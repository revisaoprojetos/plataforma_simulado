'use client'

import { useLayoutEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'

const PASSO = 75 // ms entre cards (ordem de leitura) — ritmo um pouco mais lento/gracioso
const TETO = 20 // nº máx de passos antes de estabilizar (páginas com muitos cards)

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
  const pathname = usePathname()
  // Depende do pathname → RE-DISPARA em TODA navegação (não só no 1º load). Páginas async: o
  // conteúdo (server component) pode entrar no DOM DEPOIS do efeito → um MutationObserver aplica a
  // cascata assim que os cards aparecem. reset + reflow reinicia a animação ao voltar a uma página.
  useLayoutEffect(() => {
    const root = ref.current
    if (!root) return
    root.classList.remove('cascata-pronta') // re-esconde para reanimar nesta navegação

    let semMovimento = false
    try { semMovimento = window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { /* ignore */ }
    const revelar = () => root.classList.add('cascata-pronta')
    if (semMovimento) { revelar(); return }

    const aplicar = (): boolean => {
      const cards = coletarCards(root)
      if (!cards.length) return false
      cards.forEach((el) => { el.classList.remove('cascata-item'); el.style.animationDelay = '' })
      void root.offsetWidth // reflow: garante que remover+readicionar REINICIE a animação
      cards.forEach((el, i) => {
        el.style.animationDelay = Math.min(i, TETO) * PASSO + 'ms'
        el.classList.add('cascata-item')
      })
      return true
    }

    // Conteúdo já presente (caso comum) → aplica e revela na hora.
    if (aplicar()) { revelar(); return }
    // Conteúdo async/streaming → espera aparecer; segurança revela em 1.2s de qualquer forma.
    const obs = new MutationObserver(() => { if (aplicar()) { obs.disconnect(); clearTimeout(t); revelar() } })
    obs.observe(root, { childList: true, subtree: true })
    const t = setTimeout(() => { obs.disconnect(); revelar() }, 1200)
    return () => { obs.disconnect(); clearTimeout(t) }
  }, [pathname])
  return <div ref={ref} className="cascata-root">{children}</div>
}
