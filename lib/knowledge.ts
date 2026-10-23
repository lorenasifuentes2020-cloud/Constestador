export const MAX_KNOWLEDGE_FILE_BYTES = 20_000_000;
export const MAX_KNOWLEDGE_TEXT_CHARS = 2_500_000;
export const MAX_KNOWLEDGE_DOCUMENTS_PER_STORE = 30;

export type KnowledgeDocumentSummary = {
  id: string;
  storeId: string;
  title: string;
  fileName: string;
  contentType: string;
  size: number;
  pageCount: number;
  chunkCount: number;
  enabled: boolean;
  createdAt: string;
  downloadUrl: string;
};

const STOP_WORDS = new Set([
  'para', 'pero', 'porque', 'como', 'cuando', 'donde', 'quien', 'cual', 'esto', 'esta', 'este', 'estos',
  'estas', 'tengo', 'quiero', 'puedo', 'puede', 'tiene', 'tienen', 'hola', 'gracias', 'sobre', 'entre',
  'desde', 'hasta', 'tambien', 'muy', 'más', 'mas', 'una', 'uno', 'unos', 'unas', 'del', 'las', 'los',
  'por', 'con', 'sin', 'que', 'qué', 'hay', 'ser', 'son', 'sus', 'mis', 'nos', 'me', 'te', 'se', 'ya',
]);

export function normalizeKnowledgeText(value: string) {
  return value.replace(/\r\n?/g, '\n').replace(/[\t\f\v ]+/g, ' ')
    .replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function chunkKnowledgeText(value: string, maxLength = 1800, overlap = 180) {
  const text = normalizeKnowledgeText(value);
  if (!text) return [];
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(text.length, start + maxLength);
    if (end < text.length) {
      const minimum = start + Math.floor(maxLength * 0.55);
      const paragraph = text.lastIndexOf('\n\n', end);
      const sentence = text.lastIndexOf('. ', end);
      const boundary = Math.max(paragraph, sentence);
      if (boundary >= minimum) end = boundary + (boundary === paragraph ? 2 : 1);
    }
    const chunk = text.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end >= text.length) break;
    start = Math.max(start + 1, end - overlap);
  }
  return chunks;
}

export function knowledgeSearchTerms(value: string) {
  const normalized = value.normalize('NFKC').toLocaleLowerCase('es-PE');
  return [...new Set(normalized.match(/[\p{L}\p{N}]{3,}/gu) || [])]
    .filter((term) => !STOP_WORDS.has(term))
    .sort((a, b) => b.length - a.length)
    .slice(0, 8);
}

const escapeLike = (value: string) => value.replace(/[\\%_]/g, '\\$&');

export async function retrieveKnowledgeContext(
  db: D1Database,
  input: { ownerId: string; storeId: string; query: string },
) {
  const terms = knowledgeSearchTerms(input.query);
  if (!terms.length) return '';
  const filters = terms.map(() => `lower(k.content) LIKE ? ESCAPE '\\'`).join(' OR ');
  const result = await db.prepare(
    `SELECT k.content, k.position, d.title
       FROM knowledge_chunks k
       JOIN knowledge_documents d ON d.id = k.document_id
      WHERE k.workspace_owner_id = ? AND k.store_id = ? AND d.enabled = 1
        AND (${filters})
      LIMIT 80`,
  ).bind(input.ownerId, input.storeId, ...terms.map((term) => `%${escapeLike(term)}%`))
    .all<{ content: string; position: number; title: string }>();
  const ranked = result.results.map((row) => {
    const haystack = row.content.normalize('NFKC').toLocaleLowerCase('es-PE');
    const score = terms.reduce((total, term) => total + (haystack.includes(term) ? 1 + Math.min(term.length / 10, 1) : 0), 0);
    return { ...row, score };
  }).filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.position - b.position).slice(0, 5);
  return ranked.map((row) => `[Fuente interna: ${row.title}, fragmento ${row.position + 1}]\n${row.content}`)
    .join('\n\n').slice(0, 7500);
}
