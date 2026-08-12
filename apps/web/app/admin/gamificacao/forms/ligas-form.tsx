'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Trash2, RefreshCw, Shield } from 'lucide-react'
import type { GamConfig, LigaDef } from '@/lib/gamificacao/config'
import { salvarLigas, rebuildGamificacao } from '../actions'
import { SaveButton } from './_campos'

let seq = 0
const novoId = () => `liga_${Date.now()}_${seq++}`

export function LigasForm({ config, podeGerenciar }: { config: GamConfig; podeGerenciar: boolean }) {
  const [ligas, setLigas] = useState<LigaDef[]>(config.ligas)
  const [salvando, start] = useTransition()
  const [rebuild, startRebuild] = useTransition()

  const set = (i: number, patch: Partial<LigaDef>) => setLigas((l) => l.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  const add = () => setLigas((l) => [...l, { id: novoId(), nome: 'Nova liga', xp_min: 0, cor: '#8b5cf6' }])
  const rem = (i: number) => setLigas((l) => l.filter((_, j) => j !== i))

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    start(async () => {
      const r = await salvarLigas(ligas)
      if (r?.error) toast.error(r.error); else toast.success('Ligas salvas. Recalcule os tiers para aplicar os novos limites.')
    })
  }
  function onRebuild() {
    startRebuild(async () => {
      const r = await rebuildGamificacao()
      if (r?.error) toast.error(r.error); else toast.success(`Tiers recalculados para ${r?.atualizados ?? 0} aluno(s).`)
    })
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <p className="text-sm text-muted-foreground">As ligas são <strong>tiers por XP total acumulado</strong> (sem reset). O aluno sobe ao cruzar o XP mínimo. Ordenadas automaticamente pelo XP mínimo ao salvar.</p>

      <div className="space-y-2">
        {ligas.map((l, i) => (
          <Card key={l.id} className="flex flex-wrap items-end gap-3 p-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: `color-mix(in oklab, ${l.cor} 18%, transparent)`, color: l.cor }}><Shield className="h-4 w-4" /></span>
            <label className="flex-1 space-y-1">
              <span className="text-[11px] text-muted-foreground">Nome</span>
              <Input value={l.nome} onChange={(e) => set(i, { nome: e.target.value })} disabled={!podeGerenciar} />
            </label>
            <label className="w-32 space-y-1">
              <span className="text-[11px] text-muted-foreground">XP mínimo</span>
              <Input type="number" min={0} value={l.xp_min} onChange={(e) => set(i, { xp_min: Number(e.target.value || 0) })} disabled={!podeGerenciar} />
            </label>
            <label className="space-y-1">
              <span className="text-[11px] text-muted-foreground">Cor</span>
              <input type="color" value={l.cor} onChange={(e) => set(i, { cor: e.target.value })} disabled={!podeGerenciar} className="block h-9 w-12 cursor-pointer rounded border bg-transparent" />
            </label>
            {podeGerenciar && (
              <Button type="button" variant="ghost" size="icon" onClick={() => rem(i)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
            )}
          </Card>
        ))}
      </div>

      {podeGerenciar && (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" onClick={add}><Plus className="h-4 w-4" /> Adicionar liga</Button>
          <SaveButton salvando={salvando} />
          <Button type="button" variant="secondary" onClick={onRebuild} disabled={rebuild}>
            <RefreshCw className={`h-4 w-4 ${rebuild ? 'animate-spin' : ''}`} /> Recalcular tiers dos alunos
          </Button>
        </div>
      )}
    </form>
  )
}
