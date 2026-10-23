import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { normalizeWorkspace, type Workspace } from '../../../lib/domain';
import {
  attachmentContentDisposition,
  MAX_PAYMENT_ATTACHMENTS_PER_ORDER,
  safeAttachmentName,
  validatePaymentAttachment,
} from '../../../lib/payment-attachments';
import { recordWorkspaceActivity } from '../../../lib/workspace-audit';
import { resolveWorkspaceAccess, selectedWorkspaceOwner } from '../../../lib/workspace-access';
import { getChatGPTUser } from '../../chatgpt-auth';

export const dynamic = 'force-dynamic';

const jsonHeaders = { 'Cache-Control': 'no-store', 'Content-Type': 'application/json' };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: jsonHeaders });
const id = z.string().uuid();

type AttachmentRow = {
  id: string;
  store_id: string;
  order_id: string;
  payment_id: string;
  object_key: string;
  file_name: string;
  content_type: string;
  size: number;
  created_at: string;
};

async function context(request: Request) {
  const user = await getChatGPTUser();
  if (!user) throw Object.assign(new Error('Inicia sesión para ver comprobantes.'), { status: 401 });
  if (!env.DB || !env.BUCKET) {
    throw Object.assign(new Error('El almacenamiento de comprobantes no está disponible.'), { status: 503 });
  }
  const access = await resolveWorkspaceAccess(env.DB, user, selectedWorkspaceOwner(request));
  const row = await env.DB.prepare('SELECT payload FROM workspaces WHERE owner_id = ?')
    .bind(access.ownerId).first<{ payload: string }>();
  const workspace = normalizeWorkspace(row ? JSON.parse(row.payload) as Workspace : { stores: [] });
  return { user, access, db: env.DB, bucket: env.BUCKET, workspace };
}

function checkOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) {
    throw Object.assign(new Error('Origen no permitido.'), { status: 403 });
  }
}

function findPayment(workspace: Workspace, storeId: string, orderId: string, paymentId: string) {
  const store = workspace.stores.find((item) => item.id === storeId);
  const order = store?.orders.find((item) => item.id === orderId);
  const payment = order?.payments?.find((item) => item.id === paymentId);
  if (!store || !order || !payment) {
    throw Object.assign(new Error('El pago no pertenece a este espacio.'), { status: 404 });
  }
}

function serialize(row: AttachmentRow) {
  return {
    id: row.id,
    storeId: row.store_id,
    orderId: row.order_id,
    paymentId: row.payment_id,
    fileName: row.file_name,
    contentType: row.content_type,
    size: row.size,
    createdAt: row.created_at,
    downloadUrl: `/api/payment-attachments?attachmentId=${encodeURIComponent(row.id)}`,
  };
}

function failure(error: unknown) {
  if (error instanceof z.ZodError || error instanceof SyntaxError) {
    return json({ error: 'Solicitud inválida.' }, 400);
  }
  const known = error as { name?: string; message?: string; status?: number };
  console.error('Payment attachment operation failed', known?.name);
  return json({ error: known.status ? known.message : 'No se pudo gestionar el comprobante.' }, known.status || 500);
}

