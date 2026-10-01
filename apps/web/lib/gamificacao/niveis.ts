import type { LigaDef, NivelCurva, TituloNivel } from './config'

// Curva de níveis por FÓRMULA: o custo para sair do nível n para n+1 é
//   custo(n) = base + (n-1) * incremento   (cresce a cada nível — estilo Duolingo).
// O XP total acumulado define o nível atual e o progresso dentro dele.
//
// "Ponto de virada" (break_nivel): a partir dele o custo cresce MAIS, adicionando um termo que se
// acumula — custo(n) += (n − break + 1) × incremento_apos. É o freio anti-inflação para quem
// começou no fácil. Como os níveis ABAIXO do ponto não mudam de custo, o XP acumulado para alcançar
// qualquer nível ≤ break é IDÊNTICO ao de hoje → nenhum aluno abaixo do ponto muda de nível/XP.
// (Basta colocar o ponto acima do nível mais alto atual para não mexer em ninguém.)

function custoNivel(n: number, curva: NivelCurva): number {
  let custo = (curva.base ?? 100) + (n - 1) * (curva.incremento ?? 40)
  const brk = curva.break_nivel ?? 0
  const extra = curva.incremento_apos ?? 0
  if (brk > 0 && extra > 0 && n >= brk) custo += (n - brk + 1) * extra
  return Math.max(1, Math.round(custo))
}

/** XP acumulado necessário para ALCANÇAR o nível `nivel` (nível 1 = 0 XP). */
export function xpAcumuladoParaNivel(nivel: number, curva: NivelCurva): number {
  let total = 0
  for (let n = 1; n < nivel; n++) total += custoNivel(n, curva)
  return total
}

/** Nível atual a partir do XP total (limitado pelo nível máximo da curva). */
export function nivelParaXp(xpTotal: number, curva: NivelCurva): number {
  const max = Math.max(1, curva.nivel_max ?? 30)
  let nivel = 1
  let acc = 0
  while (nivel < max) {
    const custo = custoNivel(nivel, curva)
    if (acc + custo > xpTotal) break
    acc += custo
    nivel++
  }
  return nivel
}

/** Título/cargo para um nível — o de maior nivel_min que seja <= nível. */
export function tituloParaNivel(nivel: number, titulos: TituloNivel[]): string {
  const ordenados = [...(titulos ?? [])].sort((a, b) => a.nivel_min - b.nivel_min)
  let atual = ordenados[0]?.titulo ?? ''
  for (const t of ordenados) if (nivel >= t.nivel_min) atual = t.titulo
  return atual
}

/** Cargo COMPLETO (título + ícone) para um nível — mesma regra do `tituloParaNivel`. */
export function cargoParaNivel(nivel: number, titulos: TituloNivel[]): TituloNivel | null {
  const ordenados = [...(titulos ?? [])].sort((a, b) => a.nivel_min - b.nivel_min)
  let atual: TituloNivel | null = ordenados[0] ?? null
  for (const t of ordenados) if (nivel >= t.nivel_min) atual = t
  return atual
}

export interface ProgressoNivel {
  nivel: number
  titulo: string          // cargo/título do nível atual
  xpNoNivel: number       // XP já conquistado dentro do nível atual
  xpDoNivel: number       // XP total que o nível atual exige (custo do nível)
  xpParaProximo: number   // quanto falta para o próximo nível
  pct: number             // 0–100 dentro do nível
}

export function progressoNivel(xpTotal: number, curva: NivelCurva): ProgressoNivel {
  const max = Math.max(1, curva.nivel_max ?? 30)
  const nivel = nivelParaXp(xpTotal, curva)
  const titulo = tituloParaNivel(nivel, curva.titulos)
  // No nível máximo não há "próximo": barra cheia e nada a conquistar.
  if (nivel >= max) {
    const custo = custoNivel(nivel - 1, curva)
    return { nivel, titulo, xpNoNivel: custo, xpDoNivel: custo, xpParaProximo: 0, pct: 100 }
  }
  const base = xpAcumuladoParaNivel(nivel, curva)
  const custo = custoNivel(nivel, curva)
  const xpNoNivel = Math.max(0, xpTotal - base)
  const xpParaProximo = Math.max(0, custo - xpNoNivel)
  const pct = custo > 0 ? Math.min(100, Math.round((xpNoNivel / custo) * 100)) : 0
  return { nivel, titulo, xpNoNivel, xpDoNivel: custo, xpParaProximo, pct }
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
