import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { normalizeWorkspace, type Workspace } from '../../../lib/domain';
import { retrieveKnowledgeContext } from '../../../lib/knowledge';
import {
  ASSISTANT_PROVIDER_LABELS,
  AssistantProviderError,
  assistantProviderConfigs,
  generateAssistantReply,
} from '../../../lib/assistant-providers';
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
  if (error instanceof AssistantProviderError) return json({ error: error.message }, error.status);
  const known = error as { name?: string; message?: string; status?: number };
  console.error('Assistant operation failed', known?.name);
  return json(
    { error: known.status ? known.message : 'No se pudo consultar al vendedor virtual.' },
    known.status || 500,
  );
}

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return json({ error: 'Inicia sesión para revisar los motores de IA.' }, 401);
  const providers = assistantProviderConfigs(env);
  return json({
    providers: Object.fromEntries(Object.entries(providers).map(([key, config]) => [key, {
      configured: Boolean(config.apiKey),
      model: config.model,
      label: ASSISTANT_PROVIDER_LABELS[key as keyof typeof ASSISTANT_PROVIDER_LABELS],
    }])),
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

    const provider = store.agent.provider || 'gemini';
    const configs = assistantProviderConfigs(env);
    const knowledgeContext = await retrieveKnowledgeContext(env.DB, {
      ownerId: access.ownerId,
      storeId: store.id,
      query: [...input.history.slice(-4).map((item) => item.text), input.message].join(' '),
    });
    const reply = await generateAssistantReply({
      provider,
      configs,
      store,
      message: input.message,
      history: input.history,
      knowledgeContext,
    });
    return json({
      reply,
      provider,
      model: configs[provider].model,
      providerLabel: ASSISTANT_PROVIDER_LABELS[provider],
    });
  } catch (error) {
    return failure(error);
  }
}
