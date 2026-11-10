/** host[:porta] de uma origem/URL ("https://app.x.com:8443" → "app.x.com:8443"), ou null se inválida. */
export function hostOf(origin: string | undefined | null): string | null {
  if (!origin) return null;
  try {
    return new URL(origin).host.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Domínios permitidos da empresa. Lista vazia = sem restrição (ou negado, com `denyEmpty`: produção).
 * Com restrição, a requisição precisa trazer uma origem válida que case com uma entrada:
 * "app.x.com" ou "localhost:5173" (exatos, com porta se houver) ou "*.x.com" (qualquer subdomínio, não o próprio x.com).
 */
export function isOriginAllowed(
  origin: string | undefined | null,
  allowed: string[],
  opts: { denyEmpty?: boolean } = {},
): boolean {
  // Lista vazia: liberado, a menos que o ambiente exija configuração explícita (produção).
  if (allowed.length === 0) return !opts.denyEmpty;
  const host = hostOf(origin);
  if (!host) return false;
  return allowed.some((entry) => {
    const e = entry.trim().toLowerCase();
    if (e.startsWith('*.')) return host.endsWith(e.slice(1)) && host.length > e.length - 1;
    return host === e;
  });
}

/** "Ana Souza" + "ana.souza@empresa.com" → "Ana Souza · a***@empresa.com" (marca d'água por aluno). */
export function watermarkText(name: string, email: string): string {
  const [local = '', domain = ''] = email.split('@');
  return `${name} · ${local.slice(0, 1)}***@${domain}`;
}

/**
 * CORS dinâmico: sem cabeçalho Origin (servidor-a-servidor) passa; origens fixas do .env passam;
 * senão vale a lista de domínios das empresas ativas. Lista vazia = nega (nada a casar).
 */
export function corsAllows(
  origin: string | undefined | null,
  staticOrigins: string[],
  tenantHosts: string[],
): boolean {
  if (!origin) return true;
  if (staticOrigins.includes(origin)) return true;
  return tenantHosts.length > 0 && isOriginAllowed(origin, tenantHosts);
}
