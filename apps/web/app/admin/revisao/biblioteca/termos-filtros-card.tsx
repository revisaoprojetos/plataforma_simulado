'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { BarraFiltrosHorizontal, CampoFiltro, EscopoFiltroAdmin, MultiFiltro, type OpcaoMulti } from '@/components/filtros/multi-filtro'
import { ROTULO_CONF_TERMO, TIPOS_TERMO, type TipoTermo } from '@/lib/admin-revisao/questoes-termos-tipos'
import { FAIXAS_TERMO, VARIANTES_TERMO, type FacetasTermo, type FiltrosTermo } from '@/lib/admin-revisao/termos-filtros'

// CARD DE FILTROS do Unificar › Termos: o MESMO MultiFiltro do Banco (número à esquerda, acordeão, rolagem horizontal), contagens
// (nº de GRUPOS por opção) vindas do servidor. Sem cálculo aqui: este componente só renderiza o que a API devolveu.

type Dim = 'tipo' | 'confianca' | 'disciplina' | 'faixa' | 'variantes'
const ROTULO: Record<Dim, string> = { tipo: 'Tipo de termo', confianca: 'Confiança', disciplina: 'Disciplina', faixa: 'Questões envolvidas', variantes: 'Termos no grupo' }

export function TermosFiltrosCard({ tipos, onTipos, filtros, onFiltros, facetas, disciplinas, mostrarTipo }: {
  tipos: TipoTermo[]; onTipos: (t: TipoTermo[]) => void
  filtros: FiltrosTermo; onFiltros: (f: FiltrosTermo) => void
  facetas?: FacetasTermo; disciplinas: OpcaoMulti[]; mostrarTipo: boolean
}) {
  const [aberto, setAberto] = useState<Dim | null>(null)
  const opcoes: Record<Dim, OpcaoMulti[]> = {
    tipo: TIPOS_TERMO.filter((t) => t.mesclavel).map((t) => ({ v: t.id, label: t.nome })),
    confianca: (['alta', 'media', 'baixa'] as const).map((c) => ({ v: c, label: ROTULO_CONF_TERMO[c] })),
    disciplina: disciplinas,
    faixa: FAIXAS_TERMO.map((f) => ({ v: f.v, label: f.label })),
    variantes: VARIANTES_TERMO,
  }
  const sel = (d: Dim): string[] => (d === 'tipo' ? tipos : filtros[d] ?? [])
  const mudar = (d: Dim, v: string[]) => { if (d === 'tipo') onTipos(v as TipoTermo[]); else onFiltros({ ...filtros, [d]: v }) }
  const dims: Dim[] = [...(mostrarTipo ? ['tipo' as const] : []), 'confianca', 'disciplina', 'faixa', 'variantes']
  const chips = dims.flatMap((d) => sel(d).map((v) => ({ d, v, label: opcoes[d].find((o) => o.v === v)?.label ?? v })))
  const limpar = () => { onFiltros({}); if (mostrarTipo && tipos.length) onTipos([]) }

  return (
    <section className="rounded-2xl border bg-card p-3 shadow-sm" aria-label="Filtros dos termos">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Filtros</h2>
        {chips.length > 0 && <button type="button" onClick={limpar} className="text-xs font-semibold text-primary hover:underline">Limpar filtros</button>}
      </div>
      <EscopoFiltroAdmin className="space-y-2">
        <BarraFiltrosHorizontal>
          {dims.map((d) => (
            <CampoFiltro key={d} label={ROTULO[d]}>
              <MultiFiltro options={opcoes[d]} selecionados={sel(d)} onChange={(v) => mudar(d, v)} vazio={d === 'tipo' ? 'Todos os tipos' : 'Todos'}
                busca={d === 'disciplina' ? 'Buscar disciplina…' : undefined} contagens={facetas?.[d]} aberto={aberto === d} onToggle={() => setAberto(aberto === d ? null : d)} />
            </CampoFiltro>
          ))}
        </BarraFiltrosHorizontal>
        {chips.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {chips.map((c) => (
              <button key={c.d + c.v} type="button" onClick={() => mudar(c.d, sel(c.d).filter((x) => x !== c.v))} title={`${ROTULO[c.d]}: ${c.label}`}
                className="inline-flex max-w-full items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary hover:bg-primary/20">
                <span className="truncate">{c.label}</span><X className="h-3 w-3 shrink-0" />
              </button>
            ))}
          </div>
        )}
        <p className="text-[11px] text-muted-foreground">O número ao lado de cada opção é a quantidade de <b>grupos</b> candidatos que você teria ao marcá-la.</p>
      </EscopoFiltroAdmin>
    </section>
  )
}
