import type { Store } from './domain.ts';
import {
  buildSellerSystemPrompt,
  generateGeminiReply,
  type AssistantMessage,
  GeminiError,
} from './gemini.ts';

export type AssistantProvider = 'gemini' | 'anthropic' | 'openai';

export type AssistantProviderConfig = {
  apiKey?: string;
  model: string;
};

export type AssistantProviderConfigs = Record<AssistantProvider, AssistantProviderConfig>;

export type AssistantProviderEnvironment = {
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_MODEL?: string;
  NEXO_OPENAI_API_KEY?: string;
  NEXO_OPENAI_MODEL?: string;
};

export function assistantProviderConfigs(env: AssistantProviderEnvironment): AssistantProviderConfigs {
  return {
    gemini: {
      apiKey: env.GEMINI_API_KEY,
      model: env.GEMINI_MODEL || 'gemini-3.8-flash',
    },
    anthropic: {
      apiKey: env.ANTHROPIC_API_KEY,
      model: env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
    },
    openai: {
      apiKey: env.NEXO_OPENAI_API_KEY,
      model: env.NEXO_OPENAI_MODEL || 'gpt-5.4',
    },
  };
}

export const ASSISTANT_PROVIDER_LABELS: Record<AssistantProvider, string> = {
  gemini: 'Gemini',
  anthropic: 'Claude',
  openai: 'ChatGPT',
};

export class AssistantProviderError extends Error {
  status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.status = status;
  }
}

type GenerateInput = {
  provider: AssistantProvider;
  configs: AssistantProviderConfigs;
  store: Store;
  message: string;
  history: AssistantMessage[];
  knowledgeContext?: string;
  fetcher?: typeof fetch;
};

const validModel = (model: string) => /^[a-zA-Z0-9._:-]{1,120}$/.test(model);

function ensureConfig(provider: AssistantProvider, config: AssistantProviderConfig) {
  const label = ASSISTANT_PROVIDER_LABELS[provider];
  if (!config.apiKey) {
    throw new AssistantProviderError(`${label} todavía no tiene una clave configurada.`, 503);
  }
  if (!validModel(config.model)) {
    throw new AssistantProviderError(`El modelo de ${label} configurado no es válido.`, 503);
  }
}

async function request(
  provider: AssistantProvider,
  url: string,
  init: RequestInit,
  fetcher: typeof fetch,
): Promise<Response> {
  const label = ASSISTANT_PROVIDER_LABELS[provider];
  try {
    return await fetcher(url, { ...init, signal: AbortSignal.timeout(45_000) });
  } catch {
    throw new AssistantProviderError(`${label} no respondió a tiempo. Inténtalo nuevamente.`);
  }
}

function checkResponse(provider: AssistantProvider, response: Response) {
  if (response.ok) return;
  const label = ASSISTANT_PROVIDER_LABELS[provider];
  if (response.status === 429) {
    throw new AssistantProviderError(`${label} alcanzó su cuota temporal. Inténtalo más tarde.`, 429);
  }
  if (response.status === 401 || response.status === 403) {
    throw new AssistantProviderError(`La clave de ${label} no es válida o no tiene acceso al modelo.`, 503);
  }
  throw new AssistantProviderError(`${label} no pudo generar una respuesta.`, 502);
}

async function generateClaudeReply(input: Omit<GenerateInput, 'provider' | 'configs'> & AssistantProviderConfig) {
  ensureConfig('anthropic', input);
  const response = await request('anthropic', 'https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': input.apiKey!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: input.model,
      max_tokens: 1200,
      temperature: 0.4,
      system: buildSellerSystemPrompt(input.store, input.knowledgeContext),
      messages: [
        ...input.history.slice(-12).map((item) => ({ role: item.role, content: item.text })),
        { role: 'user', content: input.message },
      ],
    }),
  }, input.fetcher ?? fetch);
  checkResponse('anthropic', response);
  const data = await response.json() as { content?: Array<{ type?: string; text?: string }> };
  const reply = data.content?.filter((item) => item.type === 'text')
    .map((item) => item.text?.trim()).filter(Boolean).join('\n').trim();
  if (!reply) throw new AssistantProviderError('Claude devolvió una respuesta vacía.');
  return reply;
}

async function generateOpenAIReply(input: Omit<GenerateInput, 'provider' | 'configs'> & AssistantProviderConfig) {
  ensureConfig('openai', input);
  const response = await request('openai', 'https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${input.apiKey}`,
    },
    body: JSON.stringify({
      model: input.model,
      instructions: buildSellerSystemPrompt(input.store, input.knowledgeContext),
      input: [
        ...input.history.slice(-12).map((item) => ({
          role: item.role,
          content: [{ type: item.role === 'assistant' ? 'output_text' : 'input_text', text: item.text }],
        })),
        { role: 'user', content: [{ type: 'input_text', text: input.message }] },
      ],
      max_output_tokens: 1200,
      reasoning: { effort: 'high' },
    }),
  }, input.fetcher ?? fetch);
  checkResponse('openai', response);
  const data = await response.json() as {
    output_text?: string;
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  };
  const reply = (data.output_text || data.output?.flatMap((item) => item.content || [])
    .filter((item) => item.type === 'output_text')
    .map((item) => item.text?.trim()).filter(Boolean).join('\n') || '').trim();
  if (!reply) throw new AssistantProviderError('ChatGPT devolvió una respuesta vacía.');
  return reply;
}

export async function generateAssistantReply(input: GenerateInput): Promise<string> {
  const config = input.configs[input.provider];
  ensureConfig(input.provider, config);
  if (input.provider === 'gemini') {
    try {
      return await generateGeminiReply({
        apiKey: config.apiKey!,
        model: config.model,
        store: input.store,
        message: input.message,
        history: input.history,
        knowledgeContext: input.knowledgeContext,
        fetcher: input.fetcher,
      });
    } catch (error) {
      if (error instanceof GeminiError) {
        throw new AssistantProviderError(error.message, error.status);
      }
      throw error;
    }
  }
  if (input.provider === 'anthropic') {
    return generateClaudeReply({ ...input, ...config });
  }
  return generateOpenAIReply({ ...input, ...config });
}
