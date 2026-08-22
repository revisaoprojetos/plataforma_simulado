'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Highlighter, Trash2, StickyNote, X, Crosshair } from 'lucide-react'
import { cn } from '@/lib/utils'
import { construirEspinha, rangeParaAncora, ancoraParaRange, rectsDoRange, type Espinha, type RectRel } from '@/lib/leitura/anotacoes-engine'
import { listarAnotacoesBase, criarAnotacaoBase, atualizarAnotacaoBase, excluirAnotacaoBase, type AnotacaoBase } from '@/app/admin/leitura/actions'

const CORES = ['#fde047', '#86efac', '#93c5fd', '#f9a8d4', '#fca5a5']
const useIso = typeof window !== 'undefined' ? useLayoutEffect : useEffect

/**
 * Modo AUTOR: o admin grifa trechos que "vêm no documento" (anotações base). Reusa o
 * mesmo motor de âncora do leitor do aluno. Ao abrir, cada aluno recebe uma CÓPIA
 * (editável/apagável por ele) — feito no carregarDocumentoAluno.
 */
export function LeituraAutorAnotacoes({ documentoId, versao, html }: { documentoId: string; versao: number; html: string }) {
  const [anotacoes, setAnotacoes] = useState<AnotacaoBase[]>([])
  const [rectsPorId, setRectsPorId] = useState<Record<string, RectRel[]>>({})
  const [sel, setSel] = useState<{ anc: any; x: number; y: number } | null>(null)
  const [notaEdit, setNotaEdit] = useState<{ id: string; valor: string } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const espinhaRef = useRef<Espinha | null>(null)

  useEffect(() => { listarAnotacoesBase(documentoId, versao).then((r) => { if (r.ok) setAnotacoes(r.itens ?? []) }) }, [documentoId, versao])

  const recomputar = useCallback(() => {
    const root = contentRef.current, ov = overlayRef.current
    if (!root || !ov) return
    const esp = construirEspinha(root); espinhaRef.current = esp
    const base = ov.getBoundingClientRect()
    const map: Record<string, RectRel[]> = {}
    for (const a of anotacoes) {
      const range = ancoraParaRange(esp, { inicio: a.inicio, fim: a.fim, exact: a.exact, prefix: a.prefix, suffix: a.suffix })
      if (range) { const rs = rectsDoRange(range, base); if (rs.length) map[a.id] = rs }
    }
    setRectsPorId(map)
  }, [anotacoes])
  useIso(() => { recomputar() }, [recomputar, html])

  function aoSelecionar() {
    const s = window.getSelection(); const root = contentRef.current, cont = containerRef.current
    if (!s || s.isCollapsed || s.rangeCount === 0 || !root || !cont) { setSel(null); return }
    const range = s.getRangeAt(0)
    if (!root.contains(range.commonAncestorContainer)) return
    const esp = espinhaRef.current ?? construirEspinha(root)
    const anc = rangeParaAncora(root, esp, range)
    if (!anc || !anc.exact.trim()) return
    const rc = range.getBoundingClientRect(), cr = cont.getBoundingClientRect()
    setSel({ anc, x: Math.min(Math.max(60, rc.left + rc.width / 2 - cr.left), cr.width - 60), y: rc.bottom - cr.top + 6 })
  }

  async function criar(cor: string) {
    if (!sel) return
    const a = sel.anc
    setSel(null); window.getSelection()?.removeAllRanges()
    const r = await criarAnotacaoBase(documentoId, versao, { inicio: a.inicio, fim: a.fim, exact: a.exact, prefix: a.prefix, suffix: a.suffix, cor })
    if (r.ok && r.id) setAnotacoes((p) => [...p, { id: r.id!, inicio: a.inicio, fim: a.fim, exact: a.exact, prefix: a.prefix, suffix: a.suffix, cor, nota: null }])
    else toast.error(r.error ?? 'Erro ao grifar.')
  }
  async function atualizar(id: string, patch: Partial<Pick<AnotacaoBase, 'cor' | 'nota'>>) {
    setAnotacoes((p) => p.map((a) => (a.id === id ? { ...a, ...patch } : a)))
    await atualizarAnotacaoBase(id, patch)
  }
  async function excluir(id: string) {
    setAnotacoes((p) => p.filter((a) => a.id !== id))
    await excluirAnotacaoBase(id)
  }
  function pular(a: AnotacaoBase) {
    const esp = espinhaRef.current; if (!esp) return
    const range = ancoraParaRange(esp, { inicio: a.inicio, fim: a.fim, exact: a.exact, prefix: a.prefix, suffix: a.suffix })
    range?.startContainer.parentElement?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  if (!html) return <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Salve o conteúdo do documento primeiro para poder marcar as anotações base.</p>

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
      {/* Conteúdo (seleção → grifo) */}
      <div ref={containerRef} className="relative rounded-2xl border bg-card">
        <div className="flex items-center gap-2 border-b px-4 py-2 text-sm font-medium"><Highlighter className="h-4 w-4 text-primary" /> Selecione um trecho para marcar (vem no documento p/ todos os alunos)</div>
        <div onMouseUp={aoSelecionar} className="max-h-[65vh] overflow-auto">
          {/* wrapper relative: overlay rola JUNTO com o conteúdo */}
          <div className="relative">
            <div ref={contentRef}
              className="leitura-conteudo px-5 py-4 text-sm leading-relaxed [&_a]:text-primary [&_a]:underline [&_h1]:mb-2 [&_h1]:mt-3 [&_h1]:text-lg [&_h1]:font-bold [&_h2]:mb-1.5 [&_h2]:mt-3 [&_h2]:text-base [&_h2]:font-bold [&_h3]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_p]:mb-2 [&_table]:w-full [&_td]:border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:px-2 [&_th]:py-1"
              dangerouslySetInnerHTML={{ __html: html }} />
            <div ref={overlayRef} className="pointer-events-none absolute inset-0" aria-hidden>
              {anotacoes.map((a) => (rectsPorId[a.id] ?? []).map((r, i) => (
                <div key={`${a.id}-${i}`} className="absolute rounded-[2px]" style={{ left: r.left, top: r.top, width: r.width, height: r.height, background: a.cor, opacity: 0.4, mixBlendMode: 'multiply' }} />
              )))}
            </div>
          </div>
        </div>
        {sel && (
          <div className="absolute z-30 -translate-x-1/2 rounded-xl border bg-popover p-1.5 shadow-lg" style={{ left: sel.x, top: sel.y }} onMouseDown={(e) => e.preventDefault()}>
            <div className="flex items-center gap-1">
              {CORES.map((c) => <button key={c} onClick={() => criar(c)} className="h-6 w-6 rounded-full border border-black/10 transition hover:scale-110" style={{ background: c }} aria-label={c} />)}
              <button onClick={() => { setSel(null); window.getSelection()?.removeAllRanges() }} className="ml-0.5 rounded-md p-1 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
            </div>
          </div>
        )}
      </div>

      {/* Lista das anotações base */}
      <div className="rounded-2xl border bg-card">
        <div className="border-b px-3 py-2 text-sm font-semibold">Anotações base ({anotacoes.length})</div>
        <div className="max-h-[65vh] space-y-2 overflow-y-auto p-2">
          {anotacoes.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs text-muted-foreground">Nenhuma ainda. Grife um trecho no conteúdo ao lado.</p>
          ) : [...anotacoes].sort((a, b) => a.inicio - b.inicio).map((a) => (
            <div key={a.id} className="rounded-lg border p-2">
              <div className="flex items-start gap-2">
                <span className="mt-0.5 h-3 w-3 shrink-0 rounded-full" style={{ background: a.cor }} />
                <button onClick={() => pular(a)} className="min-w-0 flex-1 text-left text-xs leading-snug"><span className="line-clamp-3">{a.exact}</span></button>
                <button onClick={() => pular(a)} className="shrink-0 rounded p-1 text-muted-foreground" aria-label="Ir"><Crosshair className="h-3.5 w-3.5" /></button>
                <button onClick={() => excluir(a.id)} className="shrink-0 rounded p-1 text-muted-foreground hover:text-destructive" aria-label="Excluir"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
              <div className="mt-1.5 flex items-center gap-1 pl-5">
                {CORES.map((c) => <button key={c} onClick={() => atualizar(a.id, { cor: c })} className={cn('h-4 w-4 rounded-full transition', a.cor === c ? 'ring-2 ring-primary' : 'border border-black/10')} style={{ background: c }} aria-label={c} />)}
                <button onClick={() => setNotaEdit(notaEdit?.id === a.id ? null : { id: a.id, valor: a.nota ?? '' })} className="ml-auto rounded p-1 text-muted-foreground hover:text-foreground" title="Nota"><StickyNote className="h-3.5 w-3.5" /></button>
              </div>
              {notaEdit?.id === a.id ? (
                <div className="mt-1.5 pl-5">
                  <textarea value={notaEdit.valor} onChange={(e) => setNotaEdit({ id: a.id, valor: e.target.value })} rows={2} autoFocus placeholder="Nota (opcional)…" className="w-full resize-none rounded-md border bg-transparent px-2 py-1 text-xs outline-none" />
                  <div className="mt-1 flex justify-end gap-1">
                    <button onClick={() => setNotaEdit(null)} className="rounded px-2 py-0.5 text-xs text-muted-foreground">Cancelar</button>
                    <button onClick={() => { atualizar(a.id, { nota: notaEdit.valor || null }); setNotaEdit(null) }} className="rounded bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">Salvar</button>
                  </div>
                </div>
              ) : a.nota ? <p className="mt-1.5 pl-5 text-xs italic text-muted-foreground">{a.nota}</p> : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
