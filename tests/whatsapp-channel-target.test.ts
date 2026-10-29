import assert from "node:assert/strict";
import test from "node:test";
import { resolveWhatsAppStoreId } from "../lib/whatsapp-channel-target.ts";

const workspace = {
  stores: [
    { id: "tienda-anterior" },
    { id: "otra-tienda" },
  ],
} as Parameters<typeof resolveWhatsAppStoreId>[0];

test("usa la tienda solicitada cuando pertenece al espacio", () => {
  assert.equal(
    resolveWhatsAppStoreId(workspace, "otra-tienda", "tienda-anterior"),
    "otra-tienda",
  );
});

test("recupera la tienda del canal cuando la pantalla conserva un identificador anterior", () => {
  assert.equal(
    resolveWhatsAppStoreId(workspace, "tienda-de-sesion-vieja", "tienda-anterior"),
    "tienda-anterior",
  );
});

test("no acepta una tienda ajena si el canal tampoco pertenece al espacio", () => {
  assert.equal(
    resolveWhatsAppStoreId(workspace, "tienda-ajena", "canal-ajeno"),
    null,
  );
});
