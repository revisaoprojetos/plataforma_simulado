'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { BarraFiltrosHorizontal, CampoFiltro, EscopoFiltroAdmin, MultiFiltro, type OpcaoMulti } from '@/components/filtros/multi-filtro'
import { cn } from '@/lib/utils'

// CARD DE FILTROS GENÉRICO das telas de gestão (Etiquetas, Classificação › cadastro, Disciplinas): o MESMO MultiFiltro do Banco/Termos
// (multi-seleção, acordeão, número à esquerda, chips por valor). Só renderiza: opções e contagens vêm prontas do servidor.
export interface DimFiltro { id: string; rotulo: string; opcoes: OpcaoMulti[]; valor: string[]; contagens?: Record<string, number>; busca?: string; vazio?: string }

export function FiltrosMultiCard({ titulo = 'Filtros', dims, onChange, onLimpar, nota, rotulo, className }: {
  titulo?: string; dims: DimFiltro[]; onChange: (id: string, v: string[]) => void; onLimpar: () => void; nota?: string; rotulo: string; className?: string
}) {
  const [aberto, setAberto] = useState<string | null>(null)
  const chips = dims.flatMap((d) => d.valor.map((v) => ({ d, v, label: d.opcoes.find((o) => o.v === v)?.label ?? v })))
  return (
    <section className={cn('rounded-2xl border bg-card p-3 shadow-sm', className)} aria-label={rotulo}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</h2>
        {chips.length > 0 && <button type="button" onClick={onLimpar} className="text-xs font-semibold text-primary hover:underline">Limpar filtros</button>}
      </div>
      <EscopoFiltroAdmin className="space-y-2">
        <BarraFiltrosHorizontal>
          {dims.map((d) => (
            <CampoFiltro key={d.id} label={d.rotulo}>
              <MultiFiltro options={d.opcoes} selecionados={d.valor} onChange={(v) => onChange(d.id, v)} vazio={d.vazio ?? 'Todos'} busca={d.busca}
                contagens={d.contagens} aberto={aberto === d.id} onToggle={() => setAberto(aberto === d.id ? null : d.id)} />
            </CampoFiltro>
          ))}
        </BarraFiltrosHorizontal>
        {chips.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {chips.map((c) => (
              <button key={c.d.id + c.v} type="button" onClick={() => onChange(c.d.id, c.d.valor.filter((x) => x !== c.v))} title={`${c.d.rotulo}: ${c.label}`}
                className="inline-flex max-w-full items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary hover:bg-primary/20">
                <span className="truncate">{c.label}</span><X className="h-3 w-3 shrink-0" />
              </button>
            ))}
          </div>
        )}
        {nota && <p className="text-[11px] text-muted-foreground">{nota}</p>}
      </EscopoFiltroAdmin>
    </section>
  )
}
