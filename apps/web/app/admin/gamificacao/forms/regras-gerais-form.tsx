'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import type { GamConfig } from '@/lib/gamificacao/config'
import { salvarRegrasGerais } from '../actions'
import { NumberField, TextField, SaveBar, SectionCard } from './_campos'

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
    <form onSubmit={onSubmit} className="space-y-4">
      {podeGerenciar && <SaveBar salvando={salvando} hint="Ativação, streak, baú e fuso." />}
      <div className={`flex items-center justify-between gap-4 rounded-2xl border p-5 shadow-sm ${ativo ? 'border-emerald-500/40 bg-emerald-500/5' : 'bg-card'}`}>
        <div>
          <Label className="text-sm font-semibold">Gamificação ativa</Label>
          <p className="mt-0.5 text-xs text-muted-foreground">Liga XP, níveis, ligas, streak, missões e conquistas para os alunos desta plataforma.</p>
        </div>
        <Switch checked={ativo} onCheckedChange={setAtivo} disabled={!podeGerenciar} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard titulo="Sequência diária (streak)" className="space-y-4">
          <NumberField label="XP por dia" value={streak.por_dia} onChange={(v) => setStreak({ ...streak, por_dia: v })} suffix="XP × dias de sequência" disabled={!podeGerenciar} />
          <NumberField label="Teto do XP diário" value={streak.cap} onChange={(v) => setStreak({ ...streak, cap: v })} suffix="XP máx./dia" hint="O bônus cresce com a sequência até este limite." disabled={!podeGerenciar} />
        </SectionCard>

        <SectionCard titulo="Baú de sequência" className="space-y-4">
          <NumberField label="A cada N dias" value={chest.cada_n_dias} onChange={(v) => setChest({ ...chest, cada_n_dias: v })} suffix="dias" min={1} disabled={!podeGerenciar} />
          <NumberField label="XP do baú" value={chest.xp} onChange={(v) => setChest({ ...chest, xp: v })} suffix="XP" disabled={!podeGerenciar} />
        </SectionCard>
      </div>

      <SectionCard titulo="Fuso horário" descricao="Define a fronteira do dia para streak e missões diárias.">
        <div className="max-w-md">
          <TextField label="Timezone" value={timezone} onChange={setTimezone} placeholder="America/Sao_Paulo" disabled={!podeGerenciar} />
        </div>
      </SectionCard>
    </form>
  )
}
