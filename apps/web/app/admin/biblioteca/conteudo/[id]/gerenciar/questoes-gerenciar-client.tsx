'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowLeft, ListChecks, Trash2, Loader2, GripVertical } from 'lucide-react'
import { AdicionarQuestoesDialog } from '@/components/admin/adicionar-questoes-dialog'
import { confirmar } from '@/components/ui/confirm-dialog'
import type { QuestaoImport } from '@/app/admin/banco-questoes/import-types'
import {
  listarQuestoesConjunto, adicionarQuestoesConjunto, importarQuestoesConjunto, removerQuestaoConjunto,
  type QuestaoConjuntoItem,
} from './questoes-actions'

const DIF: Record<string, { label: string; cls: string }> = {
  facil: { label: 'Fácil', cls: 'text-emerald-600 dark:text-emerald-400' },
  medio: { label: 'Médio', cls: 'text-amber-600 dark:text-amber-400' },
  dificil: { label: 'Difícil', cls: 'text-rose-600 dark:text-rose-400' },
}
const limpar = (s: string) => (s || '').replace(/<[^>]+>/g, ' ').replace(/[#*_`]/g, '').replace(/\s+/g, ' ').trim()

export function QuestoesGerenciarClient({
  base, itensIniciais, disciplinas,
}: {
  base: { id: string; titulo: string; status: string }
  itensIniciais: QuestaoConjuntoItem[]
  disciplinas: { id: string; nome: string }[]
}) {
  const router = useRouter()
  const [itens, setItens] = useState<QuestaoConjuntoItem[]>(itensIniciais)
  const [pending, start] = useTransition()
  const jaIds = useMemo(() => new Set(itens.map((i) => i.questao_id)), [itens])

  function recarregar() {
    start(async () => {
      const r = await listarQuestoesConjunto(base.id)
      if (r.ok && r.itens) setItens(r.itens)
    })
  }

  function adicionarDoBanco(items: { id: string }[]) {
    const ids = items.map((i) => i.id)
    start(async () => {
      const r = await adicionarQuestoesConjunto(base.id, ids)
      if (!r.ok) { toast.error(r.error || 'Falha ao adicionar.'); return }
      toast.success(`${r.adicionadas ?? 0} questão(ões) adicionada(s).`)
      recarregar()
    })
  }
  function importarPlanilha(questoes: QuestaoImport[]) {
    start(async () => {
      const r = await importarQuestoesConjunto(base.id, questoes)
      if (!r.ok) { toast.error(r.error || 'Falha ao importar.'); return }
      toast.success(`${r.adicionadas ?? 0} questão(ões) importada(s).`)
      recarregar()
    })
  }
  async function remover(questaoId: string) {
    const ok = await confirmar({ titulo: 'Remover questão', mensagem: 'Tirar esta questão do conjunto? (ela continua no banco)', confirmar: 'Remover', destrutivo: true })
    if (!ok) return
    start(async () => {
      const r = await removerQuestaoConjunto(base.id, questaoId)
      if (!r.ok) { toast.error(r.error || 'Falha ao remover.'); return }
      setItens((xs) => xs.filter((x) => x.questao_id !== questaoId))
    })
  }

  return (
    <div className="w-full space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => router.back()} className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted" aria-label="Voltar"><ArrowLeft className="h-5 w-5" /></button>
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl" style={{ background: 'color-mix(in oklab, var(--sel-questoes, var(--primary)) 14%, var(--card))' }}>
          <ListChecks className="h-5 w-5" style={{ color: 'var(--sel-questoes, var(--primary))' }} />
        </div>
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Conjunto de questões</div>
          <h1 className="truncate text-2xl font-bold tracking-tight">{base.titulo}</h1>
        </div>
        <span className={`ml-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${base.status === 'publicado' ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-muted text-muted-foreground'}`}>
          {base.status === 'publicado' ? 'Publicado' : 'Rascunho'}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <AdicionarQuestoesDialog
            bancoId={null}
            disciplinas={disciplinas}
            jaIds={jaIds}
            onSelecionar={adicionarDoBanco}
            onImportar={importarPlanilha}
          />
        </div>
      </div>

      {/* Resumo */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {pending && <Loader2 className="h-4 w-4 animate-spin" />}
        <strong className="text-foreground">{itens.length}</strong> {itens.length === 1 ? 'questão' : 'questões'} no conjunto
      </div>

      {/* Lista */}
      {itens.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-muted/30 p-10 text-center">
          <ListChecks className="mx-auto mb-3 h-8 w-8 text-muted-foreground/60" />
          <p className="text-sm text-muted-foreground">Nenhuma questão ainda. Use <strong>Adicionar questões</strong> para puxar do banco ou importar uma planilha.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {itens.map((q, i) => (
            <li key={q.id} className="flex items-start gap-3 rounded-2xl border bg-card p-3 shadow-sm">
              <GripVertical className="mt-1 h-4 w-4 shrink-0 cursor-default text-muted-foreground/40" aria-hidden />
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-bold tabular-nums text-muted-foreground">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-sm leading-snug text-foreground">{limpar(q.enunciado) || '(sem enunciado)'}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                  {q.disciplina && <span className="rounded-full bg-muted px-2 py-0.5 font-medium">{q.disciplina}</span>}
                  {q.tipo && <span className="capitalize">{q.tipo}</span>}
                  {q.nivel && DIF[q.nivel] && <span className={`font-semibold ${DIF[q.nivel].cls}`}>{DIF[q.nivel].label}</span>}
                </div>
              </div>
              <button onClick={() => remover(q.questao_id)} disabled={pending} aria-label="Remover questão" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50">
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
