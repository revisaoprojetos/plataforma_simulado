// Blocklist EDGE-SAFE (pura). MODO OPERÁVEL (read_and_act): o admin faz TUDO da área do aluno e
// grava como o aluno. Esta lista é o ÚNICO freio — bloqueia só o IRREVERSÍVEL / IDENTIDADE:
// LGPD (consentimento/solicitação), troca de e-mail de LOGIN e exclusão de conta. Todo o resto
// (responder simulado, leitura, gamificação, personalização de perfil…) é liberado.
// Fonte de verdade em RUNTIME (o middleware roda no Edge e não consulta o banco); espelhada em
// simulado_impersonation_blocked_routes p/ painel/contrato.
export interface BlockedRoute { method: string; pathPattern: string; reason: string }

export const BLOCKED_ROUTES: BlockedRoute[] = [
  { method: 'POST', pathPattern: '/lgpd/*', reason: 'Consentimento/solicitação LGPD — ação de identidade do titular.' },
  { method: '*', pathPattern: '/api/aluno/lgpd/*', reason: 'Solicitações/consentimento LGPD do aluno.' },
  { method: '*', pathPattern: '/api/aluno/conta/*', reason: 'Ações de conta irreversíveis (excluir conta / identidade).' },
  { method: 'POST', pathPattern: '/api/aluno/perfil/email/*', reason: 'Troca de e-mail de login (irreversível / identidade).' },
  { method: 'PUT', pathPattern: '/api/aluno/perfil/email/*', reason: 'Troca de e-mail de login (irreversível / identidade).' },
]

/** Casa um padrão contra um path. Suporta '*' (tudo), sufixo '/*' (prefixo) e '*' por segmento. */
export function casaPadraoRota(pattern: string, path: string): boolean {
  if (pattern === '*') return true
  if (pattern.endsWith('/*')) {
    const base = pattern.slice(0, -2)
    return path === base || path.startsWith(base + '/')
  }
  const pp = pattern.split('/')
  const sp = path.split('/')
  if (pp.length !== sp.length) return false
  return pp.every((seg, i) => seg === '*' || seg === sp[i])
}

/** Retorna a regra que bloqueia (method, path), ou null. `method='*'` na regra casa qualquer método. */
export function rotaBloqueada(method: string, path: string, rotas: BlockedRoute[] = BLOCKED_ROUTES): BlockedRoute | null {
  const m = method.toUpperCase()
  for (const r of rotas) {
    if (r.method !== '*' && r.method.toUpperCase() !== m) continue
    if (casaPadraoRota(r.pathPattern, path)) return r
  }
  return null
}
