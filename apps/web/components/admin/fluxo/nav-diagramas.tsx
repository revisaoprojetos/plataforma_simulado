'use client'

// SELETOR DE DIAGRAMAS (menu lateral compacto, agrupado). Em telas estreitas vira um <select>. No modo construir, cria/renomeia/exclui diagramas do usuário.
import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, ListTree, Pencil, Plus, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DiagramaFluxo } from '@/lib/admin/fluxo/adaptador'

const btn = 'inline-flex h-7 items-center gap-1 rounded-md border bg-card px-2 text-[11px] font-medium hover:bg-muted disabled:opacity-50'
const inputCls = 'h-8 w-full rounded-lg border border-input bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring'

/** Agrupa preservando a ordem; diagramas do usuário vão para “Meus diagramas”. */
export function agruparDiagramas(ds: readonly DiagramaFluxo[]): Array<{ grupo: string; itens: DiagramaFluxo[] }> {
  const m = new Map<string, DiagramaFluxo[]>()
  for (const d of ds) { const g = d.origem === 'usuario' ? 'Meus diagramas' : d.grupo ?? ''; m.set(g, [...(m.get(g) ?? []), d]) }
  const ordem = ['Fluxograma principal', 'Árvores de decisão', 'Precedência']
  const peso = (g: string) => (g === 'Meus diagramas' ? 999 : ordem.includes(g) ? ordem.indexOf(g) : 100)
  return [...m.entries()].sort((a, b) => peso(a[0]) - peso(b[0])).map(([grupo, itens]) => ({ grupo, itens }))
}

export interface NavDiagramasProps {
  diagramas: readonly DiagramaFluxo[]
  atualId: string
  marcados: ReadonlySet<string>
  onSelecionar: (id: string) => void
  construir: boolean
  onNovo: (titulo: string) => void
  onRenomear: (titulo: string) => void
  onExcluir: () => void
  /** nº de avisos/erros por diagrama (da verificação). */
  alertas?: Readonly<Record<string, number>>
  recolhido?: boolean
  onRecolher?: () => void
}

export function NavDiagramas({ diagramas, atualId, marcados, onSelecionar, construir, onNovo, onRenomear, onExcluir, alertas, recolhido, onRecolher }: NavDiagramasProps) {
  const [nome, setNome] = useState('')
  const grupos = useMemo(() => agruparDiagramas(diagramas), [diagramas])
  const atual = diagramas.find((d) => d.id === atualId)
  const destacados = (d: DiagramaFluxo) => d.nos.filter((n) => marcados.has(n.id)).length
  return (
    <nav className={cn('flex shrink-0 flex-col gap-2 transition-[width] duration-200 lg:overflow-y-auto lg:rounded-xl lg:border lg:bg-card lg:p-2', recolhido ? 'lg:w-11' : 'lg:w-60')} aria-label="Diagramas">
      <button type="button" onClick={onRecolher} className="hidden h-7 items-center gap-1.5 rounded-md px-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground hover:bg-muted lg:flex" aria-label={recolhido ? 'Expandir lista de diagramas' : 'Recolher lista de diagramas'} aria-expanded={!recolhido}>
        <ListTree className="h-4 w-4 shrink-0" />{!recolhido && <span className="flex-1 text-left">Diagramas</span>}{recolhido ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
      </button>
      {/* estreito: dropdown */}
      <select className={cn(inputCls, 'lg:hidden')} value={atualId} onChange={(e) => onSelecionar(e.target.value)} aria-label="Diagrama">
        {grupos.map((g) => (
          <optgroup key={g.grupo || 'geral'} label={g.grupo || 'Diagramas'}>
            {g.itens.map((d) => <option key={d.id} value={d.id}>{d.titulo}</option>)}
          </optgroup>
        ))}
      </select>
      {/* largo: lista lateral */}
      <div className={cn('hidden flex-col gap-3', recolhido ? 'lg:hidden' : 'lg:flex')}>
        {grupos.map((g) => (
          <div key={g.grupo || 'geral'} className="space-y-0.5">
            <p className="px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{g.grupo || 'Diagramas'}</p>
            {g.itens.map((d) => {
              const on = d.id === atualId, n = destacados(d)
              return (
                <button key={d.id} type="button" onClick={() => onSelecionar(d.id)} aria-current={on ? 'page' : undefined} title={d.resumo}
                  className={cn('flex w-full items-center gap-2 rounded-md border-l-2 px-2 py-1.5 text-left text-[13px] leading-tight transition-colors',
                    on ? 'border-primary bg-muted font-bold text-foreground' : 'border-transparent font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground')}>
                  <span className="min-w-0 flex-1 line-clamp-2">{d.titulo}</span>
                  {n > 0 && <span className="shrink-0 text-[11px] tabular-nums text-primary" title="nós destacados pela simulação">{n}</span>}
                  {(alertas?.[d.id] ?? 0) > 0 && <span className="shrink-0 rounded-full bg-amber-500/20 px-1.5 text-[10px] font-bold tabular-nums text-amber-700 dark:text-amber-400" title="avisos/erros">{alertas?.[d.id]}</span>}
                  <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground" title="nós">{d.nos.length}</span>
                </button>
              )
            })}
          </div>
        ))}
      </div>
      {construir && !recolhido && (
        <div className="space-y-1.5 border-t pt-2">
          <input className={inputCls} value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} placeholder="Nome do diagrama" aria-label="Nome do diagrama" />
          <div className="flex flex-wrap gap-1.5">
            <button type="button" className={btn} disabled={!nome.trim()} onClick={() => { onNovo(nome); setNome('') }}><Plus className="h-3 w-3" />Novo</button>
            {atual?.origem === 'usuario' && (
              <>
                <button type="button" className={btn} disabled={!nome.trim()} onClick={() => { onRenomear(nome); setNome('') }}><Pencil className="h-3 w-3" />Renomear</button>
                <button type="button" className={cn(btn, 'text-destructive')} onClick={onExcluir}><Trash2 className="h-3 w-3" />Excluir</button>
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  )
}
