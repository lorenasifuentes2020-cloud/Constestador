import { env } from 'cloudflare:workers';
import { z } from 'zod';
import {
  MAX_TEAM_MEMBERS,
  listWorkspaceAccesses,
  normalizeTeamEmail,
  resolveWorkspaceAccess,
  selectedWorkspaceOwner,
} from '../../../lib/workspace-access';
import { getChatGPTUser, type ChatGPTUser } from '../../chatgpt-auth';

export const dynamic = 'force-dynamic';

type TeamMemberRow = {
  id: string;
  member_email: string;
  status: 'invited' | 'active';
  invited_at: string;
  joined_at: string | null;
};

const headers = {
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers });
}

async function context() {
  const user = await getChatGPTUser();
  if (!user) throw Object.assign(new Error('Inicia sesión para ver tu equipo.'), { status: 401 });
  if (!env.DB) throw Object.assign(new Error('El almacenamiento no está disponible.'), { status: 503 });
  return { user, db: env.DB };
}

function ensureSameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) {
    throw Object.assign(new Error('Origen no permitido.'), { status: 403 });
  }
}

function failure(error: unknown) {
  if (error instanceof z.ZodError) {
    return json({ error: error.issues[0]?.message || 'Revisa los datos.' }, 400);
  }
  const known = error as { name?: string; message?: string; status?: number };
  console.error('Team operation failed', known?.name);
  return json(
    { error: known.status ? known.message : 'No se pudo actualizar el equipo.' },
    known.status || 500,
  );
}

export async function GET(request: Request) {
  try {
    const { user, db } = await context();
    const current = await resolveWorkspaceAccess(
      db,
      user,
      selectedWorkspaceOwner(request),
    );
    const spaces = await listWorkspaceAccesses(db, user);
    const canManageTeam = current.role === 'owner' && current.ownerId === user.userId;
    const members = canManageTeam
      ? await listMembers(db, user.userId)
      : [];

    return json({
      current,
      spaces,
      canManageTeam,
      members,
      maxMembers: MAX_TEAM_MEMBERS,
      signedInEmail: normalizeTeamEmail(user.email),
    });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    ensureSameOrigin(request);
    const { user, db } = await context();
    await requireOwner(db, user, request);

    const raw = await request.text();
    if (raw.length > 5000) return json({ error: 'Solicitud demasiado grande.' }, 413);
    const input = z.object({
      email: z.string().trim().email('Escribe un correo válido.').max(254),
    }).parse(JSON.parse(raw));
    const email = normalizeTeamEmail(input.email);
    if (email === normalizeTeamEmail(user.email)) {
      return json({ error: 'Tu cuenta ya es la propietaria del espacio.' }, 400);
    }

    await db.prepare(
      `INSERT OR IGNORE INTO workspaces
       (owner_id, payload, version, updated_at) VALUES (?, ?, 0, ?)`,
    ).bind(user.userId, JSON.stringify({ stores: [] }), new Date().toISOString()).run();

    const existing = await db.prepare(
      `SELECT id, status FROM workspace_members
        WHERE workspace_owner_id = ? AND member_email = ?`,
    ).bind(user.userId, email).first<{ id: string; status: string }>();
    if (existing?.status === 'active') {
      return json({ error: 'Esta persona ya forma parte del equipo.' }, 409);
    }

    if (!existing) {
      const count = await db.prepare(
        'SELECT COUNT(*) AS total FROM workspace_members WHERE workspace_owner_id = ?',
      ).bind(user.userId).first<{ total: number }>();
      if ((count?.total ?? 0) >= MAX_TEAM_MEMBERS) {
        return json({ error: `Puedes tener hasta ${MAX_TEAM_MEMBERS} administradores.` }, 400);
      }
    }

    const now = new Date().toISOString();
    const workspaceLabel = ownerWorkspaceLabel(user);
    if (existing) {
      await db.prepare(
        `UPDATE workspace_members
            SET member_user_id = NULL, status = 'invited', workspace_label = ?,
                owner_email = ?, invited_by = ?, invited_at = ?, joined_at = NULL,
                updated_at = ?
          WHERE id = ? AND workspace_owner_id = ?`,
      ).bind(
        workspaceLabel,
        normalizeTeamEmail(user.email),
        user.userId,
        now,
        now,
        existing.id,
        user.userId,
      ).run();
    } else {
      await db.prepare(
        `INSERT INTO workspace_members
         (id, workspace_owner_id, member_user_id, member_email, role, status,
          workspace_label, owner_email, invited_by, invited_at, joined_at, updated_at)
         VALUES (?, ?, NULL, ?, 'admin', 'invited', ?, ?, ?, ?, NULL, ?)`,
      ).bind(
        crypto.randomUUID(),
        user.userId,
        email,
        workspaceLabel,
        normalizeTeamEmail(user.email),
        user.userId,
        now,
        now,
      ).run();
    }

    return json({ members: await listMembers(db, user.userId) }, 201);
  } catch (error) {
    if (error instanceof SyntaxError) return json({ error: 'Solicitud inválida.' }, 400);
    return failure(error);
  }
}

export async function DELETE(request: Request) {
  try {
    ensureSameOrigin(request);
    const { user, db } = await context();
    await requireOwner(db, user, request);
    const id = z.string().uuid().parse(new URL(request.url).searchParams.get('id'));
    const result = await db.prepare(
      'DELETE FROM workspace_members WHERE id = ? AND workspace_owner_id = ?',
    ).bind(id, user.userId).run();
    if (result.meta.changes !== 1) return json({ error: 'Miembro no encontrado.' }, 404);
    return json({ members: await listMembers(db, user.userId) });
  } catch (error) {
    return failure(error);
  }
}

async function requireOwner(db: D1Database, user: ChatGPTUser, request: Request) {
  const current = await resolveWorkspaceAccess(
    db,
    user,
    selectedWorkspaceOwner(request),
  );
  if (current.role !== 'owner' || current.ownerId !== user.userId) {
    throw Object.assign(new Error('Solo la propietaria puede administrar el equipo.'), {
      status: 403,
    });
  }
}

async function listMembers(db: D1Database, ownerId: string) {
  const result = await db.prepare(
    `SELECT id, member_email, status, invited_at, joined_at
       FROM workspace_members
      WHERE workspace_owner_id = ?
      ORDER BY status ASC, invited_at ASC`,
  ).bind(ownerId).all<TeamMemberRow>();
  return result.results;
}

function ownerWorkspaceLabel(user: ChatGPTUser) {
  const name = user.fullName || user.displayName || user.email;
  return `Equipo de ${name}`.slice(0, 100);
}
