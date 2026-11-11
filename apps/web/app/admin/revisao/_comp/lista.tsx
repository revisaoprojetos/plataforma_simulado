import Link from 'next/link'
import { ArrowDown, ArrowUp, ChevronsUpDown, Info, TriangleAlert, CircleCheck, Search, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

// Peças SERVER (sem estado) das telas "Plataforma Revisão": KPIs, notas, pílulas e a barra de lista
// (busca + filtros + ordenação + paginação) conduzida por `?q=&…&ord=&dir=&pag=` — tudo resolvido no servidor.

export type QS = Record<string, string | undefined>

/** Monta `base?…` mesclando params atuais com `mudar` (valor vazio/undefined remove). */
export function hrefCom(base: string, atual: QS, mudar: QS = {}): string {
  const q = new URLSearchParams()
  const m = { ...atual, ...mudar }
  for (const [k, v] of Object.entries(m)) if (v) q.set(k, v)
  const s = q.toString()
  return s ? `${base}?${s}` : base
}

export function KpiCard({ rotulo, valor, alerta }: { rotulo: string; valor: React.ReactNode; alerta?: boolean }) {
  return (
    <div className={cn('rounded-2xl border bg-card p-4 shadow-sm', alerta && 'border-amber-300/60')}>
      <span className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">{rotulo}</span>
      <b className={cn('mt-1 block text-3xl font-bold tabular-nums', alerta && 'text-amber-700 dark:text-amber-400')}>{valor}</b>
    </div>
  )
}

export function KpiGrid({ children, cols = 4 }: { children: React.ReactNode; cols?: 3 | 4 }) {
  return <div className={cn('mb-4 grid gap-3 sm:grid-cols-2', cols === 4 ? 'xl:grid-cols-4' : 'xl:grid-cols-3')}>{children}</div>
}

const NOTA = {
  info: { cls: 'bg-muted text-foreground', Icon: Info },
  aviso: { cls: 'border border-amber-300/60 bg-amber-50 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200', Icon: TriangleAlert },
  ok: { cls: 'border border-emerald-300/60 bg-emerald-50 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200', Icon: CircleCheck },
} as const
export function Nota({ tipo = 'info', children }: { tipo?: keyof typeof NOTA; children: React.ReactNode }) {
  const { cls, Icon } = NOTA[tipo]
  return (
    <div className={cn('mb-4 flex items-start gap-2.5 rounded-xl px-4 py-3 text-sm', cls)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </div>
  )
}

const PILULA = {
  ok: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  bad: 'bg-destructive/10 text-destructive',
  warn: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  mut: 'bg-muted text-muted-foreground',
  vio: 'bg-primary/10 text-primary',
} as const
export function Pilula({ tipo = 'mut', children, className }: { tipo?: keyof typeof PILULA; children: React.ReactNode; className?: string }) {
  return <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold', PILULA[tipo], className)}>{children}</span>
}

/** Cabeçalho de coluna ordenável por link (`ord`/`dir`), mantendo busca e filtros; volta à página 1. */
export function ThOrd({ rotulo, col, base, qs, align }: { rotulo: string; col: string; base: string; qs: QS; align?: 'right' }) {
  const ativo = qs.ord === col
  const dir = ativo && qs.dir !== 'desc' ? 'desc' : 'asc'
  const Icon = ativo ? (qs.dir === 'desc' ? ArrowDown : ArrowUp) : ChevronsUpDown
  return (
    <th className={cn('px-3 py-2.5 text-left font-medium', align === 'right' && 'text-right')}>
      <Link href={hrefCom(base, qs, { ord: col, dir, pag: undefined })} className={cn('inline-flex items-center gap-1 text-xs uppercase tracking-wide transition-colors hover:text-foreground', ativo ? 'text-foreground' : 'text-muted-foreground')}>
        {rotulo}
        <Icon className={cn('h-3.5 w-3.5', ativo ? 'opacity-100' : 'opacity-40')} />
      </Link>
    </th>
  )
}
export const ThFixo = ({ children, align }: { children?: React.ReactNode; align?: 'right' }) => (
  <th className={cn('px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground', align === 'right' && 'text-right')}>{children}</th>
)

export interface FiltroSelect { nome: string; rotulo: string; valor?: string; opcoes: Array<{ v: string; l: string }> }

/** Barra de busca + filtros (GET): preserva os params que não são dela (aba etc.) via inputs ocultos. */
export function BarraBusca({ base, qs, placeholder, filtros = [], preservar = [] }: {
  base: string; qs: QS; placeholder: string; filtros?: FiltroSelect[]; preservar?: string[]
}) {
  const limpar = hrefCom(base, Object.fromEntries(preservar.map((k) => [k, qs[k]])))
  const temFiltro = !!qs.q || filtros.some((f) => !!qs[f.nome])
  return (
    <form method="get" action={base} className="mb-3 flex flex-wrap items-center gap-2">
      {preservar.map((k) => qs[k] ? <input key={k} type="hidden" name={k} value={qs[k]} /> : null)}
      <label className="relative min-w-[14rem] flex-1">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input name="q" defaultValue={qs.q ?? ''} placeholder={placeholder} autoComplete="off"
          className="h-9 w-full rounded-lg border bg-background pl-8 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
      </label>
      {filtros.map((f) => (
        <select key={f.nome} name={f.nome} defaultValue={f.valor ?? qs[f.nome] ?? ''} aria-label={f.rotulo}
          className="h-9 rounded-lg border bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <option value="">{f.rotulo}</option>
          {f.opcoes.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
        </select>
      ))}
      <button type="submit" className="h-9 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90">Filtrar</button>
      {temFiltro && <Link href={limpar} className="h-9 content-center text-sm text-muted-foreground underline-offset-2 hover:underline">Limpar</Link>}
    </form>
  )
}

/** Paginação por links (server). */
export function PaginaNav({ base, qs, pagina, porPagina, total }: { base: string; qs: QS; pagina: number; porPagina: number; total: number }) {
  const paginas = Math.max(1, Math.ceil(total / porPagina))
  if (total === 0) return null
  const ini = (pagina - 1) * porPagina + 1, fim = Math.min(total, pagina * porPagina)
  const Btn = ({ p, children, off }: { p: number; children: React.ReactNode; off: boolean }) => off
    ? <span className="inline-flex h-8 items-center gap-1 rounded-lg border px-2.5 text-sm text-muted-foreground opacity-50">{children}</span>
    : <Link href={hrefCom(base, qs, { pag: p > 1 ? String(p) : undefined })} className="inline-flex h-8 items-center gap-1 rounded-lg border bg-card px-2.5 text-sm font-medium hover:bg-accent">{children}</Link>
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
      <span>{ini}–{fim} de {total} · página {pagina} de {paginas}</span>
      <div className="flex gap-2">
        <Btn p={pagina - 1} off={pagina <= 1}><ChevronLeft className="h-4 w-4" />Anterior</Btn>
        <Btn p={pagina + 1} off={pagina >= paginas}>Próxima<ChevronRight className="h-4 w-4" /></Btn>
      </div>
    </div>
  )
}

export function ParamsInt(v: string | undefined, padrao: number, min = 1, max = 100000): number {
  const n = Math.trunc(Number(v))
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : padrao
}
