import { env, waitUntil } from 'cloudflare:workers';
import { normalizeWorkspace, type Workspace } from '../../../../lib/domain';
import { retrieveKnowledgeContext } from '../../../../lib/knowledge';
import {
  AssistantProviderError,
  assistantProviderConfigs,
  generateAssistantReply,
} from '../../../../lib/assistant-providers';
import { sendWhatsAppText, verifyWhatsAppSignature } from '../../../../lib/whatsapp';

export const dynamic = 'force-dynamic';

type IncomingMessage = {
  id?: string;
  from?: string;
  type?: string;
  text?: { body?: string };
};

type WhatsAppPayload = {
  object?: string;
  entry?: Array<{
    changes?: Array<{
      value?: {
        metadata?: { phone_number_id?: string };
        contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>;
        messages?: IncomingMessage[];
      };
    }>;
  }>;
};

const plain = (body: string, status = 200) => new Response(body, {
  status,
  headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' },
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');
  if (mode === 'subscribe' && env.WHATSAPP_VERIFY_TOKEN && token === env.WHATSAPP_VERIFY_TOKEN && challenge) {
    return plain(challenge);
  }
  return plain('Verificación rechazada.', 403);
}

function messageBody(message: IncomingMessage) {
  if (message.type === 'text') return message.text?.body?.trim().slice(0, 4000) || '';
  const labels: Record<string, string> = {
    image: '[El cliente envió una imagen]',
    video: '[El cliente envió un video]',
    audio: '[El cliente envió un audio]',
    document: '[El cliente envió un documento]',
    location: '[El cliente compartió una ubicación]',
    contacts: '[El cliente compartió un contacto]',
    sticker: '[El cliente envió un sticker]',
  };
  return labels[message.type || ''] || '[El cliente envió un mensaje no compatible]';
}

async function markEvent(db: D1Database, eventId: string, status: 'processed' | 'failed', error?: string) {
  await db.prepare(
    'UPDATE whatsapp_events SET status = ?, error = ?, processed_at = ? WHERE event_id = ?',
  ).bind(status, error?.slice(0, 300) || null, new Date().toISOString(), eventId).run();
}

async function processMessage(phoneNumberId: string, message: IncomingMessage, customerName: string) {
  if (!env.DB || !message.id || !message.from) return;
  const db = env.DB;
  const now = new Date().toISOString();
  const claim = await db.prepare(
    `INSERT OR IGNORE INTO whatsapp_events
     (event_id, phone_number_id, status, error, received_at, processed_at)
     VALUES (?, ?, 'processing', NULL, ?, NULL)`,
  ).bind(message.id, phoneNumberId, now).run();
  if (!claim.meta.changes) return;

  try {
    const channel = await db.prepare(
      `SELECT workspace_owner_id, store_id FROM whatsapp_channels
        WHERE phone_number_id = ? AND enabled = 1`,
    ).bind(phoneNumberId).first<{ workspace_owner_id: string; store_id: string }>();
    if (!channel) {
      await markEvent(db, message.id, 'failed', 'Número no conectado a una tienda activa.');
      return;
    }
    const row = await db.prepare('SELECT payload FROM workspaces WHERE owner_id = ?')
      .bind(channel.workspace_owner_id).first<{ payload: string }>();
    const workspace = normalizeWorkspace(row ? JSON.parse(row.payload) as Workspace : { stores: [] });
    const store = workspace.stores.find((item) => item.id === channel.store_id);
    if (!store) {
      await markEvent(db, message.id, 'failed', 'Tienda no disponible.');
      return;
    }

    const externalId = `${phoneNumberId}:${message.from}`;
    let conversation = await db.prepare(
      `SELECT id, mode FROM conversations
        WHERE workspace_owner_id = ? AND channel = 'WhatsApp' AND external_id = ?`,
    ).bind(channel.workspace_owner_id, externalId).first<{ id: string; mode: 'ai' | 'human' }>();
    if (!conversation) {
      // WhatsApp starts in human mode so the team decides when an AI should reply.
      conversation = { id: crypto.randomUUID(), mode: 'human' };
      await db.prepare(
        `INSERT INTO conversations
         (id, workspace_owner_id, store_id, channel, external_id, customer_name,
          status, mode, assigned_user_id, last_message_preview, last_message_at, created_at, updated_at)
         VALUES (?, ?, ?, 'WhatsApp', ?, ?, 'open', 'human', NULL, '', ?, ?, ?)`,
      ).bind(conversation.id, channel.workspace_owner_id, store.id, externalId,
        customerName || `WhatsApp ${message.from.slice(-4)}`, now, now, now).run();
    }

    const body = messageBody(message);
    if (!body) {
      await markEvent(db, message.id, 'processed');
      return;
    }
    const previous = await db.prepare(
      `SELECT sender, body FROM conversation_messages
        WHERE conversation_id = ? ORDER BY created_at DESC, id DESC LIMIT 12`,
    ).bind(conversation.id).all<{ sender: string; body: string }>();
    const history = previous.results.reverse()
      .filter((item) => ['customer', 'assistant', 'team'].includes(item.sender))
      .map((item) => ({ role: item.sender === 'customer' ? 'user' as const : 'assistant' as const, text: item.body }));
    await db.batch([
      db.prepare(
        `INSERT INTO conversation_messages
         (id, conversation_id, workspace_owner_id, sender, actor_user_id, body, created_at)
         VALUES (?, ?, ?, 'customer', NULL, ?, ?)`,
      ).bind(crypto.randomUUID(), conversation.id, channel.workspace_owner_id, body, now),
      db.prepare(
        `UPDATE conversations SET customer_name = ?, status = 'open', last_message_preview = ?,
                last_message_at = ?, updated_at = ? WHERE id = ? AND workspace_owner_id = ?`,
      ).bind(customerName || `WhatsApp ${message.from.slice(-4)}`, body.slice(0, 180), now, now,
        conversation.id, channel.workspace_owner_id),
    ]);

    if (conversation.mode === 'human') {
      await markEvent(db, message.id, 'processed');
      return;
    }

    let reply = '';
    let useHuman = message.type !== 'text';
    if (useHuman) {
      reply = 'Gracias por enviarnos el archivo. Una persona del equipo continuará la atención por aquí.';
    } else {
      try {
        const knowledgeContext = await retrieveKnowledgeContext(db, {
          ownerId: channel.workspace_owner_id,
          storeId: store.id,
          query: [...history.slice(-4).map((item) => item.text), body].join(' '),
        });
        reply = await generateAssistantReply({
          provider: store.agent.provider || 'gemini',
          configs: assistantProviderConfigs(env),
          store,
          message: body,
          history,
          knowledgeContext,
        });
      } catch (error) {
        if (!(error instanceof AssistantProviderError)) throw error;
        useHuman = true;
        reply = 'Gracias por escribirnos. Tu consulta quedó guardada y una persona del equipo continuará la atención.';
      }
    }

    await sendWhatsAppText({ env, phoneNumberId, recipient: message.from, text: reply });
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
    await markEvent(db, message.id, 'processed');
  } catch (error) {
    const messageText = error instanceof Error ? error.message : 'Error desconocido';
    await markEvent(db, message.id, 'failed', messageText).catch(() => undefined);
    console.error('WhatsApp message processing failed', error instanceof Error ? error.name : 'UnknownError');
  }
}

export async function POST(request: Request) {
  if (!env.DB || !env.WHATSAPP_APP_SECRET) return plain('Integración no configurada.', 503);
  const raw = await request.arrayBuffer();
  if (raw.byteLength > 1_000_000) return plain('Solicitud demasiado grande.', 413);
  if (!await verifyWhatsAppSignature(raw, request.headers.get('x-hub-signature-256'), env.WHATSAPP_APP_SECRET)) {
    return plain('Firma inválida.', 401);
  }
  let payload: WhatsAppPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(raw)) as WhatsAppPayload;
  } catch {
    return plain('Solicitud inválida.', 400);
  }
  if (payload.object !== 'whatsapp_business_account') return plain('IGNORED');

  const jobs: Promise<void>[] = [];
  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value;
      const phoneNumberId = value?.metadata?.phone_number_id || '';
      if (!/^\d{5,30}$/.test(phoneNumberId)) continue;
      const names = new Map((value?.contacts || []).map((contact) => [contact.wa_id, contact.profile?.name || '']));
      for (const message of value?.messages || []) {
        jobs.push(processMessage(phoneNumberId, message, names.get(message.from) || ''));
      }
    }
  }
  if (jobs.length) waitUntil(Promise.all(jobs).then(() => undefined));
  return plain('EVENT_RECEIVED');
}
