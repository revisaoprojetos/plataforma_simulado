import Link from 'next/link'
import { Search, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

// Primitivas do bloco Pedagógico (Biblioteca / Videoteca / Central de Atualizações). Só apresentação:
// server components, sem estado — a busca e a paginação vivem na URL (?q=&pp=&p=).

export function KpiGrade({ itens, colunas = 4 }: { itens: { valor: React.ReactNode; rotulo: string; alerta?: boolean }[]; colunas?: 3 | 4 }) {
  return (
    <div className={cn('mb-4 grid gap-3', colunas === 4 ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-1 sm:grid-cols-3')}>
      {itens.map((k) => (
        <div key={k.rotulo} className="rounded-2xl border bg-card p-4 shadow-sm">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{k.rotulo}</div>
          <div className={cn('mt-1 text-3xl font-bold tabular-nums', k.alerta && Number(k.valor) > 0 ? 'text-primary' : 'text-foreground')}>{k.valor}</div>
        </div>
      ))}
    </div>
  )
}

/** Nota (faixa de aviso) do protótipo: `.note` / `.note.gold`. */
export function Nota({ children, destaque, icone }: { children: React.ReactNode; destaque?: boolean; icone?: React.ReactNode }) {
  return (
    <div className={cn('mb-4 flex items-start gap-2 rounded-xl border px-4 py-3 text-sm', destaque ? 'border-primary/30 bg-primary/5' : 'bg-muted/40')}>
      {icone}
      <span className="min-w-0">{children}</span>
    </div>
  )
}

/** Busca por GET (sem JS): preserva os demais parâmetros por inputs ocultos e volta à página 1. */
export function BuscaGet({ placeholder, q, ocultos }: { placeholder: string; q: string; ocultos: Record<string, string | undefined> }) {
  return (
    <form method="get" className="mb-3">
      {Object.entries(ocultos).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      <label className="flex w-full items-center gap-2 rounded-xl border bg-card px-3 py-2 text-sm focus-within:ring-2 focus-within:ring-ring">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <input name="q" defaultValue={q} placeholder={placeholder} autoComplete="off" className="w-full bg-transparent outline-none placeholder:text-muted-foreground" />
      </label>
    </form>
  )
}

export function Paginacao({
  total, pagina, porPagina, base, params, opcoes = [10, 25, 50],
}: {
  total: number; pagina: number; porPagina: number; base: string; params: Record<string, string | undefined>; opcoes?: number[]
}) {
  const paginas = Math.max(1, Math.ceil(total / porPagina))
  const href = (p: number, pp = porPagina) => {
    const sp = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v)
    if (pp !== opcoes[1]) sp.set('pp', String(pp))
    if (p > 1) sp.set('p', String(p))
    const s = sp.toString()
    return s ? `${base}?${s}` : base
  }
  const de = total === 0 ? 0 : (pagina - 1) * porPagina + 1
  const ate = Math.min(total, pagina * porPagina)
  const btn = 'inline-flex h-8 items-center gap-1 rounded-lg border px-2.5 text-xs font-medium'
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
      <span>{de}–{ate} de {total.toLocaleString('pt-BR')}</span>
      <div className="flex items-center gap-1.5">
        <span className="mr-1">Por página</span>
        {opcoes.map((n) => (
          <Link key={n} href={href(1, n)} className={cn(btn, n === porPagina ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-muted')}>{n}</Link>
        ))}
        <span className="mx-1">Página {pagina} de {paginas}</span>
        {pagina > 1 ? <Link href={href(pagina - 1)} className={cn(btn, 'hover:bg-muted')} aria-label="Página anterior"><ChevronLeft className="h-3.5 w-3.5" />Anterior</Link> : <span className={cn(btn, 'opacity-40')}><ChevronLeft className="h-3.5 w-3.5" />Anterior</span>}
        {pagina < paginas ? <Link href={href(pagina + 1)} className={cn(btn, 'hover:bg-muted')} aria-label="Próxima página">Próxima<ChevronRight className="h-3.5 w-3.5" /></Link> : <span className={cn(btn, 'opacity-40')}>Próxima<ChevronRight className="h-3.5 w-3.5" /></span>}
      </div>
    </div>
  )
}

/** Lê `?p` e `?pp` com valores válidos. */
export function lerPaginacao(sp: Record<string, string | string[] | undefined>, opcoes = [10, 25, 50]) {
  const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
  const pagina = Math.max(1, Number(um(sp.p)) || 1)
  const pp = Number(um(sp.pp))
  return { pagina, porPagina: opcoes.includes(pp) ? pp : opcoes[1] }
}
