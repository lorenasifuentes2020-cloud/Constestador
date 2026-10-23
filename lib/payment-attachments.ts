export const MAX_PAYMENT_ATTACHMENT_BYTES = 5_000_000;
export const MAX_PAYMENT_ATTACHMENTS_PER_ORDER = 20;

export const PAYMENT_ATTACHMENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

export type PaymentAttachment = {
  id: string;
  storeId: string;
  orderId: string;
  paymentId: string;
  fileName: string;
  contentType: string;
  size: number;
  createdAt: string;
  downloadUrl: string;
};

export function validatePaymentAttachment(file: File) {
  if (!PAYMENT_ATTACHMENT_TYPES.has(file.type)) {
    throw Object.assign(new Error('Usa una imagen JPG, PNG, WebP o un archivo PDF.'), { status: 400 });
  }
  if (file.size < 1 || file.size > MAX_PAYMENT_ATTACHMENT_BYTES) {
    throw Object.assign(new Error('El comprobante debe pesar como máximo 5 MB.'), { status: 400 });
  }
}

export function safeAttachmentName(value: string) {
  const name = value.normalize('NFKC').replace(/[\x00-\x1f\x7f/\\]/g, '').trim().slice(0, 120);
  return name || 'comprobante';
}

export function attachmentContentDisposition(fileName: string) {
  const ascii = safeAttachmentName(fileName).replace(/[^\x20-\x7e]/g, '_').replace(/[";]/g, '_');
  return `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(safeAttachmentName(fileName))}`;
}
