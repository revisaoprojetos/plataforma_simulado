import { rotaBloqueada, type BlockedRoute } from './blocked-routes'
import type { ImpersonationActionLevel } from './token'

// Decisão PURA do guard de visualização (edge-safe, sem I/O) — usada pelo middleware e coberta por
// testes. read_only: bloqueia toda mutação (não-GET). read_and_act: consulta a blocklist.
export interface DecisaoGuard { bloquear: boolean; motivo?: 'read_only_session' | 'action_blocked_during_impersonation' }

const LEITURA = new Set(['GET', 'HEAD', 'OPTIONS'])

export function decisaoImpersonation(
  actionLevel: ImpersonationActionLevel,
  method: string,
  path: string,
  rotas?: BlockedRoute[],
): DecisaoGuard {
  const ehLeitura = LEITURA.has(method.toUpperCase())
  if (actionLevel === 'read_only') {
    return ehLeitura ? { bloquear: false } : { bloquear: true, motivo: 'read_only_session' }
  }
  // read_and_act (futuro): só as rotas sensíveis da blocklist.
  const hit = rotaBloqueada(method, path, rotas)
  return hit ? { bloquear: true, motivo: 'action_blocked_during_impersonation' } : { bloquear: false }
}
