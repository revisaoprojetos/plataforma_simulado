'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Trash2, Award } from 'lucide-react'
import type { GamConfig, ConquistaDef, ConquistaRegraTipo } from '@/lib/gamificacao/config'
import { salvarConquistas } from '../actions'
import { SaveButton } from './_campos'

let seq = 0
const novoId = () => `c_${Date.now()}_${seq++}`
const REGRAS: { v: ConquistaRegraTipo; label: string }[] = [
  { v: 'simulados_concluidos', label: 'Simulados concluídos' },
  { v: 'xp_total', label: 'XP total acumulado' },
  { v: 'streak', label: 'Dias de sequência' },
  { v: 'nota_max', label: 'Nota máxima atingida' },
]
const ICONES = ['rocket', 'flame', 'zap', 'trophy', 'medal']
const selectCls = 'h-9 rounded-md border bg-background px-2 text-sm'

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
      <p className="text-sm text-muted-foreground">Conquistas são desbloqueadas <strong>uma vez</strong> ao cumprir a regra. Podem conceder XP extra ao desbloquear.</p>

      <div className="space-y-2">
        {lista.map((c, i) => (
          <Card key={c.id} className="space-y-3 p-3">
            <div className="flex flex-wrap items-end gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><Award className="h-4 w-4" /></span>
              <label className="min-w-[160px] flex-1 space-y-1">
                <span className="text-[11px] text-muted-foreground">Título</span>
                <Input value={c.titulo} onChange={(e) => set(i, { titulo: e.target.value })} disabled={!podeGerenciar} />
              </label>
              <label className="space-y-1">
                <span className="block text-[11px] text-muted-foreground">Ícone</span>
                <select className={selectCls} value={c.icone} onChange={(e) => set(i, { icone: e.target.value })} disabled={!podeGerenciar}>
                  {ICONES.map((ic) => <option key={ic} value={ic}>{ic}</option>)}
                </select>
              </label>
              {podeGerenciar && <Button type="button" variant="ghost" size="icon" onClick={() => rem(i)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>}
            </div>
            <label className="block space-y-1">
              <span className="text-[11px] text-muted-foreground">Descrição</span>
              <Input value={c.descricao} onChange={(e) => set(i, { descricao: e.target.value })} disabled={!podeGerenciar} />
            </label>
            <div className="flex flex-wrap items-end gap-3">
              <label className="space-y-1">
                <span className="block text-[11px] text-muted-foreground">Regra</span>
                <select className={selectCls} value={c.regra.tipo} onChange={(e) => setRegra(i, { tipo: e.target.value as ConquistaRegraTipo })} disabled={!podeGerenciar}>
                  {REGRAS.map((rg) => <option key={rg.v} value={rg.v}>{rg.label}</option>)}
                </select>
              </label>
              <label className="w-28 space-y-1">
                <span className="text-[11px] text-muted-foreground">Meta (≥)</span>
                <Input type="number" min={0} value={c.regra.meta} onChange={(e) => setRegra(i, { meta: Number(e.target.value || 0) })} disabled={!podeGerenciar} />
              </label>
              <label className="w-28 space-y-1">
                <span className="text-[11px] text-muted-foreground">XP ao desbloquear</span>
                <Input type="number" min={0} value={c.xp} onChange={(e) => set(i, { xp: Number(e.target.value || 0) })} disabled={!podeGerenciar} />
              </label>
            </div>
          </Card>
        ))}
      </div>

      {podeGerenciar && (
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" onClick={add}><Plus className="h-4 w-4" /> Adicionar conquista</Button>
          <SaveButton salvando={salvando} />
        </div>
      )}
    </form>
  )
}
