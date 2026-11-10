/** Escopos do token pessoal do MCP. O token nunca vale mais do que o papel do usuário dono. */
export const SCOPES = [
  'catalog:read',
  'content:read',
  'progress:read',
  'analytics:read',
  'notes:write',
  /** chave de integração: matricular alunos e abrir sessão em nome deles (só admin) */
  'access:manage',
] as const;

export type Scope = (typeof SCOPES)[number];

export const isScope = (value: string): value is Scope =>
  (SCOPES as readonly string[]).includes(value);

/** A tool aparece (e roda) se o token tiver ao menos um dos escopos listados. */
export function hasAnyScope(granted: readonly string[], needed: readonly Scope[]): boolean {
  return needed.some((s) => granted.includes(s));
}
