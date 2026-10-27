import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { normalizeWorkspace, type Workspace } from '../../../lib/domain';
import type {
  ConversationAdvisor,
  ConversationMessage,
  ConversationSummary,
} from '../../../lib/conversations';
import { CONVERSATION_SALES_STAGES } from '../../../lib/conversations';
import { recordWorkspaceActivity } from '../../../lib/workspace-audit';
import {
  resolveWorkspaceAccess,
  selectedWorkspaceOwner,
} from '../../../lib/workspace-access';
import { getChatGPTUser } from '../../chatgpt-auth';
import { sendWhatsAppText, whatsappRecipient } from '../../../lib/whatsapp';

export const dynamic = 'force-dynamic';

const headers = {
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json',
};

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers });

type Context = Awaited<ReturnType<typeof context>>;

async function context(request: Request) {
  const user = await getChatGPTUser();
  if (!user) throw Object.assign(new Error('Inicia sesión para ver las conversaciones.'), { status: 401 });
  if (!env.DB) throw Object.assign(new Error('El almacenamiento no está disponible.'), { status: 503 });
  const access = await resolveWorkspaceAccess(env.DB, user, selectedWorkspaceOwner(request));
  const row = await env.DB.prepare('SELECT payload FROM workspaces WHERE owner_id = ?')
    .bind(access.ownerId).first<{ payload: string }>();
  const workspace = normalizeWorkspace(row ? JSON.parse(row.payload) as Workspace : { stores: [] });
  return { user, access, db: env.DB, workspace };
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
  if (error instanceof SyntaxError) return json({ error: 'Solicitud inválida.' }, 400);
  const known = error as { name?: string; message?: string; status?: number };
  console.error('Conversation operation failed', known?.name);
  return json({ error: known.status ? known.message : 'No se pudo actualizar la conversación.' }, known.status || 500);
}

async function listConversations(ctx: Context, storeId?: string | null) {
  if (storeId && !ctx.workspace.stores.some((store) => store.id === storeId)) {
    throw Object.assign(new Error('La tienda no pertenece a este espacio.'), { status: 404 });
  }
  const query = storeId
    ? `SELECT id, store_id, channel, customer_name, status, sales_stage, mode, assigned_user_id,
              last_message_preview, last_message_at, created_at
         FROM conversations WHERE workspace_owner_id = ? AND store_id = ?
         ORDER BY last_message_at DESC LIMIT 100`
    : `SELECT id, store_id, channel, customer_name, status, sales_stage, mode, assigned_user_id,
              last_message_preview, last_message_at, created_at
         FROM conversations WHERE workspace_owner_id = ?
         ORDER BY last_message_at DESC LIMIT 100`;
  const result = storeId
    ? await ctx.db.prepare(query).bind(ctx.access.ownerId, storeId).all<Record<string, unknown>>()
    : await ctx.db.prepare(query).bind(ctx.access.ownerId).all<Record<string, unknown>>();
  const names = new Map(ctx.workspace.stores.map((store) => [store.id, store.name]));
  return result.results.map((row) => ({
    id: String(row.id),
    storeId: String(row.store_id),
    storeName: names.get(String(row.store_id)) || 'Tienda no disponible',
    channel: row.channel,
    customerName: String(row.customer_name),
    status: row.status,
    salesStage: row.sales_stage || 'inquiry',
    mode: row.mode,
    assignedUserId: row.assigned_user_id ? String(row.assigned_user_id) : null,
    lastMessagePreview: String(row.last_message_preview),
    lastMessageAt: String(row.last_message_at),
    createdAt: String(row.created_at),
  })) as ConversationSummary[];
}

async function salesStageCounts(ctx: Context, storeId?: string | null) {
  const query = storeId
    ? `SELECT sales_stage, COUNT(*) AS total FROM conversations
        WHERE workspace_owner_id = ? AND store_id = ? GROUP BY sales_stage`
    : `SELECT sales_stage, COUNT(*) AS total FROM conversations
        WHERE workspace_owner_id = ? GROUP BY sales_stage`;
  const result = storeId
    ? await ctx.db.prepare(query).bind(ctx.access.ownerId, storeId).all<{ sales_stage: string; total: number }>()
    : await ctx.db.prepare(query).bind(ctx.access.ownerId).all<{ sales_stage: string; total: number }>();
  return Object.fromEntries(result.results.map((row) => [row.sales_stage || 'inquiry', Number(row.total)]));
}

async function listAdvisors(ctx: Context): Promise<ConversationAdvisor[]> {
  const result = await ctx.db.prepare(
    `SELECT member_user_id, member_email FROM workspace_members
      WHERE workspace_owner_id = ? AND status = 'active' AND member_user_id IS NOT NULL
      ORDER BY member_email ASC`,
  ).bind(ctx.access.ownerId).all<{ member_user_id: string; member_email: string }>();
  return [
    { userId: ctx.access.ownerId, email: ctx.access.ownerEmail, role: 'owner' },
    ...result.results.map((row) => ({
      userId: row.member_user_id,
      email: row.member_email,
      role: 'admin' as const,
    })),
  ];
}

