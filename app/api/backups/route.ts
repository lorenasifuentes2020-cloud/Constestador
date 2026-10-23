import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { parseWorkspaceBackup, type Workspace } from '../../../lib/domain';
import { recordWorkspaceActivity } from '../../../lib/workspace-audit';
import {
  createWorkspaceSnapshot,
  listWorkspaceSnapshots,
} from '../../../lib/workspace-snapshots';
import { resolveWorkspaceAccess, selectedWorkspaceOwner } from '../../../lib/workspace-access';
import { assertWorkspaceFileReferences } from '../../../lib/workspace-files';
import { getChatGPTUser } from '../../chatgpt-auth';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store', 'Content-Type': 'application/json' };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers });

async function context(request: Request) {
  const user = await getChatGPTUser();
  if (!user) throw Object.assign(new Error('Inicia sesión para ver los puntos de recuperación.'), { status: 401 });
  if (!env.DB) throw Object.assign(new Error('El almacenamiento no está disponible.'), { status: 503 });
  const access = await resolveWorkspaceAccess(env.DB, user, selectedWorkspaceOwner(request));
  return { user, access, db: env.DB };
}

function requireOwner(access: { role: string }) {
  if (access.role !== 'owner') {
    throw Object.assign(new Error('Solo la propietaria puede crear o restaurar puntos de recuperación.'), { status: 403 });
  }
}

function failure(error: unknown) {
  if (error instanceof z.ZodError || error instanceof SyntaxError) {
    return json({ error: 'Solicitud inválida.' }, 400);
  }
  const known = error as { name?: string; message?: string; status?: number };
  console.error('Backup operation failed', known?.name);
  return json({ error: known.status ? known.message : 'No se pudo actualizar el respaldo.' }, known.status || 500);
}

export async function GET(request: Request) {
  try {
    const ctx = await context(request);
    return json({
      snapshots: await listWorkspaceSnapshots(ctx.db, ctx.access.ownerId),
      canRestore: ctx.access.role === 'owner',
    });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) return json({ error: 'Origen no permitido.' }, 403);
    const ctx = await context(request);
    requireOwner(ctx.access);
    const raw = await request.text();
    if (raw.length > 2000) return json({ error: 'Solicitud demasiado grande.' }, 413);
    const input = z.discriminatedUnion('action', [
      z.object({ action: z.literal('create') }),
      z.object({ action: z.literal('restore'), snapshotId: z.string().uuid() }),
    ]).parse(JSON.parse(raw));
    const current = await ctx.db.prepare(
      'SELECT payload, version FROM workspaces WHERE owner_id = ?',
    ).bind(ctx.access.ownerId).first<{ payload: string; version: number }>();
    if (!current) return json({ error: 'El espacio todavía no tiene datos guardados.' }, 404);

    if (input.action === 'create') {
      await createWorkspaceSnapshot(ctx.db, {
        ownerId: ctx.access.ownerId,
        version: current.version,
        payload: current.payload,
        reason: 'manual',
        force: true,
      });
      await recordWorkspaceActivity(ctx.db, {
        access: ctx.access, user: ctx.user, action: 'backup.create', summary: 'Creó un punto de recuperación',
      });
      return json({ snapshots: await listWorkspaceSnapshots(ctx.db, ctx.access.ownerId) }, 201);
    }

    const snapshot = await ctx.db.prepare(
      `SELECT payload FROM workspace_snapshots WHERE id = ? AND workspace_owner_id = ?`,
    ).bind(input.snapshotId, ctx.access.ownerId).first<{ payload: string }>();
    if (!snapshot) return json({ error: 'Punto de recuperación no encontrado.' }, 404);
    const restored: Workspace = parseWorkspaceBackup(JSON.parse(snapshot.payload));
    await assertWorkspaceFileReferences(ctx.db, ctx.access.ownerId, restored);
    await createWorkspaceSnapshot(ctx.db, {
      ownerId: ctx.access.ownerId,
      version: current.version,
      payload: current.payload,
      reason: 'before_restore',
      force: true,
    });
    const result = await ctx.db.prepare(
      `UPDATE workspaces SET payload = ?, version = version + 1, updated_at = ?
        WHERE owner_id = ? AND version = ?`,
    ).bind(JSON.stringify(restored), new Date().toISOString(), ctx.access.ownerId, current.version).run();
    if (result.meta.changes !== 1) {
      return json({ error: 'El espacio cambió mientras restaurábamos. Actualiza e inténtalo nuevamente.' }, 409);
    }
    await recordWorkspaceActivity(ctx.db, {
      access: ctx.access, user: ctx.user, action: 'backup.restore', summary: 'Restauró un punto de recuperación',
    });
    return json({
      workspace: restored,
      version: current.version + 1,
      snapshots: await listWorkspaceSnapshots(ctx.db, ctx.access.ownerId),
    });
  } catch (error) {
    return failure(error);
  }
}
