'use client'

// Kit de visualização dos relatórios — 100% CSS/SVG, sem recharts.
// Motivo: o tema usa `--primary: oklch(...)`, então passar `hsl(var(--primary))`
// para o recharts gerava cor inválida e barras/linhas em branco. Aqui usamos
// classes Tailwind (bg-primary, bg-emerald-500…) que resolvem o oklch certo,
// e SVG com `currentColor` — robusto no claro e no escuro, e no estilo do Ranking.

import { useId, useState } from 'react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { usePdfDownloads } from '@/components/pdf-downloads-provider'

export type Tom = 'primary' | 'emerald' | 'amber' | 'sky' | 'violet' | 'rose' | 'slate'

const TOM_ICON: Record<Tom, string> = {
  primary: 'bg-primary/15 text-primary',
  emerald: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  amber: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  sky: 'bg-sky-500/15 text-sky-600 dark:text-sky-400',
  violet: 'bg-violet-500/15 text-violet-600 dark:text-violet-400',
  rose: 'bg-rose-500/15 text-rose-600 dark:text-rose-400',
  slate: 'bg-slate-500/15 text-slate-600 dark:text-slate-400',
}
const TOM_BAR: Record<Tom, string> = {
  primary: 'bg-primary', emerald: 'bg-emerald-500', amber: 'bg-amber-500',
  sky: 'bg-sky-500', violet: 'bg-violet-500', rose: 'bg-rose-500', slate: 'bg-slate-400',
}
const TOM_TEXT: Record<Tom, string> = {
  primary: 'text-primary', emerald: 'text-emerald-500', amber: 'text-amber-500',
  sky: 'text-sky-500', violet: 'text-violet-500', rose: 'text-rose-500', slate: 'text-slate-400',
}
const TOM_GRAD: Record<Tom, string> = {
  primary: 'from-primary to-primary/50', emerald: 'from-emerald-500 to-emerald-500/50',
  amber: 'from-amber-500 to-amber-500/50', sky: 'from-sky-500 to-sky-500/50',
  violet: 'from-violet-500 to-violet-500/50', rose: 'from-rose-500 to-rose-500/50', slate: 'from-slate-400 to-slate-400/50',
}
const TOM_ACCENT: Record<Tom, string> = {
  primary: 'from-primary/70 to-primary/5', emerald: 'from-emerald-500/70 to-emerald-500/5',
  amber: 'from-amber-500/70 to-amber-500/5', sky: 'from-sky-500/70 to-sky-500/5',
  violet: 'from-violet-500/70 to-violet-500/5', rose: 'from-rose-500/70 to-rose-500/5', slate: 'from-slate-400/70 to-slate-400/5',
}
const CICLO: Tom[] = ['primary', 'emerald', 'amber', 'sky', 'violet', 'rose']

/** Cor de "calor" por percentual de acerto (verde bom → vermelho ruim). */
export function heatBar(pct: number) {
  if (pct >= 75) return 'bg-emerald-500'
  if (pct >= 55) return 'bg-lime-500'
  if (pct >= 35) return 'bg-amber-500'
  return 'bg-rose-500'
}