async function validAdvisor(ctx: Context, userId: string) {
  if (userId === ctx.access.ownerId) return true;
  return Boolean(await ctx.db.prepare(
    `SELECT 1 FROM workspace_members
      WHERE workspace_owner_id = ? AND member_user_id = ? AND status = 'active'`,
  ).bind(ctx.access.ownerId, userId).first());
}

async function requireConversation(ctx: Context, id: string) {
  const conversation = await ctx.db.prepare(
    `SELECT id, store_id, channel, external_id FROM conversations
      WHERE id = ? AND workspace_owner_id = ?`,
  ).bind(id, ctx.access.ownerId).first<{ id: string; store_id: string; channel: string; external_id: string | null }>();
  if (!conversation) throw Object.assign(new Error('Conversación no encontrada.'), { status: 404 });
  return conversation;
}

async function listMessages(ctx: Context, conversationId: string) {
  await requireConversation(ctx, conversationId);
  const result = await ctx.db.prepare(
    `SELECT id, conversation_id, sender, body, created_at FROM (
       SELECT id, conversation_id, sender, body, created_at
         FROM conversation_messages
        WHERE conversation_id = ? AND workspace_owner_id = ?
        ORDER BY created_at DESC, id DESC LIMIT 200
     ) ORDER BY created_at ASC, id ASC`,
  ).bind(conversationId, ctx.access.ownerId).all<Record<string, unknown>>();
  return result.results.map((row) => ({
    id: String(row.id),
    conversationId: String(row.conversation_id),
    sender: row.sender,
    body: String(row.body),
    createdAt: String(row.created_at),
  })) as ConversationMessage[];
}

