'use client'

import { BookOpen, Shield, Calendar, Target, Timer, Layers, ChevronUp, ChevronDown, X, Plus, GripVertical } from 'lucide-react'
import { rotuloCriterio, type CriteriosRanking, type Criterio, type TipoCriterio } from '@/lib/simulado/ranking'

type Grupo = { id: string; nome: string; count: number }
const TONS = ['bg-blue-50 dark:bg-blue-950/40', 'bg-violet-50 dark:bg-violet-950/40', 'bg-rose-50 dark:bg-rose-950/40', 'bg-emerald-50 dark:bg-emerald-950/40', 'bg-amber-50 dark:bg-amber-950/40']
const BARRAS = ['bg-blue-500', 'bg-violet-500', 'bg-rose-500', 'bg-emerald-500', 'bg-amber-500']

const META: Record<TipoCriterio, { rotulo: string; desc: string; icon: React.ReactNode; cor: string }> = {
  passaporte: { rotulo: 'Passaporte', desc: 'Quem tem classificação passaporte fica à frente.', icon: <Shield className="h-4 w-4" />, cor: 'bg-violet-100 text-violet-600 dark:bg-violet-950/50' },
  grupo: { rotulo: 'Grupo de questões', desc: 'Quem acertou mais no grupo escolhido fica à frente.', icon: <Layers className="h-4 w-4" />, cor: 'bg-blue-100 text-blue-600 dark:bg-blue-950/50' },
  acertos: { rotulo: 'Mais acertos', desc: 'Quem tem mais acertos no total fica à frente.', icon: <Target className="h-4 w-4" />, cor: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/50' },
  tempo: { rotulo: 'Menor tempo', desc: 'Quem concluiu a prova em menos tempo fica à frente.', icon: <Timer className="h-4 w-4" />, cor: 'bg-amber-100 text-amber-600 dark:bg-amber-950/50' },
  idade: { rotulo: 'Idade', desc: 'O aluno mais velho fica à frente.', icon: <Calendar className="h-4 w-4" />, cor: 'bg-rose-100 text-rose-600 dark:bg-rose-950/50' },
}
const TIPOS_ADD: TipoCriterio[] = ['passaporte', 'grupo', 'acertos', 'tempo', 'idade']

function novoId() {
  try { if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID() } catch { /* ignore */ }
  return 'c' + Math.random().toString(36).slice(2, 10)
}

export function CriteriosForm({ grupos, totalQuestoes, criterios: c, onChange }: {
  grupos: Grupo[]; totalQuestoes: number; criterios: CriteriosRanking; onChange: (c: CriteriosRanking) => void
}) {
  const lista = c.criterios ?? []
  const set = (criterios: Criterio[]) => onChange({ criterios })
  const add = (tipo: TipoCriterio) => set([...lista, { id: novoId(), tipo, ...(tipo === 'grupo' ? { grupoId: null } : {}) }])
  const remover = (id: string) => set(lista.filter((x) => x.id !== id))
  const mover = (i: number, dir: -1 | 1) => { const j = i + dir; if (j < 0 || j >= lista.length) return; const n = [...lista]; [n[i], n[j]] = [n[j], n[i]]; set(n) }
  const setGrupo = (id: string, grupoId: string | null) => set(lista.map((x) => (x.id === id ? { ...x, grupoId } : x)))
  const nomeGrupo = (id: string) => grupos.find((g) => g.id === id)?.nome

  return (
    <div className="space-y-3">
      {/* Grupos do banco (referência) */}
      <div className="rounded-2xl border bg-card p-4">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted"><BookOpen className="h-4 w-4" /></span>
            <div>
              <h3 className="text-sm font-semibold">Grupos de Questões</h3>
              <p className="text-xs text-muted-foreground">Vêm dos grupos de disciplinas do banco deste simulado.</p>
            </div>
          </div>
          <span className="rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground">{totalQuestoes} questões no total</span>
        </div>
        {grupos.length === 0 ? (
          <p className="rounded-lg border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">Nenhum grupo definido. Configure os grupos de disciplinas no banco de questões.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {grupos.map((g, i) => {
              const pct = totalQuestoes ? Math.round((g.count / totalQuestoes) * 100) : 0
              return (
                <div key={g.id} className={`rounded-xl p-3 ${TONS[i % TONS.length]}`}>
                  <div className="flex items-center justify-between"><span className="text-sm font-semibold uppercase">{g.nome}</span><span className="text-2xl font-bold tabular-nums">{g.count}</span></div>
                  <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground"><span>{g.count} questões</span><span>{pct}% do total</span></div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-black/10"><div className={`h-full rounded-full ${BARRAS[i % BARRAS.length]}`} style={{ width: `${pct}%` }} /></div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Lista de critérios de desempate */}
      <div className="rounded-2xl border bg-card p-4">
        <div className="mb-1 flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><Target className="h-4 w-4" /></span>
          <div>
            <h3 className="text-sm font-semibold">Critérios de desempate</h3>
            <p className="text-xs text-muted-foreground">Aplicados <strong>na ordem abaixo</strong>, só quando a pontuação empata. Adicione quantos quiser e arraste com as setas.</p>
          </div>
        </div>

        {lista.length === 0 ? (
          <p className="my-3 rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">Nenhum critério — em caso de empate na pontuação, a ordem fica indefinida. Adicione um critério abaixo.</p>
        ) : (
          <ol className="my-3 space-y-2">
            {lista.map((cr, i) => {
              const meta = META[cr.tipo]
              return (
                <li key={cr.id} className="flex items-center gap-3 rounded-xl border bg-background p-2.5">
                  <div className="flex flex-col text-muted-foreground">
                    <button type="button" onClick={() => mover(i, -1)} disabled={i === 0} className="rounded p-0.5 hover:bg-muted disabled:opacity-30"><ChevronUp className="h-3.5 w-3.5" /></button>
                    <button type="button" onClick={() => mover(i, 1)} disabled={i === lista.length - 1} className="rounded p-0.5 hover:bg-muted disabled:opacity-30"><ChevronDown className="h-3.5 w-3.5" /></button>
                  </div>
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold tabular-nums">{i + 1}º</span>
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${meta.cor}`}>{meta.icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{meta.rotulo}</div>
                    <div className="truncate text-xs text-muted-foreground">{meta.desc}</div>
                  </div>
                  {cr.tipo === 'grupo' && (
                    <select value={cr.grupoId ?? ''} onChange={(e) => setGrupo(cr.id, e.target.value || null)}
                      className="w-40 shrink-0 rounded-lg border bg-[var(--input-bg,transparent)] px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring">
                      <option value="">Selecionar grupo</option>
                      {grupos.map((g) => <option key={g.id} value={g.id}>{g.nome}</option>)}
                    </select>
                  )}
                  <button type="button" onClick={() => remover(cr.id)} className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" title="Remover critério"><X className="h-4 w-4" /></button>
                </li>
              )
            })}
          </ol>
        )}

        {/* Adicionar critério */}
        <div className="flex flex-wrap items-center gap-2 border-t pt-3">
          <span className="text-xs font-medium text-muted-foreground">Adicionar critério:</span>
          {TIPOS_ADD.map((t) => (
            <button key={t} type="button" onClick={() => add(t)}
              className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium hover:bg-muted">
              <Plus className="h-3.5 w-3.5" /> {META[t].rotulo}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-2xl border bg-muted/40 p-3 text-xs text-muted-foreground">
        <GripVertical className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <p>
          Ordem de desempate: <strong>Pontuação</strong>
          {lista.map((cr, i) => <span key={cr.id}> → <span className="text-foreground">{i + 1}º {rotuloCriterio(cr, nomeGrupo)}</span></span>)}
          . Salvo automaticamente por simulado.
        </p>
      </div>
    </div>
  )
}
