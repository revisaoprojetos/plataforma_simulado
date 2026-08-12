'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Zap, BookOpen, TrendingUp } from 'lucide-react'
import type { GamConfig } from '@/lib/gamificacao/config'
import { xpAcumuladoParaNivel } from '@/lib/gamificacao/niveis'
import { salvarXpNiveis } from '../actions'
import { NumberField, SaveButton, SectionCard } from './_campos'

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

  // Escada completa: XP acumulado para alcançar cada nível + custo do salto anterior.
  const nivelMax = Math.max(2, Math.min(200, curva.nivel_max || 30))
  const niveis = Array.from({ length: nivelMax }, (_, i) => {
    const n = i + 1
    const acc = xpAcumuladoParaNivel(n, curva)
    const custo = n > 1 ? acc - xpAcumuladoParaNivel(n - 1, curva) : 0
    return { n, acc, custo }
  })
  const xpMaximo = niveis[niveis.length - 1]?.acc ?? 0

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard titulo="XP por concluir simulado" icon={Zap} className="space-y-2.5">
          <NumberField label="XP base (por concluir)" value={simulado.base} onChange={(v) => setSimulado({ ...simulado, base: v })} suffix="XP" disabled={!podeGerenciar} />
          <NumberField label="XP por acerto" value={simulado.por_acerto} onChange={(v) => setSimulado({ ...simulado, por_acerto: v })} suffix="XP / acerto" disabled={!podeGerenciar} />
          <NumberField label="Bônus máximo por nota" value={simulado.bonus_nota_max} onChange={(v) => setSimulado({ ...simulado, bonus_nota_max: v })} suffix="XP na nota 100" hint="Proporcional à nota: 100 = cheio; 50 = metade." disabled={!podeGerenciar} />
        </SectionCard>

        <SectionCard titulo="XP por praticar (Banco de Questões)" icon={BookOpen} className="space-y-2.5">
          <NumberField label="XP por acerto na prática" value={pratica.por_acerto} onChange={(v) => setPratica({ ...pratica, por_acerto: v })} suffix="XP" disabled={!podeGerenciar} />
          <NumberField label="Bônus em disciplina fraca" value={pratica.bonus_disc_fraca} onChange={(v) => setPratica({ ...pratica, bonus_disc_fraca: v })} suffix="XP extra" hint="Quando o aproveitamento na disciplina está abaixo de 50%." disabled={!podeGerenciar} />
        </SectionCard>
      </div>

      <SectionCard titulo="Curva de níveis" icon={TrendingUp} descricao="Custo do nível n→n+1 = base + (n−1) × incremento. Cresce a cada nível.">
        <div className="grid gap-2.5 sm:grid-cols-3">
          <NumberField label="Custo base (1→2)" value={curva.base} onChange={(v) => setCurva({ ...curva, base: v })} suffix="XP" disabled={!podeGerenciar} />
          <NumberField label="Incremento por nível" value={curva.incremento} onChange={(v) => setCurva({ ...curva, incremento: v })} suffix="XP" disabled={!podeGerenciar} />
          <NumberField label="Nível máximo" value={curva.nivel_max} onChange={(v) => setCurva({ ...curva, nivel_max: Math.max(2, Math.min(200, v)) })} suffix="níveis" min={2} disabled={!podeGerenciar} />
        </div>

        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Todos os níveis (XP acumulado · custo do salto)</span>
            <span className="text-xs text-muted-foreground">Máx.: <span className="font-semibold text-foreground tabular-nums">{xpMaximo.toLocaleString('pt-BR')} XP</span> no nível {nivelMax}</span>
          </div>
          <div className="grid max-h-72 grid-cols-2 gap-1.5 overflow-auto rounded-lg border bg-muted/20 p-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {niveis.map((l) => (
              <div key={l.n} className="rounded-md border bg-card px-2.5 py-1.5">
                <div className="flex items-baseline justify-between gap-1">
                  <span className="text-xs font-semibold">Nível {l.n}</span>
                  {l.custo > 0 && <span className="text-[10px] text-muted-foreground">+{l.custo.toLocaleString('pt-BR')}</span>}
                </div>
                <div className="text-[11px] tabular-nums text-muted-foreground">{l.acc.toLocaleString('pt-BR')} XP</div>
              </div>
            ))}
          </div>
        </div>
      </SectionCard>

      {podeGerenciar && <SaveButton salvando={salvando} />}
    </form>
  )
}
