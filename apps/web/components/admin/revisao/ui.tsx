import Link from 'next/link'
import { cn } from '@/lib/utils'

// Primitivas compartilhadas das telas "Plataforma Revisão" (protótipo admin-plataforma-revisao).
// Cabeçalho = caminho + título + subtítulo + ações (como `head()` do protótipo); abas = sublinhado (border-b-2).
// Só apresentação: nenhum cálculo aqui — as páginas só LÊEM dados prontos do servidor.

export function RevisaoHead({
  secao,
  titulo,
  subtitulo,
  acoes,
}: {
  secao?: string
  titulo: string
  subtitulo?: string
  acoes?: React.ReactNode
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        {secao && (
          <nav className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground" aria-label="Caminho">
            <span>{secao}</span>
            <span>/</span>
            <b className="font-medium text-foreground">{titulo}</b>
          </nav>
        )}
        <h1 className="text-2xl font-bold tracking-tight">{titulo}</h1>
        {subtitulo && <p className="mt-1 text-sm text-muted-foreground">{subtitulo}</p>}
      </div>
      {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
    </div>
  )
}

export type AbaRevisao = { id: string; titulo: string; contagem?: number }

/** Abas de LINHA (sublinhado), navegação por `?<param>=<id>` — estado na URL, página renderiza no servidor. */
export function RevisaoAbas({
  abas,
  atual,
  base,
  param = 'aba',
  extra,
}: {
  abas: AbaRevisao[]
  atual: string
  base: string // ex.: '/admin/revisao/cursos/abc'
  param?: string
  extra?: Record<string, string | undefined> // outros params a preservar
}) {
  const href = (id: string) => {
    const q = new URLSearchParams()
    for (const [k, v] of Object.entries(extra ?? {})) if (v) q.set(k, v)
    q.set(param, id)
    return `${base}?${q.toString()}`
  }
  return (
    <div className="mb-4 flex gap-1 overflow-x-auto border-b" role="tablist">
      {abas.map((a) => {
        const on = a.id === atual
        return (
          <Link
            key={a.id}
            href={href(a.id)}
            role="tab"
            aria-selected={on}
            className={cn(
              '-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              on ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {a.titulo}
            {a.contagem != null && a.contagem > 0 && (
              <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">{a.contagem}</span>
            )}
          </Link>
        )
      })}
    </div>
  )
}

export function RevisaoCard({ titulo, children, className }: { titulo?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-2xl border bg-card p-4 shadow-sm', className)}>
      {titulo && <h2 className="mb-3 text-sm font-semibold">{titulo}</h2>}
      {children}
    </section>
  )
}
