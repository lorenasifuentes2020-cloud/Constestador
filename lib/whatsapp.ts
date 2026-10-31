export type WhatsAppEnvironment = {
  WHATSAPP_ACCESS_TOKEN?: string;
  WHATSAPP_APP_SECRET?: string;
  WHATSAPP_VERIFY_TOKEN?: string;
  WHATSAPP_GRAPH_VERSION?: string;
};

export class WhatsAppError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.status = status;
  }
}

export const whatsappGraphVersion = (env: WhatsAppEnvironment) =>
  /^v\d{1,2}\.\d$/.test(env.WHATSAPP_GRAPH_VERSION || '')
    ? env.WHATSAPP_GRAPH_VERSION!
    : 'v23.0';

function bytesToHex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function verifyWhatsAppSignature(raw: ArrayBuffer, signature: string | null, appSecret?: string) {
  if (!appSecret || !signature?.startsWith('sha256=')) return false;
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(appSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const expected = `sha256=${bytesToHex(await crypto.subtle.sign('HMAC', key, raw))}`;
  if (expected.length !== signature.length) return false;
  let different = 0;
  for (let index = 0; index < expected.length; index += 1) {
    different |= expected.charCodeAt(index) ^ signature.charCodeAt(index);
  }
  return different === 0;
}

export async function sendWhatsAppText(input: {
  env: WhatsAppEnvironment;
  phoneNumberId: string;
  recipient: string;
  text: string;
  fetcher?: typeof fetch;
}) {
  if (!input.env.WHATSAPP_ACCESS_TOKEN) {
    throw new WhatsAppError('Falta configurar el token de acceso de WhatsApp.', 503);
  }
  if (!/^\d{5,30}$/.test(input.phoneNumberId) || !/^\d{7,20}$/.test(input.recipient)) {
    throw new WhatsAppError('El número de WhatsApp configurado no es válido.', 400);
  }
  const url = `https://graph.facebook.com/${whatsappGraphVersion(input.env)}/${input.phoneNumberId}/messages`;
  let response: Response;
  try {
    response = await (input.fetcher || fetch)(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.env.WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: input.recipient,
        type: 'text',
        text: { preview_url: false, body: input.text.slice(0, 4096) },
      }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new WhatsAppError('WhatsApp no respondió a tiempo.');
  }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new WhatsAppError('El token de WhatsApp no es válido o no tiene permisos.', 503);
    }
    throw new WhatsAppError('WhatsApp no pudo enviar el mensaje.');
  }
  const data = await response.json() as { messages?: Array<{ id?: string }> };
  return data.messages?.[0]?.id || null;
}

export async function subscribeWhatsAppApp(input: {
  env: WhatsAppEnvironment;
  businessAccountId: string;
  fetcher?: typeof fetch;
}) {
  if (!input.env.WHATSAPP_ACCESS_TOKEN) {
    throw new WhatsAppError('Falta configurar el token de acceso de WhatsApp.', 503);
  }
  if (!/^\d{5,30}$/.test(input.businessAccountId)) {
    throw new WhatsAppError('El ID de la cuenta de WhatsApp Business no es válido.', 400);
  }
  const url = `https://graph.facebook.com/${whatsappGraphVersion(input.env)}/${input.businessAccountId}/subscribed_apps`;
  let response: Response;
  try {
    response = await (input.fetcher || fetch)(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${input.env.WHATSAPP_ACCESS_TOKEN}` },
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new WhatsAppError('Meta no respondió al intentar conectar el webhook.');
  }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new WhatsAppError('El token de WhatsApp venció o no tiene permiso para conectar la cuenta.', 503);
    }
    throw new WhatsAppError('Meta no permitió asociar esta aplicación a la cuenta de WhatsApp.');
  }
  const data = await response.json().catch(() => null) as { success?: boolean } | null;
  if (data?.success !== true) {
    throw new WhatsAppError('Meta no confirmó la conexión del webhook con la cuenta.');
  }
  return true;
}

export function whatsappRecipient(externalId: string) {
  const parts = externalId.split(':');
  const recipient = parts.at(-1) || '';
  return /^\d{7,20}$/.test(recipient) ? recipient : null;
}
