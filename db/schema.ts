import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const workspaces = sqliteTable('workspaces', {
  ownerId: text('owner_id').primaryKey(),
  payload: text('payload').notNull(),
  version: integer('version').notNull().default(0),
  updatedAt: text('updated_at').notNull(),
});

export const workspaceMembers = sqliteTable('workspace_members', {
  id: text('id').primaryKey(),
  workspaceOwnerId: text('workspace_owner_id').notNull().references(() => workspaces.ownerId, { onDelete: 'cascade' }),
  memberUserId: text('member_user_id'),
  memberEmail: text('member_email').notNull(),
  role: text('role', { enum: ['admin'] }).notNull().default('admin'),
  status: text('status', { enum: ['invited', 'active'] }).notNull().default('invited'),
  workspaceLabel: text('workspace_label').notNull(),
  ownerEmail: text('owner_email').notNull(),
  invitedBy: text('invited_by').notNull(),
  invitedAt: text('invited_at').notNull(),
  joinedAt: text('joined_at'),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  uniqueIndex('workspace_members_owner_email_unique').on(table.workspaceOwnerId, table.memberEmail),
  index('workspace_members_user_idx').on(table.memberUserId),
  index('workspace_members_email_idx').on(table.memberEmail),
]);

export const workspaceAuditLog = sqliteTable('workspace_audit_log', {
  id: text('id').primaryKey(),
  workspaceOwnerId: text('workspace_owner_id').notNull().references(() => workspaces.ownerId, { onDelete: 'cascade' }),
  actorUserId: text('actor_user_id').notNull(),
  actorEmail: text('actor_email').notNull(),
  actorName: text('actor_name').notNull(),
  actorRole: text('actor_role', { enum: ['owner', 'admin'] }).notNull(),
  action: text('action').notNull(),
  summary: text('summary').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => [
  index('workspace_audit_owner_created_idx').on(table.workspaceOwnerId, table.createdAt),
  index('workspace_audit_actor_idx').on(table.actorUserId),
]);
