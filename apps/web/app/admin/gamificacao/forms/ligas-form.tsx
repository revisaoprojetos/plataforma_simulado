'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Trash2, RefreshCw, Shield, ChevronRight, Trophy } from 'lucide-react'
import type { GamConfig, LigaDef } from '@/lib/gamificacao/config'
import { salvarLigas, rebuildGamificacao } from '../actions'
import { SaveBar, SectionCard } from './_campos'
import { useUnsavedGuard } from '@/components/admin/use-unsaved-guard'

let seq = 0
const novoId = () => `liga_${Date.now()}_${seq++}`
const fmt = (n: number) => n.toLocaleString('pt-BR')

export function LigasForm({ config, podeGerenciar }: { config: GamConfig; podeGerenciar: boolean }) {
  const [ligas, setLigas] = useState<LigaDef[]>(config.ligas)
  const [salvando, start] = useTransition()
  const [rebuild, startRebuild] = useTransition()
  const { dirty, markSaved } = useUnsavedGuard({ ligas })

  const setById = (id: string, patch: Partial<LigaDef>) => setLigas((l) => l.map((x) => (x.id === id ? { ...x, ...patch } : x)))
  const remById = (id: string) => setLigas((l) => l.filter((x) => x.id !== id))
  const add = () => {
    const prox = ligas.length ? Math.max(...ligas.map((x) => x.xp_min)) + 1000 : 0
    setLigas((l) => [...l, { id: novoId(), nome: 'Nova liga', xp_min: prox, cor: '#8b5cf6' }])
  }

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

  // Sempre exibida em ordem de XP mínimo (auto-organiza ao adicionar/editar). A key por id
  // preserva o foco do input mesmo quando a posição muda.
  const ordenadas = [...ligas].sort((a, b) => a.xp_min - b.xp_min)
  const faixa = (i: number) => {
    const min = ordenadas[i].xp_min
    const prox = ordenadas[i + 1]?.xp_min
    return prox != null ? `${fmt(min)} – ${fmt(Math.max(min, prox - 1))} XP` : `${fmt(min)}+ XP`
  }

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
        icon={Trophy}
        tom="#f59e0b"
        descricao="Tiers por XP total acumulado (sem reset). O aluno sobe ao cruzar o XP mínimo. A ordem é automática pelo XP mínimo."
      >
        {/* Prévia da progressão */}
        {ordenadas.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-1.5 rounded-lg border bg-muted/20 p-2.5">
            {ordenadas.map((l, i) => (
              <span key={l.id} className="flex items-center gap-1.5">
                <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium" style={{ borderColor: `color-mix(in oklab, ${l.cor} 45%, transparent)`, background: `color-mix(in oklab, ${l.cor} 12%, transparent)` }}>
                  <span className="h-2 w-2 rounded-full" style={{ background: l.cor }} />
                  {l.nome || 'Liga'} <span className="text-muted-foreground">· {fmt(l.xp_min)}+</span>
                </span>
                {i < ordenadas.length - 1 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
              </span>
            ))}
          </div>
        )}

        <div className="space-y-2">
          {ordenadas.map((l, i) => (
            <div key={l.id} className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3 shadow-sm" style={{ borderLeft: `4px solid ${l.cor}` }}>
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg" style={{ background: `color-mix(in oklab, ${l.cor} 20%, transparent)`, color: l.cor }}>
                <Shield className="h-5 w-5" />
              </span>
              <label className="min-w-[160px] flex-1 space-y-1">
                <span className="block text-[11px] font-medium text-muted-foreground">Nome da liga</span>
                <Input value={l.nome} onChange={(e) => setById(l.id, { nome: e.target.value })} disabled={!podeGerenciar} />
                <span className="block text-[11px] text-muted-foreground">Faixa: <span className="font-medium text-foreground">{faixa(i)}</span></span>
              </label>
              <label className="w-32 space-y-1 self-start">
                <span className="block text-[11px] font-medium text-muted-foreground">XP mínimo</span>
                <Input type="number" min={0} value={l.xp_min} onChange={(e) => setById(l.id, { xp_min: Number(e.target.value || 0) })} disabled={!podeGerenciar} className="text-right tabular-nums" />
              </label>
              <label className="space-y-1 self-start">
                <span className="block text-[11px] font-medium text-muted-foreground">Cor</span>
                <input type="color" value={l.cor} onChange={(e) => setById(l.id, { cor: e.target.value })} disabled={!podeGerenciar} className="block h-9 w-12 cursor-pointer rounded-lg border bg-transparent p-0.5 disabled:cursor-not-allowed" aria-label={`Cor da liga ${l.nome}`} />
              </label>
              <div className="flex items-center gap-2 self-start pt-6">
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold tabular-nums text-muted-foreground" title="Posição na escada de ligas">#{i + 1}</span>
                {podeGerenciar && (
                  <Button type="button" variant="ghost" size="icon" onClick={() => remById(l.id)} aria-label={`Remover ${l.nome}`} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
                )}
              </div>
            </div>
          ))}
          {ligas.length === 0 && <p className="rounded-lg border bg-muted/30 p-4 text-center text-sm text-muted-foreground">Nenhuma liga. Adicione ao menos uma (com XP mínimo 0).</p>}
        </div>

        {podeGerenciar && (
          <Button type="button" variant="outline" onClick={add} className="mt-3"><Plus className="h-4 w-4" /> Adicionar liga</Button>
        )}
      </SectionCard>
    </form>
  )
}
