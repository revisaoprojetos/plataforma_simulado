'use client'
// Aquece (baixa em segundo plano) os chunks dinâmicos do editor de texto e da folha livre: a 1ª abertura/criação de página não espera JS.
let feito = false
export function aquecerEditores(): void {
  if (feito || typeof window === 'undefined') return
  feito = true
  void import('./editor-pagina').catch(() => { feito = false })
  void import('./corpo-folha').catch(() => { feito = false })
}
/** Aquece quando o navegador estiver ocioso (ao montar o app). */
export function aquecerNoOcioso(): () => void {
  if (typeof window === 'undefined') return () => {}
  const w = window as Window & { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (h: number) => void }
  if (w.requestIdleCallback) { const h = w.requestIdleCallback(aquecerEditores, { timeout: 3000 }); return () => w.cancelIdleCallback?.(h) }
  const t = window.setTimeout(aquecerEditores, 1200)
  return () => window.clearTimeout(t)
}
