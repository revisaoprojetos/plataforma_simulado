// Geometria PURA dos grifos de PDF (rects normalizados 0..1 por página). Espelha, em TS testável, as
// funções rectNormPdf/mergeRects de public/leitura/leitor-jus.html (que roda em iframe, sem bundler).
// Se mudar uma, mude a outra.

export type CaixaTela = { left: number; top: number; right: number; bottom: number }
export type CaixaPagina = { left: number; top: number; width: number; height: number }
export type RectNorm = { x0: number; y0: number; x1: number; y1: number }

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

/** rect da tela → rect 0..1 da folha. null se NaN, folha sem caixa ou rect minúsculo/vazio após o clamp. */
export function rectNormPdf(rc: CaixaTela, b: CaixaPagina): RectNorm | null {
  if (!b || !(b.width > 0) || !(b.height > 0)) return null
  const x0 = clamp01((rc.left - b.left) / b.width), y0 = clamp01((rc.top - b.top) / b.height)
  const x1 = clamp01((rc.right - b.left) / b.width), y1 = clamp01((rc.bottom - b.top) / b.height)
  if (![x0, y0, x1, y1].every(Number.isFinite)) return null
  if (x1 - x0 < 0.002 || y1 - y0 < 0.002) return null
  const r5 = (v: number) => Math.round(v * 1e5) / 1e5
  return { x0: r5(x0), y0: r5(y0), x1: r5(x1), y1: r5(y1) }
}

/** une rects da MESMA linha (cada palavra é um span) e descarta os totalmente contidos em outro. */
export function mesclarRects(rects: RectNorm[]): RectNorm[] {
  const srt = rects.slice().sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0)
  const lines: RectNorm[] = []
  for (const r of srt) {
    const h = r.y1 - r.y0
    const ln = lines.find((l) => Math.abs((l.y0 + l.y1) / 2 - (r.y0 + r.y1) / 2) < h * 0.6 && r.x0 <= l.x1 + 0.015 && r.x1 >= l.x0 - 0.015)
    if (ln) { ln.x0 = Math.min(ln.x0, r.x0); ln.x1 = Math.max(ln.x1, r.x1); ln.y0 = Math.min(ln.y0, r.y0); ln.y1 = Math.max(ln.y1, r.y1) }
    else lines.push({ ...r })
  }
  return lines.filter((l, i) => !lines.some((o, j) => j !== i && o.x0 <= l.x0 + 1e-4 && o.x1 >= l.x1 - 1e-4 && o.y0 <= l.y0 + 1e-4 && o.y1 >= l.y1 - 1e-4 && (j < i || o.x1 - o.x0 > l.x1 - l.x0 || o.y1 - o.y0 > l.y1 - l.y0)))
}
