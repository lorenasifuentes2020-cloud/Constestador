import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../lib/domain.ts';
import { buildGeminiSystemPrompt, generateGeminiReply } from '../lib/gemini.ts';

function fixture() {
  const store = createStore({ name: 'Moda', category: 'Ropa', color: 'plum' });
  store.products = [
    { id: 'active', name: 'Blusa', sku: 'BL', category: 'Ropa', price: 89.9, stock: 5, description: 'Algodón', features: 'Tela ligera', benefits: 'Cómoda para clima cálido', idealFor: 'Uso diario', variants: 'Tallas S, M y L', salesNotes: 'Combina comodidad y acabado formal', active: true },
    { id: 'hidden', name: 'Producto oculto', sku: 'OC', category: 'Ropa', price: 10, stock: 1, description: '', features: '', benefits: '', idealFor: '', variants: '', salesNotes: '', active: false },
  ];
  store.faqs = [{ id: 'faq', title: 'Tallas', content: 'S, M y L', active: true }];
  return store;
}

test('el contexto de Gemini incluye solo datos comerciales de la tienda', () => {
  const prompt = buildGeminiSystemPrompt(fixture(), '[Fuente interna: Guía, fragmento 1]\nEscucha la objeción antes de responder.');
  assert.match(prompt, /Blusa/);
  assert.match(prompt, /S, M y L/);
  assert.match(prompt, /Cómoda para clima cálido/);
  assert.match(prompt, /motorizado cubre todo Lima/);
  assert.doesNotMatch(prompt, /Producto oculto/);
  assert.match(prompt, /No ofrezcas condiciones de cambios o devoluciones/);
  assert.match(prompt, /Proceso de venta: comprende la necesidad antes de recomendar/);
  assert.match(prompt, /pregunta si desea que el equipo registre el pedido/);
  assert.match(prompt, /No presiones, no uses urgencia falsa/);
  assert.match(prompt, /Escucha la objeción antes de responder/);
  assert.match(prompt, /No menciones títulos ni fuentes internas/);
});

test('envía historial breve a Gemini Flash sin razonamiento de alto consumo', async () => {
  let requestUrl = '';
  let requestInit: RequestInit | undefined;
  const fetcher: typeof fetch = async (url, init) => {
    requestUrl = String(url);
    requestInit = init;
    return new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: 'Respuesta comercial' }] } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const reply = await generateGeminiReply({
    apiKey: 'test-key',
    model: 'gemini-2.5-flash',
    store: fixture(),
    message: '¿Tienes blusas?',
    history: [{ role: 'assistant', text: 'Hola' }],
    fetcher,
  });
  assert.equal(reply, 'Respuesta comercial');
  assert.match(requestUrl, /gemini-2\.5-flash:generateContent$/);
  assert.equal(new Headers(requestInit?.headers).get('x-goog-api-key'), 'test-key');
  const body = JSON.parse(String(requestInit?.body));
  assert.equal(body.generationConfig.thinkingConfig, undefined);
  assert.equal(body.contents[0].role, 'model');
  assert.equal(body.contents[1].parts[0].text, '¿Tienes blusas?');
});

test('explica cuando Gemini alcanza su cuota', async () => {
  await assert.rejects(
    generateGeminiReply({
      apiKey: 'test-key',
      model: 'gemini-2.5-flash',
      store: fixture(),
      message: 'Hola',
      history: [],
      fetcher: async () => new Response('{}', { status: 429 }),
    }),
    /cuota temporal/,
  );
});
