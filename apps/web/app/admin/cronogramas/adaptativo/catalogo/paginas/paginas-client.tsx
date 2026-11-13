'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Loader2, RefreshCw, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { listarDivergenciaPaginas, recontarPaginasAction, type PaginaDivergencia } from '../../paginas-actions'

const fmtMin = (m: number) => `${m > 0 ? '+' : ''}${m} min`

export function PaginasClient({ inicial }: { inicial: PaginaDivergencia }) {
  const [d, setD] = useState<PaginaDivergencia>(inicial)
  const [minPct, setMinPct] = useState(10)
  const [q, setQ] = useState('')
  const [pend, start] = useTransition()
  const [ocupado, setOcupado] = useState<string | null>(null)

  function carregar(pagina: number, mp = minPct, busca = q) {
    start(async () => { setD(await listarDivergenciaPaginas({ pagina, porPagina: d.porPagina, minPct: mp, q: busca })) })
  }
  async function recontar(chave: string, input: { documentoId?: string; pastaId?: string }) {
    setOcupado(chave)
    const r = await recontarPaginasAction(input)
    setOcupado(null)
    if (!r.ok) { toast.error(r.error || 'Falha ao recontar.'); return }
    toast.success(`${r.recontados} documento(s) recontado(s)${r.falhas ? `, ${r.falhas} sem contagem` : ''}${r.restantes ? `, ${r.restantes} ficaram para a próxima rodada` : ''}.`)
    carregar(d.pagina)
  }
  const totalPag = Math.max(1, Math.ceil(d.total / d.porPagina))

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-2xl border bg-card px-4 py-2.5 text-sm">
        <span><b className="tabular-nums">{d.resumo.comparadas}</b> <span className="text-muted-foreground">aulas comparadas</span></span>
        <span><b className="tabular-nums">{d.resumo.divergentes}</b> <span className="text-muted-foreground">divergentes (≥ {minPct}%)</span></span>
        <span><b className="tabular-nums">{d.resumo.semContagem}</b> <span className="text-muted-foreground">sem contagem na Biblioteca</span></span>
        <span><b className="tabular-nums">{fmtMin(d.resumo.impactoTotalMin)}</b> <span className="text-muted-foreground">impacto estimado nas linhas filtradas</span></span>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-xs text-muted-foreground">Diferença mínima (%)
          <input type="number" min={0} max={1000} value={minPct} onChange={(e) => setMinPct(Math.max(0, Number(e.target.value) || 0))}
            onBlur={() => carregar(1)} className="block h-9 w-24 rounded-md border bg-background px-2 text-sm text-foreground tabular-nums" />
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">Buscar
          <span className="relative block">
            <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') carregar(1) }}
              placeholder="Disciplina, aula ou tema" className="block h-9 w-64 rounded-md border bg-background pl-8 pr-2 text-sm text-foreground" />
          </span>
        </label>
        {pend && <Loader2 className="mb-2 h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      {!d.ok && <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{d.error}</div>}

      <div className="overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="px-3 py-2 font-medium">Aula</th>
              <th className="px-3 py-2 text-right font-medium">Planilha</th>
              <th className="px-3 py-2 text-right font-medium">Real</th>
              <th className="px-3 py-2 text-right font-medium">Diferença</th>
              <th className="px-3 py-2 text-right font-medium">Impacto</th>
              <th className="px-3 py-2 text-right font-medium">Recontar</th>
            </tr>
          </thead>
          <tbody>
            {d.linhas.length === 0 && <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">Nenhuma aula acima da diferença mínima.</td></tr>}
            {d.linhas.map((l) => (
              <tr key={l.documentoId} className="border-b last:border-0">
                <td className="px-3 py-2"><span className="font-medium">{l.disciplina}</span> · aula {l.numero} · <span className="text-muted-foreground">{l.tema}</span></td>
                <td className="px-3 py-2 text-right tabular-nums">{l.planilha}</td>
                <td className="px-3 py-2 text-right tabular-nums">{l.real}{l.paginaInicial > 1 && <span className="ml-1 text-[11px] text-muted-foreground">({l.total} − {l.paginaInicial - 1})</span>}</td>
                <td className={cn('px-3 py-2 text-right tabular-nums font-medium', l.difPct > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-primary')}>{l.difPct > 0 ? '+' : ''}{l.difPct.toLocaleString('pt-BR')}%</td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{fmtMin(l.impactoMin)}</td>
                <td className="px-3 py-2 text-right">
                  <span className="inline-flex gap-1">
                    <button type="button" disabled={!!ocupado} onClick={() => recontar(l.documentoId, { documentoId: l.documentoId })}
                      className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50">
                      {ocupado === l.documentoId ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Documento
                    </button>
                    {l.pastaId && (
                      <button type="button" disabled={!!ocupado} onClick={() => recontar('p' + l.pastaId, { pastaId: l.pastaId! })}
                        className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50">
                        {ocupado === 'p' + l.pastaId ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Pasta
                      </button>
                    )}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{d.total} aula(s) · página {d.pagina} de {totalPag}</span>
        <span className="flex gap-2">
          <button type="button" disabled={pend || d.pagina <= 1} onClick={() => carregar(d.pagina - 1)} className="rounded-md border px-3 py-1 hover:bg-muted disabled:opacity-50">Anterior</button>
          <button type="button" disabled={pend || d.pagina >= totalPag} onClick={() => carregar(d.pagina + 1)} className="rounded-md border px-3 py-1 hover:bg-muted disabled:opacity-50">Próxima</button>
        </span>
      </div>
    </div>
  )
}
