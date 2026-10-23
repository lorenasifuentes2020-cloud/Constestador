const SNAPSHOT_RETENTION = 10;

export type WorkspaceSnapshotReason = 'automatic' | 'manual' | 'before_restore';

export type WorkspaceSnapshotSummary = {
  id: string;
  workspaceVersion: number;
  reason: WorkspaceSnapshotReason;
  createdAt: string;
  sizeBytes: number;
};

export async function createWorkspaceSnapshot(
  db: D1Database,
  input: {
    ownerId: string;
    version: number;
    payload: string;
    reason: WorkspaceSnapshotReason;
    force?: boolean;
  },
): Promise<string | null> {
  if (!input.force) {
    const latest = await db.prepare(
      `SELECT payload FROM workspace_snapshots
        WHERE workspace_owner_id = ? ORDER BY created_at DESC, id DESC LIMIT 1`,
    ).bind(input.ownerId).first<{ payload: string }>();
    if (latest?.payload === input.payload) return null;
  }
  const id = crypto.randomUUID();
  await db.prepare(
    `INSERT INTO workspace_snapshots
     (id, workspace_owner_id, workspace_version, payload, reason, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(id, input.ownerId, input.version, input.payload, input.reason, new Date().toISOString()).run();
  await db.prepare(
    `DELETE FROM workspace_snapshots
      WHERE workspace_owner_id = ? AND id NOT IN (
        SELECT id FROM workspace_snapshots WHERE workspace_owner_id = ?
         ORDER BY created_at DESC, id DESC LIMIT ?
      )`,
  ).bind(input.ownerId, input.ownerId, SNAPSHOT_RETENTION).run();
  return id;
}

export async function listWorkspaceSnapshots(db: D1Database, ownerId: string) {
  const result = await db.prepare(
    `SELECT id, workspace_version, reason, created_at, LENGTH(payload) AS size_bytes
       FROM workspace_snapshots WHERE workspace_owner_id = ?
      ORDER BY created_at DESC, id DESC LIMIT ?`,
  ).bind(ownerId, SNAPSHOT_RETENTION).all<Record<string, unknown>>();
  return result.results.map((row) => ({
    id: String(row.id),
    workspaceVersion: Number(row.workspace_version),
    reason: String(row.reason) as WorkspaceSnapshotReason,
    createdAt: String(row.created_at),
    sizeBytes: Number(row.size_bytes),
  })) satisfies WorkspaceSnapshotSummary[];
}
