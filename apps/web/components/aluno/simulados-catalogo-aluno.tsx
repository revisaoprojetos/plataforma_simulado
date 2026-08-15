import Link from 'next/link'
import { ArrowLeft, FolderOpen, Play, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { iconeBanco } from '@/lib/banco-visual'
import { CardSimulado } from '@/components/aluno/card-simulado'
import { FileiraHorizontal } from '@/components/fileira-horizontal'
import type { ItemSimulado } from '@/lib/aluno/simulado-item'
import type { GrupoCatalogo } from '@/lib/aluno/grupos-catalogo'

export type ItemSimuladoCat = ItemSimulado & { grupoId: string | null }
export type ProgressoGrupo = Record<string, { done: number; total: number }>

// Largura de cada card na fileira (deixa espiar um pedaço do próximo).
// Fileira "recentes": ~4 cards + um pedaço do próximo nas telas largas (o resto rola pro lado).
const FILEIRA_BASIS = 'shrink-0 basis-[calc((100%-1rem)/2.25)] sm:basis-[calc((100%-2rem)/3.3)] lg:basis-[calc((100%-3rem)/4.3)] xl:basis-[calc((100%-4rem)/4.3)]'
// Modo "largura total" (gamificação desativada → sem coluna lateral): ~5 cards por linha.
const FILEIRA_BASIS_FULL = 'shrink-0 basis-[calc((100%-1rem)/2.25)] sm:basis-[calc((100%-2rem)/3.3)] lg:basis-[calc((100%-4rem)/5.3)] xl:basis-[calc((100%-4rem)/5.3)]'

// Seções semânticas do aluno (por estado). Usadas na visão de dentro da pasta.
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

function SecoesGrid({ itens, cols5 }: { itens: ItemSimuladoCat[]; cols5?: boolean }) {
  const buckets: Record<string, ItemSimuladoCat[]> = { agendados: [], disponiveis: [], refazer: [] }
  for (const i of itens) buckets[bucketDe(i)].push(i)
  if (itens.length === 0) return <p className="rounded-2xl border border-dashed py-10 text-center text-sm text-muted-foreground">Nenhum simulado nesta pasta ainda.</p>
  return (
    <div className="space-y-6">
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
            <div className={cn('grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4', cols5 && 'xl:grid-cols-5')}>
              {arr.map((s) => <CardSimulado key={s.id} s={s} />)}
            </div>
          </section>
        )
      })}
    </div>
  )
}

/** Card PÔSTER de uma pasta (grupo) — abre o conteúdo em /aluno?pasta=id. Barra de progresso no hover. */
function CardPasta({ g, count, prog }: { g: GrupoCatalogo; count: number; prog?: { done: number; total: number } }) {
  const cor = g.cor ?? '#6d28d9'
  const Icon = iconeBanco(g.icone)
  const total = prog?.total ?? count
  const done = prog?.done ?? 0
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  // Card pôster (4:5) → usa a imagem NORMAL/inteira do banco (capa_card_url); só cai na larga se não houver.
  const capa = g.capaCard ?? g.capa ?? null
  return (
    <Link href={`/aluno?pasta=${g.id}`}
      className="group relative block aspect-[4/5] w-full overflow-hidden rounded-2xl border shadow-sm ring-1 ring-black/5 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:ring-white/25">
      {capa
        ? <img src={capa} alt="" className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
        : <div className="absolute inset-0" style={{ background: `linear-gradient(155deg, ${cor} 0%, #0f172a 135%)` }} />}
      {!capa && <Icon className="absolute -right-6 -top-6 h-40 w-40 text-white/10 transition-transform duration-500 group-hover:scale-110 group-hover:rotate-3" />}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-3/5 opacity-50 transition-opacity duration-300 group-hover:opacity-70" style={{ background: `linear-gradient(to top, ${cor}, transparent)` }} />
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-black/5" />

      <span className="pointer-events-none absolute right-3 top-3 z-20 rounded-lg bg-black/45 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur sm:py-1 sm:text-[11px]">{count} simulado{count !== 1 ? 's' : ''}</span>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 p-3 sm:p-4">
        <h3 className="line-clamp-2 text-sm font-bold leading-tight text-white drop-shadow-sm sm:text-base">{g.nome}</h3>

        {/* PROGRESSO — aparece/expande no hover */}
        <div className="grid grid-rows-[0fr] opacity-0 transition-all duration-300 group-hover:mt-2.5 group-hover:grid-rows-[1fr] group-hover:opacity-100">
          <div className="overflow-hidden">
            <div className="flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/25">
                <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, background: 'var(--brand-accent)' }} />
              </div>
              <span className="shrink-0 text-[11px] font-semibold tabular-nums text-white">{pct}%</span>
            </div>
            <p className="mt-1 text-[10px] text-white/70">{done} de {total} concluído{done !== 1 ? 's' : ''}</p>
          </div>
        </div>
      </div>
    </Link>
  )
}

