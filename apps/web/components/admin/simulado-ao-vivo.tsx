'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, X, Radio, CheckCircle2, Circle, Users, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { resumoAoVivoSimulado, type ResumoAoVivo } from '@/app/admin/simulados/actions'

const INTERVALO_MS = 10_000 // atualiza sozinho a cada 10s

export function SimuladoAoVivo({ simuladoId, titulo, onClose }: { simuladoId: string; titulo: string; onClose: () => void }) {
  const [resumo, setResumo] = useState<ResumoAoVivo | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [atualizadoEm, setAtualizadoEm] = useState<string>('')
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  async function carregar(silencioso = false) {
    if (!silencioso) setCarregando(true)
    const r = await resumoAoVivoSimulado(simuladoId)
    if (r.error) setErro(r.error)
    else { setResumo(r.resumo ?? null); setErro(null); setAtualizadoEm(new Date().toLocaleTimeString('pt-BR')) }
    setCarregando(false)
  }

  useEffect(() => {
    carregar()
    timer.current = setInterval(() => carregar(true), INTERVALO_MS)
    return () => { if (timer.current) clearInterval(timer.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simuladoId])

  const total = resumo?.total ?? 0
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0)
  const pctFin = pct(resumo?.finalizados ?? 0)

  const cards: { chave: string; label: string; valor: number; icon: any; cor: string; anel: string }[] = resumo ? [
    { chave: 'online', label: 'Fazendo agora', valor: resumo.online, icon: Radio, cor: 'text-emerald-600 dark:text-emerald-400', anel: 'bg-emerald-500/10' },
    { chave: 'fin', label: 'Finalizaram', valor: resumo.finalizados, icon: CheckCircle2, cor: 'text-sky-600 dark:text-sky-400', anel: 'bg-sky-500/10' },
    { chave: 'nao', label: 'Não iniciaram', valor: resumo.naoIniciaram, icon: Circle, cor: 'text-muted-foreground', anel: 'bg-muted' },
  ] : []

  const conteudo = (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl border bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary">
              <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" /></span>
              Ao vivo
            </p>
            <h2 className="truncate text-base font-bold leading-tight">{titulo}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>

        {carregando && !resumo ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Carregando…</div>
        ) : erro ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{erro}</div>
        ) : resumo ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-xl border bg-muted/30 px-3 py-2">
              <span className="inline-flex items-center gap-1.5 text-sm font-medium"><Users className="h-4 w-4 text-muted-foreground" /> Matriculados</span>
              <span className="text-lg font-bold tabular-nums">{total}</span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {cards.map((c) => (
                <div key={c.chave} className="rounded-xl border p-3 text-center">
                  <span className={cn('mx-auto mb-1.5 flex h-9 w-9 items-center justify-center rounded-lg', c.anel, c.cor)}><c.icon className="h-4 w-4" /></span>
                  <p className={cn('text-2xl font-extrabold tabular-nums', c.cor)}>{c.valor}</p>
                  <p className="mt-0.5 text-[11px] font-medium text-muted-foreground">{c.label}</p>
                  <p className="text-[10px] text-muted-foreground">{pct(c.valor)}%</p>
                </div>
              ))}
            </div>

            {/* Barra de progresso: finalizados sobre o total */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-muted-foreground">Progresso (finalizados)</span>
                <span className="font-semibold tabular-nums">{pctFin}%</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                <div className="flex h-full">
                  <div className="h-full bg-sky-500 transition-all" style={{ width: `${pctFin}%` }} title={`Finalizados: ${resumo.finalizados}`} />
                  <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct(resumo.online)}%` }} title={`Fazendo agora: ${resumo.online}`} />
                </div>
              </div>
              <p className="flex items-center gap-3 text-[10px] text-muted-foreground">
                <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-sky-500" /> Finalizaram</span>
                <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Fazendo agora</span>
                <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-muted-foreground/40" /> Não iniciaram</span>
              </p>
            </div>

            <div className="flex items-center justify-between border-t pt-3 text-[11px] text-muted-foreground">
              <span>Atualiza a cada 10s · {atualizadoEm && `última: ${atualizadoEm}`}</span>
              <button type="button" onClick={() => carregar()} className="inline-flex items-center gap-1 rounded-md px-2 py-1 hover:bg-muted hover:text-foreground">
                <RefreshCw className={cn('h-3 w-3', carregando && 'animate-spin')} /> Atualizar
              </button>
            </div>
            <p className="text-[10px] leading-snug text-muted-foreground">“Fazendo agora” = sessões em andamento (ainda não finalizadas). Sem heartbeat, um aluno que fechou o navegador sem enviar aparece aqui até finalizar/estourar o tempo.</p>
          </div>
        ) : null}
      </div>
    </div>
  )

  if (typeof document === 'undefined') return null
  return createPortal(conteudo, document.body)
}