export async function GET(request: Request) {
  try {
    const ctx = await context(request);
    const url = new URL(request.url);
    const attachmentId = url.searchParams.get('attachmentId');
    if (attachmentId) {
      const parsedId = id.parse(attachmentId);
      const row = await ctx.db.prepare(
        `SELECT id, store_id, order_id, payment_id, object_key, file_name, content_type, size, created_at
           FROM payment_attachments WHERE id = ? AND workspace_owner_id = ?`,
      ).bind(parsedId, ctx.access.ownerId).first<AttachmentRow>();
      if (!row) return json({ error: 'Comprobante no encontrado.' }, 404);
      const object = await ctx.bucket.get(row.object_key);
      if (!object) return json({ error: 'El archivo del comprobante no está disponible.' }, 404);
      return new Response(object.body, {
        headers: {
          'Cache-Control': 'private, no-store',
          'Content-Type': row.content_type,
          'Content-Length': String(row.size),
          'Content-Disposition': attachmentContentDisposition(row.file_name),
          ETag: object.httpEtag,
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }

    const query = z.object({
      storeId: z.string().min(1).max(100),
      orderId: z.string().min(1).max(100),
    }).parse({ storeId: url.searchParams.get('storeId'), orderId: url.searchParams.get('orderId') });
    const store = ctx.workspace.stores.find((item) => item.id === query.storeId);
    if (!store?.orders.some((item) => item.id === query.orderId)) {
      return json({ error: 'El pedido no pertenece a este espacio.' }, 404);
    }
    const result = await ctx.db.prepare(
      `SELECT id, store_id, order_id, payment_id, object_key, file_name, content_type, size, created_at
         FROM payment_attachments
        WHERE workspace_owner_id = ? AND store_id = ? AND order_id = ?
        ORDER BY created_at DESC`,
    ).bind(ctx.access.ownerId, query.storeId, query.orderId).all<AttachmentRow>();
    return json({ attachments: result.results.map(serialize) });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  let uploadedKey: string | null = null;
  try {
    checkOrigin(request);
    const length = Number(request.headers.get('content-length') || 0);
    if (length > 5_500_000) return json({ error: 'La solicitud supera el tamaño permitido.' }, 413);
    const ctx = await context(request);
    const form = await request.formData();
    const input = z.object({
      storeId: z.string().min(1).max(100),
      orderId: z.string().min(1).max(100),
      paymentId: z.string().min(1).max(100),
    }).parse({
      storeId: form.get('storeId'),
      orderId: form.get('orderId'),
      paymentId: form.get('paymentId'),
    });
    const file = form.get('file');
    if (!(file instanceof File)) return json({ error: 'Selecciona un comprobante.' }, 400);
    validatePaymentAttachment(file);
    findPayment(ctx.workspace, input.storeId, input.orderId, input.paymentId);
    const count = await ctx.db.prepare(
      `SELECT COUNT(*) AS total FROM payment_attachments
        WHERE workspace_owner_id = ? AND order_id = ?`,
    ).bind(ctx.access.ownerId, input.orderId).first<{ total: number }>();
    if (Number(count?.total || 0) >= MAX_PAYMENT_ATTACHMENTS_PER_ORDER) {
      return json({ error: 'Este pedido alcanzó el límite de 20 comprobantes.' }, 400);
    }

    const attachmentId = crypto.randomUUID();
    const objectKey = `payment-proofs/${attachmentId}`;
    uploadedKey = objectKey;
    await ctx.bucket.put(objectKey, await file.arrayBuffer(), {
      httpMetadata: { contentType: file.type },
    });
    const now = new Date().toISOString();
    const fileName = safeAttachmentName(file.name);
    await ctx.db.prepare(
      `INSERT INTO payment_attachments
       (id, workspace_owner_id, store_id, order_id, payment_id, object_key,
        file_name, content_type, size, uploaded_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      attachmentId, ctx.access.ownerId, input.storeId, input.orderId, input.paymentId,
      objectKey, fileName, file.type, file.size, ctx.user.userId, now,
    ).run();
    uploadedKey = null;
    await recordWorkspaceActivity(ctx.db, {
      access: ctx.access,
      user: ctx.user,
      action: 'payment.attachment.add',
      summary: 'Adjuntó un comprobante a un pago',
    });
    return json({ attachment: serialize({
      id: attachmentId,
      store_id: input.storeId,
      order_id: input.orderId,
      payment_id: input.paymentId,
      object_key: objectKey,
      file_name: fileName,
      content_type: file.type,
      size: file.size,
      created_at: now,
    }) }, 201);
  } catch (error) {
    if (uploadedKey && env.BUCKET) await env.BUCKET.delete(uploadedKey).catch(() => undefined);
    return failure(error);
  }
}

export async function DELETE(request: Request) {
  try {
    checkOrigin(request);
    const ctx = await context(request);
    const raw = await request.text();
    if (raw.length > 1000) return json({ error: 'Solicitud demasiado grande.' }, 413);
    const input = z.object({ attachmentId: id }).parse(JSON.parse(raw));
    const row = await ctx.db.prepare(
      `SELECT id, store_id, order_id, payment_id, object_key, file_name, content_type, size, created_at
         FROM payment_attachments WHERE id = ? AND workspace_owner_id = ?`,
    ).bind(input.attachmentId, ctx.access.ownerId).first<AttachmentRow>();
    if (!row) return json({ error: 'Comprobante no encontrado.' }, 404);
    await ctx.bucket.delete(row.object_key);
    await ctx.db.prepare(
      'DELETE FROM payment_attachments WHERE id = ? AND workspace_owner_id = ?',
    ).bind(row.id, ctx.access.ownerId).run();
    await recordWorkspaceActivity(ctx.db, {
      access: ctx.access,
      user: ctx.user,
      action: 'payment.attachment.remove',
      summary: 'Eliminó un comprobante de pago',
    });
    return json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
