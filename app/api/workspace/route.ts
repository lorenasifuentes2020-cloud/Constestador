import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { mutateWorkspace, DomainError, type Workspace } from '../../../lib/domain';
import {
  describeWorkspaceAction,
  recordWorkspaceActivity,
} from '../../../lib/workspace-audit';
import {
  resolveWorkspaceAccess,
  selectedWorkspaceOwner,
} from '../../../lib/workspace-access';
import { getChatGPTUser } from '../../chatgpt-auth';

export const dynamic = 'force-dynamic';

const responseHeaders = {
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: responseHeaders });
}

async function context(request: Request) {
  const user = await getChatGPTUser();
  if (!user) {
    throw Object.assign(new Error('Inicia sesión para acceder a tus tiendas.'), {
      status: 401,
    });
  }
  if (!env.DB) {
    throw Object.assign(new Error('El almacenamiento no está disponible.'), {
      status: 503,
    });
  }

  const access = await resolveWorkspaceAccess(
    env.DB,
    user,
    selectedWorkspaceOwner(request),
  );
  return { access, db: env.DB, user };
}

function failure(error: unknown) {
  if (error instanceof z.ZodError) {
    return json({ error: error.issues[0]?.message || 'Revisa los campos.' }, 400);
  }
  if (error instanceof DomainError) return json({ error: error.message }, 400);
  const known = error as { name?: string; message?: string; status?: number };
  console.error('Workspace operation failed', known?.name);
  return json(
    {
      error: known.status
        ? known.message
        : 'No se pudo guardar. Tus cambios no se han aplicado. Inténtalo de nuevo.',
    },
    known.status || 500,
  );
}

export async function GET(request: Request) {
  try {
    const { access, db } = await context(request);
    const row = await db.prepare(
      'SELECT payload, version FROM workspaces WHERE owner_id = ?',
    ).bind(access.ownerId).first<{ payload: string; version: number }>();

    return json({
      workspace: row ? JSON.parse(row.payload) : { stores: [] },
      version: row?.version ?? 0,
      access,
    });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) {
      return json({ error: 'Origen no permitido.' }, 403);
    }

    const { access, db, user } = await context(request);
    const raw = await request.text();
    if (raw.length > 100000) return json({ error: 'Solicitud demasiado grande.' }, 413);

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return json({ error: 'Solicitud inválida.' }, 400);
    }

    const body = z.object({
      version: z.number().int().nonnegative(),
      type: z.string().max(100),
      payload: z.unknown(),
    }).parse(parsed);

    await db.prepare(
      `INSERT OR IGNORE INTO workspaces
       (owner_id, payload, version, updated_at) VALUES (?, ?, 0, ?)`,
    ).bind(
      access.ownerId,
      JSON.stringify({ stores: [] }),
      new Date().toISOString(),
    ).run();

    const row = await db.prepare(
      'SELECT payload, version FROM workspaces WHERE owner_id = ?',
    ).bind(access.ownerId).first<{ payload: string; version: number }>();

    if (!row || row.version !== body.version) {
      return json({
        error: 'Hay cambios guardados desde otra pestaña. Actualiza para verlos antes de continuar.',
      }, 409);
    }

    const workspace = mutateWorkspace(
      JSON.parse(row.payload) as Workspace,
      body.type,
      body.payload,
    );
    const result = await db.prepare(
      `UPDATE workspaces
          SET payload = ?, version = version + 1, updated_at = ?
        WHERE owner_id = ? AND version = ?`,
    ).bind(
      JSON.stringify(workspace),
      new Date().toISOString(),
      access.ownerId,
      body.version,
    ).run();

    if (result.meta.changes !== 1) {
      return json({
        error: 'Otro cambio se guardó al mismo tiempo. Actualiza la página antes de continuar.',
      }, 409);
    }

    await recordWorkspaceActivity(db, {
      access,
      user,
      action: body.type,
      summary: describeWorkspaceAction(body.type, body.payload),
    });

    return json({ workspace, version: row.version + 1, access });
  } catch (error) {
    return failure(error);
  }
}
