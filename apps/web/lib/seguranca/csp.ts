// CSP de scripts com NONCE por requisição + 'strict-dynamic' (padrão oficial do Next: o proxy gera o nonce, injeta o header
// de CSP também na REQUISIÇÃO — o Next lê o nonce dali e o aplica aos scripts de hidratação/inline que ele emite).
//
// MODO (env CSP_ENFORCE):
//   ausente/0 → `Content-Security-Policy-Report-Only` (NÃO bloqueia; só reporta em /api/csp-report). Padrão seguro: o app tem
//               scripts de terceiros/inline (embed Curseduca, players, OnlyOffice, páginas estáticas de public/) e páginas
//               estáticas/ISR do Next não recebem nonce — ligar bloqueio às cegas poderia derrubar a produção.
//   1         → `Content-Security-Policy` bloqueante (a diretiva é ANEXADA ao frame-ancestors já definido pelo proxy).
//
// Fora do escopo (sem CSP de script): /api/*, arquivos estáticos .html/.htm de public/ e as pastas de páginas estáticas
// abaixo — usam <script> inline próprio e não têm como receber nonce.

export const CSP_REPORT_PATH = '/api/csp-report'

const PREFIXOS_ESTATICOS = ['/api/', '/leitura/', '/estudio-conteudo/', '/cronograma/adaptativo/', '/oo-plugin', '/_next/']

export function cspEnforce(env: Record<string, string | undefined> = process.env): boolean {
  const v = (env.CSP_ENFORCE ?? '').trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'on'
}

export function ignoraCspScript(pathname: string): boolean {
  if (/\.(?:html?|js|css|json|map|txt|xml|pdf)$/i.test(pathname)) return true
  return PREFIXOS_ESTATICOS.some((p) => pathname.startsWith(p))
}

export function gerarNonce(): string {
  // base64 de um UUID (128 bits aleatórios) — imprevisível por requisição.
  return btoa(crypto.randomUUID())
}

/** Diretivas de script. `dev` libera 'unsafe-eval' (React/Turbopack usam eval em desenvolvimento). */
export function diretivasScript(nonce: string, dev = process.env.NODE_ENV !== 'production'): string {
  const script = ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(dev ? ["'unsafe-eval'"] : [])].join(' ')
  return `script-src ${script}; object-src 'none'; base-uri 'self'`
}

/** Valor completo do header Report-Only (inclui o endpoint de coleta). */
export function valorReportOnly(nonce: string, dev?: boolean): string {
  return `${diretivasScript(nonce, dev)}; report-uri ${CSP_REPORT_PATH}`
}

/** Anexa as diretivas de script a uma CSP existente (ex.: `frame-ancestors *`), p/ o modo bloqueante. */
export function anexarEnforce(cspExistente: string | null | undefined, nonce: string, dev?: boolean): string {
  const base = (cspExistente ?? '').trim().replace(/;+\s*$/, '')
  const scripts = diretivasScript(nonce, dev)
  return base ? `${base}; ${scripts}` : scripts
}
