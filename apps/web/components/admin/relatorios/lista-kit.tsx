'use client'

import { Search } from 'lucide-react'
import type { ReactNode } from 'react'

/** Barra de busca + slots de filtro/ordenação, reutilizada por todas as listagens de relatório. */
export function BarraBusca({ valor, onValor, placeholder, children }: {
  valor: string; onValor: (v: string) => void; placeholder: string; children?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-[220px] flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={valor}
          onChange={(e) => onValor(e.target.value)}
          placeholder={placeholder}
          className="h-10 w-full rounded-xl border bg-[var(--input-bg,transparent)] pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
      {children}
    </div>
  )
}

/** Select estilizado para os filtros da barra. */
export function FiltroSelect({ valor, onValor, opcoes }: {
  valor: string; onValor: (v: string) => void; opcoes: { valor: string; rotulo: string }[]
}) {
  return (
    <select
      value={valor}
      onChange={(e) => onValor(e.target.value)}
      className="h-10 rounded-xl border bg-[var(--input-bg,transparent)] px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
    >
      {opcoes.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
    </select>
  )
}

/** Anel de progresso circular (SVG) — usado para taxa de acerto etc. */
export function Anel({ pct, cor = 'hsl(var(--primary))', tamanho = 52, faixa = 5, children }: {
  pct: number; cor?: string; tamanho?: number; faixa?: number; children?: ReactNode
}) {
  const r = (tamanho - faixa) / 2
  const c = 2 * Math.PI * r
  const off = c - (Math.max(0, Math.min(100, pct)) / 100) * c
  return (
    <div className="relative shrink-0" style={{ width: tamanho, height: tamanho }}>
      <svg width={tamanho} height={tamanho} className="-rotate-90">
        <circle cx={tamanho / 2} cy={tamanho / 2} r={r} fill="none" stroke="currentColor" strokeWidth={faixa} className="text-muted/30" />
        <circle cx={tamanho / 2} cy={tamanho / 2} r={r} fill="none" stroke={cor} strokeWidth={faixa} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-[11px] font-bold tabular-nums">{children ?? `${Math.round(pct)}%`}</div>
    </div>
  )
}

/** Avatar de iniciais com cor derivada do nome. */
export function Iniciais({ nome, tamanho = 40 }: { nome: string; tamanho?: number }) {
  const ini = nome.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '?'
  const tons = ['bg-blue-500', 'bg-violet-500', 'bg-rose-500', 'bg-emerald-500', 'bg-amber-500', 'bg-cyan-500', 'bg-fuchsia-500', 'bg-indigo-500']
  let h = 0; for (let i = 0; i < nome.length; i++) h = (h * 31 + nome.charCodeAt(i)) >>> 0
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${tons[h % tons.length]}`}
      style={{ width: tamanho, height: tamanho, fontSize: tamanho * 0.36 }}>{ini}</span>
  )
}

/** Estado vazio consistente. */
export function Vazio({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed py-14 text-center text-sm text-muted-foreground">{children}</div>
}

/** Cor de acerto: vermelho→amarelo→verde. */
export function corAcerto(pct: number): string {
  if (pct >= 70) return '#22c55e'
  if (pct >= 50) return '#eab308'
  if (pct >= 30) return '#f97316'
  return '#ef4444'
}
