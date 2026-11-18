// Extrai da text layer do pdf.js os itens (normalizados 0..1 por página) que alimentam a espinha de texto
// (lib/conteudo/pdf-texto-ancora.ts). Recebe um PDFDocumentProxy (navegador OU Node) — não importa pdf.js aqui.
import type { PaginaPdf } from './pdf-texto-ancora'

export async function extrairPaginasPdf(pdf: any, opts: { lote?: number; aoProgredir?: (feitas: number, total: number) => void } = {}): Promise<PaginaPdf[]> {
  const total: number = pdf.numPages; const LOTE = opts.lote ?? 12
  const out: PaginaPdf[] = new Array(total)
  for (let ini = 0; ini < total; ini += LOTE) {
    const fim = Math.min(ini + LOTE, total)
    await Promise.all(Array.from({ length: fim - ini }, async (_, k) => {
      const n = ini + k + 1
      const page = await pdf.getPage(n)
      const vp = page.getViewport({ scale: 1 })
      const tc = await page.getTextContent()
      const itens = (tc.items as any[]).filter((it) => typeof it.str === 'string').map((it) => {
        const [, , , , e, f] = it.transform as number[]
        const w = Number(it.width) || 0, h = Number(it.height) || 0
        return {
          str: it.str as string,
          x0: Math.max(0, e / vp.width), x1: Math.min(1, (e + w) / vp.width),
          y0: Math.max(0, (vp.height - (f + h)) / vp.height), y1: Math.min(1, (vp.height - f) / vp.height),
        }
      })
      out[n - 1] = { pagina: n, itens }
    }))
    opts.aoProgredir?.(fim, total)
  }
  return out
}
