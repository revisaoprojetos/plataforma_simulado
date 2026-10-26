'use client'
// Primitivos compartilhados das abas de Gerenciamento do conteúdo (03b). Puramente presentacionais,
// tokens de cor (white-label) + semânticas fixas. "Em construção" = estado HONESTO onde não há pipeline.

import { Construction, Inbox } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatBrt } from '@/lib/brt'

/** "DD/MM/AAAA HH:mm" (BRT) — vazio → '—'. */
export function fmtDataHora(iso?: string | null): string {
  const s = formatBrt(iso)
  return s ? s.replace(/:\d{2}$/, '') : '—'
}
export function fmtData(iso?: string | null): string {
  const s = formatBrt(iso)
  if (!s) return '—'
  return s.split(' ')[0]
}

/** Caixa "Métricas em construção" — usada onde NÃO há pipeline de dados (nunca inventar número). */
export function EmConstrucao({ titulo = 'Métricas em construção', children }: { titulo?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed bg-muted/30 px-6 py-10 text-center">
      <Construction className="h-6 w-6 text-muted-foreground" aria-hidden />
      <div className="text-sm font-semibold text-foreground">{titulo}</div>
      {children && <div className="max-w-md text-xs text-muted-foreground">{children}</div>}
    </div>
  )
}

/** Vazio honesto genérico. */
export function Vazio({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed bg-muted/30 px-6 py-10 text-center text-sm text-muted-foreground">
      <Inbox className="h-6 w-6" aria-hidden />
      {children}
    </div>
  )
}

export function Secao({ titulo, acao, children, className }: { titulo?: string; acao?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-2xl border bg-card p-4 shadow-sm', className)}>
      {(titulo || acao) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {titulo && <h3 className="text-sm font-semibold text-foreground">{titulo}</h3>}
          {acao}
        </div>
      )}
      {children}
    </section>
  )
}

/** Avatar circular com inicial (usa cor do perfil quando houver). */
export function AvatarAluno({ nome, avatar, cor, size = 32 }: { nome: string; avatar?: string | null; cor?: string | null; size?: number }) {
  const inicial = (nome?.trim()?.[0] ?? '?').toUpperCase()
  if (avatar) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={avatar} alt="" width={size} height={size} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
  }
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full text-xs font-bold text-primary"
      style={{ width: size, height: size, background: cor ? `color-mix(in oklab, ${cor} 22%, var(--card))` : 'color-mix(in oklab, var(--primary) 14%, var(--card))', color: cor ?? 'var(--primary)' }}
    >
      {inicial}
    </span>
  )
}

const SIT = {
  nao_abriu: { txt: 'Não abriu', cls: 'bg-muted text-muted-foreground border-border' },
  lendo: { txt: 'Lendo', cls: 'bg-sky-500/12 text-sky-700 dark:text-sky-400 border-sky-500/25' },
  concluiu: { txt: 'Concluiu', cls: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-400 border-emerald-500/25' },
} as const
export function SituacaoBadge({ s }: { s: 'nao_abriu' | 'lendo' | 'concluiu' }) {
  const i = SIT[s]
  return <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium', i.cls)}>{i.txt}</span>
}

const ORIGEM = {
  avulsa: { txt: 'Avulsa', cls: 'bg-amber-500/12 text-amber-700 dark:text-amber-400 border-amber-500/25' },
  individual: { txt: 'Individual', cls: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-400 border-emerald-500/25' },
  via_pacote: { txt: 'Via pacote', cls: 'bg-primary/10 text-primary border-primary/25' },
} as const
export function OrigemBadge({ origem }: { origem: 'avulsa' | 'individual' | 'via_pacote' }) {
  const i = ORIGEM[origem]
  return <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium', i.cls)}>{i.txt}</span>
}

/** Mini-cartão de KPI (valor em "em construção" por padrão). */
export function KpiCard({ rotulo, hint, valor }: { rotulo: string; hint?: string; valor?: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{rotulo}</div>
      <div className="mt-1 text-xl font-bold text-foreground">{valor ?? <span className="text-sm font-medium text-muted-foreground">—</span>}</div>
      {hint && <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  )
}
