'use client'

// LEITOR DA BIBLIOTECA — HOST. Usa LITERALMENTE o leitor do Jurisprudência (public/leitura/leitor-jus.html,
// iframe): mesma top bar, barra de grifos, sumário, caderno, foco — tudo real e compartilhado. O CONTEÚDO
// de leitura é o PDF FIEL (o mesmo do editor), renderizado DENTRO do #article do leitor (canvas + camada de
// texto), e o motor de grifos do Juris opera sobre ele. Aqui o host só faz o handshake + a persistência dos
// grifos por aluno:
//   1) carrega os metadados do PDF (nº de páginas + tamanhos) e manda { type:'leitor-jus-day', cfg:{ modo,
//      pdf, grifos, ... } } quando o iframe avisa 'leitor-jus-ready';
//   2) a cada mudança o iframe manda 'leitor-jus-grifos' → reconciliamos com /api/conteudo/grifo-pdf.

import { useCallback, useEffect, useRef, useState } from 'react'
import type { GrifoPdf } from '@/lib/conteudo/leitor'
import { APP_VERSION } from '@/lib/version'

const PROTOTIPO = `/leitura/leitor-jus.html?v=${APP_VERSION}`
const LARGURA_ALVO = 820 // largura de referência p/ a escala do PDF (host e iframe usam a MESMA)

type Rect = { x0: number; y0: number; x1: number; y1: number }
interface GrifoEngine { id: string; sec: string; rects: Rect[]; t: string; c: string; note: string; text: string }

const aEngine = (g: GrifoPdf): GrifoEngine => ({ id: g.id, sec: 'p' + g.pagina, rects: g.rects, t: g.tool, c: g.cor, note: g.nota || '', text: g.texto || '' })
const hashGrifo = (g: GrifoEngine) => `${g.sec}|${JSON.stringify(g.rects)}|${g.t}|${g.c}|${g.note}`

export function LeitorBiblioteca({
  documentoId, versaoId, titulo, pdfUrl, grifos: iniciais, voltarHref = '/aluno/biblioteca',
}: {
  documentoId: string; versaoId: string; titulo: string; pdfUrl: string | null
  grifos: GrifoPdf[]; voltarHref?: string
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [pdfMeta, setPdfMeta] = useState<{ url: string; scale: number; pages: { w: number; h: number }[] } | null>(null)
  const enviados = useRef(new Map<string, { serverId: string; hash: string }>())
  const busy = useRef(false); const pendente = useRef<GrifoEngine[] | null>(null)
  const dados = useRef({ documentoId, versaoId, titulo, voltarHref })
  dados.current = { documentoId, versaoId, titulo, voltarHref }

  useEffect(() => {
    enviados.current.clear()
    for (const g of iniciais) { const e = aEngine(g); enviados.current.set(e.id, { serverId: g.id, hash: hashGrifo(e) }) }
  }, [iniciais])

  // carrega os metadados do PDF (nº de páginas + tamanho de cada uma na MESMA escala que o iframe usará)
  useEffect(() => {
    if (!pdfUrl) return
    let vivo = true
    ;(async () => {
      try {
        const pdfjs: any = await import('pdfjs-dist')
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdf/pdf.worker.min.mjs'
        const pdf = await pdfjs.getDocument({ url: pdfUrl }).promise
        if (!vivo) return
        const v1 = (await pdf.getPage(1)).getViewport({ scale: 1 })
        const scale = Math.max(0.8, Math.min(2, LARGURA_ALVO / v1.width))
        const pages: { w: number; h: number }[] = []
        for (let n = 1; n <= pdf.numPages; n++) {
          const v = (await pdf.getPage(n)).getViewport({ scale })
          pages.push({ w: Math.round(v.width), h: Math.round(v.height) })
        }
        if (!vivo) return
        setPdfMeta({ url: pdfUrl, scale, pages })
      } catch { /* sem PDF → o leitor mostra conteúdo vazio; o download continua disponível */ }
    })()
    return () => { vivo = false }
  }, [pdfUrl])

  const enviarDia = useCallback(() => {
    const win = iframeRef.current?.contentWindow
    if (!win) return
    if (pdfUrl && !pdfMeta) return // o leitor boota UMA vez → só manda o "dia" quando o PDF já está pronto
    const d = dados.current
    win.postMessage({
      type: 'leitor-jus-day', html: '',
      cfg: {
        modo: 'biblioteca', docKey: d.documentoId, titulo: d.titulo,
        pdf: pdfMeta ? { url: pdfMeta.url, scale: pdfMeta.scale, pages: pdfMeta.pages } : null,
        grifos: iniciais.map(aEngine),
        caminho: ['Biblioteca', d.titulo], voltarHref: d.voltarHref, questoesHref: d.voltarHref,
        grifoRevisaoOff: true,
      },
    }, '*')
  }, [pdfMeta, iniciais, pdfUrl])

  const reconciliar = useCallback(async (grifos: GrifoEngine[]) => {
    if (busy.current) { pendente.current = grifos; return }
    busy.current = true
    const d = dados.current; const map = enviados.current
    try {
      const atual = new Map(grifos.map((g) => [g.id, g]))
      for (const [cid, info] of [...map.entries()]) {
        if (!atual.has(cid)) { try { await fetch('/api/conteudo/grifo-pdf?id=' + encodeURIComponent(info.serverId), { method: 'DELETE' }) } catch { /* */ } map.delete(cid) }
      }
      for (const g of grifos) {
        if (!g.rects || !g.rects.length) continue
        const info = map.get(g.id); const h = hashGrifo(g)
        if (info && info.hash === h) continue
        if (info && info.hash !== h) { try { await fetch('/api/conteudo/grifo-pdf?id=' + encodeURIComponent(info.serverId), { method: 'DELETE' }) } catch { /* */ } map.delete(g.id) }
        try {
          const r = await fetch('/api/conteudo/grifo-pdf', {
            method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'same-origin',
            body: JSON.stringify({ documento_id: d.documentoId, versao_id: d.versaoId, pagina: Number(g.sec.slice(1)) || 1, rects: g.rects, cor: g.c, tool: g.t, nota: g.note, texto: g.text }),
          })
          const j = await r.json().catch(() => ({}))
          if (r.ok && j?.id) map.set(g.id, { serverId: j.id, hash: h })
        } catch { /* tenta no próximo sync */ }
      }
    } finally { busy.current = false; if (pendente.current) { const p = pendente.current; pendente.current = null; void reconciliar(p) } }
  }, [])

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.source !== iframeRef.current?.contentWindow) return
      const m = e.data; if (!m || typeof m !== 'object') return
      if (m.type === 'leitor-jus-ready') { enviarDia(); return }
      if (m.type === 'leitor-jus-grifos') { void reconciliar(Array.isArray(m.grifos) ? m.grifos : []); return }
      if (m.type === 'leitor-jus-nav') { window.location.href = dados.current.voltarHref }
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [enviarDia, reconciliar])

  // quando os metadados do PDF ficam prontos (após o 'ready'), reenvia o dia já com o PDF
  useEffect(() => { if (pdfMeta) enviarDia() }, [pdfMeta, enviarDia])

  return (
    <div className="fixed inset-0 z-40 bg-[var(--bg,#fbfbfc)]">
      <iframe ref={iframeRef} src={PROTOTIPO} title={titulo || 'Leitura'} onLoad={enviarDia}
        style={{ display: 'block', width: '100%', height: '100%', border: 0, background: 'var(--bg, #fbfbfc)' }} />
    </div>
  )
}
