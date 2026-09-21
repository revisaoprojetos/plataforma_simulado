/**
 * Helpers de rolagem suave da TRILHA do aluno — compartilhados entre a trilha livre (cronograma)
 * e a trilha gigante (leitura/gamificação), para ambas rolarem até a aula ATUAL ao abrir.
 */

/** Ancestral rolável (overflow-y auto/scroll) — no aluno é o <main> do portal; senão a janela. */
export function scrollParent(el: HTMLElement): HTMLElement | null {
  let p = el.parentElement
  while (p) { const s = getComputedStyle(p); if (/(auto|scroll)/.test(s.overflowY) && p.scrollHeight > p.clientHeight) return p; p = p.parentElement }
  return null
}

/** Rola DEVAGAR (ease-in-out) até centralizar o elemento no container rolável. */
export function scrollSuaveAte(el: HTMLElement, ms = 1600) {
  const sp = scrollParent(el)
  const startTop = sp ? sp.scrollTop : window.scrollY
  const er = el.getBoundingClientRect()
  const vh = sp ? sp.clientHeight : window.innerHeight
  const spTop = sp ? sp.getBoundingClientRect().top : 0
  const alvo = startTop + (er.top - spTop) - (vh / 2 - er.height / 2)
  const dist = alvo - startTop
  if (Math.abs(dist) < 8) return
  const t0 = performance.now()
  const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
  const step = (now: number) => {
    const p = Math.min(1, (now - t0) / ms)
    const y = startTop + dist * ease(p)
    if (sp) sp.scrollTop = y; else window.scrollTo(0, y)
    if (p < 1) requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}
