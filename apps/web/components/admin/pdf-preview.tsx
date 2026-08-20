'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, FileText } from 'lucide-react'

/**
 * Prévia de PDF renderizada em <canvas> via PDF.js — funciona mesmo quando o navegador está
 * configurado para BAIXAR PDFs em vez de exibi-los (não depende do visualizador nativo).
 * Busca o arquivo pelo proxy same-origin (/api/pdf-view) p/ evitar CORS/download.
 * Re-rasteriza ao mudar a largura do container (ResizeObserver) → não perde nitidez ao expandir.
 */
export function PdfPreview({ url, titulo, className, maxPag = 12 }: { url: string; titulo?: string; className?: string; maxPag?: number }) {
  const contRef = useRef<HTMLDivElement>(null)
  const [estado, setEstado] = useState<'load' | 'ok' | 'erro'>('load')

  useEffect(() => {
    let cancel = false
    let doc: any = null
    let ultimaLargura = 0
    let t: ReturnType<typeof setTimeout> | null = null
    let seq = 0
    const cont = contRef.current
    const dpr = () => Math.min(window.devicePixelRatio || 1, 2)

    async function renderizar() {
      if (!doc || !cont || cancel) return
      const largura = cont.clientWidth || 320
      if (largura < 10) return
      ultimaLargura = largura
      const meu = ++seq
      const frag = document.createDocumentFragment()
      const maxPaginas = Math.min(doc.numPages, maxPag)
      for (let i = 1; i <= maxPaginas; i++) {
        const page = await doc.getPage(i)
        if (cancel || meu !== seq) return
        const base = page.getViewport({ scale: 1 })
        const vp = page.getViewport({ scale: (largura * dpr()) / base.width })
        const canvas = document.createElement('canvas')
        canvas.width = vp.width; canvas.height = vp.height
        canvas.style.width = '100%'; canvas.style.height = 'auto'; canvas.style.display = 'block'
        if (i > 1) canvas.style.marginTop = '6px'
        frag.appendChild(canvas)
        await page.render({ canvasContext: canvas.getContext('2d')!, viewport: vp }).promise
        if (cancel || meu !== seq) return
      }
      if (cancel || meu !== seq || !cont) return
      cont.replaceChildren(frag) // troca tudo de uma vez (evita flicker/scroll pulando)
    }

    ;(async () => {
      try {
        setEstado('load')
        const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs')
        try { pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/legacy/build/pdf.worker.min.mjs` } catch { /* noop */ }
        const resp = await fetch(`/api/pdf-view?u=${encodeURIComponent(url)}`, { cache: 'force-cache' })
        if (!resp.ok) throw new Error('fetch')
        const buf = await resp.arrayBuffer()
        if (cancel) return
        doc = await pdfjs.getDocument({ data: new Uint8Array(buf), isEvalSupported: false, useSystemFonts: true, disableFontFace: false }).promise
        if (cancel) return
        await renderizar()
        if (!cancel) setEstado('ok')
      } catch {
        if (!cancel) setEstado('erro')
      }
    })()

    // Re-renderiza ao mudar a largura do container (debounce) — mantém a nitidez ao expandir a coluna.
    const ro = new ResizeObserver(() => {
      if (!cont) return
      const w = cont.clientWidth
      if (Math.abs(w - ultimaLargura) < 24) return
      if (t) clearTimeout(t)
      t = setTimeout(() => { renderizar() }, 180)
    })
    if (cont) ro.observe(cont)

    return () => { cancel = true; if (t) clearTimeout(t); ro.disconnect() }
  }, [url, maxPag])

  return (
    <div className={className}>
      <div ref={contRef} className="h-full w-full overflow-auto bg-white" />
      {estado === 'load' && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /> <span className="text-sm">Carregando prévia…</span>
        </div>
      )}
      {estado === 'erro' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-neutral-100 px-6 text-center text-muted-foreground dark:bg-neutral-900">
          <FileText className="h-8 w-8" />
          <span className="text-sm font-medium">PDF do {titulo ?? 'material'} enviado</span>
          <a href={url} target="_blank" rel="noreferrer" className="text-xs font-medium text-primary underline">Abrir PDF em nova aba</a>
        </div>
      )}
    </div>
  )
}
