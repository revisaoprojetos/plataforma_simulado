'use client'

import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Search, RefreshCw, AlertTriangle, CheckCircle2, XCircle, ListChecks } from 'lucide-react'

export type LogSaida = {
  id: string; nome: string | null; url: string; evento: string | null
  status: string | null; httpStatus: number | null; ms: number | null; erro: string | null; criadoEm: string | null
}

/** Sub-aba "Logs de saída": histórico de entregas dos webhooks (evento, status, HTTP, tempo, erro). */
export function WebhookLogsSaida({ logs, eventos, precisaMigrar }: { logs: LogSaida[]; eventos: { chave: string; label: string }[]; precisaMigrar: boolean }) {
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<'todos' | 'ok' | 'erro'>('todos')
  const labelEvento = (c: string | null) => (c ? (eventos.find((e) => e.chave === c)?.label ?? c) : '—')

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return logs.filter((l) => {
      if (filtro !== 'todos' && (l.status ?? '') !== filtro) return false
      if (!q) return true
      return `${l.nome ?? ''} ${l.url} ${l.evento ?? ''}`.toLowerCase().includes(q)
    })
  }, [logs, busca, filtro])

  const okN = logs.filter((l) => l.status === 'ok').length
  const erroN = logs.filter((l) => l.status === 'erro').length

  if (precisaMigrar) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
        <span>Rode a migration <code className="rounded bg-muted px-1">20260927000000_webhook_saida_logs.sql</code> no Supabase para registrar e ver os logs de saída.</span>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Resumo + barra */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 font-medium text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" /> {okN} ok</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2.5 py-1 font-medium text-rose-600 dark:text-rose-400"><XCircle className="h-3.5 w-3.5" /> {erroN} erro</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex overflow-hidden rounded-lg border text-xs">
            {(['todos', 'ok', 'erro'] as const).map((f) => (
              <button key={f} type="button" onClick={() => setFiltro(f)} className={cn('px-3 py-1.5 font-medium transition-colors', filtro === f ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}>{f === 'todos' ? 'Todos' : f === 'ok' ? 'OK' : 'Erro'}</button>
            ))}
          </div>
          <div className="relative min-w-[200px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Filtrar por nome, URL ou evento…" className="h-9 pl-9" />
          </div>
          <Button variant="outline" size="icon" onClick={() => location.reload()} aria-label="Atualizar" title="Atualizar logs"><RefreshCw className="h-4 w-4" /></Button>
        </div>
      </div>

      {/* Tabela */}
      <div className="overflow-hidden rounded-2xl border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Quando</th>
                <th className="px-4 py-2.5 font-medium">Webhook</th>
                <th className="px-4 py-2.5 font-medium">Evento</th>
                <th className="px-4 py-2.5 font-medium">URL</th>
                <th className="px-4 py-2.5 text-center font-medium">Status</th>
                <th className="px-4 py-2.5 text-right font-medium">Tempo</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtrados.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">{logs.length === 0 ? (<span className="inline-flex items-center gap-2"><ListChecks className="h-4 w-4" /> Nenhuma entrega registrada ainda.</span>) : 'Nenhum log encontrado para o filtro.'}</td></tr>
              ) : filtrados.map((l) => {
                const ok = l.status === 'ok'
                return (
                  <tr key={l.id} className="transition-colors hover:bg-muted/30">
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">{l.criadoEm ? new Date(l.criadoEm).toLocaleString('pt-BR') : '—'}</td>
                    <td className="px-4 py-3"><span className="block truncate font-medium" title={l.nome ?? ''}>{l.nome ?? '—'}</span></td>
                    <td className="px-4 py-3"><span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">{labelEvento(l.evento)}</span></td>
                    <td className="max-w-[240px] px-4 py-3"><span className="block truncate text-xs text-muted-foreground" title={l.url}>{l.url}</span></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center">
                        <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium', ok ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/10 text-rose-600 dark:text-rose-400')} title={l.erro ?? undefined}>
                          {ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                          {l.httpStatus != null ? `HTTP ${l.httpStatus}` : (ok ? 'ok' : 'falha')}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-xs tabular-nums text-muted-foreground">{l.ms != null ? `${l.ms} ms` : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Mostra as últimas {logs.length} entregas. Passe o mouse no status para ver o erro completo.</p>
    </div>
  )
}
