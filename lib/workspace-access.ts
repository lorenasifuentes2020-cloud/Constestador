import type { ChatGPTUser } from '../app/chatgpt-auth';

export const TEAM_WORKSPACE_COOKIE = 'nexo_workspace_owner';
export const MAX_TEAM_MEMBERS = 10;

export type WorkspaceRole = 'owner' | 'admin';

export type WorkspaceAccess = {
  ownerId: string;
  role: WorkspaceRole;
  label: string;
  ownerEmail: string;
};

type MembershipRow = {
  workspace_owner_id: string;
  workspace_label: string;
  owner_email: string;
};

export function normalizeTeamEmail(email: string): string {
  return email.trim().toLocaleLowerCase('en-US');
}

export function selectedWorkspaceOwner(request: Request): string | null {
  const header = request.headers.get('cookie');
  if (!header) return null;

  for (const item of header.split(';')) {
    const [rawName, ...rawValue] = item.trim().split('=');
    if (rawName !== TEAM_WORKSPACE_COOKIE) continue;
    const value = decodeURIComponent(rawValue.join('='));
    return value && value.length <= 200 ? value : null;
  }
  return null;
}

export async function claimTeamInvitations(
  db: D1Database,
  user: ChatGPTUser,
): Promise<void> {
  const now = new Date().toISOString();
  await db.prepare(
    `UPDATE workspace_members
       SET member_user_id = ?, status = 'active',
           joined_at = COALESCE(joined_at, ?), updated_at = ?
     WHERE member_email = ?
       AND (member_user_id IS NULL OR member_user_id = ?)`,
  ).bind(
    user.userId,
    now,
    now,
    normalizeTeamEmail(user.email),
    user.userId,
  ).run();
}

export async function resolveWorkspaceAccess(
  db: D1Database,
  user: ChatGPTUser,
  preferredOwnerId: string | null,
): Promise<WorkspaceAccess> {
  await claimTeamInvitations(db, user);

  if (preferredOwnerId === user.userId) return ownWorkspace(user);

  if (preferredOwnerId) {
    const preferred = await membershipForOwner(db, user.userId, preferredOwnerId);
    if (preferred) return membershipAccess(preferred);
  }

  const ownsWorkspace = await db.prepare(
    'SELECT owner_id FROM workspaces WHERE owner_id = ?',
  ).bind(user.userId).first();
  if (ownsWorkspace) return ownWorkspace(user);

  const firstMembership = await db.prepare(
    `SELECT workspace_owner_id, workspace_label, owner_email
       FROM workspace_members
      WHERE member_user_id = ? AND status = 'active'
      ORDER BY joined_at ASC, invited_at ASC
      LIMIT 1`,
  ).bind(user.userId).first<MembershipRow>();

  return firstMembership ? membershipAccess(firstMembership) : ownWorkspace(user);
}

export async function listWorkspaceAccesses(
  db: D1Database,
  user: ChatGPTUser,
): Promise<WorkspaceAccess[]> {
  await claimTeamInvitations(db, user);
  const result = await db.prepare(
    `SELECT workspace_owner_id, workspace_label, owner_email
       FROM workspace_members
      WHERE member_user_id = ? AND status = 'active'
      ORDER BY joined_at ASC, invited_at ASC`,
  ).bind(user.userId).all<MembershipRow>();

  return [ownWorkspace(user), ...result.results.map(membershipAccess)];
}

export async function canAccessWorkspace(
  db: D1Database,
  user: ChatGPTUser,
  ownerId: string,
): Promise<boolean> {
  if (ownerId === user.userId) return true;
  await claimTeamInvitations(db, user);
  return Boolean(await membershipForOwner(db, user.userId, ownerId));
}

function ownWorkspace(user: ChatGPTUser): WorkspaceAccess {
  return {
    ownerId: user.userId,
    role: 'owner',
    label: 'Mi espacio',
    ownerEmail: normalizeTeamEmail(user.email),
  };
}

async function membershipForOwner(
  db: D1Database,
  userId: string,
  ownerId: string,
): Promise<MembershipRow | null> {
  return db.prepare(
    `SELECT workspace_owner_id, workspace_label, owner_email
       FROM workspace_members
      WHERE workspace_owner_id = ? AND member_user_id = ? AND status = 'active'
      LIMIT 1`,
  ).bind(ownerId, userId).first<MembershipRow>();
}

function membershipAccess(row: MembershipRow): WorkspaceAccess {
  return {
    ownerId: row.workspace_owner_id,
    role: 'admin',
    label: row.workspace_label,
    ownerEmail: row.owner_email,
  };
}
