'use client'

import { useEffect, useLayoutEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'

// useLayoutEffect no CLIENTE (revela ANTES do paint → zero frame branco nas navegações);
// useEffect no server (evita o warning de "useLayoutEffect não faz nada no servidor").
const useIsoEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

// Passo por card (sensação "normal") e JANELA máxima de escalonamento. TODOS os cards entram na
// sequência (mais simulados/cadernos/banco → mais cards animando, sem teto). O passo em ms se
// AUTO-AJUSTA: fica em PASSO_MS para páginas típicas e comprime só quando há muitos cards, para o
// total nunca passar de ~JANELA_MS (evita arrastar). O passo entra no animation-delay de cada regra.
const PASSO_MS = 75
const JANELA_MS = 1800

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
  const primeiraVezRef = useRef(true)
  const pathname = usePathname()
  // Layout effect (cliente): na NAVEGAÇÃO roda antes do paint → revela sem frame branco. Na 1ª carga
  // (hidratação) a mutação é adiada p/ o idle (evita "didn't match" durante a hidratação concorrente).
  useIsoEffect(() => {
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
    // Numa NAVEGAÇÃO client-side o loader (loading.tsx via Suspense) é comitado DEPOIS deste efeito —
    // e numa 1ª VISITA o chunk da rota carrega mais tarde ainda, então o loader entra atrasado no DOM.
    // Um observer DEDICADO, anexado JÁ (síncrono), revela no exato instante em que `[data-app-loading]`
    // aparecer, não importa quando — sem isto a tela fica BRANCA até o conteúdo real chegar.
    // (revelar() só adiciona classe → seguro; não roda a cascata no esqueleto.)
    const obsLoader = new MutationObserver(() => { if (carregando()) revelar() })
    obsLoader.observe(root, { childList: true, subtree: true })
    requestAnimationFrame(() => { if (carregando()) revelar() })

    // Folha de estilo PRÓPRIA, pendurada no <head> — fora da árvore do React.
    //
    // Antes a cascata marcava cada card com `data-cascata` + `--cascata-i`. Mexer nos atributos de um
    // nó que o React ainda está HIDRATANDO faz ele acusar "server rendered HTML didn't match": o HTML
    // do servidor não traz essas marcas. O adiamento para o idle reduzia a chance, mas era corrida —
    // em página pesada a hidratação passa dos 500ms do timeout e o aviso volta.
    //
    // Escrevendo REGRAS em vez de tocar nos elementos, não existe o que divergir: os cards continuam
    // exatamente como o servidor mandou, e o atraso de cada um chega pelo CSS. O aviso deixa de ser
    // possível, não importa quando a cascata rodar.
    const estilo = document.createElement('style')
    estilo.setAttribute('data-cascata-regras', '')
    document.head.appendChild(estilo)

    // Caminho `:nth-child` do card até a raiz — vira o "endereço" que o atributo dava antes.
    const caminho = (el: HTMLElement): string | null => {
      const partes: string[] = []
      let n: HTMLElement | null = el
      while (n && n !== root) {
        const pai: HTMLElement | null = n.parentElement
        if (!pai) return null
        partes.unshift(`>*:nth-child(${Array.prototype.indexOf.call(pai.children, n) + 1})`)
        n = pai
      }
      return n === root ? partes.join('') : null
    }

    const aplicar = (): boolean => {
      if (carregando()) return false // espera o conteúdo REAL substituir o loader
      const cards = coletarCards(root)
      if (!cards.length) return false
      const alvos = cards.map(caminho).filter((c): c is string => c !== null)
      if (!alvos.length) return false
      // Passo auto-ajustável: normal (PASSO_MS) até caber em JANELA_MS; comprime se houver muitos
      // cards. Assim a cascata SEMPRE percorre todos os cards, sem arrastar quando há muitos.
      const passo = cards.length > 1 ? Math.min(PASSO_MS, Math.round(JANELA_MS / (cards.length - 1))) : PASSO_MS
      estilo.textContent = ''
      void root.offsetWidth // reflow: limpar + reescrever REINICIA a animação a cada navegação
      // `!important` é preciso para vencer o `.cascata-root > * { animation: none !important }` do
      // globals.css (que existe para a RAIZ não animar em bloco); `:nth-child` já dá especificidade maior.
      const sel = (c: string) => `.cascata-root${c}`
      estilo.textContent =
        alvos
          .map((c, i) => `${sel(c)}{animation:riseIn .55s cubic-bezier(.2,.8,.2,1) both!important;animation-delay:${i * passo}ms!important}`)
          .join('') +
        // Congela a cascata enquanto o splash está na tela (o globals fazia isso via [data-cascata]).
        `html.splash-ativo :is(${alvos.map(sel).join(',')}){animation-play-state:paused!important}`
      return true
    }

    let cancelado = false
    let obs: MutationObserver | null = null
    let seguranca = 0
    const tentar = () => {
      if (cancelado) return
      if (aplicar()) { revelar(); return }
      // Loader de rota na tela agora (comitado após o efeito): revela JÁ (não fica branco esperando
      // o conteúdo real) — a cascata roda depois, quando o conteúdo REAL substituir o loader.
      if (carregando()) revelar()
      // Ou o loader de rota está na tela (o CSS já o exibe via :has), ou o conteúdo async/streaming
      // ainda vai chegar. Observa até o loader SAIR e o conteúdo real aparecer → então a cascata roda
      // (as regras entram na MESMA callback do observer, antes do paint → sem "flash").
      obs = new MutationObserver(() => {
        if (carregando()) { revelar(); return } // loader (ainda) na tela → mantém VISÍVEL e espera o conteúdo real
        if (aplicar()) { obs?.disconnect(); clearTimeout(seguranca); revelar() }
      })
      obs.observe(root, { childList: true, subtree: true })
      // Backstop generoso (cobre páginas pesadas com loader); nunca deixa a tela presa invisível.
      seguranca = window.setTimeout(() => { obs?.disconnect(); aplicar(); revelar() }, 6000)
    }

    // 1ª VEZ (carga + hidratação): agenda no IDLE — espera a hidratação concorrente do React 19
    // concluir antes de mutar o DOM (evita "didn't match"). NAVEGAÇÕES seguintes: rAF (rápido) — não
    // há hidratação e, sem loading.tsx, o conteúdo já chega PRONTO, então a cascata revela em ~1 frame
    // (sem tela branca perceptível, em vez de esperar até 500ms do requestIdleCallback).
    let cancelarAgenda: () => void
    if (primeiraVezRef.current) {
      const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback
      const cic = (window as unknown as { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback
      const idle = ric ? ric(tentar, { timeout: 500 }) : window.setTimeout(tentar, 180)
      cancelarAgenda = () => { if (ric && cic) cic(idle); else clearTimeout(idle) }
    } else {
      // Navegação: o conteúdo já está presente (sem loading.tsx) → aplica + revela AGORA, dentro do
      // layout effect (antes do paint) → a nova página já aparece com a cascata, sem NENHUM frame branco.
      tentar()
      cancelarAgenda = () => {}
    }
    primeiraVezRef.current = false

    return () => {
      cancelado = true
      estilo.remove()
      obs?.disconnect()
      obsLoader.disconnect()
      clearTimeout(seguranca)
      cancelarAgenda()
    }
  }, [pathname, ativa])
  // Sem `cascata-root` quando desligada → o CSS não esconde (opacity:0) nem anima nada.
  return <div ref={ref} className={ativa ? 'cascata-root' : undefined}>{children}</div>
}
