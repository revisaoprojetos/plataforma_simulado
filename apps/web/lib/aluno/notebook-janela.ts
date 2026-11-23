// Virtualização simples (janela) da lista de páginas — puro e testável. Altura FIXA por linha.
/** Acima disto a lista renderiza só a janela visível. */
export const LIMIAR_VIRTUAL_LINHAS = 150
/** Altura FIXA da linha no modo virtual (px). No modo normal a linha cresce até 2 linhas de texto (minHeight 38). */
export const ALTURA_LINHA_VIRTUAL = 38
const EXTRA_JANELA = 8 // linhas renderizadas além da área visível (cima e baixo)

/** Janela [ini, fim) de linhas a renderizar. */
export function janelaVirtual(total: number, scrollTop: number, altura: number, h = ALTURA_LINHA_VIRTUAL, extra = EXTRA_JANELA): { ini: number; fim: number } {
  if (total <= 0) return { ini: 0, fim: 0 }
  const ini = Math.min(total, Math.max(0, Math.floor(scrollTop / h) - extra))
  const fim = Math.min(total, Math.ceil((scrollTop + Math.max(altura, h)) / h) + extra)
  return { ini, fim: Math.max(fim, ini) }
}
