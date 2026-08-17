'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { CheckCircle2, Lock, LayoutGrid, Rows3 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { iconeBanco } from '@/lib/banco-visual'
import { FileiraHorizontal } from '@/components/fileira-horizontal'
import { PersonalizadosLista } from '@/components/aluno/personalizados-lista'
import type { VisualSim } from '@/lib/aluno/simulado-visual'

export type MeuSimuladoItem = {
  id: string
  titulo: string
  modo_aplicacao: string
  tentativas: number
  melhor: number | null
  notaLiberada: boolean
  vis: VisualSim | null
  grupoId: string | null
}
type Grupo = { id: string; nome: string }

const notaTone = (n: number) => (n >= 70 ? 'text-emerald-600 dark:text-emerald-400' : n >= 50 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400')
const modoLabel = (m: string) => (m === 'janela_fixa' ? 'Agendado' : m === 'prazo_relativo' ? 'Prazo' : 'Aberto')

// Cards um pouco mais estreitos para espiar um pedaço do próximo na fileira do catálogo.
const BASIS = 'shrink-0 basis-[calc((100%-1rem)/2.25)] sm:basis-[calc((100%-2rem)/3.3)] lg:basis-[calc((100%-3rem)/4.3)] xl:basis-[calc((100%-4rem)/5.3)]'

/** Card (pôster) de um simulado concluído — nota, tentativas e link para o resultado. */
function CardConcluido({ s }: { s: MeuSimuladoItem }) {
  const cor = s.vis?.cor ?? '#6d28d9'
  const BancoIcon = iconeBanco(s.vis?.icone)
  const capa = s.vis?.capa
  return (
    <div className="group relative aspect-[4/5] overflow-hidden rounded-2xl border shadow-sm ring-1 ring-black/5 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:ring-white/25">
      {capa
        ? <img src={capa} alt="" className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
        : <div className="absolute inset-0" style={{ background: `linear-gradient(155deg, ${cor} 0%, #0f172a 135%)` }} />}
      {!capa && <BancoIcon className="absolute -right-6 -top-6 h-40 w-40 text-white/10 transition-transform duration-500 group-hover:scale-110 group-hover:rotate-3" />}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-3/5 opacity-50 transition-opacity duration-300 group-hover:opacity-70" style={{ background: `linear-gradient(to top, ${cor}, transparent)` }} />
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-black/5" />

      <Link href={`/aluno/simulados/${s.id}`} className="absolute inset-0 z-10" aria-label={s.titulo} />

      {s.notaLiberada ? (
        <span className="pointer-events-none absolute right-3 top-3 z-20 rounded-lg bg-black/45 px-2 py-1 text-right backdrop-blur">
          <span className={cn('block text-lg font-bold leading-none tabular-nums text-white', s.melhor != null && notaTone(s.melhor))}>{s.melhor != null ? s.melhor.toFixed(1).replace('.', ',') : '—'}</span>
          <span className="block text-[9px] uppercase tracking-wide text-white/70">nota</span>
        </span>
      ) : (
        <span className="pointer-events-none absolute right-3 top-3 z-20 inline-flex items-center gap-1 rounded-lg bg-black/45 px-2 py-1 text-[10px] font-medium text-white/80 backdrop-blur" title="A nota será liberada pelo professor"><Lock className="h-3 w-3" /> Nota</span>
      )}

      {/* Modalidade (Aberto/Agendado/Prazo) — canto superior esquerdo. */}
      <span className="pointer-events-none absolute left-3 top-3 z-20 rounded-lg bg-black/45 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white/85 backdrop-blur">{modoLabel(s.modo_aplicacao)}</span>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 p-4">
        <span className="mb-1 inline-flex items-center gap-1 rounded-md bg-black/45 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white/85 backdrop-blur"><CheckCircle2 className="h-3 w-3" /> Concluído</span>
        <h3 className="line-clamp-2 text-base font-bold leading-tight text-white drop-shadow-sm">{s.titulo}</h3>
      </div>
    </div>
  )
}

/**
 * "Meus simulados" (concluídos) com dois modos: "Quadro" (grade) e "Catálogo" (fileiras horizontais
 * por grupo/pasta do banco, estilo Netflix). Catálogo é o padrão quando há grupos.
 */
export function MeusSimuladosCatalogo({ itens, grupos }: { itens: MeuSimuladoItem[]; grupos: Grupo[] }) {
  const temCatalogo = grupos.length > 0
  const searchParams = useSearchParams()
  // Aba refletida na URL (?aba=personalizados). Manter na URL é o que faz o VOLTAR do navegador
  // (botão lateral do mouse) retornar à aba certa em vez de cair sempre na "Simulado Revisão".
  const abaUrl = searchParams.get('aba') === 'personalizados' ? 'personalizados' : 'revisao'
  const [aba, setAba] = useState<'revisao' | 'personalizados'>(abaUrl)
  // Direção da animação de deslizar ao trocar de aba (Personalizados fica à DIREITA).
  const [dir, setDir] = useState<'dir' | 'esq'>('dir')
  // Sincroniza a aba quando a URL muda (ex.: voltar do navegador para ?aba=personalizados).
  useEffect(() => { setAba(abaUrl); setDir(abaUrl === 'personalizados' ? 'dir' : 'esq') }, [abaUrl])
  // Troca a aba E grava na URL via History API (instantâneo, SEM round-trip/re-fetch do Next) — o
  // voltar do navegador retorna à aba certa. router.replace faria um fetch RSC (~1s) e criava corrida.
  const trocarAba = (id: 'revisao' | 'personalizados') => {
    setDir(id === 'personalizados' ? 'dir' : 'esq')
    setAba(id)
    const params = new URLSearchParams(searchParams.toString())
    if (id === 'personalizados') params.set('aba', 'personalizados')
    else params.delete('aba')
    const qs = params.toString()
    window.history.replaceState(null, '', qs ? `/aluno/simulados?${qs}` : '/aluno/simulados')
  }
  const [vista, setVista] = useState<'quadro' | 'catalogo'>('catalogo')
  useEffect(() => { const v = localStorage.getItem('aluno-meus-simulados-vista'); if (v === 'catalogo' || v === 'quadro') setVista(v) }, [])
  useEffect(() => { localStorage.setItem('aluno-meus-simulados-vista', vista) }, [vista])

  const catalogo = vista === 'catalogo' && temCatalogo
  const fileiras = catalogo ? grupos.map((g) => ({ g, its: itens.filter((s) => s.grupoId === g.id) })).filter((x) => x.its.length > 0) : []
  const avulsos = catalogo ? itens.filter((s) => !s.grupoId) : itens

  return (
    <div data-tour="simulados-lista" className="space-y-5">
      {/* Título + (à direita) alternador de visão — só faz sentido na aba da plataforma. */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Meus simulados</h1>
        {aba === 'revisao' && temCatalogo && (
          <div className="flex shrink-0 gap-1 rounded-lg bg-muted p-1">
            {([['quadro', 'Quadro', LayoutGrid], ['catalogo', 'Catálogo', Rows3]] as const).map(([v, label, Icon]) => (
              <button key={v} type="button" onClick={() => setVista(v)} aria-pressed={vista === v}
                className={cn('inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors',
                  vista === v ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
                <Icon className="h-4 w-4" /> <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Abas com linha embaixo: conteúdo da plataforma × simulados criados pelo próprio aluno. */}
      <div className="border-b border-border">
        <nav className="-mb-px flex gap-5" role="tablist" aria-label="Meus simulados">
          {([['revisao', 'Simulado Revisão'], ['personalizados', 'Personalizados']] as const).map(([id, label]) => (
            <button key={id} type="button" role="tab" data-tour={id === 'personalizados' ? 'aba-personalizados' : undefined} aria-selected={aba === id} onClick={() => trocarAba(id)}
              className={cn('-mb-px border-b-2 px-1 pb-2.5 text-sm font-medium transition-colors',
                aba === id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground')}>
              {label}
            </button>
          ))}
        </nav>
      </div>

      {/* Conteúdo da aba com animação de DESLIZAR (key=aba remonta → re-anima; direção pela posição). */}
      <div key={aba} className={cn('duration-300 fill-mode-both animate-in fade-in', dir === 'dir' ? 'slide-in-from-right-6' : 'slide-in-from-left-6')}>
      {aba === 'revisao' ? (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold"><CheckCircle2 className="h-4 w-4 text-emerald-500" /> Concluídos ({itens.length})</h2>
          {itens.length === 0 && (
            <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              Você ainda não concluiu nenhum simulado. Veja os disponíveis em <Link href="/aluno/simulado" className="font-medium text-primary hover:underline">Simulados</Link>.
            </div>
          )}
          <div className="space-y-4">
            {fileiras.map(({ g, its }) => (
              <FileiraHorizontal key={g.id} titulo={g.nome} count={its.length}>
                {its.map((s) => <div key={s.id} className={BASIS}><CardConcluido s={s} /></div>)}
              </FileiraHorizontal>
            ))}
            {avulsos.length > 0 && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {avulsos.map((s) => <CardConcluido key={s.id} s={s} />)}
              </div>
            )}
          </div>
        </section>
      ) : (
        <PersonalizadosLista />
      )}
      </div>
    </div>
  )
}
