import assert from 'node:assert/strict';
import test from 'node:test';
import {
  sendWhatsAppText,
  verifyWhatsAppSignature,
  whatsappGraphVersion,
  whatsappRecipient,
} from '../lib/whatsapp.ts';

async function signature(secret: string, body: ArrayBuffer) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, body));
  return `sha256=${[...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

test('verifies Meta webhook signatures without accepting modified content', async () => {
  const body = new TextEncoder().encode('{"message":"hola"}').buffer;
  const signed = await signature('app-secret', body);
  assert.equal(await verifyWhatsAppSignature(body, signed, 'app-secret'), true);
  const modified = new TextEncoder().encode('{"message":"adios"}').buffer;
  assert.equal(await verifyWhatsAppSignature(modified, signed, 'app-secret'), false);
  assert.equal(await verifyWhatsAppSignature(body, null, 'app-secret'), false);
});

test('sends a WhatsApp text through the configured Graph API version', async () => {
  let request: { url: string; init?: RequestInit } | undefined;
  const id = await sendWhatsAppText({
    env: { WHATSAPP_ACCESS_TOKEN: 'token', WHATSAPP_GRAPH_VERSION: 'v23.0' },
    phoneNumberId: '12345678901',
    recipient: '51999999999',
    text: 'Hola desde Nexo',
    fetcher: async (url, init) => {
      request = { url: String(url), init };
      return new Response(JSON.stringify({ messages: [{ id: 'wamid.test' }] }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    },
  });
  assert.equal(id, 'wamid.test');
  assert.equal(request?.url, 'https://graph.facebook.com/v23.0/12345678901/messages');
  assert.equal((request?.init?.headers as Record<string, string>).Authorization, 'Bearer token');
  const payload = JSON.parse(String(request?.init?.body));
  assert.equal(payload.to, '51999999999');
  assert.equal(payload.text.body, 'Hola desde Nexo');
});

test('uses safe defaults and extracts the recipient from conversation ids', () => {
  assert.equal(whatsappGraphVersion({ WHATSAPP_GRAPH_VERSION: 'invalid' }), 'v23.0');
  assert.equal(whatsappRecipient('12345678901:51999999999'), '51999999999');
  assert.equal(whatsappRecipient('invalid'), null);
});
