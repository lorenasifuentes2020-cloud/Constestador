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

type GeminiErrorResponse = {
  error?: {
    message?: string;
    status?: string;
  };
};

export class GeminiError extends Error {
  status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.status = status;
  }
}

const shortened = (value: string, max: number) => value.trim().slice(0, max);

export function buildSellerSystemPrompt(store: Store, knowledgeContext = ''): string {
  const products = store.products.filter((product) => product.active).slice(0, 250).map((product) => ({
    nombre: product.name,
    sku: product.sku,
    categoria: product.category,
    precioPEN: product.price,
    stock: product.stock,
    descripcion: shortened(product.description, 500),
    caracteristicas: shortened(product.features, 700),
    beneficios: shortened(product.benefits, 700),
    idealPara: shortened(product.idealFor, 500),
    variantes: shortened(product.variants, 500),
    argumentosComerciales: shortened(product.salesNotes, 700),
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
    `Objetivo comercial: ${shortened(store.agent.salesObjective, 2000)}`,
    `Preguntas para entender la necesidad: ${shortened(store.agent.qualificationQuestions, 4000)}`,
    `Manejo de objeciones: ${shortened(store.agent.objectionHandling, 4000)}`,
    `Instrucciones de cierre: ${shortened(store.agent.closingInstructions, 4000)}`,
    'Proceso de venta: comprende la necesidad antes de recomendar; presenta hasta tres opciones pertinentes; explica diferencias con datos reales; atiende dudas; confirma intención y deriva al equipo para registrar el pedido.',
    'No presiones, no uses urgencia falsa y no insistas después de que el cliente rechace la compra.',
    `Catálogo activo: ${JSON.stringify(products)}`,
    `Preguntas frecuentes: ${JSON.stringify(entries(store.faqs))}`,
    `Reglas de la tienda: ${JSON.stringify(entries(store.rules))}`,
    `Promociones vigentes registradas: ${JSON.stringify(entries(store.promotions))}`,
    knowledgeContext
      ? `Técnicas recuperadas de la biblioteca interna:\n${knowledgeContext}\nÚsalas como guía de conversación. El catálogo, precios, stock y reglas de la tienda siempre tienen prioridad. No menciones títulos ni fuentes internas al cliente salvo que te lo pida.`
      : 'No se recuperaron fragmentos de la biblioteca para esta consulta.',
  ].join('\n');
}

// Backwards-compatible export for existing integrations and backups of test code.
export const buildGeminiSystemPrompt = buildSellerSystemPrompt;

export async function generateGeminiReply(input: {
  apiKey: string;
  model: string;
  store: Store;
  message: string;
  history: AssistantMessage[];
  knowledgeContext?: string;
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
          systemInstruction: { parts: [{ text: buildSellerSystemPrompt(input.store, input.knowledgeContext) }] },
          contents,
          generationConfig: {
            temperature: 0.4,
            ...(input.model.includes('pro')
              ? { thinkingConfig: { thinkingLevel: 'HIGH' } }
              : {}),
          },
        }),
        signal: AbortSignal.timeout(45_000),
      },
    );
  } catch {
    throw new GeminiError('Gemini no respondió a tiempo. Inténtalo nuevamente.');
  }

  if (!response.ok) {
    const detail = await response.json().catch(() => null) as GeminiErrorResponse | null;
    const providerMessage = detail?.error?.message?.replace(/\s+/g, ' ').trim().slice(0, 240) || '';
    if (response.status === 429) {
      throw new GeminiError(`Gemini alcanzó su cuota temporal.${providerMessage ? ` ${providerMessage}` : ' Inténtalo más tarde.'}`, 429);
    }
    if (response.status === 401 || response.status === 403) {
      throw new GeminiError(`La clave de Gemini no es válida o no tiene acceso al modelo.${providerMessage ? ` ${providerMessage}` : ''}`, 503);
    }
    if (response.status === 404) {
      throw new GeminiError(`El modelo de Gemini no está disponible para esta clave.${providerMessage ? ` ${providerMessage}` : ''}`, 503);
    }
    throw new GeminiError(`Gemini rechazó la solicitud.${providerMessage ? ` ${providerMessage}` : ''}`, 502);
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
