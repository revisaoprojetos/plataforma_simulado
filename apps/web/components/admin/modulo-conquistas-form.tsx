'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Trophy, Trash2, Plus, Save } from 'lucide-react'
import { ICONE_OPCOES, corConquista } from '@/lib/gamificacao/icones'
import { ConquistaIconeFx } from '@/components/gamificacao/conquista-icone'
import { salvarConquistasModulo } from '@/app/admin/leitura/actions'
import { conquistaModuloNova, CONDICAO_LABEL, CONDICAO_TIPOS, usaMeta, usaAula, type ModuloConquistaDef, type CarimboCondicaoTipo } from '@/lib/leitura/carimbos-tipos'
import type { AulaOpcao } from '@/components/admin/modulo-medalhas-form'
import { AulasAlvo } from '@/components/admin/modulo-carimbos-form'

/**
 * Sub-aba "Conquistas" do módulo: conquistas PRÓPRIAS do módulo (ícone + condição de progresso).
 * O aluno ganha ao cumprir a condição; entram na coleção de conquistas dele e aparecem na área de
 * gamificação com etiqueta da origem. Salva tudo de uma vez.
 */
export function ModuloConquistasForm({ pastaId, inicial, aulas = [] }: { pastaId: string; inicial: ModuloConquistaDef[]; aulas?: AulaOpcao[] }) {
  const [lista, setLista] = useState<ModuloConquistaDef[]>(inicial)
  const [salvando, setSalvando] = useState(false)

  const patch = (id: string, p: Partial<ModuloConquistaDef>) => setLista((l) => l.map((c) => (c.id === id ? { ...c, ...p } : c)))
  const remover = (id: string) => setLista((l) => l.filter((c) => c.id !== id))
  const add = () => setLista((l) => [...l, conquistaModuloNova()])

  async function salvar() {
    setSalvando(true)
    const r = await salvarConquistasModulo(pastaId, lista)
    setSalvando(false)
    if (r.ok) { if (r.conquistas) setLista(r.conquistas); toast.success('Conquistas salvas') }
    else toast.error(r.error ?? 'Erro ao salvar')
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Trophy className="h-5 w-5" /></span>
          <div>
            <h2 className="text-sm font-semibold tracking-tight">Conquistas do módulo</h2>
            <p className="max-w-2xl text-xs text-muted-foreground">Conquistas próprias deste módulo. O aluno desbloqueia ao cumprir a condição, elas ficam no perfil dele junto das outras conquistas e aparecem na área de gamificação com a etiqueta deste módulo.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={add} className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium hover:bg-muted"><Plus className="h-4 w-4" /> Nova conquista</button>
          <button type="button" onClick={salvar} disabled={salvando} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50">
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar
          </button>
        </div>
      </div>

      {lista.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-12 text-center text-muted-foreground">
          <Trophy className="mx-auto mb-2 h-8 w-8 opacity-40" />
          Nenhuma conquista ainda. Crie uma com <b>Nova conquista</b>.
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {lista.map((c) => <ConquistaCard key={c.id} c={c} aulas={aulas} onPatch={(p) => patch(c.id, p)} onRemover={() => remover(c.id)} />)}
        </div>
      )}
    </div>
  )
}

function ConquistaCard({ c, aulas, onPatch, onRemover }: { c: ModuloConquistaDef; aulas: AulaOpcao[]; onPatch: (p: Partial<ModuloConquistaDef>) => void; onRemover: () => void }) {
  const cor = c.cor || corConquista(c.id)
  const selectCls = 'h-9 w-full rounded-lg border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40'
  return (
    <div className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm">
      {/* Prévia: tile igual ao da coleção do aluno + ícone/cor + excluir */}
      <div className="flex items-center gap-3">
        <div className="flex flex-col items-center gap-1 rounded-xl border p-2.5 text-center" style={{ borderColor: `color-mix(in oklab, ${cor} 35%, transparent)`, background: `color-mix(in oklab, ${cor} 7%, transparent)` }}>
          <span className="relative flex h-12 w-12 items-center justify-center overflow-visible rounded-full" style={{ background: `color-mix(in oklab, ${cor} 18%, transparent)`, color: cor }}><ConquistaIconeFx icone={c.icone} /></span>
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <input value={c.titulo} onChange={(e) => onPatch({ titulo: e.target.value })} placeholder="Título (ex.: Concluiu o desafio)" className="h-9 w-full rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40" />
          <input value={c.descricao} onChange={(e) => onPatch({ descricao: e.target.value })} placeholder="Texto (ex.: Participou do Desafio de Lei Seca)" className="h-9 w-full rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40" />
        </div>
        <button type="button" onClick={onRemover} aria-label="Excluir conquista" className="shrink-0 self-start rounded-lg border border-destructive/30 p-2 text-destructive hover:bg-destructive/5"><Trash2 className="h-4 w-4" /></button>
      </div>

      {/* Ícone / cor / XP */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <label className="space-y-1">
          <span className="block text-[11px] font-medium text-muted-foreground">Ícone</span>
          <select className={selectCls} value={c.icone} onChange={(e) => onPatch({ icone: e.target.value })}>
            {ICONE_OPCOES.map((ic) => <option key={ic.v} value={ic.v}>{ic.label}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="block text-[11px] font-medium text-muted-foreground">Cor</span>
          <input type="color" value={cor} onChange={(e) => onPatch({ cor: e.target.value })} className="h-9 w-full cursor-pointer rounded-lg border bg-transparent p-0.5" aria-label="Cor da conquista" />
        </label>
        <label className="space-y-1">
          <span className="block text-[11px] font-medium text-muted-foreground">XP (gamificação)</span>
          <input type="number" min={0} value={c.xp} onChange={(e) => onPatch({ xp: Math.max(0, Number(e.target.value) || 0) })} className={`${selectCls} text-right tabular-nums`} />
        </label>
      </div>

      {/* Condição de ganho */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Ganha quando:</span>
          <select value={c.condicao.tipo} onChange={(e) => onPatch({ condicao: { ...c.condicao, tipo: e.target.value as CarimboCondicaoTipo } })} className="h-9 min-w-[220px] flex-1 rounded-lg border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
            {CONDICAO_TIPOS.map((t) => <option key={t} value={t}>{CONDICAO_LABEL[t]}</option>)}
          </select>
          {usaMeta(c.condicao.tipo) && (
            <input type="number" min={1} value={c.condicao.meta} onChange={(e) => onPatch({ condicao: { ...c.condicao, meta: Math.max(1, Number(e.target.value) || 1) } })} className="h-9 w-16 rounded-lg border bg-background px-2 text-right text-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-primary/40" />
          )}
        </div>
        {usaAula(c.condicao.tipo) && (
          <AulasAlvo modo={c.condicao.aulaModo ?? 'todas'} ids={c.condicao.aulaIds ?? []} aulas={aulas}
            onChange={(modo, ids) => onPatch({ condicao: { ...c.condicao, aulaModo: modo, aulaIds: ids } })}
            rotulos={{ todas: 'Não exigir nestes dias:', especificas: 'Exigir estes dias:' }} />
        )}
      </div>
    </div>
  )
}
