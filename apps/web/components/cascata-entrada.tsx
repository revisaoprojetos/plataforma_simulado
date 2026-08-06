'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'

const TETO = 20 // nº máx de passos antes de estabilizar (o passo em ms fica no CSS: 75ms)

/**
 * Coleta os "cards" na ORDEM DE LEITURA para escalonar a entrada, com a MESMA granularidade em
 * todas as páginas (o dashboard tinha os grids como filhos diretos e ficava granular; outras páginas
 * embrulham tudo num wrapper de layout a mais e animavam como 1 bloco só). Regras:
 * - GRID com vários itens → cada ITEM é um card (no DOM já vêm L→R, linha a linha).
 * - Container de LAYOUT transparente (só espaçamento: sem borda/fundo/sombra/cantos), empilhado
 *   (block ou flex-column), com vários filhos e ao menos uma sub-seção → DESCE e anima as seções
 *   internas (evita "1 bloco só"). Cabeçalhos (flex-row) e blocos de texto (filhos sem filhos) e
 *   cards visuais (com borda/fundo/cantos) NÃO são desmembrados. Cap de profundidade = 2.
 */
function coletarCards(root: HTMLElement): HTMLElement[] {
  const raiz = root.firstElementChild as HTMLElement | null
  if (!raiz) return []
  const MAX = 6            // profundidade de descida (para em card visual/linha de cards/folha)
  const ALTURA_CARD = 64   // px: separa CARDS/posters (altos) de toolbars/abas/textos (baixos)

  // Container "de layout" (só espaçamento): sem borda, fundo, sombra ou cantos → dá p/ desembrulhar
  // e animar as seções internas. Um card VISUAL (tem borda/fundo/sombra/cantos) NÃO é desmembrado.
  const transparente = (el: HTMLElement): boolean => {
    const s = getComputedStyle(el)
    const semBorda = ['top', 'right', 'bottom', 'left'].every((l) => parseFloat(s.getPropertyValue(`border-${l}-width`)) === 0)
    const semFundo = s.backgroundColor === 'rgba(0, 0, 0, 0)' || s.backgroundColor === 'transparent'
    return semBorda && semFundo && s.boxShadow === 'none' && s.borderRadius === '0px'
  }

  // "Linha de cards": GRID, ou FLEX em linha (ex.: FileiraHorizontal), com vários filhos ALTOS
  // (cards/posters) → cada filho vira um card e escalona sozinho (L→R). Toolbars/abas (filhos baixos)
  // NÃO contam como linha de cards, então continuam como uma unidade só.
  const linhaDeCards = (el: HTMLElement, filhos: HTMLElement[]): boolean => {
    const s = getComputedStyle(el)
    const ehLinha = s.display === 'grid' || (s.display === 'flex' && s.flexDirection !== 'column')
    if (!ehLinha || filhos.length < 2) return false
    const altos = filhos.filter((c) => c.offsetHeight >= ALTURA_CARD).length
    return altos >= Math.ceil(filhos.length / 2)
  }

  const cards: HTMLElement[] = []
  const classificar = (el: HTMLElement, prof: number): void => {
    const filhos = Array.from(el.children) as HTMLElement[]
    if (filhos.length === 0) { cards.push(el); return }                              // folha
    if (linhaDeCards(el, filhos)) { for (const c of filhos) cards.push(c); return }  // linha de cards → cada um
    // Só descemos por containers de LAYOUT transparentes (cards visuais param aqui, viram 1 card).
    if (prof < MAX && transparente(el)) {
      if (filhos.length === 1) { classificar(filhos[0], prof + 1); return }          // desembrulha camada única
      const s = getComputedStyle(el)
      const empilhado = s.display === 'block' || (s.display === 'flex' && s.flexDirection === 'column')
      const temSubsecao = filhos.some((c) => c.childElementCount > 0)               // não fragmenta título+subtítulo
      if (empilhado && temSubsecao) { for (const c of filhos) classificar(c, prof + 1); return }
    }
    cards.push(el)                                                                   // card/seção (unidade)
  }

  for (const filho of Array.from(raiz.children) as HTMLElement[]) classificar(filho, 0)
  return cards
}

/**
 * Entrada em cascata (riseIn) calculada por índice no JS — cada card entra ~55ms depois do
 * anterior, na ordem de leitura. Re-montado a cada navegação (é usado no template), então roda
 * em toda página. A página fica escondida (`.cascata-root` opacity 0) até o JS calcular os delays,
 * evitando o "flash" de tudo visível antes da cascata; `cascata-pronta` sempre é aplicada (mesmo
 * em erro/reduced-motion) para nunca deixar a tela presa invisível.
 */
