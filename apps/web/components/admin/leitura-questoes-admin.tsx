'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { HelpCircle, Trash2, Star, Plus, ListTree, ChevronUp, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MarkdownContent } from '@/components/markdown-content'
import { AdicionarQuestoesDialog } from '@/components/admin/adicionar-questoes-dialog'
import { listarDisciplinasFiltro, type QuestaoBancoBuscaItem } from '@/app/admin/banco-questoes/actions'
import type { QuestaoImport } from '@/app/admin/banco-questoes/import-types'
import {
  listarQuestoesDocumento, adicionarQuestaoDocumento, atualizarQuestaoDocumento, removerQuestaoDocumento, importarQuestoesLeitura,
  type QuestaoDoc,
} from '@/app/admin/leitura/actions'

// Item do índice — SÓ capítulos (expansíveis) + artigos (§/inciso/"Livros do Tombo" ficam de fora).
interface OutlineItem { key: string; artId: string | null; nivel: number; isArtigo: boolean; isCap: boolean; label: string }

const NIVEL: Record<string, number> = { livro: 0, parte: 0, titulo: 0, capitulo: 0, secao: 0, subsecao: 0, artigo: 1, paragrafo: 2, inciso: 3, alinea: 4, item: 4 }

/**
 * Admin — aba "Questões": mostra o documento como um ÍNDICE em blocos (capítulos/artigos/§) e
 * permite inserir questões do banco DEPOIS de cada artigo (ancoradas por `data-art`, que é como o
 * leitor as intercala). A seleção usa o mesmo pop-up do banco de simulado (AdicionarQuestoesDialog).
 */
