import Link from 'next/link'
import { ArrowLeft, ArrowRight, FolderOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import { iconeBanco } from '@/lib/banco-visual'
import { CardSimulado } from '@/components/aluno/card-simulado'
import type { ItemSimulado } from '@/lib/aluno/simulado-item'
import type { GrupoCatalogo } from '@/lib/aluno/grupos-catalogo'

export type ItemSimuladoCat = ItemSimulado & { grupoId: string | null }

// Seções semânticas do aluno (por estado), não por status de vida do simulado.
const SECOES = [
  { chave: 'agendados', titulo: 'Agendados', cor: 'bg-amber-500' },
  { chave: 'disponiveis', titulo: 'Disponíveis', cor: 'bg-emerald-500' },
  { chave: 'refazer', titulo: 'Já concluídos', cor: 'bg-sky-500' },
] as const

function bucketDe(i: ItemSimuladoCat): 'agendados' | 'disponiveis' | 'refazer' {
  if (i.emAndamento) return i.modo_aplicacao === 'janela_fixa' ? 'agendados' : 'disponiveis'
  if (i.refazer) return 'refazer'
  return i.modo_aplicacao === 'janela_fixa' ? 'agendados' : 'disponiveis'
}

/** Sções (agendados/disponíveis/concluídos) de uma lista, em grade. Seção vazia some. */
function SecoesGrid({ itens }: { itens: ItemSimuladoCat[] }) {
  const buckets: Record<string, ItemSimuladoCat[]> = { agendados: [], disponiveis: [], refazer: [] }
  for (const i of itens) buckets[bucketDe(i)].push(i)
  const temAlgo = itens.length > 0
  return (
    <div className="space-y-6">
      {!temAlgo && <p className="rounded-2xl border border-dashed py-10 text-center text-sm text-muted-foreground">Nenhum simulado por aqui ainda.</p>}
      {SECOES.map((sec) => {
        const arr = buckets[sec.chave]
        if (arr.length === 0) return null
        return (
          <section key={sec.chave} className="space-y-3">
            <div className="flex items-center gap-2">
              <span className={cn('h-2.5 w-2.5 rounded-full', sec.cor)} />
              <h2 className="font-semibold">{sec.titulo}</h2>
              <span className="text-sm text-muted-foreground">({arr.length})</span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {arr.map((s) => <CardSimulado key={s.id} s={s} />)}
            </div>
          </section>
        )
      })}
    </div>
  )
}

/** Card PÔSTER de uma pasta (grupo) — abre o conteúdo em /aluno/simulado?pasta=id. */
function CardPasta({ g, count }: { g: GrupoCatalogo; count: number }) {
  const cor = g.cor ?? '#6d28d9'
  const Icon = iconeBanco(g.icone)
  return (
    <Link href={`/aluno/simulado?pasta=${g.id}`}
      className="group relative aspect-[4/5] overflow-hidden rounded-2xl border shadow-sm ring-1 ring-black/5 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:ring-white/25">
      {g.capa
        ? <img src={g.capa} alt="" className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
        : <div className="absolute inset-0" style={{ background: `linear-gradient(155deg, ${cor} 0%, #0f172a 135%)` }} />}
      {!g.capa && <Icon className="absolute -right-6 -top-6 h-40 w-40 text-white/10 transition-transform duration-500 group-hover:scale-110 group-hover:rotate-3" />}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-3/5 opacity-50 transition-opacity duration-300 group-hover:opacity-70" style={{ background: `linear-gradient(to top, ${cor}, transparent)` }} />
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-black/5" />

      <span className="pointer-events-none absolute right-3 top-3 z-20 rounded-lg bg-black/45 px-2 py-1 text-[11px] font-semibold text-white backdrop-blur">{count} simulado{count !== 1 ? 's' : ''}</span>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 p-4">
        <span className="mb-1 inline-flex items-center gap-1 rounded-md bg-black/45 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white/85 backdrop-blur"><FolderOpen className="h-3 w-3" /> Pasta</span>
        <h3 className="line-clamp-2 text-base font-bold leading-tight text-white drop-shadow-sm">{g.nome}</h3>
        <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-white">Ver conteúdo <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" /></span>
      </div>
    </Link>
  )
}

/**
 * Catálogo de simulados do aluno com PASTAS: simulados agrupados aparecem como card de
 * pasta (pôster) e, ao abrir (?pasta=id), mostram os simulados de dentro. Os sem pasta
 * (avulsos) aparecem direto em grade por seção.
 */
export function SimuladosCatalogoAluno({ itens, grupos, pastaAtiva }: { itens: ItemSimuladoCat[]; grupos: GrupoCatalogo[]; pastaAtiva?: string | null }) {
  // VISÃO DA PASTA — só os simulados de dentro dela.
  if (pastaAtiva) {
    const g = grupos.find((x) => x.id === pastaAtiva)
    const its = itens.filter((s) => s.grupoId === pastaAtiva)
    return (
      <div className="space-y-5">
        <Link href="/aluno/simulado" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Simulados</Link>
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white shadow-sm" style={{ background: g?.cor ?? '#6d28d9' }}><FolderOpen className="h-5 w-5" /></span>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold tracking-tight">{g?.nome ?? 'Pasta'}</h1>
            <p className="text-muted-foreground">{its.length} simulado(s) nesta pasta.</p>
          </div>
        </div>
        <SecoesGrid itens={its} />
      </div>
    )
  }

  // RAIZ — cards de pasta + simulados avulsos.
  const avulsos = itens.filter((s) => !s.grupoId)
  const contar = (gid: string) => itens.filter((s) => s.grupoId === gid).length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Simulados</h1>
        <p className="text-muted-foreground">Simulados liberados para você — abra uma pasta ou faça um avulso.</p>
      </div>

      {grupos.length > 0 && (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold"><FolderOpen className="h-4 w-4 text-primary" /> Pastas</h2>
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {grupos.map((g) => <CardPasta key={g.id} g={g} count={contar(g.id)} />)}
          </div>
        </section>
      )}

      {avulsos.length > 0 && (
        <section className="space-y-3">
          {grupos.length > 0 && <h2 className="text-sm font-semibold text-muted-foreground">Avulsos</h2>}
          <SecoesGrid itens={avulsos} />
        </section>
      )}

      {grupos.length === 0 && avulsos.length === 0 && (
        <p className="rounded-2xl border border-dashed py-12 text-center text-sm text-muted-foreground">Nenhum simulado liberado no momento.</p>
      )}
    </div>
  )
}
