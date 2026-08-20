import 'server-only'

/** Extrai o TEXTO de um PDF (camada de texto, via PDF.js) — usado p/ mostrar o espelho como texto. */
export async function extrairTextoPdf(buffer: Buffer, maxPag = 30): Promise<string> {
  try {
    const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer), isEvalSupported: false, useSystemFonts: true, disableFontFace: true }).promise
    const paginas: string[] = []
    const total = Math.min(doc.numPages, maxPag)
    for (let p = 1; p <= total; p++) {
      const page = await doc.getPage(p)
      const tc = await page.getTextContent()
      const its = (tc.items as any[]).filter((i) => typeof i.str === 'string').map((i) => ({ x: i.transform[4] as number, y: i.transform[5] as number, s: i.str as string }))
      its.sort((a, b) => (b.y - a.y) || (a.x - b.x))
      const linhas: string[] = []
      let lineY: number | null = null, cur = ''
      for (const it of its) {
        if (lineY !== null && Math.abs(it.y - lineY) > 3) { if (cur.trim()) linhas.push(cur.trim()); cur = ''; lineY = null }
        if (lineY === null) lineY = it.y
        cur += (cur && !cur.endsWith(' ') ? ' ' : '') + it.s
      }
      if (cur.trim()) linhas.push(cur.trim())
      paginas.push(linhas.join('\n'))
    }
    return paginas.join('\n\n──────────\n\n').trim()
  } catch { return '' }
}
