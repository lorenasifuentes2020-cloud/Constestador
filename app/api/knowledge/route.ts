import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { normalizeWorkspace, type Workspace } from '../../../lib/domain';
import { extractKnowledgeFile } from '../../../lib/knowledge-files';
import {
  chunkKnowledgeText,
  MAX_KNOWLEDGE_DOCUMENTS_PER_STORE,
  type KnowledgeDocumentSummary,
} from '../../../lib/knowledge';
import { attachmentContentDisposition, safeAttachmentName } from '../../../lib/payment-attachments';
import { recordWorkspaceActivity } from '../../../lib/workspace-audit';
import { resolveWorkspaceAccess, selectedWorkspaceOwner } from '../../../lib/workspace-access';
import { getChatGPTUser } from '../../chatgpt-auth';

export const dynamic = 'force-dynamic';

const jsonHeaders = { 'Cache-Control': 'no-store', 'Content-Type': 'application/json' };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: jsonHeaders });
const uuid = z.string().uuid();

type DocumentRow = {
  id: string;
  store_id: string;
  title: string;
  file_name: string;
  content_type: string;
  size: number;
  object_key: string;
  page_count: number;
  chunk_count: number;
  enabled: number;
  created_at: string;
};

async function context(request: Request) {
  const user = await getChatGPTUser();
  if (!user) throw Object.assign(new Error('Inicia sesión para usar la biblioteca.'), { status: 401 });
  if (!env.DB || !env.BUCKET) {
    throw Object.assign(new Error('La biblioteca de archivos no está disponible.'), { status: 503 });
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

function serialize(row: DocumentRow): KnowledgeDocumentSummary {
  return {
    id: row.id,
    storeId: row.store_id,
    title: row.title,
    fileName: row.file_name,
    contentType: row.content_type,
    size: row.size,
    pageCount: row.page_count,
    chunkCount: row.chunk_count,
    enabled: Boolean(row.enabled),
    createdAt: row.created_at,
    downloadUrl: `/api/knowledge?documentId=${encodeURIComponent(row.id)}&download=1`,
  };
}

async function listDocuments(db: D1Database, ownerId: string, storeId: string) {
  const result = await db.prepare(
    `SELECT id, store_id, title, file_name, content_type, size, object_key,
            page_count, chunk_count, enabled, created_at
       FROM knowledge_documents
      WHERE workspace_owner_id = ? AND store_id = ?
      ORDER BY created_at DESC`,
  ).bind(ownerId, storeId).all<DocumentRow>();
  return result.results.map(serialize);
}

function failure(error: unknown) {
  if (error instanceof z.ZodError || error instanceof SyntaxError) {
    return json({ error: 'Solicitud inválida.' }, 400);
  }
  const known = error as { name?: string; message?: string; status?: number };
  console.error('Knowledge library operation failed', known?.name);
  return json({ error: known.status ? known.message : 'No se pudo actualizar la biblioteca.' }, known.status || 500);
}

export async function GET(request: Request) {
  try {
    const ctx = await context(request);
    const url = new URL(request.url);
    const documentId = url.searchParams.get('documentId');
    if (documentId && url.searchParams.get('download') === '1') {
      const row = await ctx.db.prepare(
        `SELECT id, store_id, title, file_name, content_type, size, object_key,
                page_count, chunk_count, enabled, created_at
           FROM knowledge_documents WHERE id = ? AND workspace_owner_id = ?`,
      ).bind(uuid.parse(documentId), ctx.access.ownerId).first<DocumentRow>();
      if (!row) return json({ error: 'Documento no encontrado.' }, 404);
      const object = await ctx.bucket.get(row.object_key);
      if (!object) return json({ error: 'El archivo original no está disponible.' }, 404);
      return new Response(object.body, { headers: {
        'Cache-Control': 'private, no-store',
        'Content-Type': row.content_type,
        'Content-Length': String(row.size),
        'Content-Disposition': attachmentContentDisposition(row.file_name),
        'X-Content-Type-Options': 'nosniff',
        ETag: object.httpEtag,
      } });
    }
    const storeId = z.string().min(1).max(100).parse(url.searchParams.get('storeId'));
    if (!ctx.workspace.stores.some((store) => store.id === storeId)) {
      return json({ error: 'La tienda no pertenece a este espacio.' }, 404);
    }
    return json({ documents: await listDocuments(ctx.db, ctx.access.ownerId, storeId) });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  let objectKey: string | null = null;
  let documentId: string | null = null;
  try {
    checkOrigin(request);
    const length = Number(request.headers.get('content-length') || 0);
    if (length > 21_000_000) return json({ error: 'La solicitud supera el tamaño permitido.' }, 413);
    const ctx = await context(request);
    const form = await request.formData();
    const input = z.object({
      storeId: z.string().min(1).max(100),
      title: z.string().trim().min(1).max(150),
    }).parse({ storeId: form.get('storeId'), title: form.get('title') });
    if (!ctx.workspace.stores.some((store) => store.id === input.storeId)) {
      return json({ error: 'La tienda no pertenece a este espacio.' }, 404);
    }
    const count = await ctx.db.prepare(
      'SELECT COUNT(*) AS total FROM knowledge_documents WHERE workspace_owner_id = ? AND store_id = ?',
    ).bind(ctx.access.ownerId, input.storeId).first<{ total: number }>();
    if (Number(count?.total || 0) >= MAX_KNOWLEDGE_DOCUMENTS_PER_STORE) {
      return json({ error: 'Esta tienda alcanzó el límite de 30 documentos.' }, 400);
    }
    const file = form.get('file');
    if (!(file instanceof File)) return json({ error: 'Selecciona un libro o guía.' }, 400);
    const extracted = await extractKnowledgeFile(file);
    const chunks = chunkKnowledgeText(extracted.text);
    if (!chunks.length) return json({ error: 'No se pudo preparar el contenido del archivo.' }, 400);

    documentId = crypto.randomUUID();
    objectKey = `knowledge/${documentId}`;
    await ctx.bucket.put(objectKey, extracted.bytes, { httpMetadata: { contentType: extracted.contentType } });
    const now = new Date().toISOString();
    const fileName = safeAttachmentName(file.name);
    await ctx.db.prepare(
      `INSERT INTO knowledge_documents
       (id, workspace_owner_id, store_id, title, file_name, content_type, size,
        object_key, page_count, chunk_count, enabled, uploaded_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    ).bind(
      documentId, ctx.access.ownerId, input.storeId, input.title, fileName,
      extracted.contentType, file.size, objectKey, extracted.pageCount, chunks.length,
      ctx.user.userId, now,
    ).run();
    for (let offset = 0; offset < chunks.length; offset += 50) {
      await ctx.db.batch(chunks.slice(offset, offset + 50).map((content, index) => ctx.db.prepare(
        `INSERT INTO knowledge_chunks
         (id, document_id, workspace_owner_id, store_id, position, content)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).bind(
        crypto.randomUUID(), documentId, ctx.access.ownerId, input.storeId, offset + index, content,
      )));
    }
    const row = await ctx.db.prepare(
      `SELECT id, store_id, title, file_name, content_type, size, object_key,
              page_count, chunk_count, enabled, created_at
         FROM knowledge_documents WHERE id = ?`,
    ).bind(documentId).first<DocumentRow>();
    objectKey = null;
    documentId = null;
    await recordWorkspaceActivity(ctx.db, {
      access: ctx.access, user: ctx.user, action: 'knowledge.add', summary: 'Añadió una fuente a la biblioteca de ventas',
    });
    return json({ document: serialize(row!) }, 201);
  } catch (error) {
    if (documentId && env.DB) await env.DB.prepare('DELETE FROM knowledge_documents WHERE id = ?').bind(documentId).run().catch(() => undefined);
    if (objectKey && env.BUCKET) await env.BUCKET.delete(objectKey).catch(() => undefined);
    return failure(error);
  }
}