export function LeituraQuestoesAdmin({ documentoId, versao, html }: { documentoId: string; versao: number; html: string }) {
  const [itens, setItens] = useState<QuestaoDoc[]>([])
  const [disciplinas, setDisciplinas] = useState<{ id: string; nome: string }[]>([])
  const [carregando, setCarregando] = useState(true)
  const [capAberto, setCapAberto] = useState<Set<string>>(new Set())
  const toggleCap = (k: string) => setCapAberto((p) => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n })
  const [, start] = useTransition()

  // Índice (CAPÍTULO→Art→§) parseado do HTML salvo — só artigos (data-art) recebem inserção.
  const outline = useMemo<OutlineItem[]>(() => {
    if (typeof window === 'undefined' || !html) return []
    try {
      const parsed = new DOMParser().parseFromString(html, 'text/html')
      const disp = Array.from(parsed.querySelectorAll('[data-disp]'))
      const src = disp.length ? disp : Array.from(parsed.querySelectorAll('[data-art]'))
      return src.map((el, i): OutlineItem => {
        const dispId = el.getAttribute('data-disp')
        const artId = el.getAttribute('data-art')
        const tipo = el.getAttribute('data-disp-tipo') || 'artigo'
        const nivel = disp.length ? (NIVEL[tipo] ?? 1) : 1
        const isArtigo = disp.length ? tipo === 'artigo' : true
        return {
          key: dispId || artId || String(i),
          artId, nivel, isArtigo, isCap: disp.length ? tipo === 'capitulo' : false,
          label: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 90) || (dispId || artId || `Item ${i + 1}`),
        }
        // filtro abaixo mantém só capítulo + artigo
      }).filter((o) => o.isCap || o.isArtigo)
    } catch { return [] }
  }, [html])

  useEffect(() => {
    let vivo = true
    // allSettled + sempre encerra: se uma action falhar, NÃO trava em "carregando" pra sempre.
    ;(async () => {
      const [q, d] = await Promise.allSettled([listarQuestoesDocumento(documentoId, versao), listarDisciplinasFiltro()])
      if (!vivo) return
      if (q.status === 'fulfilled' && q.value.ok) setItens(q.value.itens ?? [])
      if (d.status === 'fulfilled') setDisciplinas(d.value ?? [])
      setCarregando(false)
    })()
    return () => { vivo = false }
  }, [documentoId, versao])

  const jaIds = useMemo(() => new Set(itens.map((i) => i.questaoId)), [itens])
  const porArtigo = useMemo(() => {
    const m = new Map<number, QuestaoDoc[]>()
    for (const q of itens) { const arr = m.get(q.aposArtigo) ?? []; arr.push(q); m.set(q.aposArtigo, arr) }
    return m
  }, [itens])
  // Índice em 2 níveis: capítulo (expansível) → artigos. Cada artigo guarda o capítulo-pai.
  const tocItens = useMemo(() => {
    const out: { o: OutlineItem; parentCap: string | null }[] = []
    let cur: string | null = null
    for (const o of outline) { if (o.isCap) { cur = o.key; out.push({ o, parentCap: null }) } else out.push({ o, parentCap: cur }) }
    return out
  }, [outline])
  const capsComFilhos = useMemo(() => { const s = new Set<string>(); for (const it of tocItens) if (!it.o.isCap && it.parentCap) s.add(it.parentCap); return s }, [tocItens])

  function inserir(items: QuestaoBancoBuscaItem[], apos: number) {
    start(async () => {
      const novos: QuestaoDoc[] = []
      for (const q of items) {
        const r = await adicionarQuestaoDocumento(documentoId, versao, q.id, apos, true)
        if (r.ok && r.id) novos.push({ id: r.id, questaoId: q.id, enunciado: q.enunciado, aposArtigo: apos, obrigatoria: true })
        else toast.error(r.error ?? 'Erro ao inserir questão')
      }
      if (novos.length) { setItens((p) => [...p, ...novos]); toast.success(`${novos.length} questão(ões) inserida(s)`) }
    })
  }
  function importarArquivo(rows: QuestaoImport[], apos: number) {
    start(async () => {
      const r = await importarQuestoesLeitura(documentoId, versao, apos, rows)
      if (r.ok) {
        const q = await listarQuestoesDocumento(documentoId, versao)
        if (q.ok) setItens(q.itens ?? [])
        toast.success(`${r.count ?? 0} questão(ões) importada(s) e inserida(s)`)
      } else toast.error(r.error ?? 'Erro ao importar')
    })
  }
  function alternarObrig(q: QuestaoDoc) {
    setItens((p) => p.map((x) => (x.id === q.id ? { ...x, obrigatoria: !x.obrigatoria } : x)))
    start(async () => { const r = await atualizarQuestaoDocumento(q.id, { obrigatoria: !q.obrigatoria }); if (!r.ok) toast.error(r.error ?? 'Erro') })
  }
  function remover(q: QuestaoDoc) {
    setItens((p) => p.filter((x) => x.id !== q.id))
    start(async () => { const r = await removerQuestaoDocumento(q.id); if (!r.ok) toast.error(r.error ?? 'Erro ao remover') })
  }

  // Índice vem do HTML (síncrono) → renderiza na hora. As questões/disciplinas carregam em 2º plano
  // sem bloquear (nunca mais trava em "carregando").
  if (outline.length === 0) return (
    <div className="rounded-2xl border border-dashed bg-muted/30 px-4 py-12 text-center text-sm text-muted-foreground">
      Importe o conteúdo da lei (aba <strong>Configuração</strong>) para ver o índice e inserir questões entre os artigos.
    </div>
  )

  const totalQuestoes = itens.length

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-xl border bg-card p-3 text-sm text-muted-foreground shadow-sm">
        <ListTree className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <span>Cada bloco é um tópico do documento. Use <strong>＋ Inserir questão aqui</strong> abaixo de um artigo para escolher questões do banco — elas aparecem para o aluno logo depois daquele artigo. {totalQuestoes > 0 && <span className="font-medium text-foreground">{totalQuestoes} questão(ões) no documento.</span>}</span>
      </div>

      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        {tocItens.map((it) => {
          const item = it.o

          // Capítulo — cabeçalho em negrito com seta de expandir/recolher à direita.
          if (item.isCap) {
            const tem = capsComFilhos.has(item.key)
            const aberto = capAberto.has(item.key)
            return (
              <div key={item.key} className="flex items-center gap-1 border-b bg-muted/40 px-4 py-2.5">
                <span className="min-w-0 flex-1 truncate text-[13px] font-bold uppercase tracking-wide text-foreground">{item.label}</span>
                {tem && (
                  <button type="button" onClick={() => toggleCap(item.key)} aria-label={aberto ? 'Recolher capítulo' : 'Expandir capítulo'} className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                    {aberto ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                )}
              </div>
            )
          }

          // Artigo — só aparece se o capítulo-pai estiver expandido (ou se não tiver capítulo).
          if (it.parentCap && !capAberto.has(it.parentCap)) return null
          const apos = item.artId ? Number(item.artId) : null
          const placed = apos != null ? (porArtigo.get(apos) ?? []) : []
          return (
            <div key={item.key} className="border-b py-2.5 pl-6 pr-4 last:border-0">
              <p className="text-sm font-medium text-foreground">{item.label}</p>

              {apos != null && (
                <div className="mt-2 space-y-1.5 border-l-2 border-primary/25 pl-3">
                  {placed.map((q) => (
                    <div key={q.id} className="flex items-start gap-2 rounded-lg border bg-muted/30 p-2">
                      <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <MarkdownContent inline className="line-clamp-2 min-w-0 flex-1 text-xs leading-snug text-foreground">{q.enunciado}</MarkdownContent>
                      <button type="button" onClick={() => alternarObrig(q)} title={q.obrigatoria ? 'Obrigatória (clique p/ tornar opcional)' : 'Opcional (clique p/ tornar obrigatória)'}
                        className={cn('shrink-0 rounded-md p-1 transition-colors', q.obrigatoria ? 'text-amber-500 hover:bg-amber-500/10' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
                        <Star className={cn('h-3.5 w-3.5', q.obrigatoria && 'fill-current')} />
                      </button>
                      <button type="button" onClick={() => remover(q)} title="Remover" className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-rose-500/10 hover:text-rose-600">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  <AdicionarQuestoesDialog
                    disciplinas={disciplinas}
                    jaIds={jaIds}
                    onSelecionar={(items) => inserir(items, apos)}
                    onImportar={(rows) => importarArquivo(rows, apos)}
                    trigger={
                      <button type="button" className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-primary/40 px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:border-primary hover:bg-primary/5">
                        <Plus className="h-3.5 w-3.5" /> Inserir questão aqui
                      </button>
                    }
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
