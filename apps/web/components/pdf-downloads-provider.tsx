'use client'

import { createContext, useCallback, useContext, useEffect, useRef } from 'react'
import { toast } from 'sonner'

/**
 * Acompanha a geração de PDFs (worker + Gotenberg) de forma GLOBAL: fica montado no
 * layout, então o polling continua mesmo que o usuário troque de página. Persiste os
 * jobs pendentes no localStorage → retoma até depois de recarregar a página.
 *
 * Quem inicia um download só chama `registrar({ id, nome, statusUrl })` — o provider
 * cuida do polling, do toast de progresso e do download automático quando fica pronto.
 */
type PdfPendente = { id: string; nome: string; statusUrl: string; arquivo?: string }
const PdfCtx = createContext<{ registrar: (job: PdfPendente) => void }>({ registrar: () => {} })
export const usePdfDownloads = () => useContext(PdfCtx)

const CHAVE = 'pdf_downloads_pendentes'

function baixarArquivo(url: string) {
  const a = document.createElement('a')
  a.href = url; a.rel = 'noopener'
  document.body.appendChild(a); a.click(); a.remove()
}

export function PdfDownloadsProvider({ children }: { children: React.ReactNode }) {
  const pendentes = useRef<Map<string, PdfPendente>>(new Map())
  const tentativas = useRef<Map<string, number>>(new Map())
  const loop = useRef<ReturnType<typeof setTimeout> | null>(null)
  const iniciado = useRef(false)

  const salvar = useCallback(() => {
    try { localStorage.setItem(CHAVE, JSON.stringify([...pendentes.current.values()])) } catch { /* noop */ }
  }, [])

  const concluir = useCallback((id: string) => {
    pendentes.current.delete(id); tentativas.current.delete(id); salvar()
  }, [salvar])

  const tick = useCallback(async () => {
    loop.current = null
    for (const j of [...pendentes.current.values()]) {
      const n = (tentativas.current.get(j.id) ?? 0) + 1
      tentativas.current.set(j.id, n)
      if (n > 150) { // ~5 min de teto
        concluir(j.id)
        toast.error(`"${j.nome}": a geração demorou demais.`, { id: j.id, duration: 8000 })
        continue
      }
      try {
        const res = await fetch(j.statusUrl)
        const job = await res.json()
        if (job.status === 'concluido' && job.url) {
          concluir(j.id)
          const dl = `${job.url}?download=${encodeURIComponent(j.arquivo || j.nome)}.pdf`
          toast.success(`"${j.nome}" pronto!`, { id: j.id, duration: 10000, action: { label: 'Baixar', onClick: () => baixarArquivo(dl) } })
          baixarArquivo(dl) // baixa automático; se o navegador bloquear, o botão "Baixar" resolve
        } else if (job.status === 'erro') {
          concluir(j.id)
          toast.error(`Falha ao gerar "${j.nome}".`, { id: j.id, duration: 8000 })
        }
      } catch { /* rede instável — tenta de novo no próximo tick */ }
    }
    if (pendentes.current.size > 0) loop.current = setTimeout(tick, 2000)
  }, [concluir])

  const garantirLoop = useCallback(() => {
    if (!loop.current && pendentes.current.size > 0) loop.current = setTimeout(tick, 1200)
  }, [tick])

  const registrar = useCallback((job: PdfPendente) => {
    pendentes.current.set(job.id, job)
    tentativas.current.set(job.id, 0)
    salvar()
    toast.loading(`Gerando download do ${job.nome}`, { id: job.id })
    garantirLoop()
  }, [salvar, garantirLoop])

  // Retoma jobs pendentes ao montar (sobrevive à recarga / troca de página).
  useEffect(() => {
    if (iniciado.current) return
    iniciado.current = true
    try {
      const lista: PdfPendente[] = JSON.parse(localStorage.getItem(CHAVE) || '[]')
      for (const j of lista) {
        pendentes.current.set(j.id, j)
        tentativas.current.set(j.id, 0)
        toast.loading(`Retomando "${j.nome}"…`, { id: j.id })
      }
      garantirLoop()
    } catch { /* noop */ }
    return () => { if (loop.current) clearTimeout(loop.current) }
  }, [garantirLoop])

  return <PdfCtx.Provider value={{ registrar }}>{children}</PdfCtx.Provider>
}
