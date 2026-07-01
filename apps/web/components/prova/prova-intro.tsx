'use client'

import { useState, useEffect } from 'react'
import { Loader2, Clock, ListChecks, Info, PlayCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { FitaTopo } from '@/components/prova/fita-topo'

/** Barra com contagem de porcentagem 0→100 (relativa ao tempo da tela). */
function BarraPorcentagem({ cor, duracaoMs = 4000, loop, onCompleto }: { cor: string; duracaoMs?: number; loop?: boolean; onCompleto?: () => void }) {
  const [pct, setPct] = useState(0)
  useEffect(() => {
    const passo = Math.max(20, Math.round(duracaoMs / 100))
    const id = setInterval(() => {
      setPct((p) => {
        if (p >= 100) { if (loop) return 0; return 100 }
        const np = p + 1
        if (np >= 100) onCompleto?.()
        return np
      })
    }, passo)
    return () => clearInterval(id)
  }, [duracaoMs, loop, onCompleto])
  return (
    <div className="flex w-64 max-w-[75%] items-center gap-3">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full transition-[width] duration-100 ease-linear" style={{ width: `${pct}%`, background: cor }} />
      </div>
      <span className="w-10 shrink-0 text-right text-sm font-semibold tabular-nums" style={{ color: cor }}>{pct}%</span>
    </div>
  )
}

function frameLogo(estilo?: string): string {
  if (estilo === 'quadrado') return 'rounded-none'
  if (estilo === 'borda') return 'rounded-lg border'
  return 'rounded-lg'
}

/** Estilos de carregamento (espelham os da Imersão em Configurações). */
export type EstiloProvaLoading = 'circulo' | 'spinner' | 'barra' | 'pulsar' | 'pontos' | 'porcentagem'
export const ESTILOS_PROVA_LOADING: { id: EstiloProvaLoading; nome: string }[] = [
  { id: 'circulo', nome: 'Círculo + Logo' },
  { id: 'spinner', nome: 'Logo + Spinner' },
  { id: 'barra', nome: 'Logo + Barra' },
  { id: 'porcentagem', nome: 'Logo + Porcentagem' },
  { id: 'pulsar', nome: 'Logo pulsante' },
  { id: 'pontos', nome: 'Logo + Pontos' },
]

/** Animação de carregamento (enquanto a sessão/prova é preparada). */
export function ProvaLoading({ mensagem = 'Preparando seu simulado...', compact, logoUrl, logoBg, logoEstilo, tipo = 'circulo', loop, onCompleto }: {
  mensagem?: string; compact?: boolean; logoUrl?: string | null; logoBg?: string; logoEstilo?: string; tipo?: EstiloProvaLoading; loop?: boolean; onCompleto?: () => void
}) {
  const cor = 'var(--prova-loading, var(--primary))'
  const wrap = cn('flex flex-col items-center justify-center gap-5 bg-background text-foreground', compact ? 'h-full' : 'min-h-screen')

  // Círculo: logo no centro do anel girando (padrão).
  if (tipo === 'circulo') {
    return (
      <div className={wrap}>
        <span className="relative flex h-24 w-24 items-center justify-center">
          <span className="absolute inset-0 animate-ping rounded-full opacity-20" style={{ background: cor }} />
          <span className="absolute inset-0 animate-spin rounded-full border-4 border-muted" style={{ borderTopColor: cor }} />
          {logoUrl ? (
            <span className={cn('flex h-14 w-14 items-center justify-center overflow-hidden', frameLogo(logoEstilo))} style={{ background: logoBg ?? '#ffffff' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoUrl} alt="" className="h-full w-full object-contain" />
            </span>
          ) : (
            <span className="h-3 w-3 rounded-full" style={{ background: cor }} />
          )}
        </span>
        <p className="animate-pulse text-sm font-medium text-muted-foreground">{mensagem}</p>
      </div>
    )
  }

  // Porcentagem: logo com ondas pulsando + barra com a % na lateral (sem o texto "Carregando").
  if (tipo === 'porcentagem') {
    return (
      <div className={wrap}>
        <span className="relative flex h-20 w-20 items-center justify-center">
          <span className="absolute inset-0 animate-ping rounded-full opacity-20" style={{ background: cor }} />
          <span className="absolute -inset-3 animate-ping rounded-full opacity-10" style={{ background: cor, animationDelay: '0.4s' }} />
          {logoUrl ? (
            <span className={cn('flex h-16 w-16 items-center justify-center overflow-hidden', frameLogo(logoEstilo))} style={{ background: logoBg ?? '#ffffff' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoUrl} alt="" className="h-full w-full object-contain" />
            </span>
          ) : (
            <span className="flex h-16 w-16 items-center justify-center rounded-lg text-primary-foreground" style={{ background: cor }}>
              <ListChecks className="h-8 w-8" />
            </span>
          )}
        </span>
        <p className="text-sm font-medium text-muted-foreground">{mensagem}</p>
        <BarraPorcentagem cor={cor} loop={loop} onCompleto={onCompleto} />
      </div>
    )
  }

  // Demais estilos: logo em cima + indicador (igual à Imersão).
  return (
    <div className={wrap}>
      <div className={cn('animate-page', tipo === 'pulsar' && 'animate-pulse')}>
        {logoUrl ? (
          <span className={cn('flex h-16 w-16 items-center justify-center overflow-hidden', frameLogo(logoEstilo))} style={{ background: logoBg ?? '#ffffff' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoUrl} alt="" className="h-full w-full object-contain" />
          </span>
        ) : (
          <span className="flex h-16 w-16 items-center justify-center rounded-lg text-primary-foreground" style={{ background: cor }}>
            <ListChecks className="h-8 w-8" />
          </span>
        )}
      </div>
      <p className="text-sm font-medium text-muted-foreground">{mensagem}</p>
      {tipo === 'spinner' && <Loader2 className="h-7 w-7 animate-spin" style={{ color: cor }} />}
      {tipo === 'pontos' && (
        <div className="flex gap-2">
          {[0, 0.15, 0.3].map((d, i) => <span key={i} className="h-3 w-3 animate-bounce rounded-full" style={{ background: cor, animationDelay: `${d}s` }} />)}
        </div>
      )}
      {tipo === 'barra' && (
        <div className="h-1.5 w-56 max-w-[70%] overflow-hidden rounded-full bg-muted">
          <div className="loading-bar-fill h-full rounded-full" style={{ background: cor }} />
        </div>
      )}
      {/* pulsar: o próprio logo já pulsa */}
    </div>
  )
}

export interface ProvaIntroProps {
  titulo: string
  logoUrl?: string | null
  logoGrandeUrl?: string | null
  logoBg?: string
  logoEstilo?: string
  /** tempo restante já formatado (ex.: "45:00"); null = sem limite. */
  tempoLabel: string | null
  totalQuestoes: number
  descricao?: string
  onIniciar: () => void
  iniciando?: boolean
  compact?: boolean
  /** entrou depois do horário de início do simulado */
  atraso?: boolean
  /** hora em que o simulado iniciou (ex.: "08:00") */
  inicioLabel?: string
  /** minutos de atraso do aluno */
  minAtraso?: number
  /** overlay = aparece por cima do simulado (modal com fundo escurecido). */
  overlay?: boolean
}

/** Pop-up de entrada do simulado: tempo restante + orientação + botão de confirmar. */
export function ProvaIntro(p: ProvaIntroProps) {
  const desc = p.descricao ?? 'Leia cada questão com atenção e preencha todas as alternativas antes de finalizar. Bom simulado!'

  // Variante "atraso": aluno entrou após o horário de início definido no simulado.
  if (p.atraso) {
    return (
      <div className={cn('flex items-center justify-center p-4 text-foreground', p.overlay ? cn('z-50 animate-in fade-in bg-black/50 backdrop-blur-sm duration-200', p.compact ? 'absolute inset-0' : 'fixed inset-0') : cn('bg-background', p.compact ? 'h-full' : 'min-h-screen'))}>
        <div className="relative w-full max-w-md animate-in fade-in zoom-in-95 overflow-hidden rounded-2xl border bg-card p-8 shadow-xl duration-500">
          <FitaTopo />
          <h2 className="mb-5 flex items-center gap-2 text-xl font-bold leading-tight" style={{ color: 'var(--prova-titulo, var(--primary))' }}>
            <Clock className="h-6 w-6 shrink-0" /> Você está entrando com atraso
          </h2>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border bg-muted/40 p-4 text-center">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Iniciou às</p>
              <p className="font-mono text-2xl font-bold tabular-nums">{p.inicioLabel ?? '—'}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{p.minAtraso != null ? `${p.minAtraso} min de atraso` : 'com atraso'}</p>
            </div>
            <div className="rounded-xl border bg-muted/40 p-4 text-center">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Tempo restante</p>
              <p className="font-mono text-2xl font-bold tabular-nums" style={{ color: 'var(--prova-entrada-tempo, var(--primary))' }}>{p.tempoLabel ?? 'Sem limite'}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">min disponíveis</p>
            </div>
          </div>

          <p className="mt-3 flex items-center justify-center gap-1.5 text-sm font-medium text-muted-foreground">
            <ListChecks className="h-4 w-4" /> {p.totalQuestoes} {p.totalQuestoes === 1 ? 'questão' : 'questões'}
          </p>

          <p className="my-5 text-sm leading-relaxed text-muted-foreground">
            Seu tempo será contado a partir de agora. O encerramento ocorre no horário previsto — aproveite bem o tempo restante.
          </p>

          <Button className="w-full" size="lg" onClick={p.onIniciar} disabled={p.iniciando} style={{ background: 'var(--prova-entrada-botao, var(--primary))' }}>
            {p.iniciando ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Entrando...</> : 'Entendi, vou começar'}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className={cn('flex items-center justify-center p-4 text-foreground', p.overlay ? cn('z-50 animate-in fade-in bg-black/50 backdrop-blur-sm duration-200', p.compact ? 'absolute inset-0' : 'fixed inset-0') : cn('bg-background', p.compact ? 'h-full' : 'min-h-screen'))}>
      <div className="relative w-full max-w-md animate-in fade-in zoom-in-95 overflow-hidden rounded-2xl border bg-card p-8 shadow-xl duration-500">
        <FitaTopo />
        {/* Ícone de "começando" + aviso de que o simulado iniciou */}
        <div className="mb-5 flex items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full" style={{ background: 'color-mix(in oklab, var(--prova-titulo, var(--primary)) 15%, var(--card))' }}>
            <PlayCircle className="h-7 w-7" style={{ color: 'var(--prova-titulo, var(--primary))' }} />
          </span>
          <h2 className="text-lg font-bold leading-tight" style={{ color: 'var(--prova-titulo, var(--primary))' }}>Simulado iniciado!</h2>
        </div>

        {/* Tempo + questões */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border bg-muted/40 p-4 text-center">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Tempo restante</p>
            <p className="font-mono text-2xl font-bold tabular-nums" style={{ color: 'var(--prova-entrada-tempo, var(--primary))' }}>{p.tempoLabel ?? 'Sem limite'}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{p.tempoLabel ? 'min disponíveis' : 'sem limite de tempo'}</p>
          </div>
          <div className="rounded-xl border bg-muted/40 p-4 text-center">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Questões</p>
            <p className="font-mono text-2xl font-bold tabular-nums">{p.totalQuestoes}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{p.totalQuestoes === 1 ? 'questão' : 'questões'}</p>
          </div>
        </div>

        {/* Orientação */}
        <p className="my-5 flex items-start gap-2 text-sm leading-relaxed text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{desc}</span>
        </p>

        <Button className="w-full" size="lg" onClick={p.onIniciar} disabled={p.iniciando}>
          {p.iniciando ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Entrando...</> : 'Iniciar simulado'}
        </Button>
      </div>
    </div>
  )
}