/**
 * Catálogo de simulados do aluno na HOME: simulados RECENTES (fileira) + PASTAS (cards pôster
 * com progresso no hover). Ao abrir uma pasta (?pasta=id), mostra os simulados de dentro.
 * Os sem pasta (avulsos) aparecem em grade. A área "Simulados" foi absorvida por aqui.
 */
export function SimuladosCatalogoAluno({ itens, grupos, progresso, recentes, pastaAtiva, full, recentesConcluidos }: {
  itens: ItemSimuladoCat[]
  grupos: GrupoCatalogo[]
  progresso?: ProgressoGrupo
  recentes?: ItemSimuladoCat[]
  pastaAtiva?: string | null
  /** Largura total (gamificação desativada, sem coluna lateral) → grades de 5 por linha. */
  full?: boolean
  /** Aluno já fez todos os simulados recentes disponíveis (sem pendentes, mas com histórico). */
  recentesConcluidos?: boolean
}) {
  // VISÃO DA PASTA — só os simulados de dentro dela.
  if (pastaAtiva) {
    const g = grupos.find((x) => x.id === pastaAtiva)
    const its = itens.filter((s) => s.grupoId === pastaAtiva)
    return (
      <div className="space-y-5">
        <Link href="/aluno" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Início</Link>
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

  // RAIZ (dentro da home) — recentes + pastas + avulsos.
  const avulsos = itens.filter((s) => !s.grupoId)
  const contar = (gid: string) => itens.filter((s) => s.grupoId === gid).length
  const recent = recentes ?? []
  const basis = full ? FILEIRA_BASIS_FULL : FILEIRA_BASIS
  // 1º recente que tem caderno de questões → recebe o balão de dica do botão de download.
  const dicaId = recent.find((s) => s.enunciadoUrl)?.id

  return (
    <div className="space-y-6">
      {recent.length > 0 ? (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold"><Play className="h-4 w-4 text-primary" /> Simulados recentes</h2>
          <FileiraHorizontal>
            {recent.map((s) => <div key={s.id} className={basis}><CardSimulado s={s} dica={s.id === dicaId} /></div>)}
          </FileiraHorizontal>
        </section>
      ) : recentesConcluidos ? (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold"><Play className="h-4 w-4 text-primary" /> Simulados recentes</h2>
          <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.06] px-5 py-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="h-5 w-5" /></span>
            <div className="min-w-0">
              <p className="text-sm font-semibold">Você está em dia!</p>
              <p className="text-xs text-muted-foreground">Você já fez todos os simulados recentes disponíveis. Assim que um novo for liberado, ele aparece aqui.</p>
            </div>
          </div>
        </section>
      ) : null}

      {grupos.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold"><FolderOpen className="h-4 w-4 text-primary" /> Cursos e pacotes</h2>
            <Link href="/aluno/simulados" className="text-xs font-semibold text-primary transition-opacity hover:opacity-80 md:hidden">Ver todos →</Link>
          </div>
          {/* Mobile: carrossel horizontal com snap (cards pôster ~152px). Desktop: grade. */}
          <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:hidden [&::-webkit-scrollbar]:hidden">
            {grupos.map((g) => (
              <div key={g.id} className="w-[152px] shrink-0 snap-start">
                <CardPasta g={g} count={contar(g.id)} prog={progresso?.[g.id]} />
              </div>
            ))}
          </div>
          <div className={cn('hidden gap-4 md:grid md:grid-cols-3 lg:grid-cols-4', full && 'xl:grid-cols-5')}>
            {grupos.map((g) => <CardPasta key={g.id} g={g} count={contar(g.id)} prog={progresso?.[g.id]} />)}
          </div>
        </section>
      )}

      {avulsos.length > 0 && (
        <section className="space-y-3">
          {grupos.length > 0 && <h2 className="text-sm font-semibold text-muted-foreground">Outros simulados</h2>}
          <SecoesGrid itens={avulsos} cols5={full} />
        </section>
      )}
    </div>
  )
}
