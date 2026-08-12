'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Card } from '@/components/ui/card'
import type { GamConfig } from '@/lib/gamificacao/config'
import { xpAcumuladoParaNivel } from '@/lib/gamificacao/niveis'
import { salvarXpNiveis } from '../actions'
import { NumberField, SaveButton } from './_campos'

export function XpNiveisForm({ config, podeGerenciar }: { config: GamConfig; podeGerenciar: boolean }) {
  const [simulado, setSimulado] = useState(config.xp_regras.simulado)
  const [pratica, setPratica] = useState(config.xp_regras.pratica)
  const [curva, setCurva] = useState(config.nivel_curva)
  const [salvando, start] = useTransition()

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    start(async () => {
      const r = await salvarXpNiveis({ simulado, pratica, nivel_curva: curva })
      if (r?.error) toast.error(r.error); else toast.success('XP e níveis salvos.')
    })
  }

  // Prévia: XP acumulado para alcançar alguns níveis com a curva atual.
  const previa = [2, 5, 10, 20].map((n) => ({ n, xp: xpAcumuladoParaNivel(n, curva) }))

  return (
    <form onSubmit={onSubmit} className="grid gap-5 lg:grid-cols-2">
      <Card className="space-y-4 p-5">
        <h3 className="text-sm font-semibold">XP por concluir simulado</h3>
        <NumberField label="XP base (por concluir)" value={simulado.base} onChange={(v) => setSimulado({ ...simulado, base: v })} suffix="XP" disabled={!podeGerenciar} />
        <NumberField label="XP por acerto" value={simulado.por_acerto} onChange={(v) => setSimulado({ ...simulado, por_acerto: v })} suffix="XP/acerto" disabled={!podeGerenciar} />
        <NumberField label="Bônus máximo por nota" value={simulado.bonus_nota_max} onChange={(v) => setSimulado({ ...simulado, bonus_nota_max: v })} suffix="XP (na nota 100)" hint="Proporcional à nota: nota 100 = bônus cheio; nota 50 = metade." disabled={!podeGerenciar} />
      </Card>

      <Card className="space-y-4 p-5">
        <h3 className="text-sm font-semibold">XP por praticar (Banco de Questões)</h3>
        <NumberField label="XP por acerto na prática" value={pratica.por_acerto} onChange={(v) => setPratica({ ...pratica, por_acerto: v })} suffix="XP" disabled={!podeGerenciar} />
        <NumberField label="Bônus em disciplina fraca" value={pratica.bonus_disc_fraca} onChange={(v) => setPratica({ ...pratica, bonus_disc_fraca: v })} suffix="XP extra" hint="Aplicado quando o aproveitamento na disciplina está abaixo de 50%." disabled={!podeGerenciar} />
      </Card>

      <Card className="space-y-4 p-5">
        <h3 className="text-sm font-semibold">Curva de níveis</h3>
        <div className="grid grid-cols-2 gap-3">
          <NumberField label="Custo base (nível 1→2)" value={curva.base} onChange={(v) => setCurva({ ...curva, base: v })} suffix="XP" disabled={!podeGerenciar} />
          <NumberField label="Incremento por nível" value={curva.incremento} onChange={(v) => setCurva({ ...curva, incremento: v })} suffix="XP" disabled={!podeGerenciar} />
        </div>
        <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
          <div className="mb-1 font-medium text-foreground">Prévia (XP acumulado para o nível):</div>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {previa.map((p) => <span key={p.n}>Nível {p.n}: <span className="font-semibold text-foreground tabular-nums">{p.xp.toLocaleString('pt-BR')}</span></span>)}
          </div>
        </div>
      </Card>

      <div className="lg:col-span-2">{podeGerenciar && <SaveButton salvando={salvando} />}</div>
    </form>
  )
}