export async function GET(request: Request) {
  try {
    const ctx = await context(request);
    const url = new URL(request.url);
    const storeId = z.string().max(100).optional().parse(url.searchParams.get('storeId') || undefined);
    const conversationId = z.string().uuid().optional().parse(url.searchParams.get('conversationId') || undefined);
    return json({
      conversations: await listConversations(ctx, storeId),
      messages: conversationId ? await listMessages(ctx, conversationId) : [],
      salesStageCounts: await salesStageCounts(ctx, storeId),
      advisors: await listAdvisors(ctx),
    });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    ensureSameOrigin(request);
    const ctx = await context(request);
    const raw = await request.text();
    if (raw.length > 12_000) return json({ error: 'Solicitud demasiado grande.' }, 413);
    const common = { action: z.string() };
    const parsed = z.object(common).parse(JSON.parse(raw));
    const now = new Date().toISOString();

    if (parsed.action === 'create') {
      const input = z.object({
        action: z.literal('create'),
        storeId: z.string().min(1).max(100),
        customerName: z.string().trim().min(1).max(120),
        firstMessage: z.string().trim().min(1).max(2000),
      }).parse(JSON.parse(raw));
      if (!ctx.workspace.stores.some((store) => store.id === input.storeId)) {
        return json({ error: 'La tienda no pertenece a este espacio.' }, 404);
      }
      const count = await ctx.db.prepare(
        'SELECT COUNT(*) AS total FROM conversations WHERE workspace_owner_id = ?',
      ).bind(ctx.access.ownerId).first<{ total: number }>();
      if ((count?.total ?? 0) >= 5000) return json({ error: 'Se alcanzó el límite de conversaciones.' }, 400);
      const id = crypto.randomUUID();
      const messageId = crypto.randomUUID();
      const preview = input.firstMessage.slice(0, 180);
      await ctx.db.batch([
        ctx.db.prepare(
          `INSERT INTO conversations
           (id, workspace_owner_id, store_id, channel, external_id, customer_name,
            status, mode, assigned_user_id, last_message_preview, last_message_at,
            created_at, updated_at)
           VALUES (?, ?, ?, 'Manual', NULL, ?, 'open', 'human', ?, ?, ?, ?, ?)`,
        ).bind(id, ctx.access.ownerId, input.storeId, input.customerName, ctx.user.userId, preview, now, now, now),
        ctx.db.prepare(
          `INSERT INTO conversation_messages
           (id, conversation_id, workspace_owner_id, sender, actor_user_id, body, created_at)
           VALUES (?, ?, ?, 'customer', NULL, ?, ?)`,
        ).bind(messageId, id, ctx.access.ownerId, input.firstMessage, now),
      ]);
      await recordWorkspaceActivity(ctx.db, {
        access: ctx.access, user: ctx.user, action: 'conversation.create', summary: 'Registró una conversación manual',
      });
      return json({ conversations: await listConversations(ctx, input.storeId), conversationId: id }, 201);
    }

    const input = z.object({
      action: z.enum(['message', 'mode', 'status', 'stage', 'assign']),
      conversationId: z.string().uuid(),
      text: z.string().trim().min(1).max(2000).optional(),
      mode: z.enum(['ai', 'human']).optional(),
      status: z.enum(['open', 'waiting', 'closed']).optional(),
      salesStage: z.enum(CONVERSATION_SALES_STAGES).optional(),
      assignedUserId: z.string().min(1).max(200).nullable().optional(),
    }).parse(JSON.parse(raw));
    const conversation = await requireConversation(ctx, input.conversationId);

    if (input.action === 'message') {
      if (!input.text) return json({ error: 'Escribe un mensaje.' }, 400);
      const messageCount = await ctx.db.prepare(
        'SELECT COUNT(*) AS total FROM conversation_messages WHERE conversation_id = ?',
      ).bind(input.conversationId).first<{ total: number }>();
      if ((messageCount?.total ?? 0) >= 500) return json({ error: 'Esta conversación alcanzó el límite de mensajes.' }, 400);
      if (conversation.channel === 'WhatsApp') {
        const recipient = whatsappRecipient(conversation.external_id || '');
        const phoneNumberId = (conversation.external_id || '').split(':')[0];
        if (!recipient || !/^\d{5,30}$/.test(phoneNumberId)) {
          return json({ error: 'La conversación no tiene un destinatario de WhatsApp válido.' }, 409);
        }
        await sendWhatsAppText({ env, phoneNumberId, recipient, text: input.text });
      }
      await ctx.db.batch([
        ctx.db.prepare(
          `INSERT INTO conversation_messages
           (id, conversation_id, workspace_owner_id, sender, actor_user_id, body, created_at)
           VALUES (?, ?, ?, 'team', ?, ?, ?)`,
        ).bind(crypto.randomUUID(), input.conversationId, ctx.access.ownerId, ctx.user.userId, input.text, now),
        ctx.db.prepare(
          `UPDATE conversations SET mode = 'human', assigned_user_id = ?, status = 'waiting',
                  last_message_preview = ?, last_message_at = ?, updated_at = ?
            WHERE id = ? AND workspace_owner_id = ?`,
        ).bind(ctx.user.userId, input.text.slice(0, 180), now, now, input.conversationId, ctx.access.ownerId),
      ]);
      return json({ messages: await listMessages(ctx, input.conversationId) });
    }

    if (input.action === 'mode') {
      if (!input.mode) return json({ error: 'Selecciona quién atenderá.' }, 400);
      await ctx.db.prepare(
        `UPDATE conversations SET mode = ?, assigned_user_id = ?, updated_at = ?
          WHERE id = ? AND workspace_owner_id = ?`,
      ).bind(input.mode, input.mode === 'human' ? ctx.user.userId : null, now, input.conversationId, ctx.access.ownerId).run();
    } else if (input.action === 'status') {
      if (!input.status) return json({ error: 'Selecciona un estado.' }, 400);
      await ctx.db.prepare(
        `UPDATE conversations SET status = ?, updated_at = ?
          WHERE id = ? AND workspace_owner_id = ?`,
      ).bind(input.status, now, input.conversationId, ctx.access.ownerId).run();
    } else if (input.action === 'stage') {
      if (!input.salesStage) return json({ error: 'Selecciona una etapa comercial.' }, 400);
      await ctx.db.prepare(
        `UPDATE conversations SET sales_stage = ?, updated_at = ?
          WHERE id = ? AND workspace_owner_id = ?`,
      ).bind(input.salesStage, now, input.conversationId, ctx.access.ownerId).run();
      await recordWorkspaceActivity(ctx.db, {
        access: ctx.access,
        user: ctx.user,
        action: 'conversation.stage',
        summary: 'Actualizó la etapa comercial de una conversación',
      });
    } else {
      const conversationStore = ctx.workspace.stores.find((store) => store.id === conversation.store_id);
      if (!conversationStore?.modules.advisors) {
        return json({ error: 'Activa Equipo de asesores en la configuración de esta tienda.' }, 409);
      }
      const advisorId = input.assignedUserId ?? null;
      if (advisorId && !await validAdvisor(ctx, advisorId)) {
        return json({ error: 'La persona seleccionada no pertenece a este equipo.' }, 404);
      }
      await ctx.db.prepare(
        `UPDATE conversations SET assigned_user_id = ?, mode = 'human', status = 'open', updated_at = ?
          WHERE id = ? AND workspace_owner_id = ?`,
      ).bind(advisorId, now, input.conversationId, ctx.access.ownerId).run();
      await recordWorkspaceActivity(ctx.db, {
        access: ctx.access,
        user: ctx.user,
        action: 'conversation.assign',
        summary: advisorId ? 'Asignó una conversación a una persona del equipo' : 'Dejó una conversación sin responsable',
      });
    }
    return json({ conversations: await listConversations(ctx) });
  } catch (error) {
    return failure(error);
  }
}
