'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Trash2, RefreshCw, Shield } from 'lucide-react'
import type { GamConfig, LigaDef } from '@/lib/gamificacao/config'
import { salvarLigas, rebuildGamificacao } from '../actions'
import { SaveBar, SectionCard } from './_campos'
import { useUnsavedGuard } from '@/components/admin/use-unsaved-guard'

let seq = 0
const novoId = () => `liga_${Date.now()}_${seq++}`

export function LigasForm({ config, podeGerenciar }: { config: GamConfig; podeGerenciar: boolean }) {
  const [ligas, setLigas] = useState<LigaDef[]>(config.ligas)
  const [salvando, start] = useTransition()
  const [rebuild, startRebuild] = useTransition()
  const { dirty, markSaved } = useUnsavedGuard({ ligas })

  const set = (i: number, patch: Partial<LigaDef>) => setLigas((l) => l.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  const add = () => setLigas((l) => [...l, { id: novoId(), nome: 'Nova liga', xp_min: 0, cor: '#8b5cf6' }])
  const rem = (i: number) => setLigas((l) => l.filter((_, j) => j !== i))

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    start(async () => {
      const r = await salvarLigas(ligas)
      if (r?.error) toast.error(r.error); else { toast.success('Ligas salvas. Recalcule os tiers para aplicar os novos limites.'); markSaved() }
    })
  }
  function onRebuild() {
    startRebuild(async () => {
      const r = await rebuildGamificacao()
      if (r?.error) toast.error(r.error); else toast.success(`Tiers recalculados para ${r?.atualizados ?? 0} aluno(s).`)
    })
  }

  const ordenadas = [...ligas].sort((a, b) => a.xp_min - b.xp_min)

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {podeGerenciar && (
        <SaveBar salvando={salvando} dirty={dirty} hint="Salve e recalcule os tiers após mudar os limites.">
          <Button type="button" variant="secondary" onClick={onRebuild} disabled={rebuild}>
            <RefreshCw className={`h-4 w-4 ${rebuild ? 'animate-spin' : ''}`} /> Recalcular tiers
          </Button>
        </SaveBar>
      )}
      <SectionCard
        titulo="Ligas & Divisões"
        descricao="Tiers por XP total acumulado (sem reset). O aluno sobe ao cruzar o XP mínimo. A lista é reordenada pelo XP mínimo ao salvar."
      >
        <div className="space-y-2">
          {ligas.map((l, i) => {
            const posicao = ordenadas.findIndex((x) => x.id === l.id) + 1
            return (
              <div key={l.id} className="flex flex-wrap items-end gap-3 rounded-xl border bg-muted/20 p-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg" style={{ background: `color-mix(in oklab, ${l.cor} 20%, transparent)`, color: l.cor }}>
                  <Shield className="h-5 w-5" />
                </span>
                <label className="min-w-[160px] flex-1 space-y-1">
                  <span className="block text-[11px] font-medium text-muted-foreground">Nome da liga</span>
                  <Input value={l.nome} onChange={(e) => set(i, { nome: e.target.value })} disabled={!podeGerenciar} />
                </label>
                <label className="w-32 space-y-1">
                  <span className="block text-[11px] font-medium text-muted-foreground">XP mínimo</span>
                  <Input type="number" min={0} value={l.xp_min} onChange={(e) => set(i, { xp_min: Number(e.target.value || 0) })} disabled={!podeGerenciar} />
                </label>
                <label className="space-y-1">
                  <span className="block text-[11px] font-medium text-muted-foreground">Cor</span>
                  <input type="color" value={l.cor} onChange={(e) => set(i, { cor: e.target.value })} disabled={!podeGerenciar} className="block h-9 w-12 cursor-pointer rounded-lg border bg-transparent p-0.5 disabled:cursor-not-allowed" aria-label={`Cor da liga ${l.nome}`} />
                </label>
                <div className="flex items-center gap-2 self-end pb-0.5">
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground" title="Posição na escada de ligas">#{posicao}</span>
                  {podeGerenciar && (
                    <Button type="button" variant="ghost" size="icon" onClick={() => rem(i)} aria-label={`Remover ${l.nome}`} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
                  )}
                </div>
              </div>
            )
          })}
          {ligas.length === 0 && <p className="rounded-lg border bg-muted/30 p-4 text-center text-sm text-muted-foreground">Nenhuma liga. Adicione ao menos uma (com XP mínimo 0).</p>}
        </div>

        {podeGerenciar && (
          <Button type="button" variant="outline" onClick={add} className="mt-1"><Plus className="h-4 w-4" /> Adicionar liga</Button>
        )}
      </SectionCard>
    </form>
  )
}
