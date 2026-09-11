'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { HelpCircle, Zap, ClipboardList, Shuffle, Plus, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { QuestoesTabelaBase } from '@/components/admin/questoes-tabela-base'
import { AdicionarQuestoesDialog } from '@/components/admin/adicionar-questoes-dialog'
import { listarDisciplinasFiltro, type QuestaoBancoBuscaItem } from '@/app/admin/banco-questoes/actions'
import type { QuestaoImport } from '@/app/admin/banco-questoes/import-types'
import {
  listarQuizConteudo, adicionarQuizQuestoes, removerQuizQuestoes, reordenarQuizQuestoes, importarQuizQuestoes, salvarQuizConfig,
  type QuizLinha, type QuizConfig,
} from '@/app/admin/leitura/actions'

const MODOS: { v: QuizConfig['modo']; label: string; desc: string; Icon: typeof Zap }[] = [
  { v: 'imediato', label: 'Resposta imediata', desc: 'Marca a alternativa e vê na hora se acertou (prática rápida).', Icon: Zap },
  { v: 'simulado', label: 'Nota no final', desc: 'Responde tudo e recebe a nota ao enviar, como um simulado.', Icon: ClipboardList },
]

/** Admin da "Questões do conteúdo" (mini-simulado da aula): configuração + a MESMA tabela de questões
 * do banco (QuestoesTabelaBase: busca/filtros/expandir/reordenar/remover) + adicionar do sistema/importar.
 * `initial` (SSR) evita o spinner/waterfall: a área já vem carregada com a página. */
export function QuizConteudoAdmin({ documentoId, initial }: {
  documentoId: string
  initial?: { itens: QuizLinha[]; config: QuizConfig; disciplinas: { id: string; nome: string }[] }
}) {
  const [itens, setItens] = useState<QuizLinha[]>(initial?.itens ?? [])
  const [config, setConfig] = useState<QuizConfig>(initial?.config ?? { modo: 'imediato', embaralhar: false })
  const [disciplinas, setDisciplinas] = useState<{ id: string; nome: string }[]>(initial?.disciplinas ?? [])
  const [carregando, setCarregando] = useState(!initial)
  const [erro, setErro] = useState<string | null>(null)
  const [pending, start] = useTransition()

  useEffect(() => {
    if (initial) return // veio pronto do servidor (SSR) — sem spinner/waterfall
    let vivo = true
    ;(async () => {
      const [q, d] = await Promise.allSettled([listarQuizConteudo(documentoId), listarDisciplinasFiltro()])
      if (!vivo) return
      if (q.status === 'fulfilled') { if (q.value.ok) { setItens(q.value.itens ?? []); if (q.value.config) setConfig(q.value.config) } else setErro(q.value.error ?? 'Erro ao carregar') }
      if (d.status === 'fulfilled') setDisciplinas(d.value ?? [])
      setCarregando(false)
    })()
    return () => { vivo = false }
  }, [documentoId, initial])

  const jaIds = useMemo(() => new Set(itens.map((i) => i.id)), [itens])

  // Anexa só as linhas NOVAS (dedup por id) — evita refetch da lista inteira, que fazia as questões
  // recém-adicionadas "demorarem a aparecer".
  const anexar = (linhas?: QuizLinha[]) => {
    if (!linhas?.length) return
    setItens((prev) => { const tem = new Set(prev.map((p) => p.id)); return [...prev, ...linhas.filter((l) => !tem.has(l.id))] })
  }
  function adicionar(items: QuestaoBancoBuscaItem[]) {
    start(async () => {
      const r = await adicionarQuizQuestoes(documentoId, items.map((i) => i.id))
      if (!r.ok) { toast.error(r.error ?? 'Erro'); return }
      anexar(r.linhas); toast.success(`${items.length} questão(ões) adicionada(s)`)
    })
  }
  function importar(rows: QuestaoImport[]) {
    start(async () => {
      const r = await importarQuizQuestoes(documentoId, rows)
      if (!r.ok) { toast.error(r.error ?? 'Erro'); return }
      anexar(r.linhas); toast.success(`${r.count ?? 0} questão(ões) importada(s)`)
    })
  }
  async function onRemover(ids: string[]) {
    const r = await removerQuizQuestoes(documentoId, ids)
    if (r.ok) setItens((p) => p.filter((q) => !ids.includes(q.id)))
    return r
  }
  async function onReordenar(ids: string[]) {
    const r = await reordenarQuizQuestoes(documentoId, ids)
    if (r.ok) setItens((p) => ids.map((id) => p.find((q) => q.id === id)!).filter(Boolean))
    return r
  }
  function aplicarConfig(patch: Partial<QuizConfig>) {
    setConfig((c) => ({ ...c, ...patch }))
    start(async () => { const r = await salvarQuizConfig(documentoId, patch); if (!r.ok) toast.error(r.error ?? 'Erro ao salvar config') })
  }

  if (carregando) return <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>
  if (erro) return <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{erro}</p>

  return (
    <div className="space-y-4">
      {/* Configuração do mini-simulado */}
      <div className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm">
        <p className="flex items-center gap-2 text-sm font-semibold">Configuração {pending && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}</p>
        <div className="flex flex-wrap items-center gap-2">
          {MODOS.map(({ v, label, desc, Icon }) => (
            <button key={v} type="button" onClick={() => aplicarConfig({ modo: v })} title={desc}
              className={cn('flex max-w-xs items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition-colors', config.modo === v ? 'border-primary bg-primary/5' : 'hover:border-primary/40')}>
              <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', config.modo === v ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}><Icon className="h-4 w-4" /></span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{label}</span>
                <span className="block truncate text-xs text-muted-foreground">{desc}</span>
              </span>
            </button>
          ))}
          <label className="ml-auto flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition-colors hover:border-primary/40">
            <input type="checkbox" checked={config.embaralhar} onChange={(e) => aplicarConfig({ embaralhar: e.target.checked })} className="h-4 w-4 rounded border" />
            <Shuffle className="h-4 w-4 text-muted-foreground" /> Embaralhar a ordem das questões
          </label>
        </div>
      </div>

      {/* Tabela de questões — a MESMA do banco (base reutilizável) */}
      <QuestoesTabelaBase
        questoes={itens}
        titulo="Questões do conteúdo"
        subtitulo="mini-simulado da aula"
        icone={<HelpCircle className="h-5 w-5" />}
        semCabecalho
        onRemover={onRemover}
        onReordenar={onReordenar}
        acao={
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
        }
      />
    </div>
  )
}
