import type { LigaDef, NivelCurva } from './config'

// Curva de níveis por FÓRMULA: o custo para sair do nível n para n+1 é
//   custo(n) = base + (n-1) * incremento   (cresce a cada nível — estilo Duolingo).
// O XP total acumulado define o nível atual e o progresso dentro dele.

function custoNivel(n: number, curva: NivelCurva): number {
  return Math.max(1, (curva.base ?? 100) + (n - 1) * (curva.incremento ?? 40))
}

/** XP acumulado necessário para ALCANÇAR o nível `nivel` (nível 1 = 0 XP). */
export function xpAcumuladoParaNivel(nivel: number, curva: NivelCurva): number {
  let total = 0
  for (let n = 1; n < nivel; n++) total += custoNivel(n, curva)
  return total
}

/** Nível atual a partir do XP total. */
export function nivelParaXp(xpTotal: number, curva: NivelCurva): number {
  let nivel = 1
  let acc = 0
  // Teto de segurança para não iterar infinito com curvas degeneradas.
  while (nivel < 999) {
    const custo = custoNivel(nivel, curva)
    if (acc + custo > xpTotal) break
    acc += custo
    nivel++
  }
  return nivel
}

export interface ProgressoNivel {
  nivel: number
  xpNoNivel: number       // XP já conquistado dentro do nível atual
  xpDoNivel: number       // XP total que o nível atual exige (custo do nível)
  xpParaProximo: number   // quanto falta para o próximo nível
  pct: number             // 0–100 dentro do nível
}

export function progressoNivel(xpTotal: number, curva: NivelCurva): ProgressoNivel {
  const nivel = nivelParaXp(xpTotal, curva)
  const base = xpAcumuladoParaNivel(nivel, curva)
  const custo = custoNivel(nivel, curva)
  const xpNoNivel = Math.max(0, xpTotal - base)
  const xpParaProximo = Math.max(0, custo - xpNoNivel)
  const pct = custo > 0 ? Math.min(100, Math.round((xpNoNivel / custo) * 100)) : 0
  return { nivel, xpNoNivel, xpDoNivel: custo, xpParaProximo, pct }
}

/** Liga (tier) atual a partir do XP total — a maior liga cujo xp_min é <= xpTotal. */
export function ligaParaXp(xpTotal: number, ligas: LigaDef[]): LigaDef {
  const ordenadas = [...(ligas ?? [])].sort((a, b) => a.xp_min - b.xp_min)
  let atual = ordenadas[0] ?? { id: 'bronze', nome: 'Bronze', xp_min: 0, cor: '#a16207' }
  for (const l of ordenadas) if (xpTotal >= l.xp_min) atual = l
  return atual
}

/** Próxima liga acima da atual (null se já é a maior). */
export function proximaLiga(xpTotal: number, ligas: LigaDef[]): LigaDef | null {
  const ordenadas = [...(ligas ?? [])].sort((a, b) => a.xp_min - b.xp_min)
  return ordenadas.find((l) => l.xp_min > xpTotal) ?? null
}
