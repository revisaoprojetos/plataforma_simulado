'use client'

import { useEffect, useMemo, useState } from 'react'
import { LayoutGrid, Rows3 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CardSimulado } from '@/components/aluno/card-simulado'
import { FileiraHorizontal } from '@/components/fileira-horizontal'
import type { ItemSimulado } from '@/lib/aluno/simulado-item'

export type ItemSimuladoCat = ItemSimulado & { grupoId: string | null }
type Grupo = { id: string; nome: string }

// Mesmas seções semânticas do aluno (por estado), não por status de vida do simulado.
const SECOES = [
  { chave: 'agendados', titulo: 'Agendados', cor: 'bg-amber-500', vazio: 'Nenhum simulado agendado' },
  { chave: 'disponiveis', titulo: 'Disponíveis', cor: 'bg-emerald-500', vazio: 'Nenhum simulado disponível no momento' },
  { chave: 'refazer', titulo: 'Já concluídos', cor: 'bg-sky-500', vazio: 'Nenhum concluído ainda' },
] as const

function bucketDe(i: ItemSimuladoCat): 'agendados' | 'disponiveis' | 'refazer' {
  if (i.emAndamento) return i.modo_aplicacao === 'janela_fixa' ? 'agendados' : 'disponiveis'
  if (i.refazer) return 'refazer'
  return i.modo_aplicacao === 'janela_fixa' ? 'agendados' : 'disponiveis'
}

// Cards um pouco mais estreitos para espiar um pedaço do próximo na fileira do catálogo.
const BASIS = 'shrink-0 basis-[calc((100%-1rem)/2.25)] sm:basis-[calc((100%-2rem)/3.3)] lg:basis-[calc((100%-3rem)/4.3)] xl:basis-[calc((100%-4rem)/5.3)]'

/**
 * Lista de simulados do aluno com dois modos: "Quadro" (grade por seção) e "Catálogo" (fileiras
 * horizontais por grupo/pasta do banco, estilo Netflix). Catálogo é o padrão quando há grupos.
 */
export function SimuladosCatalogoAluno({ itens, grupos }: { itens: ItemSimuladoCat[]; grupos: Grupo[] }) {
  const temCatalogo = grupos.length > 0
  const [vista, setVista] = useState<'quadro' | 'catalogo'>('catalogo')
  useEffect(() => { const v = localStorage.getItem('aluno-simulados-vista'); if (v === 'catalogo' || v === 'quadro') setVista(v) }, [])
  useEffect(() => { localStorage.setItem('aluno-simulados-vista', vista) }, [vista])

  const buckets = useMemo(() => {
    const b: Record<string, ItemSimuladoCat[]> = { agendados: [], disponiveis: [], refazer: [] }
    for (const i of itens) b[bucketDe(i)].push(i)
    return b
  }, [itens])

  const catalogo = vista === 'catalogo' && temCatalogo

  return (
    <div className="space-y-6">
      {temCatalogo && (
        <div className="flex justify-end">
          <div className="flex gap-1 rounded-lg bg-muted p-1">
            {([['quadro', 'Quadro', LayoutGrid], ['catalogo', 'Catálogo', Rows3]] as const).map(([v, label, Icon]) => (
              <button key={v} type="button" onClick={() => setVista(v)} aria-pressed={vista === v}
                className={cn('inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-sm font-medium transition-colors',
                  vista === v ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
                <Icon className="h-4 w-4" /> {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {SECOES.map((sec) => {
        const arr = buckets[sec.chave]
        // No catálogo: uma fileira por grupo (com itens neste bucket) + grid para os sem grupo.
        const fileiras = catalogo ? grupos.map((g) => ({ g, its: arr.filter((s) => s.grupoId === g.id) })).filter((x) => x.its.length > 0) : []
        const avulsos = catalogo ? arr.filter((s) => !s.grupoId) : arr
        return (
          <section key={sec.chave} className="space-y-3">
            <div className="flex items-center gap-2">
              <span className={cn('h-2.5 w-2.5 rounded-full', sec.cor)} />
              <h2 className="font-semibold">{sec.titulo}</h2>
              <span className="text-sm text-muted-foreground">({arr.length})</span>
            </div>
            {arr.length === 0 ? (
              <p className="text-sm italic text-muted-foreground">{sec.vazio}</p>
            ) : (
              <div className="space-y-4">
                {fileiras.map(({ g, its }) => (
                  <FileiraHorizontal key={g.id} titulo={g.nome} count={its.length}>
                    {its.map((s) => <div key={s.id} className={BASIS}><CardSimulado s={s} /></div>)}
                  </FileiraHorizontal>
                ))}
                {avulsos.length > 0 && (
                  <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                    {avulsos.map((s) => <CardSimulado key={s.id} s={s} />)}
                  </div>
                )}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}
