'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { HelpCircle, Trash2, ChevronUp, ChevronDown, Zap, ClipboardList, Shuffle, Plus, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MarkdownContent } from '@/components/markdown-content'
import { AdicionarQuestoesDialog } from '@/components/admin/adicionar-questoes-dialog'
import { listarDisciplinasFiltro, type QuestaoBancoBuscaItem } from '@/app/admin/banco-questoes/actions'
import type { QuestaoImport } from '@/app/admin/banco-questoes/import-types'
import {
  listarQuizConteudo, adicionarQuizQuestoes, removerQuizQuestao, reordenarQuizQuestoes, importarQuizQuestoes, salvarQuizConfig,
  type QuizQuestao, type QuizConfig,
} from '@/app/admin/leitura/actions'

const MODOS: { v: QuizConfig['modo']; label: string; desc: string; Icon: typeof Zap }[] = [
  { v: 'imediato', label: 'Resposta imediata', desc: 'Marca a alternativa e vê na hora se acertou (prática rápida).', Icon: Zap },
  { v: 'simulado', label: 'Nota no final', desc: 'Responde tudo e recebe a nota ao enviar, como um simulado.', Icon: ClipboardList },
]

/** Admin da "Questões do conteúdo" (mini-simulado da aula): configuração + lista de questões do banco
 * (adicionar do sistema ou importar). Separado das questões INLINE da leitura (LeituraQuestoesAdmin). */
export function QuizConteudoAdmin({ documentoId }: { documentoId: string }) {
  const [itens, setItens] = useState<QuizQuestao[]>([])
  const [config, setConfig] = useState<QuizConfig>({ modo: 'imediato', embaralhar: false })
  const [disciplinas, setDisciplinas] = useState<{ id: string; nome: string }[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [pending, start] = useTransition()

  useEffect(() => {
    let vivo = true
    ;(async () => {
      const [q, d] = await Promise.allSettled([listarQuizConteudo(documentoId), listarDisciplinasFiltro()])
      if (!vivo) return
      if (q.status === 'fulfilled') { if (q.value.ok) { setItens(q.value.itens ?? []); if (q.value.config) setConfig(q.value.config) } else setErro(q.value.error ?? 'Erro ao carregar') }
      if (d.status === 'fulfilled') setDisciplinas(d.value ?? [])
      setCarregando(false)
    })()
    return () => { vivo = false }
  }, [documentoId])

  const jaIds = useMemo(() => new Set(itens.map((i) => i.questaoId)), [itens])

  function recarregar() { start(async () => { const q = await listarQuizConteudo(documentoId); if (q.ok) setItens(q.itens ?? []) }) }
  function adicionar(items: QuestaoBancoBuscaItem[]) {
    start(async () => {
      const r = await adicionarQuizQuestoes(documentoId, items.map((i) => i.id))
      if (!r.ok) { toast.error(r.error ?? 'Erro'); return }
      const q = await listarQuizConteudo(documentoId); if (q.ok) setItens(q.itens ?? [])
      toast.success(`${items.length} questão(ões) adicionada(s)`)
    })
  }
  function importar(rows: QuestaoImport[]) {
    start(async () => {
      const r = await importarQuizQuestoes(documentoId, rows)
      if (!r.ok) { toast.error(r.error ?? 'Erro'); return }
      const q = await listarQuizConteudo(documentoId); if (q.ok) setItens(q.itens ?? [])
      toast.success(`${r.count ?? 0} questão(ões) importada(s)`)
    })
  }
  function remover(q: QuizQuestao) {
    setItens((p) => p.filter((x) => x.id !== q.id))
    start(async () => { const r = await removerQuizQuestao(q.id); if (!r.ok) toast.error(r.error ?? 'Erro') })
  }
  function mover(idx: number, delta: number) {
    const j = idx + delta; if (j < 0 || j >= itens.length) return
    const nova = [...itens]; ;[nova[idx], nova[j]] = [nova[j], nova[idx]]
    setItens(nova); start(async () => { await reordenarQuizQuestoes(nova.map((i) => i.id)) })
  }
  function aplicarConfig(patch: Partial<QuizConfig>) {
    setConfig((c) => ({ ...c, ...patch }))
    start(async () => { const r = await salvarQuizConfig(documentoId, patch); if (!r.ok) toast.error(r.error ?? 'Erro ao salvar config') })
  }

  if (carregando) return <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>
  if (erro) return <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{erro}</p>

  const dialog = (
    <AdicionarQuestoesDialog
      disciplinas={disciplinas}
      jaIds={jaIds}
      onSelecionar={adicionar}
      onImportar={importar}
      trigger={
        <button type="button" className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90">
          <Plus className="h-4 w-4" /> Adicionar questões
        </button>
      }
    />
  )

  return (
    <div className="space-y-4">
      {/* Configuração do mini-simulado */}
      <div className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm">
        <p className="text-sm font-semibold">Configuração</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {MODOS.map(({ v, label, desc, Icon }) => (
            <button key={v} type="button" onClick={() => aplicarConfig({ modo: v })}
              className={cn('flex items-start gap-3 rounded-xl border p-3 text-left transition-colors', config.modo === v ? 'border-primary bg-primary/5' : 'hover:border-primary/40')}>
              <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', config.modo === v ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}><Icon className="h-4 w-4" /></span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{label}</span>
                <span className="block text-xs text-muted-foreground">{desc}</span>
              </span>
            </button>
          ))}
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" checked={config.embaralhar} onChange={(e) => aplicarConfig({ embaralhar: e.target.checked })} className="h-4 w-4 rounded border" />
          <Shuffle className="h-4 w-4 text-muted-foreground" /> Embaralhar a ordem das questões
        </label>
      </div>

      {/* Lista de questões + adicionar */}
      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold"><HelpCircle className="h-4 w-4 text-primary" /> Questões <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">{itens.length}</span></p>
          {pending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          <div className="ml-auto">{dialog}</div>
        </div>

        {itens.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Nenhuma questão ainda. Clique em <strong className="text-foreground">Adicionar questões</strong> para escolher do banco ou importar.</div>
        ) : (
          <ul className="divide-y">
            {itens.map((q, i) => (
              <li key={q.id} className="flex items-start gap-3 px-4 py-2.5 hover:bg-muted/30">
                <span className="mt-0.5 w-5 shrink-0 text-center font-mono text-xs text-muted-foreground">{i + 1}</span>
                <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <MarkdownContent inline className="line-clamp-2 min-w-0 flex-1 text-sm leading-snug text-foreground">{q.enunciado}</MarkdownContent>
                <div className="flex shrink-0 items-center gap-0.5">
                  <button type="button" onClick={() => mover(i, -1)} disabled={i === 0 || pending} title="Subir" className="rounded-md p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"><ChevronUp className="h-4 w-4" /></button>
                  <button type="button" onClick={() => mover(i, 1)} disabled={i === itens.length - 1 || pending} title="Descer" className="rounded-md p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"><ChevronDown className="h-4 w-4" /></button>
                  <button type="button" onClick={() => remover(q)} title="Remover" className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-rose-500/10 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
