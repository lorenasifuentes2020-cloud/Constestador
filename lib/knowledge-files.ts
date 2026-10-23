import { extractText, getDocumentProxy } from 'unpdf';
import {
  MAX_KNOWLEDGE_FILE_BYTES,
  MAX_KNOWLEDGE_TEXT_CHARS,
  normalizeKnowledgeText,
} from './knowledge.ts';

const TEXT_TYPES = new Set(['text/plain', 'text/markdown']);

export async function extractKnowledgeFile(file: File) {
  if (file.size < 1 || file.size > MAX_KNOWLEDGE_FILE_BYTES) {
    throw Object.assign(new Error('El archivo debe pesar como máximo 20 MB.'), { status: 400 });
  }
  const lowerName = file.name.toLowerCase();
  const isPdf = file.type === 'application/pdf' || lowerName.endsWith('.pdf');
  const isText = TEXT_TYPES.has(file.type) || lowerName.endsWith('.txt') || lowerName.endsWith('.md');
  if (!isPdf && !isText) {
    throw Object.assign(new Error('Usa un libro o guía en PDF, TXT o Markdown.'), { status: 400 });
  }

  let text = '';
  let pageCount = 0;
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (isPdf) {
    try {
      const pdf = await getDocumentProxy(bytes);
      const extracted = await extractText(pdf, { mergePages: false });
      const pages = Array.isArray(extracted.text) ? extracted.text : [extracted.text];
      pageCount = extracted.totalPages;
      text = pages.map((page, index) => `Página ${index + 1}\n${page}`).join('\n\n');
    } catch {
      throw Object.assign(new Error('No se pudo leer el PDF. Comprueba que no esté dañado o protegido con contraseña.'), { status: 400 });
    }
  } else {
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      throw Object.assign(new Error('El archivo de texto debe estar codificado en UTF-8.'), { status: 400 });
    }
  }
  text = normalizeKnowledgeText(text);
  if (text.length < 200) {
    throw Object.assign(new Error('No encontramos suficiente texto. Si el PDF está escaneado como imágenes, necesita OCR antes de subirlo.'), { status: 400 });
  }
  if (text.length > MAX_KNOWLEDGE_TEXT_CHARS) {
    throw Object.assign(new Error('El contenido extraído es demasiado extenso. Divide el libro en dos archivos.'), { status: 400 });
  }
  return {
    text,
    pageCount,
    contentType: isPdf ? 'application/pdf' : 'text/plain',
    bytes,
  };
}
