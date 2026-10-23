import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { normalizeWorkspace, type Workspace } from '../../../../../lib/domain';
import {
  AssistantProviderError,
  assistantProviderConfigs,
  generateAssistantReply,
} from '../../../../../lib/assistant-providers';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store', 'Content-Type': 'application/json' };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers });
const slugSchema = z.string().regex(/^[a-z0-9-]{3,60}$/);
const visitorSchema = z.string().uuid();

type RouteContext = { params: Promise<{ slug: string }> };

async function publicStore(slug: string) {
  if (!env.DB) throw Object.assign(new Error('El chat no está disponible.'), { status: 503 });
  const channel = await env.DB.prepare(
    `SELECT workspace_owner_id, store_id FROM public_store_channels
      WHERE slug = ? AND enabled = 1`,
  ).bind(slug).first<{ workspace_owner_id: string; store_id: string }>();
  if (!channel) throw Object.assign(new Error('Este chat no está disponible.'), { status: 404 });
  const row = await env.DB.prepare('SELECT payload FROM workspaces WHERE owner_id = ?')
    .bind(channel.workspace_owner_id).first<{ payload: string }>();
  const workspace = normalizeWorkspace(row ? JSON.parse(row.payload) as Workspace : { stores: [] });
  const store = workspace.stores.find((item) => item.id === channel.store_id);
  if (!store) throw Object.assign(new Error('Esta tienda no está disponible.'), { status: 404 });
  return { db: env.DB, channel, store };
}

function failure(error: unknown) {
  if (error instanceof z.ZodError || error instanceof SyntaxError) {
    return json({ error: 'Revisa el mensaje e inténtalo nuevamente.' }, 400);
  }
  const known = error as { name?: string; message?: string; status?: number };
  console.error('Public chat operation failed', known?.name);
  return json({ error: known.status ? known.message : 'El chat no está disponible temporalmente.' }, known.status || 500);
}