/** Baixa uma planilha CSV (abre no Excel; BOM p/ acentos; separador ;). */
export function baixarCsv(nomeArq: string, linhas: (string | number | null)[][]) {
  const esc = (v: string | number | null) => { const s = String(v ?? ''); return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
  const csv = '﻿' + linhas.map((l) => l.map(esc).join(';')).join('\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  a.download = `${nomeArq.replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '_')}.csv`
  document.body.appendChild(a); a.click(); a.remove()
  URL.revokeObjectURL(a.href)
}

// ---------------------------------------------------------------------------

/** Moldura de painel com faixa de acento colorida, ícone tintado e hover. */
export function Painel({ titulo, sub, icon, tom = 'primary', acao, className, children }: {
  titulo: string; sub?: string; icon?: React.ReactNode; tom?: Tom; acao?: React.ReactNode; className?: string; children: React.ReactNode
}) {
  return (
    <div className={cn('group relative overflow-hidden rounded-2xl border bg-card transition-shadow duration-200 hover:shadow-md', className)}>
      <div className={cn('absolute inset-x-0 top-0 h-1 bg-gradient-to-r', TOM_ACCENT[tom])} />
      <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {icon && <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-transform duration-200 group-hover:scale-110', TOM_ICON[tom])}>{icon}</span>}
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold leading-tight">{titulo}</h3>
            {sub && <p className="truncate text-xs text-muted-foreground">{sub}</p>}
          </div>
        </div>
        {acao}
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

/** Banner de destaque com gradiente + glow (estilo caderno de prova). */
export function Hero({ icon, tom = 'primary', titulo, subtitulo, badge, acoes }: {
  icon?: React.ReactNode; tom?: Tom; titulo: string; subtitulo?: string; badge?: React.ReactNode; acoes?: React.ReactNode
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/10 via-card to-card">
      <div className="pointer-events-none absolute -right-10 -top-12 h-44 w-44 rounded-full bg-primary/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-16 right-24 h-40 w-40 rounded-full bg-primary/10 blur-3xl" />
      <div className="relative flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex min-w-0 items-center gap-3.5">
          {icon && <span className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl shadow-sm ring-1 ring-inset ring-white/10', TOM_ICON[tom])}>{icon}</span>}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-xl font-bold tracking-tight">{titulo}</h2>
              {badge}
            </div>
            {subtitulo && <p className="mt-0.5 text-sm text-muted-foreground">{subtitulo}</p>}
          </div>
        </div>
        {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
      </div>
    </div>
  )
}

/** Cartão de KPI — ícone tintado + número em destaque (estilo Ranking). */
export function KpiCard({ icon, tom = 'primary', label, valor, sub }: {
  icon?: React.ReactNode; tom?: Tom; label: string; valor: React.ReactNode; sub?: React.ReactNode
}) {
  return (
    <div className="group rounded-2xl border bg-card p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        {icon && <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-110', TOM_ICON[tom])}>{icon}</span>}
      </div>
      <div className="mt-3 text-2xl font-bold leading-none tabular-nums">{valor}</div>
      {sub != null && <div className="mt-1.5 text-xs text-muted-foreground">{sub}</div>}
    </div>
  )
}

/** Estado vazio padrão (dentro de um painel). */
export function Vazio({ children }: { children: React.ReactNode }) {
  return <div className="py-10 text-center text-sm text-muted-foreground">{children}</div>
}

type ItemBarra = { rotulo: string; valor: number; sub?: string }

/**
 * Lista de barras horizontais ranqueadas (label · trilha · valor).
 * `heat`: colore pela faixa de acerto. `pct`: valores já são 0–100.
 */
export function BarrasH({ itens, tom = 'primary', heat, pct, formato, max }: {
  itens: ItemBarra[]; tom?: Tom; heat?: boolean; pct?: boolean; max?: number
  formato?: (n: number) => string
}) {
  if (itens.length === 0) return <Vazio>Sem dados.</Vazio>
  const teto = max ?? (pct ? 100 : Math.max(1, ...itens.map((i) => i.valor)))
  const fmt = formato ?? ((n: number) => (pct ? `${n}%` : String(n)))
  return (
    <div className="space-y-3">
      {itens.map((it, i) => {
        const w = Math.max(0, Math.min(100, Math.round((it.valor / teto) * 100)))
        const cor = heat ? heatBar(it.valor) : TOM_BAR[tom]
        return (
          <div key={i} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
            <div className="min-w-0">
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <span className="truncate text-sm font-medium">{it.rotulo}</span>
                {it.sub && <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{it.sub}</span>}
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                <div className={cn('h-full rounded-full transition-all', cor)} style={{ width: `${w}%` }} />
              </div>
            </div>
            <span className="w-14 text-right text-sm font-bold tabular-nums">{fmt(it.valor)}</span>
          </div>
        )
      })}
    </div>
  )
}

/** Barras horizontais com duas séries por linha (ex.: aluno × turma). */
export function BarrasDupla({ itens, aTom = 'primary', bTom = 'slate', aNome, bNome }: {
  itens: { rotulo: string; a: number; b: number }[]; aTom?: Tom; bTom?: Tom; aNome: string; bNome: string
}) {
  if (itens.length === 0) return <Vazio>Sem dados.</Vazio>
  return (
    <div className="space-y-3.5">
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className={cn('h-2.5 w-2.5 rounded-full', TOM_BAR[aTom])} />{aNome}</span>
        <span className="flex items-center gap-1.5"><span className={cn('h-2.5 w-2.5 rounded-full', TOM_BAR[bTom])} />{bNome}</span>
      </div>
      {itens.map((it, i) => (
        <div key={i}>
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <span className="truncate text-sm font-medium">{it.rotulo}</span>
            <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
              <span className="font-semibold text-foreground">{it.a}%</span> · {it.b}%
            </span>
          </div>
          <div className="space-y-1">
            <div className="h-2 overflow-hidden rounded-full bg-muted"><div className={cn('h-full rounded-full', TOM_BAR[aTom])} style={{ width: `${Math.min(100, it.a)}%` }} /></div>
            <div className="h-2 overflow-hidden rounded-full bg-muted"><div className={cn('h-full rounded-full', TOM_BAR[bTom])} style={{ width: `${Math.min(100, it.b)}%` }} /></div>
          </div>
        </div>
      ))}
    </div>
  )
}

/** Colunas verticais com gradiente, valores e grade de fundo (série/distribuição). */
export function Colunas({ itens, tom = 'primary', altura = 180, formato }: {
  itens: ItemBarra[]; tom?: Tom; altura?: number; formato?: (n: number) => string
}) {
  if (itens.length === 0) return <Vazio>Sem dados.</Vazio>
  const max = Math.max(1, ...itens.map((i) => i.valor))
  const fmt = formato ?? ((n: number) => String(n))
  const densos = itens.length > 12 // esconde rótulos numéricos quando há muitas colunas
  return (
    <div>
      <div className="relative flex items-end gap-1.5" style={{ height: altura }}>
        {/* grade horizontal de fundo */}
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
          {[0, 1, 2, 3].map((i) => <div key={i} className="border-t border-dashed border-border/60" />)}
          <div className="border-t border-border" />
        </div>
        {itens.map((it, i) => {
          const h = it.valor > 0 ? Math.max(3, Math.round((it.valor / max) * 100)) : 0
          return (
            <div key={i} className="group relative z-10 flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
              <span className={cn('text-[10px] font-semibold tabular-nums text-muted-foreground transition-opacity', densos && 'opacity-0 group-hover:opacity-100')}>{fmt(it.valor)}</span>
              <div className={cn('w-full max-w-[44px] rounded-t-md bg-gradient-to-t shadow-sm transition-all duration-200 group-hover:brightness-110', TOM_GRAD[tom])} style={{ height: `${h}%` }} title={`${it.rotulo}: ${fmt(it.valor)}`} />
            </div>
          )
        })}
      </div>
      <div className="mt-1.5 flex gap-1.5">
        {itens.map((it, i) => (
          <span key={i} className="min-w-0 flex-1 truncate text-center text-[10px] leading-tight text-muted-foreground" title={it.rotulo}>{it.rotulo}</span>
        ))}
      </div>
    </div>
  )
}

/** Área/linha SVG com grade, gradiente e eixo Y (evolução). */
export function AreaSpark({ pontos, tom = 'primary', altura = 180, min, max, formato }: {
  pontos: { rotulo: string; valor: number }[]; tom?: Tom; altura?: number
  min?: number; max?: number; formato?: (n: number) => string
}) {
  const gid = useId().replace(/:/g, '')
  if (pontos.length === 0) return <Vazio>Sem dados.</Vazio>
  const fmt = formato ?? ((n: number) => String(n))
  const vals = pontos.map((p) => p.valor)
  const lo = min ?? Math.min(...vals)
  const hi = max ?? Math.max(...vals, lo + 1)
  const span = hi - lo || 1
  const n = pontos.length
  const px = (i: number) => (n === 1 ? 50 : (i / (n - 1)) * 100)
  const py = (v: number) => 100 - ((v - lo) / span) * 90 - 5 // margem 5% topo/base
  const linha = pontos.map((p, i) => `${px(i)},${py(p.valor)}`).join(' ')
  const meio = Math.round(((lo + hi) / 2) * 10) / 10
  return (
    <div className="flex gap-2">
      {/* eixo Y */}
      <div className="flex flex-col justify-between py-0.5 text-right text-[10px] tabular-nums text-muted-foreground" style={{ height: altura }}>
        <span>{fmt(hi)}</span><span>{fmt(meio)}</span><span>{fmt(lo)}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className={cn('relative', TOM_TEXT[tom])} style={{ height: altura }}>
          {/* grade horizontal */}
          <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
            {[0, 1, 2, 3].map((i) => <div key={i} className="border-t border-dashed border-border/60" />)}
            <div className="border-t border-border" />
          </div>
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
            <defs>
              <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="currentColor" stopOpacity="0.28" />
                <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
              </linearGradient>
            </defs>
            <polygon points={`0,100 ${linha} 100,100`} fill={`url(#${gid})`} />
            <polyline points={linha} fill="none" stroke="currentColor" strokeWidth={2.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
          </svg>
          {pontos.map((p, i) => (
            <div key={i} className="group absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${px(i)}%`, top: `${py(p.valor)}%` }}>
              <span className="block h-2.5 w-2.5 rounded-full border-2 border-background bg-current shadow-sm transition-transform group-hover:scale-125" />
              <span className="pointer-events-none absolute bottom-full left-1/2 mb-1 -translate-x-1/2 whitespace-nowrap rounded-md border bg-popover px-1.5 py-0.5 text-[10px] font-semibold text-popover-foreground opacity-0 shadow transition-opacity group-hover:opacity-100">{fmt(p.valor)}</span>
            </div>
          ))}
        </div>
        <div className="mt-2 flex justify-between gap-1 text-[10px] text-muted-foreground">
          {pontos.map((p, i) => (
            <span key={i} className="min-w-0 flex-1 truncate text-center first:text-left last:text-right">{p.rotulo}</span>
          ))}
        </div>
      </div>
    </div>
  )
}

/** Rosca SVG com legenda (distribuição por categoria). */
export function Donut({ itens, altura = 150 }: { itens: { rotulo: string; valor: number; tom?: Tom }[]; altura?: number }) {
  const total = itens.reduce((a, b) => a + b.valor, 0)
  if (total === 0) return <Vazio>Sem dados.</Vazio>
  const r = 42, c = 2 * Math.PI * r
  let acc = 0
  return (
    <div className="flex items-center gap-5">
      <svg viewBox="0 0 100 100" style={{ width: altura, height: altura }} className="shrink-0 -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" strokeWidth="13" stroke="currentColor" className="text-muted" />
        {itens.map((it, i) => {
          const dash = (it.valor / total) * c
          const seg = (
            <circle key={i} cx="50" cy="50" r={r} fill="none" strokeWidth="13" stroke="currentColor"
              className={TOM_TEXT[it.tom ?? CICLO[i % CICLO.length]]}
              strokeDasharray={`${dash} ${c - dash}`} strokeDashoffset={-acc} />
          )
          acc += dash
          return seg
        })}
      </svg>
      <div className="min-w-0 flex-1 space-y-1.5 text-sm">
        {itens.map((it, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', TOM_BAR[it.tom ?? CICLO[i % CICLO.length]])} />
            <span className="truncate text-muted-foreground">{it.rotulo}</span>
            <span className="ml-auto font-semibold tabular-nums">{it.valor}</span>
            <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">{Math.round((it.valor / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Lista de linhas (tabela) com busca opcional e rolagem interna com altura máxima.
 * A busca só aparece quando há linhas suficientes; a rolagem mantém o cabeçalho fixo.
 */
export function ListaBusca<T>({ itens, filtro, placeholder = 'Buscar…', alturaMax = 460, limiarBusca = 6, print, vazio, children }: {
  itens: T[]
  filtro: (item: T, termo: string) => boolean
  placeholder?: string
  alturaMax?: number
  limiarBusca?: number
  print?: boolean // no PDF: sem busca e sem rolagem (mostra todas as linhas)
  vazio?: React.ReactNode
  children: (item: T, i: number) => React.ReactNode
}) {
  const [q, setQ] = useState('')
  const termo = q.trim().toLowerCase()
  const lista = termo ? itens.filter((it) => filtro(it, termo)) : itens
  const mostrarBusca = !print && itens.length > limiarBusca
  if (print) {
    return itens.length === 0 ? <Vazio>{vazio ?? 'Sem dados.'}</Vazio> : <div className="space-y-2">{itens.map((it, i) => children(it, i))}</div>
  }
  return (
    <div className="space-y-3">
      {mostrarBusca && (
        <div className="relative">
          <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder}
            className="w-full rounded-lg border bg-transparent py-2 pl-9 pr-3 text-sm outline-none transition focus:ring-2 focus:ring-ring" />
        </div>
      )}
      {lista.length === 0 ? (
        <Vazio>{termo ? 'Nada encontrado para a busca.' : (vazio ?? 'Sem dados.')}</Vazio>
      ) : (
        <div className="space-y-2 overflow-y-auto pr-1 [scrollbar-width:thin]" style={{ maxHeight: alturaMax }}>
          {lista.map((it, i) => children(it, i))}
        </div>
      )}
      {mostrarBusca && lista.length > 0 && (
        <p className="text-center text-[11px] text-muted-foreground">Mostrando {lista.length} de {itens.length}</p>
      )}
    </div>
  )
}

/**
 * Botão "Baixar PDF" — enfileira a geração no worker/Gotenberg e usa o provider
 * global de downloads (mesma notificação do caderno: toast "gerando" → "pronto"
 * com download automático). `sub` é o tipo de relatório e `refId` o id do recurso
 * (para o gráfico geral, o id do tenant).
 */
export function BotaoBaixarPdf({ sub, refId, titulo, arquivo }: {
  sub: 'simulado' | 'disciplina' | 'estudante' | 'grafico'; refId: string; titulo: string; arquivo: string
}) {
  const { registrar } = usePdfDownloads()
  const [carregando, setCarregando] = useState(false)

  async function baixar() {
    if (carregando) return
    setCarregando(true)
    try {
      const res = await fetch('/api/pdf/gerar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'relatorio', sub, ref: refId, titulo }),
      })
      const data = await res.json()
      if (!res.ok || !data.jobId) { toast.error(data.message ?? 'Servidor de PDF indisponível.'); return }
      registrar({ id: data.jobId, nome: titulo, arquivo, statusUrl: `/api/pdf/jobs/${data.jobId}` })
    } catch {
      toast.error('Erro de rede ao iniciar a geração.')
    } finally {
      setCarregando(false)
    }
  }

  return (
    <button type="button" onClick={baixar} disabled={carregando}
      className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-sm transition hover:opacity-90 disabled:opacity-60">
      <svg className={cn('h-4 w-4', carregando && 'animate-spin')} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {carregando ? <path d="M21 12a9 9 0 1 1-6.219-8.56" /> : <><path d="M12 15V3M7 10l5 5 5-5M5 21h14" /></>}
      </svg>
      {carregando ? 'Gerando…' : 'Baixar PDF'}
    </button>
  )
}

/** Botão de exportar CSV padronizado. */
export function BotaoExportar({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-muted">
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M8 13h2m4 0h2m-8 4h2m4 0h2" /></svg>
      Exportar (CSV/Excel)
    </button>
  )
}
