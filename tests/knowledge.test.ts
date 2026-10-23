import assert from 'node:assert/strict';
import test from 'node:test';
import { extractKnowledgeFile } from '../lib/knowledge-files.ts';
import { chunkKnowledgeText, knowledgeSearchTerms, retrieveKnowledgeContext } from '../lib/knowledge.ts';

test('divide una guía extensa en fragmentos con contexto compartido', () => {
  const paragraph = 'Escucha la necesidad del cliente antes de recomendar una solución concreta. ';
  const chunks = chunkKnowledgeText(paragraph.repeat(80), 500, 60);
  assert(chunks.length > 5);
  assert(chunks.every((chunk) => chunk.length <= 500));
  assert(chunks.some((chunk, index) => index > 0 && chunk.includes('necesidad del cliente')));
});

test('elige términos útiles de una objeción comercial', () => {
  const terms = knowledgeSearchTerms('Hola, el cliente dice que el producto está demasiado caro para su presupuesto');
  assert(terms.includes('presupuesto'));
  assert(terms.includes('producto'));
  assert(terms.includes('caro'));
  assert(!terms.includes('para'));
});

test('extrae una guía de texto sin depender de Gemini', async () => {
  const content = 'Guía de ventas consultivas. '.repeat(20);
  const extracted = await extractKnowledgeFile(new File([content], 'guia.txt', { type: 'text/plain' }));
  assert.equal(extracted.pageCount, 0);
  assert.equal(extracted.contentType, 'text/plain');
  assert.match(extracted.text, /ventas consultivas/);
});

test('recupera primero el fragmento más relacionado con la objeción', async () => {
  const rows = [
    { title: 'Guía', position: 4, content: 'Ante una objeción por precio, pregunta por el presupuesto y explica el beneficio.' },
    { title: 'Guía', position: 1, content: 'Saluda de manera amable.' },
  ];
  const db = {
    prepare: () => ({
      bind: () => ({ all: async () => ({ results: rows }) }),
    }),
  } as unknown as D1Database;
  const context = await retrieveKnowledgeContext(db, {
    ownerId: 'owner', storeId: 'store', query: 'El precio supera mi presupuesto',
  });
  assert.match(context, /objeción por precio/);
  assert(!context.includes('Saluda de manera amable'));
});
