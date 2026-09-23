// Blocklist EDGE-SAFE (pura, sem imports de servidor) — fonte de verdade em RUNTIME (o middleware
// roda no Edge e não consulta o banco). Espelhada em simulado_impersonation_blocked_routes p/ o
// painel/contrato. No MVP (read_only) o middleware já barra TODO não-GET; esta lista é para o
// futuro read_and_act e para o teste de contrato front×back.
export interface BlockedRoute { method: string; pathPattern: string; reason: string }

export const BLOCKED_ROUTES: BlockedRoute[] = [
  { method: 'POST', pathPattern: '/api/aluno/*', reason: 'Mutações do aluno (nota, ranking, XP, perfil, LGPD).' },
  { method: 'PUT', pathPattern: '/api/aluno/*', reason: 'Mutações do aluno.' },
  { method: 'PATCH', pathPattern: '/api/aluno/*', reason: 'Mutações do aluno.' },
  { method: 'DELETE', pathPattern: '/api/aluno/*', reason: 'Mutações do aluno.' },
  { method: '*', pathPattern: '/aluno/simulado/*', reason: 'Responder/enviar simulado corromperia tentativas, nota e ranking.' },
  { method: '*', pathPattern: '/simulado/*', reason: 'Runner de simulado por token.' },
  { method: '*', pathPattern: '/embed/*', reason: 'Área embedável de resposta do aluno.' },
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
