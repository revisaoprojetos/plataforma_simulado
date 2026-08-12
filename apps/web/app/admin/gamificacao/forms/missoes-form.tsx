'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Trash2, Target } from 'lucide-react'
import type { GamConfig, MissaoDef, MissaoTipo } from '@/lib/gamificacao/config'
import { salvarMissoes } from '../actions'
import { SaveButton, SectionCard } from './_campos'

let seq = 0
const novoId = () => `m_${Date.now()}_${seq++}`
const TIPOS: { v: MissaoTipo; label: string }[] = [
  { v: 'finalizar_simulado', label: 'Concluir simulados' },
  { v: 'acertar_n', label: 'Acertar questões' },
  { v: 'praticar_n', label: 'Praticar questões' },
]
const selectCls = 'h-9 w-full rounded-lg border bg-background px-2 text-sm disabled:cursor-not-allowed disabled:opacity-60'

export function MissoesForm({ config, podeGerenciar }: { config: GamConfig; podeGerenciar: boolean }) {
  const [missoes, setMissoes] = useState<MissaoDef[]>(config.missoes_def)
  const [salvando, start] = useTransition()

  const set = (i: number, patch: Partial<MissaoDef>) => setMissoes((l) => l.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  const add = () => setMissoes((l) => [...l, { id: novoId(), titulo: 'Nova missão', tipo: 'finalizar_simulado', meta: 1, xp: 20 }])
  const rem = (i: number) => setMissoes((l) => l.filter((_, j) => j !== i))

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    start(async () => {
      const r = await salvarMissoes(missoes)
      if (r?.error) toast.error(r.error); else toast.success('Missões salvas.')
    })
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <SectionCard titulo="Missões diárias" descricao="Renovam à meia-noite (fuso do tenant). O aluno ganha o XP ao atingir a meta do dia.">
        <div className="space-y-2">
          {missoes.map((m, i) => (
            <div key={m.id} className="flex flex-wrap items-end gap-3 rounded-xl border bg-muted/20 p-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Target className="h-5 w-5" /></span>
              <label className="min-w-[180px] flex-1 space-y-1">
                <span className="block text-[11px] font-medium text-muted-foreground">Título</span>
                <Input value={m.titulo} onChange={(e) => set(i, { titulo: e.target.value })} disabled={!podeGerenciar} />
              </label>
              <label className="w-48 space-y-1">
                <span className="block text-[11px] font-medium text-muted-foreground">Tipo</span>
                <select className={selectCls} value={m.tipo} onChange={(e) => set(i, { tipo: e.target.value as MissaoTipo })} disabled={!podeGerenciar}>
                  {TIPOS.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
                </select>
              </label>
              <label className="w-24 space-y-1">
                <span className="block text-[11px] font-medium text-muted-foreground">Meta</span>
                <Input type="number" min={1} value={m.meta} onChange={(e) => set(i, { meta: Number(e.target.value || 1) })} disabled={!podeGerenciar} />
              </label>
              <label className="w-24 space-y-1">
                <span className="block text-[11px] font-medium text-muted-foreground">XP</span>
                <Input type="number" min={0} value={m.xp} onChange={(e) => set(i, { xp: Number(e.target.value || 0) })} disabled={!podeGerenciar} />
              </label>
              {podeGerenciar && <Button type="button" variant="ghost" size="icon" onClick={() => rem(i)} aria-label={`Remover ${m.titulo}`} className="self-end text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>}
            </div>
          ))}
          {missoes.length === 0 && <p className="rounded-lg border bg-muted/30 p-4 text-center text-sm text-muted-foreground">Nenhuma missão. Adicione a primeira.</p>}
        </div>

        {podeGerenciar && <Button type="button" variant="outline" onClick={add} className="mt-1"><Plus className="h-4 w-4" /> Adicionar missão</Button>}
      </SectionCard>

      {podeGerenciar && <SaveButton salvando={salvando} />}
    </form>
  )
}
