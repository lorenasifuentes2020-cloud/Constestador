import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { normalizeWorkspace, type Workspace } from '../../../lib/domain';
import { recordWorkspaceActivity } from '../../../lib/workspace-audit';
import { resolveWorkspaceAccess, selectedWorkspaceOwner } from '../../../lib/workspace-access';
import { whatsappGraphVersion } from '../../../lib/whatsapp';
import { getChatGPTUser } from '../../chatgpt-auth';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store', 'Content-Type': 'application/json' };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers });

async function context(request: Request) {
  const user = await getChatGPTUser();
  if (!user) throw Object.assign(new Error('Inicia sesión para configurar WhatsApp.'), { status: 401 });
  if (!env.DB) throw Object.assign(new Error('El almacenamiento no está disponible.'), { status: 503 });
  const access = await resolveWorkspaceAccess(env.DB, user, selectedWorkspaceOwner(request));
  const row = await env.DB.prepare('SELECT payload FROM workspaces WHERE owner_id = ?')
    .bind(access.ownerId).first<{ payload: string }>();
  const workspace = normalizeWorkspace(row ? JSON.parse(row.payload) as Workspace : { stores: [] });
  return { user, access, db: env.DB, workspace };
}

function failure(error: unknown) {
  if (error instanceof z.ZodError) return json({ error: error.issues[0]?.message || 'Revisa los datos.' }, 400);
  if (error instanceof SyntaxError) return json({ error: 'Solicitud inválida.' }, 400);
  const known = error as { name?: string; message?: string; status?: number };
  console.error('WhatsApp configuration failed', known?.name);
  return json({ error: known.status ? known.message : 'No se pudo configurar WhatsApp.' }, known.status || 500);
}

async function listChannels(db: D1Database, ownerId: string) {
  const result = await db.prepare(
    `SELECT store_id, phone_number_id, business_account_id, display_phone_number, enabled, updated_at
       FROM whatsapp_channels WHERE workspace_owner_id = ? ORDER BY updated_at DESC`,
  ).bind(ownerId).all<Record<string, unknown>>();
  return result.results.map((row) => ({
    storeId: String(row.store_id),
    phoneNumberId: String(row.phone_number_id),
    businessAccountId: String(row.business_account_id),
    displayPhoneNumber: String(row.display_phone_number),
    enabled: Boolean(row.enabled),
    updatedAt: String(row.updated_at),
  }));
}

export async function GET(request: Request) {
  try {
    const ctx = await context(request);
    return json({
      channels: await listChannels(ctx.db, ctx.access.ownerId),
      credentials: {
        accessToken: Boolean(env.WHATSAPP_ACCESS_TOKEN),
        appSecret: Boolean(env.WHATSAPP_APP_SECRET),
        verifyToken: Boolean(env.WHATSAPP_VERIFY_TOKEN),
        ready: Boolean(env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_APP_SECRET && env.WHATSAPP_VERIFY_TOKEN),
      },
      graphVersion: whatsappGraphVersion(env),
      webhookUrl: `${new URL(request.url).origin}/api/whatsapp/webhook`,
    });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) return json({ error: 'Origen no permitido.' }, 403);
    const ctx = await context(request);
    const raw = await request.text();
    if (raw.length > 4000) return json({ error: 'Solicitud demasiado grande.' }, 413);
    const input = z.object({
      storeId: z.string().min(1).max(100),
      phoneNumberId: z.string().trim().regex(/^\d{5,30}$/, 'El identificador del número debe contener solo dígitos.'),
      businessAccountId: z.string().trim().regex(/^\d{5,30}$/).or(z.literal('')),
      displayPhoneNumber: z.string().trim().max(30),
      enabled: z.boolean(),
    }).parse(JSON.parse(raw));
    const store = ctx.workspace.stores.find((item) => item.id === input.storeId);
    if (!store) return json({ error: 'La tienda no pertenece a este espacio.' }, 404);
    if (input.enabled && !(env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_APP_SECRET && env.WHATSAPP_VERIFY_TOKEN)) {
      return json({ error: 'Primero configura los tres secretos de WhatsApp en el servidor.' }, 503);
    }
    const collision = await ctx.db.prepare(
      `SELECT workspace_owner_id, store_id FROM whatsapp_channels
        WHERE phone_number_id = ? AND NOT (workspace_owner_id = ? AND store_id = ?)`,
    ).bind(input.phoneNumberId, ctx.access.ownerId, input.storeId)
      .first<{ workspace_owner_id: string; store_id: string }>();
    if (collision) return json({ error: 'Ese identificador de número ya está conectado a otra tienda.' }, 409);
    const existing = await ctx.db.prepare(
      'SELECT id FROM whatsapp_channels WHERE workspace_owner_id = ? AND store_id = ?',
    ).bind(ctx.access.ownerId, input.storeId).first<{ id: string }>();
    const now = new Date().toISOString();
    if (existing) {
      await ctx.db.prepare(
        `UPDATE whatsapp_channels
            SET phone_number_id = ?, business_account_id = ?, display_phone_number = ?, enabled = ?, updated_at = ?
          WHERE id = ? AND workspace_owner_id = ?`,
      ).bind(input.phoneNumberId, input.businessAccountId, input.displayPhoneNumber,
        input.enabled, now, existing.id, ctx.access.ownerId).run();
    } else {
      await ctx.db.prepare(
        `INSERT INTO whatsapp_channels
         (id, workspace_owner_id, store_id, phone_number_id, business_account_id,
          display_phone_number, enabled, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(crypto.randomUUID(), ctx.access.ownerId, input.storeId, input.phoneNumberId,
        input.businessAccountId, input.displayPhoneNumber, input.enabled, now, now).run();
    }
    await recordWorkspaceActivity(ctx.db, {
      access: ctx.access,
      user: ctx.user,
      action: 'channel.whatsapp',
      summary: input.enabled ? 'Activó WhatsApp para una tienda' : 'Guardó o pausó la conexión de WhatsApp',
    });
    return json({ channels: await listChannels(ctx.db, ctx.access.ownerId) });
  } catch (error) {
    return failure(error);
  }
}