export function CascataEntrada({ children, ativa = true }: { children: React.ReactNode; ativa?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const pathname = usePathname()
  // useEffect (não useLayoutEffect): roda DEPOIS do commit/hidratação — mutar o DOM durante a
  // hidratação concorrente do React 19 dá erro "didn't match". Depende do pathname → re-dispara em
  // TODA navegação. Páginas async: MutationObserver aplica assim que os cards aparecem.
  useEffect(() => {
    const root = ref.current
    if (!root) return
    // Desligada no console (tema.animacao_entrada = false): não anima, não esconde — só mostra.
    if (!ativa) { root.classList.add('cascata-pronta'); return }
    root.classList.remove('cascata-pronta') // re-esconde para reanimar nesta navegação

    let semMovimento = false
    try { semMovimento = window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { /* ignore */ }
    const revelar = () => root.classList.add('cascata-pronta')
    if (semMovimento) { revelar(); return }

    // Loader de ROTA (loading.tsx) ainda na tela? A cascata NÃO roda agora — senão ela é consumida
    // pelo esqueleto do loader e o conteúdo real entra sem animação.
    const carregando = () => !!root.querySelector('[data-app-loading]')

    // REVELA o container JÁ se o loader está na tela: por padrão `.cascata-root` fica opacity:0
    // (esconde p/ evitar flash antes da cascata) — mas isso também esconderia o LOADER (tela em
    // branco). Feito aqui em JS porque a regra CSS com `:has` é derrubada pelo pipeline. Síncrono
    // (fora do requestIdleCallback) p/ o loader aparecer no 1º frame, sem atraso.
    if (carregando()) revelar()

    const aplicar = (): boolean => {
      if (carregando()) return false // espera o conteúdo REAL substituir o loader
      const cards = coletarCards(root)
      if (!cards.length) return false
      // data-cascata (atributo) + --cascata-i (custom property): NÃO são gerenciados pelo React,
      // então não brigam com o className/style dos cards (evita erro de hidratação/reconciliação).
      cards.forEach((el) => { el.removeAttribute('data-cascata'); el.style.removeProperty('--cascata-i') })
      void root.offsetWidth // reflow: garante que remover+readicionar REINICIE a animação
      cards.forEach((el, i) => {
        el.style.setProperty('--cascata-i', String(Math.min(i, TETO)))
        el.setAttribute('data-cascata', '')
      })
      return true
    }

    let cancelado = false
    let obs: MutationObserver | null = null
    let seguranca = 0
    const tentar = () => {
      if (cancelado) return
      if (aplicar()) { revelar(); return }
      // Ou o loader de rota está na tela (o CSS já o exibe via :has), ou o conteúdo async/streaming
      // ainda vai chegar. Observa até o loader SAIR e o conteúdo real aparecer → então a cascata roda
      // (data-cascata é aplicado na MESMA callback do observer, antes do paint → sem "flash").
      obs = new MutationObserver(() => {
        if (carregando()) { revelar(); return } // loader (ainda) na tela → mantém VISÍVEL e espera o conteúdo real
        if (aplicar()) { obs?.disconnect(); clearTimeout(seguranca); revelar() }
      })
      obs.observe(root, { childList: true, subtree: true })
      // Backstop generoso (cobre páginas pesadas com loader); nunca deixa a tela presa invisível.
      seguranca = window.setTimeout(() => { obs?.disconnect(); aplicar(); revelar() }, 6000)
    }

    // Espera o main thread ficar OCIOSO (hidratação concorrente do React CONCLUÍDA) antes de mutar
    // o DOM — mutar durante a hidratação é o que gerava o erro "didn't match".
    const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback
    const cic = (window as unknown as { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback
    const idle = ric ? ric(tentar, { timeout: 500 }) : window.setTimeout(tentar, 180)

    return () => {
      cancelado = true
      obs?.disconnect()
      clearTimeout(seguranca)
      if (ric && cic) cic(idle)
      else clearTimeout(idle)
    }
  }, [pathname, ativa])
  // Sem `cascata-root` quando desligada → o CSS não esconde (opacity:0) nem anima nada.
  return <div ref={ref} className={ativa ? 'cascata-root' : undefined}>{children}</div>
}
