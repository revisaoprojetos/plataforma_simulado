'use client'

import { useEffect, useMemo, useState } from 'react'
import { Info, Loader2, SlidersHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import type { TipoMetaDef } from '@/lib/cronograma/tipos'
import { useCriar, type MetaDraft } from './criar-context'
import { Secao } from './secao'
import { dadosMetas } from './dados'

/**
 * Seção 4 — CONFERÊNCIA (read-only) das metas geradas pela Montagem (seção 3), semana a semana.
 * A edição de verdade (adicionar/editar/reordenar/meta de simulado/adicionar do banco) vive no
 * editor pós-criação `/admin/cronogramas/[id]`, que é um superconjunto. O botão "Ajustar no editor"
 * reusa o mesmo criar() da barra de ação: cria o rascunho e abre o editor completo.
 */
export function SecaoMetas({ onEditar, salvando }: { onEditar?: () => void; salvando?: boolean }) {
  const { draft } = useCriar()
  const [tipos, setTipos] = useState<TipoMetaDef[]>([])
  const [semanaAtiva, setSemanaAtiva] = useState(1)

  useEffect(() => {
    dadosMetas().then((r) => { if (r.ok) setTipos(r.tipos ?? []) })
  }, [])

  const revisao = useMemo(() => new Set(draft.semanasRevisao), [draft.semanasRevisao])
  const rotuloTipo = (slug: string) => tipos.find((t) => t.slug === slug)?.nome ?? slug
  const corTipo = (slug: string) => tipos.find((t) => t.slug === slug)?.cor || null

  const contagem = useMemo(() => {
    const m = new Map<number, number>()
    for (const x of draft.metas) m.set(x.semana, (m.get(x.semana) ?? 0) + 1)
    return m
  }, [draft.metas])

  const metasSemana = useMemo(
    () => draft.metas.filter((m) => m.semana === semanaAtiva).sort((a, b) => a.dia - b.dia || a.ordem - b.ordem),
    [draft.metas, semanaAtiva],
  )
  const porDia = useMemo(() => {
    const mapa = new Map<number, MetaDraft[]>()
    for (const m of metasSemana) {
      const l = mapa.get(m.dia)
      if (l) l.push(m)
      else mapa.set(m.dia, [m])
    }
    return [...mapa.entries()].sort((a, b) => a[0] - b[0])
  }, [metasSemana])

  const botaoEditar = onEditar && (
    <Button size="sm" onClick={onEditar} disabled={salvando} title="Cria o rascunho e abre o editor completo (editar, reordenar, meta de simulado, adicionar do banco…)">
      {salvando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <SlidersHorizontal className="mr-1 h-4 w-4" />}
      Ajustar no editor
    </Button>
  )

  return (
    <Secao
      numero={4}
      titulo="Revisão das metas"
      descricao="Confira, semana a semana, o que a Montagem gerou. Para editar, reordenar ou adicionar meta de simulado, abra o editor completo — que já traz tudo isso."
      colapsavel
      defaultAberto
      acessorio={draft.metas.length > 0 ? <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">{draft.metas.length.toLocaleString('pt-BR')} meta(s)</span> : undefined}
    >
      <div className="space-y-3">
        {draft.metas.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-8 text-center">
            <p className="max-w-md text-sm text-muted-foreground">
              Nenhuma meta ainda. Use a <strong>Montagem</strong> (seção Conteúdos) para gerar automaticamente — ou crie o rascunho e monte direto no editor completo.
            </p>
            {botaoEditar}
          </div>
        ) : (
          <>
            {/* Read-only + atalho para o editor completo. */}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2">
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Info className="h-3.5 w-3.5 shrink-0 text-primary" /> Só conferência. Edição, reordenar e meta de simulado ficam no editor completo.
              </p>
              {botaoEditar}
            </div>

            {/* Régua de semanas (navegação). */}
            <div className="flex gap-1 overflow-x-auto rounded-lg border bg-muted/20 p-1.5">
              {Array.from({ length: Math.max(1, draft.totalSemanas) }, (_, i) => i + 1).map((s) => {
                const n = contagem.get(s) ?? 0
                const ehRevisao = revisao.has(s)
                const ativa = s === semanaAtiva
                return (
                  <button
                    key={s}
                    onClick={() => setSemanaAtiva(s)}
                    title={ehRevisao ? `Semana ${s} — revisão` : `Semana ${s} — ${n} meta(s)`}
                    className={cn(
                      'relative h-7 min-w-7 shrink-0 rounded-md border px-1.5 text-xs transition',
                      ativa
                        ? 'border-primary bg-primary font-semibold text-primary-foreground'
                        : ehRevisao
                          ? 'border-dashed text-muted-foreground/70'
                          : n > 0
                            ? 'border-primary/40 bg-primary/5'
                            : 'hover:bg-muted',
                    )}
                  >
                    {s}
                    {n > 0 && !ativa && <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-primary ring-2 ring-card" />}
                  </button>
                )
              })}
            </div>

            <p className="text-sm font-semibold">
              Semana {semanaAtiva}
              {revisao.has(semanaAtiva) && <span className="ml-2 text-xs font-normal text-amber-600">revisão</span>}
            </p>

            {/* Metas da semana (read-only). */}
            {metasSemana.length === 0 ? (
              <p className="rounded-xl border border-dashed py-6 text-center text-sm text-muted-foreground">
                {revisao.has(semanaAtiva) ? 'Semana de revisão — fica sem metas.' : 'Sem metas nesta semana.'}
              </p>
            ) : (
              <div className="divide-y rounded-xl border">
                {porDia.map(([d, lista]) => (
                  <div key={d} className="px-3 py-2">
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{draft.diasNome[d] ?? `dia ${d}`}</p>
                    <div className="space-y-0.5">
                      {lista.map((m) => (
                        <div key={m.tmpId} className="flex items-center gap-2 rounded-md px-2 py-1 text-sm">
                          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: corTipo(m.tipo) ?? 'var(--muted-foreground)' }} />
                          <span className="w-16 shrink-0 truncate text-xs text-muted-foreground">{rotuloTipo(m.tipo)}</span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate">
                              {m.disciplina}
                              {m.aula && <span className="text-muted-foreground"> · aula {m.aula}</span>}
                            </p>
                            {m.conteudo && <p className="truncate text-xs text-muted-foreground">{m.conteudo}</p>}
                          </div>
                          {m.duracao && <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{m.duracao}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </Secao>
  )
}
