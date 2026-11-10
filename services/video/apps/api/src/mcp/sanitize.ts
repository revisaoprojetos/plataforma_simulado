/**
 * Última barreira antes de qualquer dado sair pelo MCP (RF37, regra 3): remove campos sensíveis
 * mesmo que um service os devolva, limita listas e recusa respostas que pareçam conter segredos.
 */

/** Campos que nunca saem: segredos, chaves de armazenamento e identificadores internos de fila. */
const ALWAYS_REMOVED = new Set([
  'passwordHash',
  'tokenHash',
  'sourceKey',
  's3Key',
  'uploadId',
  'partSize',
  'createdById',
  'error',
  'email', // dado pessoal: minimização (docs/mcp.md)
]);

const MAX_ITEMS = 200;
const FORBIDDEN_OUTPUT =
  /X-Amz-(Signature|Credential)|gvmcp_[A-Za-z0-9_-]{20,}|-----BEGIN [A-Z ]*KEY|__KEY_URI__/;

export class UnsafeOutputError extends Error {}

export function sanitize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'bigint') return Number(value);
  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ITEMS).map(sanitize);
    return value.length > MAX_ITEMS ? { items, truncated: true, total: value.length } : items;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (!ALWAYS_REMOVED.has(k)) out[k] = sanitize(v);
    }
    return out;
  }
  return value;
}

/** Serializa já sanitizado; lança se o texto final contiver algo que parece segredo ou URL assinada. */
export function toSafeJson(value: unknown): string {
  const text = JSON.stringify(sanitize(value));
  if (FORBIDDEN_OUTPUT.test(text))
    throw new UnsafeOutputError('resposta bloqueada por conter segredo');
  return text;
}
