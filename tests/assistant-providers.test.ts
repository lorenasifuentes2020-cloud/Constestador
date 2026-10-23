import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../lib/domain.ts';
import {
  AssistantProviderError,
  generateAssistantReply,
  type AssistantProviderConfigs,
} from '../lib/assistant-providers.ts';

const configs: AssistantProviderConfigs = {
  gemini: { apiKey: 'gemini-key', model: 'gemini-test' },
  anthropic: { apiKey: 'claude-key', model: 'claude-test' },
  openai: { apiKey: 'openai-key', model: 'gpt-test' },
};

const store = () => createStore({ name: 'Moda', category: 'Ropa', color: 'plum' });

test('Claude recibe el mismo contexto comercial sin datos privados', async () => {
  let url = '';
  let init: RequestInit | undefined;
  const reply = await generateAssistantReply({
    provider: 'anthropic', configs, store: store(), message: 'Hola', history: [],
    fetcher: async (request, options) => {
      url = String(request); init = options;
      return new Response(JSON.stringify({ content: [{ type: 'text', text: 'Hola desde Claude' }] }), {
        headers: { 'Content-Type': 'application/json' },
      });
    },
  });
  assert.equal(reply, 'Hola desde Claude');
  assert.equal(url, 'https://api.anthropic.com/v1/messages');
  assert.equal(new Headers(init?.headers).get('x-api-key'), 'claude-key');
  const body = JSON.parse(String(init?.body));
  assert.match(body.system, /vendedor virtual de Moda/);
  assert.equal(body.messages.at(-1).content, 'Hola');
});

test('ChatGPT usa Responses API con razonamiento alto', async () => {
  let init: RequestInit | undefined;
  const reply = await generateAssistantReply({
    provider: 'openai', configs, store: store(), message: 'Catálogo',
    history: [{ role: 'assistant', text: 'Hola' }],
    fetcher: async (_request, options) => {
      init = options;
      return new Response(JSON.stringify({ output_text: 'Respuesta de ChatGPT' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    },
  });
  assert.equal(reply, 'Respuesta de ChatGPT');
  assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer openai-key');
  const body = JSON.parse(String(init?.body));
  assert.equal(body.reasoning.effort, 'high');
  assert.equal(body.input.at(-1).content[0].text, 'Catálogo');
});

test('rechaza un proveedor seleccionado que no tiene clave', async () => {
  await assert.rejects(
    generateAssistantReply({
      provider: 'anthropic',
      configs: { ...configs, anthropic: { model: 'claude-test' } },
      store: store(), message: 'Hola', history: [],
    }),
    (error: unknown) => error instanceof AssistantProviderError
      && error.status === 503
      && /no tiene una clave/.test(error.message),
  );
});
