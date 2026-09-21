/**
 * Helpers de rolagem suave da TRILHA do aluno — compartilhados entre a trilha livre (cronograma /
 * leitura personalizada) e a trilha gigante (serpentina), para ambas rolarem até a aula ATUAL ao abrir.
 */

/** Primeiro ancestral com overflow-y auto/scroll (não exige estar rolável AGORA — pode ainda carregar). */
export function scrollParent(el: HTMLElement): HTMLElement | null {
  let p = el.parentElement
  while (p) {
    const s = getComputedStyle(p)
    if (/(auto|scroll)/.test(s.overflowY)) return p
    p = p.parentElement
  }
  return null
}

/** Um container só serve se realmente tem distância para rolar. */
function podeRolar(c: HTMLElement | null): c is HTMLElement {
  return !!c && c.scrollHeight - c.clientHeight > 4
}

/**
 * Rola DEVAGAR (ease-in-out) até CENTRALIZAR o elemento. Robusto:
 *  - usa o ancestral rolável; se ele ainda não rola, cai no scrollingElement do documento (window);
 *  - se NADA está rolável ainda (layout/imagens carregando), tenta de novo algumas vezes;
 *  - limita ao máximo rolável (não passa do fim).
 */
export function scrollSuaveAte(el: HTMLElement, ms = 1400, tentativas = 12): void {
  const sp = scrollParent(el)
  const doc = (document.scrollingElement as HTMLElement | null) ?? document.documentElement
  const cont: HTMLElement | null = podeRolar(sp) ? sp : (podeRolar(doc) ? doc : null)
  if (!cont) {
    if (tentativas > 0) setTimeout(() => scrollSuaveAte(el, ms, tentativas - 1), 150)
    return
  }
  const usaDoc = cont === doc
  const startTop = cont.scrollTop
  const er = el.getBoundingClientRect()
  const contTop = usaDoc ? 0 : cont.getBoundingClientRect().top
  const vh = usaDoc ? window.innerHeight : cont.clientHeight
  const maxTop = cont.scrollHeight - cont.clientHeight
  const alvo = Math.max(0, Math.min(startTop + (er.top - contTop) - (vh / 2 - er.height / 2), maxTop))
  const dist = alvo - startTop
  if (Math.abs(dist) < 4) return
  const t0 = performance.now()
  const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
  const step = (now: number) => {
    const p = Math.min(1, (now - t0) / ms)
    cont.scrollTop = startTop + dist * ease(p)
    if (p < 1) requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}
