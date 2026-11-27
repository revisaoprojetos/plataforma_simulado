'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { BarraFiltrosHorizontal, CampoFiltro, EscopoFiltroAdmin, MultiFiltro, type OpcaoMulti } from '@/components/filtros/multi-filtro'
import { ROTULO_NIVEL_DUP } from '@/lib/admin-revisao/biblioteca-questoes-gestao-tipos'
import { DIMS_U, ROTULO_DIM_U, ROTULO_GAB_U, ROTULO_STATUS_U, ROTULO_USO_U, type DimU, type FacetasContU, type ListasU, type RespostaGruposU } from '@/lib/admin-revisao/questoes-unificar-tipos'

// FILTROS do Unificar › Questões duplicadas: o MESMO MultiFiltro do Banco/Termos (multi-seleção, acordeão, número à esquerda), com a
// contagem de GRUPOS por opção vinda do servidor. Sem cálculo aqui: só renderiza o que a API devolveu.
const NIVEIS = ['identica', 'codigo', 'enunciado', 'semelhante'] as const

export function DuplicadasFiltrosCard({ valor, onChange, facetas, contagens }: {
  valor: ListasU; onChange: (v: ListasU) => void; facetas?: RespostaGruposU['facetas']; contagens?: FacetasContU
}) {
  const [aberto, setAberto] = useState<DimU | null>(null)
  const dePares = (l?: { id: string; nome: string }[]): OpcaoMulti[] => (l ?? []).map((x) => ({ v: x.id, label: x.nome }))
  const opcoes: Record<DimU, OpcaoMulti[]> = {
    nivel: NIVEIS.map((n) => ({ v: n, label: ROTULO_NIVEL_DUP[n] })),
    uso: Object.entries(ROTULO_USO_U).map(([v, label]) => ({ v, label })),
    gabarito: Object.entries(ROTULO_GAB_U).map(([v, label]) => ({ v, label })),
    disciplina: dePares(facetas?.disciplinas), banca: dePares(facetas?.bancas), ano: dePares(facetas?.anos),
    status: Object.entries(ROTULO_STATUS_U).map(([v, label]) => ({ v, label })),
  }
  const chips = DIMS_U.flatMap((d) => valor[d].map((v) => ({ d, v, label: opcoes[d].find((o) => o.v === v)?.label ?? v })))
  const mudar = (d: DimU, v: string[]) => onChange({ ...valor, [d]: v })
  return (
    <EscopoFiltroAdmin className="space-y-2">
      <BarraFiltrosHorizontal>
        {DIMS_U.map((d) => (
          <CampoFiltro key={d} label={ROTULO_DIM_U[d]}>
            <MultiFiltro options={opcoes[d]} selecionados={valor[d]} onChange={(v) => mudar(d, v)} vazio="Todos"
              busca={d === 'disciplina' || d === 'banca' ? `Buscar ${ROTULO_DIM_U[d].toLowerCase()}…` : undefined} contagens={contagens?.[d]} aberto={aberto === d} onToggle={() => setAberto(aberto === d ? null : d)} />
          </CampoFiltro>
        ))}
      </BarraFiltrosHorizontal>
      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map((c) => (
            <button key={c.d + c.v} type="button" onClick={() => mudar(c.d, valor[c.d].filter((x) => x !== c.v))} title={`${ROTULO_DIM_U[c.d]}: ${c.label}`}
              className="inline-flex max-w-full items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary hover:bg-primary/20">
              <span className="truncate">{c.label}</span><X className="h-3 w-3 shrink-0" />
            </button>
          ))}
          <button type="button" onClick={() => onChange({ ...valor, nivel: [], uso: [], gabarito: [], disciplina: [], banca: [], ano: [], status: [] })} className="text-[11px] font-semibold text-primary hover:underline">Limpar filtros</button>
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">O número ao lado de cada opção é a quantidade de <b>grupos</b> que você teria ao marcá-la.</p>
    </EscopoFiltroAdmin>
  )
}
