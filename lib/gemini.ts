import type { Store } from './domain';

export type AssistantMessage = {
  role: 'user' | 'assistant';
  text: string;
};

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string; thought?: boolean }>;
    };
  }>;
};

export class GeminiError extends Error {
  status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.status = status;
  }
}

const shortened = (value: string, max: number) => value.trim().slice(0, max);

export function buildGeminiSystemPrompt(store: Store): string {
  const products = store.products.filter((product) => product.active).slice(0, 250).map((product) => ({
    nombre: product.name,
    sku: product.sku,
    categoria: product.category,
    precioPEN: product.price,
    stock: product.stock,
    descripcion: shortened(product.description, 500),
  }));
  const entries = (items: Store['faqs']) => items.filter((item) => item.active).slice(0, 80).map((item) => ({
    titulo: item.title,
    contenido: shortened(item.content, 1200),
  }));

  return [
    `Eres ${store.agent.name}, el vendedor virtual de ${store.name}.`,
    `Tono: ${store.agent.tone}.`,
    'Responde en español, de forma breve, clara y útil para vender sin presionar.',
    'Usa únicamente los datos incluidos debajo. No inventes precios, stock, promociones, plazos, cuentas, pagos ni características.',
    'Si falta información, dilo claramente y deriva la consulta a una persona del equipo.',
    'No afirmes que un pago fue recibido o completado: los pagos se verifican y registran manualmente en Nexo.',
    'No ofrezcas condiciones de cambios o devoluciones. Si preguntan por ellas, indica que el equipo debe revisar el caso.',
    'No digas que eres una persona. Puedes identificarte como asistente virtual cuando sea relevante.',
    `Descripción del negocio: ${shortened(store.agent.description, 4000) || 'No configurada.'}`,
    `Instrucciones de atención: ${shortened(store.agent.instructions, 8000) || 'No configuradas.'}`,
    `Envíos: ${shortened(store.agent.shipping, 3000) || 'No configurados.'}`,
    `Pagos: ${shortened(store.agent.payments, 3000) || 'No configurados.'}`,
    `Catálogo activo: ${JSON.stringify(products)}`,
    `Preguntas frecuentes: ${JSON.stringify(entries(store.faqs))}`,
    `Reglas de la tienda: ${JSON.stringify(entries(store.rules))}`,
    `Promociones vigentes registradas: ${JSON.stringify(entries(store.promotions))}`,
  ].join('\n');
}

export async function generateGeminiReply(input: {
  apiKey: string;
  model: string;
  store: Store;
  message: string;
  history: AssistantMessage[];
  fetcher?: typeof fetch;
}): Promise<string> {
  if (!/^[a-zA-Z0-9._-]{1,100}$/.test(input.model)) {
    throw new GeminiError('El modelo de Gemini configurado no es válido.', 503);
  }

  const fetcher = input.fetcher ?? fetch;
  const contents = input.history.slice(-12).map((item) => ({
    role: item.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: item.text }],
  }));
  contents.push({ role: 'user', parts: [{ text: input.message }] });

  let response: Response;
  try {
    response = await fetcher(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(input.model)}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': input.apiKey,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: buildGeminiSystemPrompt(input.store) }] },
          contents,
          generationConfig: {
            temperature: 0.4,
            thinkingConfig: { thinkingLevel: 'HIGH' },
          },
        }),
        signal: AbortSignal.timeout(45_000),
      },
    );
  } catch {
    throw new GeminiError('Gemini no respondió a tiempo. Inténtalo nuevamente.');
  }

  if (!response.ok) {
    if (response.status === 429) {
      throw new GeminiError('Gemini alcanzó su cuota temporal. Inténtalo más tarde.', 429);
    }
    if (response.status === 401 || response.status === 403) {
      throw new GeminiError('La clave de Gemini no es válida o no tiene acceso al modelo.', 503);
    }
    throw new GeminiError('Gemini no pudo generar una respuesta.', 502);
  }

  const data = await response.json() as GeminiResponse;
  const reply = data.candidates?.[0]?.content?.parts
    ?.filter((part) => part.thought !== true && typeof part.text === 'string')
    .map((part) => part.text!.trim())
    .filter(Boolean)
    .join('\n')
    .trim();
  if (!reply) throw new GeminiError('Gemini devolvió una respuesta vacía.');
  return reply;
}
