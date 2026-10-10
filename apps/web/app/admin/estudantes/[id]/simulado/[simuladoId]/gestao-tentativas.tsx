'use client'

// Barra ADMIN de gestão de tentativas na página do aluno-no-simulado: por tentativa, marcar como
// teste (reversível) ou excluir; e marcar o ALUNO como testador deste simulado (cascateia + futuras).
// Reusa as mesmas server actions do relatório.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { FlaskConical, Trash2, UserCheck, Wrench } from 'lucide-react'
import { marcarSessaoTeste, excluirSessaoSimulado, marcarTestadorSimulado } from '@/app/admin/relatorios/simulados/actions'

const fmtBRT = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'

type Sess = { id: string; tentativa_num: number | null; nota: number | null; finalizado_em: string | null }

export function GestaoTentativas({ simuladoId, estId, sessoes }: { simuladoId: string; estId: string; sessoes: Sess[] }) {
  const router = useRouter()
  const [, start] = useTransition()
  const [busy, setBusy] = useState<string | null>(null)
  const [aberto, setAberto] = useState(false)

  const run = (id: string, fn: () => Promise<{ ok?: true; error?: string }>, msg: string) => {
    setBusy(id)
    start(async () => {
      const r = await fn()
      setBusy(null)
      if (r?.error) toast.error(r.error)
      else { toast.success(msg); router.refresh() }
    })
  }

  return (
    <div className="rounded-xl border bg-card p-3 shadow-sm">
      <button type="button" onClick={() => setAberto((v) => !v)} className="flex w-full items-center gap-2 text-left text-sm font-semibold">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary"><Wrench className="h-3.5 w-3.5" /></span>
        Gestão de tentativas (admin)
        <span className="ml-auto text-xs font-normal text-muted-foreground">{aberto ? 'ocultar' : `${sessoes.length} tentativa(s)`}</span>
      </button>

      {aberto && (
        <div className="mt-3 space-y-2">
          <button type="button" disabled={busy === 'testador'}
            onClick={() => { if (confirm('Marcar este ALUNO como testador deste simulado? Todas as tentativas dele (atuais e futuras) viram teste e saem das estatísticas.')) run('testador', () => marcarTestadorSimulado(simuladoId, estId, true), 'Aluno marcado como testador') }}
            className="inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 disabled:opacity-50">
            <UserCheck className="h-3.5 w-3.5" /> Marcar aluno como testador (todas as tentativas)
          </button>

          <div className="flex flex-col gap-1.5">
            {sessoes.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-2 text-sm">
                <span className="font-medium">Tentativa {s.tentativa_num ?? '—'}</span>
                <span className="text-xs text-muted-foreground">{fmtBRT(s.finalizado_em)}</span>
                {s.nota != null ? <span className="text-xs text-muted-foreground">· nota {Number(s.nota).toFixed(1).replace('.', ',')}</span> : null}
                <div className="ml-auto flex gap-1.5">
                  <button type="button" disabled={busy === 'teste' + s.id}
                    onClick={() => run('teste' + s.id, () => marcarSessaoTeste(s.id, true), 'Marcada como teste')}
                    className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium hover:bg-accent disabled:opacity-50" title="Marcar esta tentativa como teste (reversível)">
                    <FlaskConical className="h-3 w-3" /> Teste
                  </button>
                  <button type="button" disabled={busy === 'del' + s.id}
                    onClick={() => { if (confirm('Excluir esta tentativa? (sai do relatório)')) run('del' + s.id, () => excluirSessaoSimulado(s.id), 'Tentativa excluída') }}
                    className="inline-flex items-center gap-1 rounded-md border border-destructive/30 px-2 py-1 text-[11px] font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50" title="Excluir esta tentativa">
                    <Trash2 className="h-3 w-3" /> Excluir
                  </button>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">Marcar como teste é reversível (some das estatísticas/ranking). Excluir remove a tentativa do relatório.</p>
        </div>
      )}
    </div>
  )
}
