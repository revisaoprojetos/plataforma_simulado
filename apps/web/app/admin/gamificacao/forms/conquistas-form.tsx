'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Trash2, Rocket, Flame, Zap, Trophy, Medal, Award, type LucideIcon } from 'lucide-react'
import type { GamConfig, ConquistaDef, ConquistaRegraTipo } from '@/lib/gamificacao/config'
import { salvarConquistas } from '../actions'
import { SaveButton, SectionCard } from './_campos'

let seq = 0
const novoId = () => `c_${Date.now()}_${seq++}`
const REGRAS: { v: ConquistaRegraTipo; label: string }[] = [
  { v: 'simulados_concluidos', label: 'Simulados concluídos' },
  { v: 'xp_total', label: 'XP total acumulado' },
  { v: 'streak', label: 'Dias de sequência' },
  { v: 'nota_max', label: 'Nota máxima atingida' },
]
const ICONES: Record<string, LucideIcon> = { rocket: Rocket, flame: Flame, zap: Zap, trophy: Trophy, medal: Medal }
const selectCls = 'h-9 w-full rounded-lg border bg-background px-2 text-sm disabled:cursor-not-allowed disabled:opacity-60'

export function ConquistasForm({ config, podeGerenciar }: { config: GamConfig; podeGerenciar: boolean }) {
  const [lista, setLista] = useState<ConquistaDef[]>(config.conquistas_def)
  const [salvando, start] = useTransition()

  const set = (i: number, patch: Partial<ConquistaDef>) => setLista((l) => l.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  const setRegra = (i: number, patch: Partial<ConquistaDef['regra']>) => setLista((l) => l.map((x, j) => (j === i ? { ...x, regra: { ...x.regra, ...patch } } : x)))
  const add = () => setLista((l) => [...l, { id: novoId(), titulo: 'Nova conquista', descricao: '', icone: 'trophy', regra: { tipo: 'simulados_concluidos', meta: 1 }, xp: 20 }])
  const rem = (i: number) => setLista((l) => l.filter((_, j) => j !== i))

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    start(async () => {
      const r = await salvarConquistas(lista)
      if (r?.error) toast.error(r.error); else toast.success('Conquistas salvas.')
    })
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <SectionCard titulo="Conquistas" descricao="Desbloqueadas uma única vez ao cumprir a regra. Podem conceder XP extra ao desbloquear.">
        <div className="grid gap-3 lg:grid-cols-2">
          {lista.map((c, i) => {
            const Icon = ICONES[c.icone] ?? Award
            return (
              <div key={c.id} className="space-y-3 rounded-xl border bg-muted/20 p-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary"><Icon className="h-5 w-5" /></span>
                  <label className="min-w-0 flex-1 space-y-1">
                    <span className="block text-[11px] font-medium text-muted-foreground">Título</span>
                    <Input value={c.titulo} onChange={(e) => set(i, { titulo: e.target.value })} disabled={!podeGerenciar} />
                  </label>
                  {podeGerenciar && <Button type="button" variant="ghost" size="icon" onClick={() => rem(i)} aria-label={`Remover ${c.titulo}`} className="self-end text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>}
                </div>
                <label className="block space-y-1">
                  <span className="text-[11px] font-medium text-muted-foreground">Descrição</span>
                  <Input value={c.descricao} onChange={(e) => set(i, { descricao: e.target.value })} disabled={!podeGerenciar} placeholder="Ex.: Conclua seu primeiro simulado" />
                </label>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <label className="space-y-1">
                    <span className="block text-[11px] font-medium text-muted-foreground">Ícone</span>
                    <select className={selectCls} value={c.icone} onChange={(e) => set(i, { icone: e.target.value })} disabled={!podeGerenciar}>
                      {Object.keys(ICONES).map((ic) => <option key={ic} value={ic}>{ic}</option>)}
                    </select>
                  </label>
                  <label className="col-span-1 space-y-1 sm:col-span-1">
                    <span className="block text-[11px] font-medium text-muted-foreground">Regra</span>
                    <select className={selectCls} value={c.regra.tipo} onChange={(e) => setRegra(i, { tipo: e.target.value as ConquistaRegraTipo })} disabled={!podeGerenciar}>
                      {REGRAS.map((rg) => <option key={rg.v} value={rg.v}>{rg.label}</option>)}
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="block text-[11px] font-medium text-muted-foreground">Meta (≥)</span>
                    <Input type="number" min={0} value={c.regra.meta} onChange={(e) => setRegra(i, { meta: Number(e.target.value || 0) })} disabled={!podeGerenciar} />
                  </label>
                  <label className="space-y-1">
                    <span className="block text-[11px] font-medium text-muted-foreground">XP</span>
                    <Input type="number" min={0} value={c.xp} onChange={(e) => set(i, { xp: Number(e.target.value || 0) })} disabled={!podeGerenciar} />
                  </label>
                </div>
              </div>
            )
          })}
          {lista.length === 0 && <p className="rounded-lg border bg-muted/30 p-4 text-center text-sm text-muted-foreground lg:col-span-2">Nenhuma conquista. Adicione a primeira.</p>}
        </div>

        {podeGerenciar && <Button type="button" variant="outline" onClick={add} className="mt-3"><Plus className="h-4 w-4" /> Adicionar conquista</Button>}
      </SectionCard>

      {podeGerenciar && <SaveButton salvando={salvando} />}
    </form>
  )
}
