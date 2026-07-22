'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, Radio, CheckCircle2, Circle, Users, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { resumoAoVivoSimulado } from '@/app/admin/simulados/actions'
import type { ResumoAoVivo } from '@/lib/simulado/ao-vivo'

const INTERVALO_MS = 10_000 // atualiza sozinho a cada 10s

/** Painel "ao vivo": cards de contagem + barra de progresso, com polling. */
export function AoVivoPainel({ simuladoId }: { simuladoId: string }) {
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

  const [tempoReal, setTempoReal] = useState(false)

  useEffect(() => {
    carregar() // snapshot imediato
    let es: EventSource | null = null
    const iniciarPolling = () => { if (!timer.current) timer.current = setInterval(() => carregar(true), INTERVALO_MS) }

    // Realtime via SSE (Fase 2). onmessage traz o resumo atualizado; em erro (proxy sem SSE,
    // Redis fora) cai no polling de 10s — a UI continua funcionando.
    try {
      es = new EventSource(`/api/stream/ao-vivo/${simuladoId}`)
      es.onmessage = (ev) => {
        try {
          const r = JSON.parse(ev.data) as ResumoAoVivo
          setResumo(r); setErro(null); setCarregando(false); setTempoReal(true)
          setAtualizadoEm(new Date().toLocaleTimeString('pt-BR'))
        } catch { /* ignora frame inválido */ }
      }
      es.onerror = () => { try { es?.close() } catch { /* */ } es = null; setTempoReal(false); iniciarPolling() }
    } catch {
      iniciarPolling()
    }

    return () => { try { es?.close() } catch { /* */ } if (timer.current) { clearInterval(timer.current); timer.current = null } }
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

  if (carregando && !resumo) {
    return <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Carregando…</div>
  }
  if (erro) {
    return <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{erro}</div>
  }
  if (!resumo) return null

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="flex flex-col justify-center rounded-2xl border bg-muted/30 p-4">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Users className="h-4 w-4" /> Matriculados</span>
          <span className="mt-1 text-3xl font-extrabold tabular-nums">{total}</span>
        </div>
        {cards.map((c) => (
          <div key={c.chave} className="rounded-2xl border p-4">
            <span className={cn('mb-2 flex h-9 w-9 items-center justify-center rounded-lg', c.anel, c.cor)}><c.icon className="h-4 w-4" /></span>
            <p className={cn('text-3xl font-extrabold tabular-nums', c.cor)}>{c.valor}</p>
            <p className="mt-0.5 text-xs font-medium text-muted-foreground">{c.label} · {pct(c.valor)}%</p>
          </div>
        ))}
      </div>

      {/* Barra de progresso: finalizados (azul) + fazendo agora (verde) sobre o total */}
      <div className="space-y-1.5 rounded-2xl border p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-muted-foreground">Progresso do simulado</span>
          <span className="font-semibold tabular-nums">{pctFin}% concluído</span>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-muted">
          <div className="flex h-full">
            <div className="h-full bg-sky-500 transition-all" style={{ width: `${pctFin}%` }} title={`Finalizados: ${resumo.finalizados}`} />
            <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct(resumo.online)}%` }} title={`Fazendo agora: ${resumo.online}`} />
          </div>
        </div>
        <p className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-sky-500" /> Finalizaram</span>
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Fazendo agora</span>
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-muted-foreground/40" /> Não iniciaram</span>
        </p>
      </div>

      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" /></span>
          Ao vivo · {tempoReal ? 'tempo real' : 'atualiza a cada 10s'}{atualizadoEm && ` · última: ${atualizadoEm}`}
        </span>
        <button type="button" onClick={() => carregar()} className="inline-flex items-center gap-1 rounded-md px-2 py-1 hover:bg-muted hover:text-foreground">
          <RefreshCw className={cn('h-3 w-3', carregando && 'animate-spin')} /> Atualizar
        </button>
      </div>
      <p className="text-[10px] leading-snug text-muted-foreground">“Fazendo agora” = sessões em andamento (ainda não finalizadas). Sem heartbeat, um aluno que fechou o navegador sem enviar aparece aqui até finalizar/estourar o tempo.</p>
    </div>
  )
}
