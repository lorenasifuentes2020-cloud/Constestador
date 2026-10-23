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

export const conversations = sqliteTable('conversations', {
  id: text('id').primaryKey(),
  workspaceOwnerId: text('workspace_owner_id').notNull().references(() => workspaces.ownerId, { onDelete: 'cascade' }),
  storeId: text('store_id').notNull(),
  channel: text('channel', { enum: ['Manual', 'Web', 'WhatsApp', 'Instagram', 'Messenger'] }).notNull(),
  externalId: text('external_id'),
  customerName: text('customer_name').notNull(),
  status: text('status', { enum: ['open', 'waiting', 'closed'] }).notNull().default('open'),
  mode: text('mode', { enum: ['ai', 'human'] }).notNull().default('ai'),
  assignedUserId: text('assigned_user_id'),
  lastMessagePreview: text('last_message_preview').notNull().default(''),
  lastMessageAt: text('last_message_at').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  index('conversations_workspace_updated_idx').on(table.workspaceOwnerId, table.updatedAt),
  index('conversations_store_status_idx').on(table.storeId, table.status),
  uniqueIndex('conversations_external_unique').on(table.workspaceOwnerId, table.channel, table.externalId),
]);

export const conversationMessages = sqliteTable('conversation_messages', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  workspaceOwnerId: text('workspace_owner_id').notNull().references(() => workspaces.ownerId, { onDelete: 'cascade' }),
  sender: text('sender', { enum: ['customer', 'assistant', 'team', 'system'] }).notNull(),
  actorUserId: text('actor_user_id'),
  body: text('body').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => [
  index('conversation_messages_conversation_created_idx').on(table.conversationId, table.createdAt),
  index('conversation_messages_workspace_idx').on(table.workspaceOwnerId),
]);