export async function PATCH(request: Request) {
  try {
    checkOrigin(request);
    const ctx = await context(request);
    const raw = await request.text();
    if (raw.length > 1000) return json({ error: 'Solicitud demasiado grande.' }, 413);
    const input = z.object({ documentId: uuid, enabled: z.boolean() }).parse(JSON.parse(raw));
    const result = await ctx.db.prepare(
      `UPDATE knowledge_documents SET enabled = ?
        WHERE id = ? AND workspace_owner_id = ?`,
    ).bind(input.enabled, input.documentId, ctx.access.ownerId).run();
    if (result.meta.changes !== 1) return json({ error: 'Documento no encontrado.' }, 404);
    await recordWorkspaceActivity(ctx.db, {
      access: ctx.access, user: ctx.user, action: 'knowledge.toggle',
      summary: input.enabled ? 'Activó una fuente de ventas' : 'Pausó una fuente de ventas',
    });
    return json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(request: Request) {
  try {
    checkOrigin(request);
    const ctx = await context(request);
    const raw = await request.text();
    if (raw.length > 1000) return json({ error: 'Solicitud demasiado grande.' }, 413);
    const input = z.object({ documentId: uuid }).parse(JSON.parse(raw));
    const row = await ctx.db.prepare(
      'SELECT object_key FROM knowledge_documents WHERE id = ? AND workspace_owner_id = ?',
    ).bind(input.documentId, ctx.access.ownerId).first<{ object_key: string }>();
    if (!row) return json({ error: 'Documento no encontrado.' }, 404);
    await ctx.bucket.delete(row.object_key);
    await ctx.db.prepare(
      'DELETE FROM knowledge_documents WHERE id = ? AND workspace_owner_id = ?',
    ).bind(input.documentId, ctx.access.ownerId).run();
    await recordWorkspaceActivity(ctx.db, {
      access: ctx.access, user: ctx.user, action: 'knowledge.remove', summary: 'Eliminó una fuente de la biblioteca de ventas',
    });
    return json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
