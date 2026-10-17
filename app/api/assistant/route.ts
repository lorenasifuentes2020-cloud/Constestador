import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { normalizeWorkspace, type Workspace } from '../../../lib/domain';
import {
  generateGeminiReply,
  GeminiError,
} from '../../../lib/gemini';
import {
  resolveWorkspaceAccess,
  selectedWorkspaceOwner,
} from '../../../lib/workspace-access';
import { getChatGPTUser } from '../../chatgpt-auth';

export const dynamic = 'force-dynamic';

const responseHeaders = {
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: responseHeaders });
}

function failure(error: unknown) {
  if (error instanceof z.ZodError) {
    return json({ error: error.issues[0]?.message || 'Revisa el mensaje.' }, 400);
  }
  if (error instanceof GeminiError) return json({ error: error.message }, error.status);
  const known = error as { name?: string; message?: string; status?: number };
  console.error('Assistant operation failed', known?.name);
  return json(
    { error: known.status ? known.message : 'No se pudo consultar al vendedor virtual.' },
    known.status || 500,
  );
}

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return json({ error: 'Inicia sesión para revisar Gemini.' }, 401);
  return json({
    configured: Boolean(env.GEMINI_API_KEY),
    model: env.GEMINI_MODEL || 'gemini-3.1-pro-preview',
  });
}

export async function POST(request: Request) {
  try {
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) {
      return json({ error: 'Origen no permitido.' }, 403);
    }

    const user = await getChatGPTUser();
    if (!user) return json({ error: 'Inicia sesión para probar el vendedor.' }, 401);
    if (!env.DB) return json({ error: 'El almacenamiento no está disponible.' }, 503);
    if (!env.GEMINI_API_KEY) {
      return json({ error: 'Gemini todavía no tiene una clave configurada.' }, 503);
    }

    const raw = await request.text();
    if (raw.length > 50_000) return json({ error: 'La conversación es demasiado grande.' }, 413);
    const input = z.object({
      storeId: z.string().min(1).max(100),
      message: z.string().trim().min(1).max(2000),
      history: z.array(z.object({
        role: z.enum(['user', 'assistant']),
        text: z.string().trim().min(1).max(2000),
      })).max(20).default([]),
    }).parse(JSON.parse(raw));

    const access = await resolveWorkspaceAccess(
      env.DB,
      user,
      selectedWorkspaceOwner(request),
    );
    const row = await env.DB.prepare(
      'SELECT payload FROM workspaces WHERE owner_id = ?',
    ).bind(access.ownerId).first<{ payload: string }>();
    const workspace = normalizeWorkspace(row ? JSON.parse(row.payload) as Workspace : { stores: [] });
    const store = workspace.stores.find((item) => item.id === input.storeId);
    if (!store) return json({ error: 'La tienda no existe o no pertenece a tu espacio.' }, 404);

    const model = env.GEMINI_MODEL || 'gemini-3.1-pro-preview';
    const reply = await generateGeminiReply({
      apiKey: env.GEMINI_API_KEY,
      model,
      store,
      message: input.message,
      history: input.history,
    });
    return json({ reply, model });
  } catch (error) {
    return failure(error);
  }
}
