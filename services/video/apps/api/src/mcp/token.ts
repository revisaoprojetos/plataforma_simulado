import { createHmac, randomBytes } from 'node:crypto';

export const TOKEN_PREFIX = 'gvmcp_';
/** Caracteres do token (após o prefixo) mostrados na listagem para identificá-lo. */
const VISIBLE = 6;

export function generateToken(): { token: string; prefix: string } {
  const token = TOKEN_PREFIX + randomBytes(32).toString('base64url');
  return { token, prefix: token.slice(0, TOKEN_PREFIX.length + VISIBLE) };
}

/** HMAC-SHA256 com o segredo do refresh: vazamento do banco não revela tokens utilizáveis. */
export function hashToken(token: string, secret: string): string {
  return createHmac('sha256', secret).update(token).digest('hex');
}

export const looksLikeMcpToken = (value: string): boolean =>
  value.startsWith(TOKEN_PREFIX) && value.length >= TOKEN_PREFIX.length + 32 && value.length < 128;
