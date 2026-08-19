'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, X, Camera, Maximize2 } from 'lucide-react'

const MAX_PAGINAS = 10

interface Pagina { juncaoId: string; arquivoId: string; ordem: number; nome: string | null; url: string }

/**
 * Envio da resposta DISCURSIVA por IMAGEM (foto da folha manuscrita), durante a sessão.
 * O aluno anexa/tira foto(s); cada página vira um arquivo em bucket privado (URL assinada).
 * Reporta a contagem via `onCount` para o runner marcar a questão como respondida.
 * Cada página pode ser AMPLIADA (lightbox) e removida (com animação "apagando" na própria folha).
 */
export function QuestaoDiscursivaEnvio({ sessaoId, questaoId, bloqueada, onCount }: {
  sessaoId: string; questaoId: string; bloqueada?: boolean; onCount?: (n: number) => void
}) {
  const [paginas, setPaginas] = useState<Pagina[]>([])
  const [carregando, setCarregando] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [removendo, setRemovendo] = useState<Set<string>>(new Set()) // juncaoIds sendo apagados
  const [ampliada, setAmpliada] = useState<Pagina | null>(null) // página aberta no lightbox
  const [erro, setErro] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const aplicar = (ps: Pagina[]) => { setPaginas(ps); onCount?.(ps.length) }

  async function carregar() {
    setCarregando(true)
    try {
      const r = await fetch(`/api/sessoes/resposta-discursiva/imagem?sessao_id=${sessaoId}&questao_id=${questaoId}`)
      if (r.ok) { const j = await r.json(); aplicar(j.paginas ?? []) }
    } finally { setCarregando(false) }
  }
  // Recarrega ao trocar de questão (o runner reusa o componente por índice).
  useEffect(() => { carregar() }, [questaoId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function enviar(files: FileList | null) {
    if (!files?.length || bloqueada) return
    setEnviando(true); setErro(null)
    try {
      const fd = new FormData()
      fd.append('sessao_id', sessaoId); fd.append('questao_id', questaoId)
      for (const f of Array.from(files)) fd.append('file', f)
      const r = await fetch('/api/sessoes/resposta-discursiva/imagem', { method: 'POST', body: fd })
      const j = await r.json().catch(() => ({}))
      if (j.paginas) aplicar(j.paginas)
      if (j.erros?.length) setErro(j.erros.join(' '))
      else if (!r.ok) setErro(j.message ?? 'Falha no envio.')
    } catch { setErro('Falha no envio.') } finally {
      setEnviando(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function remover(juncaoId: string) {
    if (bloqueada || removendo.has(juncaoId)) return
    setRemovendo((s) => new Set(s).add(juncaoId)) // liga a animação "apagando" nesta folha
    try {
      const r = await fetch('/api/sessoes/resposta-discursiva/imagem', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessao_id: sessaoId, questao_id: questaoId, juncao_id: juncaoId }),
      })
      const j = await r.json().catch(() => ({}))
      if (j.paginas) aplicar(j.paginas)
    } finally {
      setRemovendo((s) => { const n = new Set(s); n.delete(juncaoId); return n })
      setAmpliada((a) => (a?.juncaoId === juncaoId ? null : a)) // fecha o lightbox se era a página apagada
    }
  }

  // Esc fecha o lightbox.
  useEffect(() => {
    if (!ampliada) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setAmpliada(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ampliada])

  return (
    <div className="space-y-3">
      {carregando ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>
      ) : paginas.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {paginas.map((p, i) => {
            const apagando = removendo.has(p.juncaoId)
            return (
              <div key={p.juncaoId} className="group relative overflow-hidden rounded-lg border bg-muted/30">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={`Página ${i + 1}`} className="h-40 w-full cursor-zoom-in object-cover" onClick={() => !apagando && setAmpliada(p)} />
                <span className="absolute left-1.5 top-1.5 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] font-semibold text-white">Página {i + 1}</span>
                {/* Expandir (lightbox) */}
                <button type="button" onClick={() => setAmpliada(p)} aria-label="Expandir imagem" disabled={apagando}
                  className="absolute bottom-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-md bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100">
                  <Maximize2 className="h-3.5 w-3.5" />
                </button>
                {!bloqueada && !apagando && (
                  <button type="button" onClick={() => remover(p.juncaoId)} aria-label="Remover página"
                    className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-md bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
                {/* Animação "apagando" sobre a própria folha (o DELETE tem latência: storage + re-listagem). */}
                {apagando && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/60 backdrop-blur-sm">
                    <Loader2 className="h-6 w-6 animate-spin text-white" />
                    <span className="text-[11px] font-medium text-white">Apagando…</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {bloqueada ? (
        paginas.length === 0 && <p className="text-sm text-muted-foreground">Questão anulada — sem envio.</p>
      ) : (
        <>
          <input ref={inputRef} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={(e) => enviar(e.target.files)} />
          <button type="button" onClick={() => inputRef.current?.click()} disabled={enviando || paginas.length >= MAX_PAGINAS}
            className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-primary/40 bg-primary/5 py-4 text-sm font-medium text-primary transition-colors hover:bg-primary/10 disabled:opacity-60">
            {enviando ? <><Loader2 className="h-4 w-4 animate-spin" /> Enviando…</> : <><Camera className="h-4 w-4" /> {paginas.length ? 'Adicionar mais fotos' : 'Enviar foto(s) da resposta'}</>}
          </button>
          <p className="text-xs text-muted-foreground">
            Tire ou anexe foto(s) da sua resposta manuscrita (PNG/JPG, até 5&nbsp;MB cada, máx. {MAX_PAGINAS} páginas). Será corrigida por um avaliador.
          </p>
        </>
      )}
      {erro && <p className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">{erro}</p>}

      {/* Lightbox: imagem ampliada (portal p/ document.body — não é cortada por overflow do runner). */}
      {ampliada && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" onClick={() => setAmpliada(null)} role="dialog" aria-modal="true" aria-label="Imagem ampliada">
          <button type="button" aria-label="Fechar" onClick={() => setAmpliada(null)}
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20">
            <X className="h-5 w-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={ampliada.url} alt="Resposta ampliada" className="max-h-[92vh] max-w-[95vw] rounded-lg object-contain shadow-2xl" onClick={(e) => e.stopPropagation()} />
        </div>,
        document.body,
      )}
    </div>
  )
}
