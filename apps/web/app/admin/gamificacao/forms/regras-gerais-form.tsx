'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Card } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import type { GamConfig } from '@/lib/gamificacao/config'
import { salvarRegrasGerais } from '../actions'
import { NumberField, TextField, SaveButton } from './_campos'

export function RegrasGeraisForm({ config, podeGerenciar }: { config: GamConfig; podeGerenciar: boolean }) {
  const [ativo, setAtivo] = useState(config.ativo)
  const [timezone, setTimezone] = useState(config.timezone)
  const [streak, setStreak] = useState(config.xp_regras.streak)
  const [chest, setChest] = useState(config.xp_regras.chest)
  const [salvando, start] = useTransition()

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    start(async () => {
      const r = await salvarRegrasGerais({ ativo, timezone, streak, chest })
      if (r?.error) toast.error(r.error); else toast.success('Regras gerais salvas.')
    })
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-5 lg:grid-cols-2">
      <Card className="space-y-4 p-5 lg:col-span-2">
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label className="text-sm font-semibold">Gamificação ativa</Label>
            <p className="text-xs text-muted-foreground">Liga XP, níveis, ligas, streak, missões e conquistas para os alunos desta plataforma.</p>
          </div>
          <Switch checked={ativo} onCheckedChange={setAtivo} disabled={!podeGerenciar} />
        </div>
      </Card>

      <Card className="space-y-4 p-5">
        <h3 className="text-sm font-semibold">Sequência diária (streak)</h3>
        <NumberField label="XP por dia" value={streak.por_dia} onChange={(v) => setStreak({ ...streak, por_dia: v })} suffix="XP × dias de sequência" disabled={!podeGerenciar} />
        <NumberField label="Teto do XP diário" value={streak.cap} onChange={(v) => setStreak({ ...streak, cap: v })} suffix="XP máx./dia" hint="O bônus cresce com a sequência até este limite." disabled={!podeGerenciar} />
      </Card>

      <Card className="space-y-4 p-5">
        <h3 className="text-sm font-semibold">Baú de sequência</h3>
        <NumberField label="A cada N dias" value={chest.cada_n_dias} onChange={(v) => setChest({ ...chest, cada_n_dias: v })} suffix="dias" min={1} disabled={!podeGerenciar} />
        <NumberField label="XP do baú" value={chest.xp} onChange={(v) => setChest({ ...chest, xp: v })} suffix="XP" disabled={!podeGerenciar} />
      </Card>

      <Card className="space-y-4 p-5 lg:col-span-2">
        <h3 className="text-sm font-semibold">Fuso horário</h3>
        <TextField label="Timezone (fronteira do dia p/ streak e missões)" value={timezone} onChange={setTimezone} placeholder="America/Sao_Paulo" disabled={!podeGerenciar} />
      </Card>

      <div className="lg:col-span-2">{podeGerenciar && <SaveButton salvando={salvando} />}</div>
    </form>
  )
}
