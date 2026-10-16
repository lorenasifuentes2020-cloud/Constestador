import type { ChatGPTUser } from '../app/chatgpt-auth';
import type { WorkspaceAccess } from './workspace-access';

const AUDIT_RETENTION_PER_WORKSPACE = 1000;

export type WorkspaceActivity = {
  id: string;
  actor_email: string;
  actor_name: string;
  actor_role: 'owner' | 'admin';
  action: string;
  summary: string;
  created_at: string;
};

export function describeWorkspaceAction(type: string, payload: unknown): string {
  const values = record(payload);
  const editing = typeof values.id === 'string' && values.id.length > 0;

  switch (type) {
    case 'store.create': return 'Creó una tienda';
    case 'store.update': return 'Actualizó una tienda';
    case 'demo.load': return 'Cargó las tiendas de ejemplo';
    case 'product.save': return editing ? 'Actualizó un producto' : 'Añadió un producto';
    case 'contact.save': return editing ? 'Actualizó un cliente' : 'Añadió un cliente';
    case 'agent.save': return 'Actualizó la configuración del vendedor';
    case 'faq.save': return editing ? 'Actualizó una pregunta frecuente' : 'Añadió una pregunta frecuente';
    case 'rule.save': return editing ? 'Actualizó una regla' : 'Añadió una regla';
    case 'promotion.save': return editing ? 'Actualizó una promoción' : 'Añadió una promoción';
    case 'modules.save': return 'Actualizó los módulos de una tienda';
    case 'order.create': return 'Registró un pedido';
    case 'order.status': return enumSummary('Cambió el estado de un pedido a', values.status);
    case 'order.payment.add': return 'Registró un abono verificado';
    case 'order.payment.remove': return 'Eliminó un abono del pedido';
    default: return 'Actualizó el espacio de trabajo';
  }
}

export async function recordWorkspaceActivity(
  db: D1Database,
  input: {
    access: WorkspaceAccess;
    user: ChatGPTUser;
    action: string;
    summary: string;
  },
): Promise<void> {
  const now = new Date().toISOString();
  try {
    await db.prepare(
      `INSERT INTO workspace_audit_log
       (id, workspace_owner_id, actor_user_id, actor_email, actor_name,
        actor_role, action, summary, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      input.access.ownerId,
      input.user.userId,
      input.user.email.trim().toLocaleLowerCase('en-US'),
      (input.user.fullName || input.user.displayName || input.user.email).slice(0, 120),
      input.access.role,
      input.action.slice(0, 100),
      input.summary.slice(0, 240),
      now,
    ).run();

    await db.prepare(
      `DELETE FROM workspace_audit_log
        WHERE workspace_owner_id = ?
          AND id NOT IN (
            SELECT id FROM workspace_audit_log
             WHERE workspace_owner_id = ?
             ORDER BY created_at DESC, id DESC
             LIMIT ?
          )`,
    ).bind(
      input.access.ownerId,
      input.access.ownerId,
      AUDIT_RETENTION_PER_WORKSPACE,
    ).run();
  } catch (error) {
    console.error('Workspace activity could not be recorded', (error as { name?: string }).name);
  }
}

export async function listWorkspaceActivity(
  db: D1Database,
  ownerId: string,
  limit = 30,
): Promise<WorkspaceActivity[]> {
  const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
  const result = await db.prepare(
    `SELECT id, actor_email, actor_name, actor_role, action, summary, created_at
       FROM workspace_audit_log
      WHERE workspace_owner_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT ?`,
  ).bind(ownerId, safeLimit).all<WorkspaceActivity>();
  return result.results;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function enumSummary(prefix: string, value: unknown): string {
  return typeof value === 'string' && /^[\p{L} ]{1,30}$/u.test(value)
    ? `${prefix} ${value.toLocaleLowerCase('es')}`
    : prefix;
}
