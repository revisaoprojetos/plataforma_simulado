'use client'

import { useLayoutEffect, useRef } from 'react'

const PASSO = 55 // ms entre cards (ordem de leitura)
const TETO = 22 // nº máx de passos antes de estabilizar (páginas com muitos cards)

/**
 * Coleta os "cards" na ORDEM DE LEITURA para escalonar a entrada:
 * - filhos diretos da raiz da página (seções empilhadas → de cima para baixo);
 * - se um filho é um GRID com vários itens, entram os ITENS dele — que no DOM já vêm da
 *   esquerda para a direita, linha a linha → a cascata fica "linha por linha, L→R".
 */
function coletarCards(root: HTMLElement): HTMLElement[] {
  const raiz = root.firstElementChild as HTMLElement | null
  if (!raiz) return []
  const cards: HTMLElement[] = []
  for (const filho of Array.from(raiz.children) as HTMLElement[]) {
    const disp = getComputedStyle(filho).display
    if (disp === 'grid' && filho.childElementCount > 1) {
      for (const item of Array.from(filho.children) as HTMLElement[]) cards.push(item)
    } else {
      cards.push(filho)
    }
  }
  return cards
}

/**
 * Entrada em cascata (riseIn) calculada por índice no JS — cada card entra ~55ms depois do
 * anterior, na ordem de leitura. Re-montado a cada navegação (é usado no template), então roda
 * em toda página. A página fica escondida (`.cascata-root` opacity 0) até o JS calcular os delays,
 * evitando o "flash" de tudo visível antes da cascata; `cascata-pronta` sempre é aplicada (mesmo
 * em erro/reduced-motion) para nunca deixar a tela presa invisível.
 */
export function CascataEntrada({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const root = ref.current
    if (!root) return
    try {
      let semMovimento = false
      try { semMovimento = window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { /* ignore */ }
      if (!semMovimento) {
        coletarCards(root).forEach((el, i) => {
          el.style.animationDelay = Math.min(i, TETO) * PASSO + 'ms'
          el.classList.add('cascata-item')
        })
      }
    } finally {
      root.classList.add('cascata-pronta') // revela a página (mesmo se algo acima falhar)
    }
  }, [])
  return <div ref={ref} className="cascata-root">{children}</div>
}
