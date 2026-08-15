'use client'

import { useMemo, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus, Trash2, Loader2, Play, X } from 'lucide-react'
import { toast } from 'sonner'
import { SeletorQuestoes } from '@/components/aluno/seletor-questoes'
import { adicionarQuestoes, removerQuestao, renomearMeuSimulado, type QuestaoEscolhida } from '@/app/aluno/(portal)/simulados/builder-actions'

/** Editor de um simulado personalizado do aluno: nome + questões escolhidas + seletor de questões. */
export function PersonalizadoEditor({ simuladoId, titulo: tituloIni, itensIniciais }: {
  simuladoId: string; titulo: string; itensIniciais: QuestaoEscolhida[]
}) {
  const router = useRouter()
  const [titulo, setTitulo] = useState(tituloIni)
  const [itens, setItens] = useState<QuestaoEscolhida[]>(itensIniciais)
  const [modal, setModal] = useState(false)
  const [salvandoNome, startSalvar] = useTransition()
  const escolhidas = useMemo(() => new Set(itens.map((i) => i.questaoId)), [itens])

  const salvarNome = () => {
    if (titulo.trim() === tituloIni.trim()) return
    startSalvar(async () => { const r = await renomearMeuSimulado(simuladoId, titulo); if (r.error) toast.error(r.error) })
  }
  const remover = async (qid: string) => {
    setItens((prev) => prev.filter((i) => i.questaoId !== qid))
    const r = await removerQuestao(simuladoId, qid)
    if (r.error) toast.error(r.error)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 sm:gap-3">
        <Link href="/aluno/simulados" className="shrink-0 rounded-lg border p-2 text-muted-foreground transition-colors hover:text-foreground" aria-label="Voltar para Meus simulados"><ArrowLeft className="h-4 w-4" /></Link>
        <div className="relative min-w-0 flex-1">
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} onBlur={salvarNome} maxLength={120}
            className="w-full rounded-lg border bg-transparent px-3 py-2 text-lg font-bold tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label="Nome do simulado" />
          {salvandoNome && <Loader2 className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
        </div>
        <button type="button" onClick={() => router.push(`/aluno/simulados/personalizados/${simuladoId}/fazer`)}
          disabled={itens.length === 0} title={itens.length === 0 ? 'Adicione questões para fazer' : 'Fazer o simulado'}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60">
          <Play className="h-4 w-4" /> <span className="hidden sm:inline">Fazer</span>
        </button>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">Questões ({itens.length})</h2>
          <button type="button" onClick={() => setModal(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90">
            <Plus className="h-4 w-4" /> Adicionar questões
          </button>
        </div>
        {itens.length === 0 ? (
          <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            Nenhuma questão ainda. Clique em <span className="font-medium text-foreground">Adicionar questões</span> para montar seu simulado.
          </div>
        ) : (
          <ol className="space-y-2">
            {itens.map((q, i) => (
              <li key={q.questaoId} className="flex items-start gap-3 rounded-xl border bg-card p-3 text-sm shadow-sm">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-semibold text-muted-foreground">{i + 1}</span>
                <p className="min-w-0 flex-1 line-clamp-2 text-foreground">{q.enunciado || '(sem enunciado)'}</p>
                <button type="button" onClick={() => remover(q.questaoId)} title="Remover"
                  className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
              </li>
            ))}
          </ol>
        )}
      </section>

      {modal && createPortal(
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center sm:p-4" onClick={() => setModal(false)}>
          <div className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border bg-card shadow-xl sm:max-h-[85vh] sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 border-b p-4">
              <h3 className="text-sm font-semibold">Adicionar questões</h3>
              <button type="button" onClick={() => setModal(false)} className="rounded-md p-1 text-muted-foreground hover:text-foreground" aria-label="Fechar"><X className="h-4 w-4" /></button>
            </div>
            <SeletorQuestoes jaEscolhidas={escolhidas} onCancelar={() => setModal(false)} onConcluir={async (qs) => {
              const r = await adicionarQuestoes(simuladoId, qs.map((q) => q.id))
              if (r.error) { toast.error(r.error); return }
              setItens((prev) => {
                const ex = new Set(prev.map((i) => i.questaoId))
                const novos = qs.filter((q) => !ex.has(q.id)).map((q, i) => ({ questaoId: q.id, ordem: prev.length + i, enunciado: q.enunciado }))
                return [...prev, ...novos]
              })
              toast.success(`${r.adicionadas ?? 0} ${(r.adicionadas ?? 0) === 1 ? 'questão adicionada' : 'questões adicionadas'}.`)
              setModal(false)
            }} />
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
