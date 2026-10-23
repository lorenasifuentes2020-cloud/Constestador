import type { Workspace } from './domain.ts';

export async function assertWorkspaceFileReferences(
  db: D1Database,
  ownerId: string,
  workspace: Workspace,
) {
  const [documents, attachments] = await Promise.all([
    db.prepare(
      'SELECT store_id FROM knowledge_documents WHERE workspace_owner_id = ?',
    ).bind(ownerId).all<{ store_id: string }>(),
    db.prepare(
      `SELECT store_id, order_id, payment_id FROM payment_attachments
        WHERE workspace_owner_id = ?`,
    ).bind(ownerId).all<{ store_id: string; order_id: string; payment_id: string }>(),
  ]);
  const stores = new Map(workspace.stores.map((store) => [store.id, store]));
  if (documents.results.some((item) => !stores.has(item.store_id))) {
    throw Object.assign(new Error('El respaldo no contiene una tienda que todavía tiene documentos en su biblioteca.'), { status: 409 });
  }
  const invalidPayment = attachments.results.some((item) => {
    const order = stores.get(item.store_id)?.orders.find((candidate) => candidate.id === item.order_id);
    return !order?.payments?.some((payment) => payment.id === item.payment_id);
  });
  if (invalidPayment) {
    throw Object.assign(new Error('El respaldo no contiene un pago que todavía tiene comprobantes adjuntos.'), { status: 409 });
  }
}
