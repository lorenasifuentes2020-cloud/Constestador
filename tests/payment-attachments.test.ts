import assert from 'node:assert/strict';
import test from 'node:test';
import {
  attachmentContentDisposition,
  safeAttachmentName,
  validatePaymentAttachment,
} from '../lib/payment-attachments.ts';

test('acepta comprobantes seguros y limpia nombres antes de descargarlos', () => {
  const file = new File(['contenido'], '../pago octubre ñ.pdf', { type: 'application/pdf' });
  assert.doesNotThrow(() => validatePaymentAttachment(file));
  assert.equal(safeAttachmentName(file.name), '..pago octubre ñ.pdf');
  const header = attachmentContentDisposition(file.name);
  assert.match(header, /^inline; filename="\.\.pago octubre _\.pdf";/);
  assert.match(header, /filename\*=UTF-8''\.\.pago%20octubre%20%C3%B1\.pdf$/);
});

test('rechaza formatos ejecutables y archivos mayores a 5 MB', () => {
  assert.throws(
    () => validatePaymentAttachment(new File(['x'], 'malware.exe', { type: 'application/x-msdownload' })),
    /JPG, PNG, WebP o un archivo PDF/,
  );
  assert.throws(
    () => validatePaymentAttachment(new File([new Uint8Array(5_000_001)], 'grande.png', { type: 'image/png' })),
    /máximo 5 MB/,
  );
});