async function publicMessages(db: D1Database, ownerId: string, conversationId: string) {
  const result = await db.prepare(
    `SELECT sender, body, created_at FROM (
       SELECT sender, body, created_at, id FROM conversation_messages
        WHERE conversation_id = ? AND workspace_owner_id = ?
        ORDER BY created_at DESC, id DESC LIMIT 100
     ) ORDER BY created_at ASC, id ASC`,
  ).bind(conversationId, ownerId).all<{ sender: string; body: string; created_at: string }>();
  return result.results.map((item) => ({
    role: item.sender === 'customer' ? 'user' : 'assistant',
    text: item.body,
    createdAt: item.created_at,
  }));
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const slug = slugSchema.parse((await context.params).slug);
    const { db, channel, store } = await publicStore(slug);
    const visitorValue = new URL(request.url).searchParams.get('visitorId');
    let messages: Array<{ role: string; text: string; createdAt: string }> = [];
    if (visitorValue) {
      const visitorId = visitorSchema.parse(visitorValue);
      const conversation = await db.prepare(
        `SELECT id FROM conversations
          WHERE workspace_owner_id = ? AND store_id = ? AND channel = 'Web' AND external_id = ?`,
      ).bind(channel.workspace_owner_id, store.id, `${slug}:${visitorId}`).first<{ id: string }>();
      if (conversation) messages = await publicMessages(db, channel.workspace_owner_id, conversation.id);
    }
    return json({
      store: { name: store.name, category: store.category, color: store.color },
      agent: { name: store.agent.name, greeting: store.agent.greeting },
      messages,
    });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const origin = request.headers.get('origin');
    if (!origin || origin !== new URL(request.url).origin) return json({ error: 'Origen no permitido.' }, 403);
    const slug = slugSchema.parse((await context.params).slug);
    const raw = await request.text();
    if (raw.length > 6000) return json({ error: 'El mensaje es demasiado grande.' }, 413);
    const input = z.object({
      visitorId: visitorSchema.optional(),
      customerName: z.string().trim().max(80).default(''),
      message: z.string().trim().min(1).max(1200),
    }).parse(JSON.parse(raw));
    const { db, channel, store } = await publicStore(slug);
    const visitorId = input.visitorId || crypto.randomUUID();
    const externalId = `${slug}:${visitorId}`;
    let conversation = await db.prepare(
      `SELECT id, mode FROM conversations
        WHERE workspace_owner_id = ? AND store_id = ? AND channel = 'Web' AND external_id = ?`,
    ).bind(channel.workspace_owner_id, store.id, externalId).first<{ id: string; mode: 'ai' | 'human' }>();
    const now = new Date().toISOString();

    if (!conversation) {
      const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const recent = await db.prepare(
        `SELECT COUNT(*) AS total FROM conversations
          WHERE workspace_owner_id = ? AND store_id = ? AND channel = 'Web' AND created_at >= ?`,
      ).bind(channel.workspace_owner_id, store.id, hourAgo).first<{ total: number }>();
      if ((recent?.total ?? 0) >= 200) return json({ error: 'La tienda recibió muchas conversaciones. Inténtalo más tarde.' }, 429);
      conversation = { id: crypto.randomUUID(), mode: 'ai' };
      await db.prepare(
        `INSERT INTO conversations
         (id, workspace_owner_id, store_id, channel, external_id, customer_name,
          status, mode, assigned_user_id, last_message_preview, last_message_at, created_at, updated_at)
         VALUES (?, ?, ?, 'Web', ?, ?, 'open', 'ai', NULL, '', ?, ?, ?)`,
      ).bind(conversation.id, channel.workspace_owner_id, store.id, externalId,
        input.customerName || 'Visitante web', now, now, now).run();
    }

    const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const usage = await db.prepare(
      `SELECT COUNT(*) AS total FROM conversation_messages
        WHERE conversation_id = ? AND sender = 'customer' AND created_at >= ?`,
    ).bind(conversation.id, hourAgo).first<{ total: number }>();
    if ((usage?.total ?? 0) >= 30) return json({ error: 'Alcanzaste el límite temporal de mensajes. Inténtalo más tarde.' }, 429);

    const previous = await db.prepare(
      `SELECT sender, body FROM conversation_messages
        WHERE conversation_id = ? ORDER BY created_at DESC, id DESC LIMIT 12`,
    ).bind(conversation.id).all<{ sender: string; body: string }>();
    const history = previous.results.reverse()
      .filter((item) => item.sender === 'customer' || item.sender === 'assistant' || item.sender === 'team')
      .map((item) => ({ role: item.sender === 'customer' ? 'user' as const : 'assistant' as const, text: item.body }));
    await db.batch([
      db.prepare(
        `INSERT INTO conversation_messages
         (id, conversation_id, workspace_owner_id, sender, actor_user_id, body, created_at)
         VALUES (?, ?, ?, 'customer', NULL, ?, ?)`,
      ).bind(crypto.randomUUID(), conversation.id, channel.workspace_owner_id, input.message, now),
      db.prepare(
        `UPDATE conversations SET customer_name = CASE WHEN ? = '' THEN customer_name ELSE ? END,
                status = 'open', last_message_preview = ?, last_message_at = ?, updated_at = ?
          WHERE id = ? AND workspace_owner_id = ?`,
      ).bind(input.customerName, input.customerName, input.message.slice(0, 180), now, now,
        conversation.id, channel.workspace_owner_id),
    ]);

    let reply: string;
    let useHuman = conversation.mode === 'human';
    if (useHuman) {
      reply = 'Gracias. Tu mensaje llegó al equipo de la tienda y una persona continuará la atención.';
    } else {
      try {
        const configs = assistantProviderConfigs(env);
        reply = await generateAssistantReply({
          provider: store.agent.provider || 'gemini', configs, store,
          message: input.message, history,
        });
      } catch (error) {
        if (!(error instanceof AssistantProviderError)) throw error;
        useHuman = true;
        reply = 'Gracias por escribirnos. Guardamos tu consulta para que una persona del equipo pueda ayudarte.';
      }
    }
    const replyAt = new Date().toISOString();
    await db.batch([
      db.prepare(
        `INSERT INTO conversation_messages
         (id, conversation_id, workspace_owner_id, sender, actor_user_id, body, created_at)
         VALUES (?, ?, ?, 'assistant', NULL, ?, ?)`,
      ).bind(crypto.randomUUID(), conversation.id, channel.workspace_owner_id, reply, replyAt),
      db.prepare(
        `UPDATE conversations SET mode = ?, status = ?, assigned_user_id = NULL,
                last_message_preview = ?, last_message_at = ?, updated_at = ?
          WHERE id = ? AND workspace_owner_id = ?`,
      ).bind(useHuman ? 'human' : 'ai', useHuman ? 'open' : 'waiting', reply.slice(0, 180),
        replyAt, replyAt, conversation.id, channel.workspace_owner_id),
    ]);
    return json({ visitorId, reply, handedToTeam: useHuman });
  } catch (error) {
    return failure(error);
  }
}
