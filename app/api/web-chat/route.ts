import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { normalizeWorkspace, type Workspace } from '../../../lib/domain';
import { recordWorkspaceActivity } from '../../../lib/workspace-audit';
import { resolveWorkspaceAccess, selectedWorkspaceOwner } from '../../../lib/workspace-access';
import { getChatGPTUser } from '../../chatgpt-auth';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store', 'Content-Type': 'application/json' };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers });

async function context(request: Request) {
  const user = await getChatGPTUser();
  if (!user) throw Object.assign(new Error('Inicia sesión para configurar el chat web.'), { status: 401 });
  if (!env.DB) throw Object.assign(new Error('El almacenamiento no está disponible.'), { status: 503 });
  const access = await resolveWorkspaceAccess(env.DB, user, selectedWorkspaceOwner(request));
  const row = await env.DB.prepare('SELECT payload FROM workspaces WHERE owner_id = ?')
    .bind(access.ownerId).first<{ payload: string }>();
  const workspace = normalizeWorkspace(row ? JSON.parse(row.payload) as Workspace : { stores: [] });
  return { user, access, db: env.DB, workspace };
}

function failure(error: unknown) {
  if (error instanceof z.ZodError) return json({ error: error.issues[0]?.message || 'Revisa los datos.' }, 400);
  if (error instanceof SyntaxError) return json({ error: 'Solicitud inválida.' }, 400);
  const known = error as { name?: string; message?: string; status?: number };
  console.error('Web chat configuration failed', known?.name);
  return json({ error: known.status ? known.message : 'No se pudo configurar el chat web.' }, known.status || 500);
}

async function listChannels(db: D1Database, ownerId: string) {
  const result = await db.prepare(
    `SELECT slug, store_id, enabled, created_at, updated_at
       FROM public_store_channels WHERE workspace_owner_id = ?`,
  ).bind(ownerId).all<Record<string, unknown>>();
  return result.results.map((row) => ({
    slug: String(row.slug),
    storeId: String(row.store_id),
    enabled: Boolean(row.enabled),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }));
}

export async function GET(request: Request) {
  try {
    const ctx = await context(request);
    return json({ channels: await listChannels(ctx.db, ctx.access.ownerId) });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) return json({ error: 'Origen no permitido.' }, 403);
    const ctx = await context(request);
    const raw = await request.text();
    if (raw.length > 2000) return json({ error: 'Solicitud demasiado grande.' }, 413);
    const input = z.object({
      storeId: z.string().min(1).max(100),
      enabled: z.boolean(),
    }).parse(JSON.parse(raw));
    const store = ctx.workspace.stores.find((item) => item.id === input.storeId);
    if (!store) return json({ error: 'La tienda no pertenece a este espacio.' }, 404);
    const existing = await ctx.db.prepare(
      `SELECT slug FROM public_store_channels
        WHERE workspace_owner_id = ? AND store_id = ?`,
    ).bind(ctx.access.ownerId, store.id).first<{ slug: string }>();
    const now = new Date().toISOString();
    if (existing) {
      await ctx.db.prepare(
        `UPDATE public_store_channels SET enabled = ?, updated_at = ?
          WHERE workspace_owner_id = ? AND store_id = ?`,
      ).bind(input.enabled, now, ctx.access.ownerId, store.id).run();
    } else {
      const base = store.name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 42) || 'tienda';
      const slug = `${base}-${crypto.randomUUID().slice(0, 8)}`;
      await ctx.db.prepare(
        `INSERT INTO public_store_channels
         (slug, workspace_owner_id, store_id, enabled, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).bind(slug, ctx.access.ownerId, store.id, input.enabled, now, now).run();
    }
    await recordWorkspaceActivity(ctx.db, {
      access: ctx.access,
      user: ctx.user,
      action: 'channel.web',
      summary: input.enabled ? 'Activó el chat web de una tienda' : 'Pausó el chat web de una tienda',
    });
    return json({ channels: await listChannels(ctx.db, ctx.access.ownerId) });
  } catch (error) {
    return failure(error);
  }
}
