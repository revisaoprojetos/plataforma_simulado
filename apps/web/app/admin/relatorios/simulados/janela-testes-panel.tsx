'use client'

// Painel "Janela de aplicação & tentativas-teste" do relatório de simulado (só modo janela_fixa).
// Mostra quantos finalizaram DENTRO do horário previsto vs ANTES/DEPOIS, e lista as finalizações
// FORA da janela (prováveis testes) com ações: marcar como teste (reversível), excluir, ou marcar
// o aluno como testador deste simulado (cascateia e vale p/ futuras sessões).

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CalendarClock, FlaskConical, Trash2, UserCheck } from 'lucide-react'
import { marcarSessaoTeste, excluirSessaoSimulado, marcarTestadorSimulado } from './actions'

const fmtBRT = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

type Fora = { sessId: string; estId: string; nome: string; fimISO: string; quando: 'antes' | 'depois'; nota: number | null }

export function JanelaTestesPanel({ simuladoId, janela, janelaStats, foraJanela }: {
  simuladoId: string
  janela: { inicio: string; fim: string } | null
  janelaStats: { dentro: number; antes: number; depois: number } | null
  foraJanela: Fora[]
}) {
  const router = useRouter()
  const [, start] = useTransition()
  const [busy, setBusy] = useState<string | null>(null)
  if (!janela || !janelaStats) return null

  const run = (id: string, fn: () => Promise<{ ok?: true; error?: string }>, msg: string) => {
    setBusy(id)
    start(async () => {
      const r = await fn()
      setBusy(null)
      if (r?.error) toast.error(r.error)
      else { toast.success(msg); router.refresh() }
    })
  }

  const Kpi = ({ v, l, tom, sub }: { v: number; l: string; tom: string; sub?: string }) => (
    <div className={`rounded-xl border p-3 ${tom}`}>
      <div className="text-2xl font-bold tabular-nums">{v}</div>
      <div className="text-xs font-medium">{l}</div>
      {sub ? <div className="text-[11px] opacity-70">{sub}</div> : null}
    </div>
  )

  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary"><CalendarClock className="h-4 w-4" /></span>
        <div>
          <h3 className="text-sm font-semibold">Janela de aplicação & tentativas-teste</h3>
          <p className="text-xs text-muted-foreground">Horário previsto: <b>{fmtBRT(janela.inicio)}</b> → <b>{fmtBRT(janela.fim)}</b> (horário de Brasília)</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <Kpi v={janelaStats.dentro} l="Finalizaram no horário" tom="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" sub="dentro da janela" />
        <Kpi v={janelaStats.antes} l="Antes da janela" tom="border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400" sub="prováveis testes" />
        <Kpi v={janelaStats.depois} l="Depois da janela" tom="border-slate-500/30 bg-slate-500/10 text-slate-700 dark:text-slate-300" sub="fora do prazo" />
      </div>

      <div className="mt-4">
        <p className="mb-2 text-xs font-semibold text-muted-foreground">
          Finalizações FORA da janela ({foraJanela.length}) — marque como teste / exclua para não interferirem nas estatísticas.
        </p>
        {foraJanela.length === 0 ? (
          <p className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">Nenhuma finalização fora da janela. 👍</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {foraJanela.map((f) => (
              <div key={f.sessId} className="flex flex-wrap items-center gap-2 rounded-lg border p-2.5 text-sm">
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${f.quando === 'antes' ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400' : 'bg-slate-500/15 text-slate-600 dark:text-slate-300'}`}>
                  {f.quando === 'antes' ? 'Antes' : 'Depois'}
                </span>
                <span className="min-w-0 flex-1 truncate font-medium">{f.nome}</span>
                <span className="text-xs text-muted-foreground">{fmtBRT(f.fimISO)}</span>
                {f.nota != null ? <span className="text-xs text-muted-foreground">· nota {f.nota.toFixed(1).replace('.', ',')}</span> : null}
                <div className="flex gap-1.5">
                  <button type="button" disabled={busy === 'teste' + f.sessId}
                    onClick={() => run('teste' + f.sessId, () => marcarSessaoTeste(f.sessId, true), 'Marcado como teste')}
                    className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium hover:bg-accent disabled:opacity-50" title="Marcar esta tentativa como teste (reversível)">
                    <FlaskConical className="h-3 w-3" /> Teste
                  </button>
                  <button type="button" disabled={busy === 'test' + f.estId}
                    onClick={() => run('test' + f.estId, () => marcarTestadorSimulado(simuladoId, f.estId, true), 'Aluno marcado como testador')}
                    className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium hover:bg-accent disabled:opacity-50" title="Marcar o ALUNO como testador deste simulado (todas as tentativas dele viram teste)">
                    <UserCheck className="h-3 w-3" /> Testador
                  </button>
                  <button type="button" disabled={busy === 'del' + f.sessId}
                    onClick={() => { if (confirm(`Excluir a tentativa de ${f.nome}? (sai do relatório)`)) run('del' + f.sessId, () => excluirSessaoSimulado(f.sessId), 'Tentativa excluída') }}
                    className="inline-flex items-center gap-1 rounded-md border border-destructive/30 px-2 py-1 text-[11px] font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50" title="Excluir esta tentativa (deletar)">
                    <Trash2 className="h-3 w-3" /> Excluir
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
