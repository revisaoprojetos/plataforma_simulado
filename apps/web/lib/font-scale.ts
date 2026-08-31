// Escala de fonte (acessibilidade). Multiplica o font-size RAIZ (html) via CSS var `--font-scale`,
// então TODAS as páginas crescem/diminuem proporcionalmente (portal do aluno, admin e o runner do
// simulado). A preferência é salva no localStorage POR USUÁRIO (escopo passado por quem monta o
// controle), então logins/acessos diferentes no mesmo navegador NÃO interferem entre si.

/** Níveis discretos de escala (o controle anda por estes passos). 1 = padrão (100%). */
export const FONT_SCALE_LEVELS = [0.85, 0.925, 1, 1.075, 1.15, 1.3, 1.45] as const
export const FONT_SCALE_DEFAULT = 1
export const FONT_SCALE_MIN = FONT_SCALE_LEVELS[0]
export const FONT_SCALE_MAX = FONT_SCALE_LEVELS[FONT_SCALE_LEVELS.length - 1]

/** Chave do localStorage por escopo (usuário). */
export function scaleKey(scope?: string | null): string {
  return `plt.fontscale.${scope || 'anon'}`
}

/** Índice do nível mais próximo de um valor de escala. */
export function nivelDe(scale: number): number {
  let best = 0
  let bestD = Infinity
  FONT_SCALE_LEVELS.forEach((v, i) => {
    const d = Math.abs(v - scale)
    if (d < bestD) { bestD = d; best = i }
  })
  return best
}

export function clampScale(n: number): number {
  if (!Number.isFinite(n)) return FONT_SCALE_DEFAULT
  return Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, n))
}

/** Aplica a escala no documento (controle interativo). O anti-flash roda inline no layout. */
export function aplicarEscala(scale: number): void {
  if (typeof document === 'undefined') return
  document.documentElement.style.setProperty('--font-scale', String(clampScale(scale)))
}

/** Lê a escala salva para um escopo (ou o padrão). */
export function lerEscala(scope?: string | null): number {
  if (typeof window === 'undefined') return FONT_SCALE_DEFAULT
  try {
    const raw = localStorage.getItem(scaleKey(scope))
    const n = raw ? parseFloat(raw) : NaN
    return Number.isFinite(n) ? clampScale(n) : FONT_SCALE_DEFAULT
  } catch { return FONT_SCALE_DEFAULT }
}

export function salvarEscala(scope: string | null | undefined, scale: number): void {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(scaleKey(scope), String(clampScale(scale))) } catch { /* storage indisponível */ }
}

/** % inteiro para exibição (100%, 115%…). */
export function pctDe(scale: number): number { return Math.round(scale * 100) }
