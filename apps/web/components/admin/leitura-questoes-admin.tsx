'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { HelpCircle, Plus, Trash2, Search, Loader2 } from 'lucide-react'
import {
  listarQuestoesDocumento, buscarQuestoesLeitura, adicionarQuestaoDocumento, atualizarQuestaoDocumento, removerQuestaoDocumento,
  type QuestaoDoc, type QuestaoBuscaLeitura,
} from '@/app/admin/leitura/actions'

/** Admin: anexa questões do banco entre artigos da leitura (Fase 2). */
export function LeituraQuestoesAdmin({ documentoId, versao, html }: { documentoId: string; versao: number; html: string }) {
  const [itens, setItens] = useState<QuestaoDoc[]>([])
  const [busca, setBusca] = useState('')
  const [resultados, setResultados] = useState<QuestaoBuscaLeitura[] | null>(null)
  const [buscando, setBuscando] = useState(false)
  const [, start] = useTransition()

  // Seções (data-art) parseadas do HTML salvo → opções de "após qual artigo".
  const secoes = useMemo(() => {
    if (typeof window === 'undefined' || !html) return [] as { art: number; label: string }[]
    try {
      const d = new DOMParser().parseFromString(html, 'text/html')
      return Array.from(d.querySelectorAll('[data-art]')).map((el) => ({ art: Number(el.getAttribute('data-art')) || 0, label: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 50) || `Seção ${el.getAttribute('data-art')}` }))
    } catch { return [] }
  }, [html])

  useEffect(() => { listarQuestoesDocumento(documentoId, versao).then((r) => { if (r.ok) setItens(r.itens ?? []) }) }, [documentoId, versao])

  function buscar() {
    setBuscando(true)
    buscarQuestoesLeitura(busca).then((r) => { setResultados(r.ok ? r.itens ?? [] : []); setBuscando(false); if (!r.ok) toast.error(r.error ?? 'Erro na busca.') })
  }
  function adicionar(q: QuestaoBuscaLeitura) {
    const apos = secoes[secoes.length - 1]?.art ?? 1
    start(async () => {
      const r = await adicionarQuestaoDocumento(documentoId, versao, q.id, apos, true)
      if (r.ok && r.id) { setItens((p) => [...p, { id: r.id!, questaoId: q.id, enunciado: q.enunciado, aposArtigo: apos, obrigatoria: true }]); setResultados((rs) => (rs ?? []).filter((x) => x.id !== q.id)); toast.success('Questão adicionada') }
      else toast.error(r.error ?? 'Erro')
    })
  }
  function mudarApos(id: string, apos: number) { setItens((p) => p.map((x) => (x.id === id ? { ...x, aposArtigo: apos } : x))); atualizarQuestaoDocumento(id, { aposArtigo: apos }) }
  function toggleObrig(id: string, v: boolean) { setItens((p) => p.map((x) => (x.id === id ? { ...x, obrigatoria: v } : x))); atualizarQuestaoDocumento(id, { obrigatoria: v }) }
  function remover(id: string) { setItens((p) => p.filter((x) => x.id !== id)); removerQuestaoDocumento(id) }

  return (
    <div className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm">
      <p className="flex items-center gap-1.5 text-sm font-semibold"><HelpCircle className="h-4 w-4 text-primary" /> Questões no meio da leitura</p>

      {/* Buscar + adicionar */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') buscar() }} placeholder="Buscar questão por enunciado ou código…" className="w-full rounded-lg border bg-[var(--input-bg,transparent)] py-2 pl-8 pr-3 text-sm outline-none focus:ring-1 focus:ring-ring" />
        </div>
        <button onClick={buscar} disabled={buscando} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50">
          {buscando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Buscar
        </button>
      </div>
      {resultados && (
        <div className="max-h-52 space-y-1 overflow-y-auto rounded-lg border bg-muted/20 p-1">
          {resultados.length === 0 ? <p className="px-2 py-2 text-xs text-muted-foreground">Nenhuma questão encontrada.</p> : resultados.map((q) => (
            <button key={q.id} onClick={() => adicionar(q)} className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-card">
              <Plus className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              <span className="min-w-0 flex-1"><span className="line-clamp-2">{q.enunciado}</span>{q.codigo && <span className="ml-1 font-mono text-[10px] text-muted-foreground">{q.codigo}</span>}</span>
            </button>
          ))}
        </div>
      )}

      {/* Lista de anexadas */}
      {itens.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">Nenhuma questão no meio da leitura ainda. Busque e adicione acima.</p>
      ) : (
        <div className="space-y-2">
          {itens.map((q) => (
            <div key={q.id} className="rounded-lg border p-2.5">
              <div className="flex items-start gap-2">
                <span className="min-w-0 flex-1 text-sm"><span className="line-clamp-2">{q.enunciado}</span></span>
                <button onClick={() => remover(q.id)} className="shrink-0 rounded p-1 text-muted-foreground hover:text-destructive" aria-label="Remover"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <label className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">Após:</span>
                  <select value={q.aposArtigo} onChange={(e) => mudarApos(q.id, Number(e.target.value))} className="h-8 rounded-lg border bg-[var(--input-bg,transparent)] px-2 text-xs outline-none focus:ring-1 focus:ring-ring">
                    {secoes.length === 0 ? <option value={1}>Artigo 1</option> : secoes.map((s) => <option key={s.art} value={s.art}>{s.art}. {s.label}</option>)}
                  </select>
                </label>
                <label className="ml-auto flex items-center gap-1.5">
                  <input type="checkbox" checked={q.obrigatoria} onChange={(e) => toggleObrig(q.id, e.target.checked)} className="h-4 w-4 rounded border" />
                  <span className="text-muted-foreground">Obrigatória p/ concluir</span>
                </label>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
