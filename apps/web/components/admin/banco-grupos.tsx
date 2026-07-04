'use client'

import { useEffect, useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { salvarGruposBanco, type GrupoBanco } from '@/app/admin/banco-questoes/actions'
import { confirmar } from '@/components/ui/confirm-dialog'
import { Plus, Trash2, Loader2, Layers, Check, PencilLine, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

const CORES = ['#4f7fff', '#8b5cf6', '#ef4444', '#10b981', '#f59e0b', '#ec4899', '#06b6d4', '#84cc16']
const ROMANOS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']

export function BancoGrupos({ bancoId, disciplinas, gruposIniciais }: { bancoId: string; disciplinas: string[]; gruposIniciais: GrupoBanco[] }) {
  const [grupos, setGrupos] = useState<GrupoBanco[]>(gruposIniciais)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'erro'>('idle')
  const primeira = useRef(true)

  // Salva automaticamente (debounce) a cada alteração dos grupos.
  useEffect(() => {
    if (primeira.current) { primeira.current = false; return }
    setStatus('saving')
    const t = setTimeout(async () => {
      const r = await salvarGruposBanco(bancoId, grupos.map((g) => ({ ...g, nome: g.nome.trim() || 'Grupo' })))
      setStatus(r.ok ? 'saved' : 'erro')
    }, 600)
    return () => clearTimeout(t)
  }, [grupos, bancoId])

  const grupoDaDisc = (d: string) => grupos.find((g) => g.disciplinas.includes(d)) ?? null
  const semGrupo = disciplinas.filter((d) => !grupoDaDisc(d))

  function addGrupo() {
    setGrupos((gs) => [...gs, { id: crypto.randomUUID(), nome: `Grupo ${ROMANOS[gs.length] ?? gs.length + 1}`, disciplinas: [] }])
  }
  function renomear(id: string, nome: string) { setGrupos((gs) => gs.map((g) => (g.id === id ? { ...g, nome } : g))) }
  async function excluir(id: string) {
    const g = grupos.find((x) => x.id === id)
    if (g?.disciplinas.length && !(await confirmar({ mensagem: `Excluir "${g.nome}"? As disciplinas voltam para "sem grupo".`, destrutivo: true }))) return
    setGrupos((gs) => gs.filter((x) => x.id !== id))
  }
  // Move a disciplina para este grupo (exclusivo) — ou remove se já estiver nele.
  function toggleDisc(grupoId: string, disc: string) {
    setGrupos((gs) => gs.map((g) => {
      if (g.id === grupoId) {
        const tem = g.disciplinas.includes(disc)
        return { ...g, disciplinas: tem ? g.disciplinas.filter((d) => d !== disc) : [...g.disciplinas, disc] }
      }
      return { ...g, disciplinas: g.disciplinas.filter((d) => d !== disc) }
    }))
  }
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <div>
          <CardTitle className="text-base">Grupos de disciplinas</CardTitle>
          <p className="mt-0.5 text-xs text-muted-foreground">Agrupe as disciplinas do banco (ex.: Grupo I, II, III) — cada disciplina fica em um grupo. As alterações são salvas automaticamente.</p>
        </div>
        <div className="flex items-center gap-3">
          {status === 'saving' && <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Salvando…</span>}
          {status === 'saved' && <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400"><Check className="h-3.5 w-3.5" /> Salvo</span>}
          {status === 'erro' && <span className="inline-flex items-center gap-1 text-xs text-destructive"><AlertTriangle className="h-3.5 w-3.5" /> Não salvo</span>}
          <button type="button" onClick={addGrupo} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors hover:border-primary hover:text-primary"><Plus className="h-4 w-4" /> Grupo</button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {disciplinas.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">O banco não tem disciplinas ainda.</p>
        ) : grupos.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <Layers className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">Nenhum grupo criado. Clique em <b>Grupo</b> para começar.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {grupos.map((g, i) => {
              const cor = CORES[i % CORES.length]
              return (
                <div key={g.id} className="rounded-xl border p-3" style={{ borderColor: `${cor}55` }}>
                  <div className="mb-2 flex items-center gap-2">
                    <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: cor }} />
                    <label className="group flex min-w-0 flex-1 cursor-text items-center gap-1.5 rounded-md border border-transparent px-2 py-1 transition-colors hover:border-border hover:bg-muted/60 focus-within:border-primary focus-within:bg-muted focus-within:ring-1 focus-within:ring-ring" title="Renomear grupo">
                      <input value={g.nome} onChange={(e) => renomear(g.id, e.target.value)} placeholder="Nome do grupo"
                        className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none placeholder:font-normal placeholder:text-muted-foreground" />
                      <PencilLine className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50 transition-colors group-hover:text-primary group-focus-within:text-primary" />
                    </label>
                    <span className="shrink-0 text-[11px] text-muted-foreground">{g.disciplinas.length} disc.</span>
                    <button type="button" onClick={() => excluir(g.id)} title="Excluir grupo" className="shrink-0 rounded-md p-1 text-destructive transition-colors hover:bg-destructive/10"><Trash2 className="h-4 w-4" /></button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {disciplinas.map((d) => {
                      const noGrupo = g.disciplinas.includes(d)
                      const emOutro = !noGrupo && !!grupoDaDisc(d)
                      return (
                        <button key={d} type="button" onClick={() => toggleDisc(g.id, d)} title={emOutro ? 'Está em outro grupo — clique para mover' : undefined}
                          className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-all',
                            noGrupo ? 'font-medium text-white' : emOutro ? 'border-dashed text-muted-foreground/40 hover:text-foreground' : 'text-muted-foreground hover:border-primary hover:text-foreground')}
                          style={noGrupo ? { background: cor, borderColor: cor } : undefined}>
                          {noGrupo && <Check className="h-3 w-3" />} {d}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}
        {grupos.length > 0 && semGrupo.length > 0 && (
          <div className="rounded-lg border border-dashed p-3">
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Sem grupo ({semGrupo.length})</p>
            <div className="flex flex-wrap gap-1.5">{semGrupo.map((d) => <span key={d} className="rounded-full border bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground">{d}</span>)}</div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
