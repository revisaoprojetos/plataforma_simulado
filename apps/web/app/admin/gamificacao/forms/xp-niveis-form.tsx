'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Zap, BookOpen, TrendingUp, Briefcase, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { GamConfig, TituloNivel } from '@/lib/gamificacao/config'
import { xpAcumuladoParaNivel, tituloParaNivel } from '@/lib/gamificacao/niveis'
import { salvarXpNiveis } from '../actions'
import { NumberField, SaveBar, SectionCard } from './_campos'
import { useUnsavedGuard } from '@/components/admin/use-unsaved-guard'

export function XpNiveisForm({ config, podeGerenciar }: { config: GamConfig; podeGerenciar: boolean }) {
  const [simulado, setSimulado] = useState(config.xp_regras.simulado)
  const [pratica, setPratica] = useState(config.xp_regras.pratica)
  const [curva, setCurva] = useState(config.nivel_curva)
  const [salvando, start] = useTransition()
  const { dirty, markSaved } = useUnsavedGuard({ simulado, pratica, curva })

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    start(async () => {
      const r = await salvarXpNiveis({ simulado, pratica, nivel_curva: curva })
      if (r?.error) toast.error(r.error); else { toast.success('XP, níveis e cargos salvos.'); markSaved() }
    })
  }

  const nivelMax = Math.max(2, Math.min(200, curva.nivel_max || 30))
  const niveis = Array.from({ length: nivelMax }, (_, i) => {
    const n = i + 1
    const acc = xpAcumuladoParaNivel(n, curva)
    const custo = n > 1 ? acc - xpAcumuladoParaNivel(n - 1, curva) : 0
    return { n, acc, custo, titulo: tituloParaNivel(n, curva.titulos) }
  })
  const xpMaximo = niveis[niveis.length - 1]?.acc ?? 0

  // ── Cargos (títulos por nível) ──
  const titulos = curva.titulos ?? []
  const setTitulos = (t: TituloNivel[]) => setCurva({ ...curva, titulos: t })
  const setTitulo = (i: number, patch: Partial<TituloNivel>) => setTitulos(titulos.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  const addTitulo = () => setTitulos([...titulos, { nivel_min: (titulos.at(-1)?.nivel_min ?? 0) + 2, titulo: 'Novo cargo' }])
  const remTitulo = (i: number) => setTitulos(titulos.filter((_, j) => j !== i))

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {podeGerenciar && <SaveBar salvando={salvando} dirty={dirty} hint="Aplica XP, níveis e cargos." />}

      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard titulo="XP por concluir simulado" icon={Zap} tom="#f59e0b" descricao="XP que o aluno ganha ao finalizar cada simulado (base + acertos + bônus por nota).">
          <div className="grid grid-cols-3 gap-2.5">
            <NumberField stacked label="XP base (por concluir)" value={simulado.base} onChange={(v) => setSimulado({ ...simulado, base: v })} suffix="XP" hint="Fixo por finalizar, mesmo sem acertar." disabled={!podeGerenciar} />
            <NumberField stacked label="XP por acerto" value={simulado.por_acerto} onChange={(v) => setSimulado({ ...simulado, por_acerto: v })} suffix="XP / acerto" hint="Multiplicado pelo nº de questões corretas." disabled={!podeGerenciar} />
            <NumberField stacked label="Bônus máximo por nota" value={simulado.bonus_nota_max} onChange={(v) => setSimulado({ ...simulado, bonus_nota_max: v })} suffix="XP na nota 100" hint="Proporcional à nota: 100 = cheio; 50 = metade." disabled={!podeGerenciar} />
          </div>
        </SectionCard>

        <SectionCard titulo="XP por praticar (Banco de Questões)" icon={BookOpen} tom="#0ea5e9" descricao="XP ao acertar questões na prática avulsa do banco, com bônus em disciplinas fracas.">
          <div className="grid grid-cols-2 gap-2.5">
            <NumberField stacked label="XP por acerto na prática" value={pratica.por_acerto} onChange={(v) => setPratica({ ...pratica, por_acerto: v })} suffix="XP" hint="Por questão acertada no banco (repetível)." disabled={!podeGerenciar} />
            <NumberField stacked label="Bônus em disciplina fraca" value={pratica.bonus_disc_fraca} onChange={(v) => setPratica({ ...pratica, bonus_disc_fraca: v })} suffix="XP extra" hint="Quando o aproveitamento na disciplina está abaixo de 50%." disabled={!podeGerenciar} />
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 lg:items-stretch">
        <SectionCard titulo="Curva de níveis" icon={TrendingUp} tom="#8b5cf6" descricao="Custo do nível n→n+1 = base + (n−1) × incremento. Cresce a cada nível." className="flex flex-col lg:h-[34rem]">
          <div className="grid grid-cols-3 gap-2.5">
            <NumberField stacked label="Custo base (1→2)" value={curva.base} onChange={(v) => setCurva({ ...curva, base: v })} suffix="XP" hint="XP para sair do nível 1 para o 2." disabled={!podeGerenciar} />
            <NumberField stacked label="Incremento" value={curva.incremento} onChange={(v) => setCurva({ ...curva, incremento: v })} suffix="XP" hint="Quanto o custo sobe a cada nível." disabled={!podeGerenciar} />
            <NumberField stacked label="Nível máximo" value={curva.nivel_max} onChange={(v) => setCurva({ ...curva, nivel_max: Math.max(2, Math.min(200, v)) })} suffix="níveis" min={2} hint="Último nível que o aluno pode alcançar." disabled={!podeGerenciar} />
          </div>

          <div className="mt-4 flex min-h-0 flex-1 flex-col">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-1">
              <span className="text-xs font-medium text-muted-foreground">Todos os níveis (XP acumulado · custo · cargo)</span>
              <span className="text-xs text-muted-foreground">Máx.: <span className="font-semibold text-foreground tabular-nums">{xpMaximo.toLocaleString('pt-BR')} XP</span> no nível {nivelMax}</span>
            </div>
            <div className="grid min-h-0 max-h-[24rem] flex-1 grid-cols-2 content-start gap-1.5 overflow-auto rounded-lg border bg-muted/20 p-2 sm:grid-cols-3 lg:max-h-none">
              {niveis.map((l) => {
                const iniciaCargo = curva.titulos?.some((t) => t.nivel_min === l.n)
                return (
                  <div key={l.n} className={`rounded-md border px-2.5 py-1.5 ${iniciaCargo ? 'border-primary/40 bg-primary/5' : 'bg-card'}`}>
                    <div className="flex items-baseline justify-between gap-1">
                      <span className="text-xs font-semibold">Nível {l.n}</span>
                      {l.custo > 0 && <span className="text-[10px] text-muted-foreground">+{l.custo.toLocaleString('pt-BR')}</span>}
                    </div>
                    <div className="text-[11px] tabular-nums text-muted-foreground">{l.acc.toLocaleString('pt-BR')} XP</div>
                    {l.titulo && <div className="mt-0.5 truncate text-[10px] font-medium text-primary" title={l.titulo}>{l.titulo}</div>}
                  </div>
                )
              })}
            </div>
          </div>
        </SectionCard>

        <SectionCard titulo="Cargos por nível" icon={Briefcase} tom="#10b981" descricao="Título exibido ao aluno a partir de cada nível (ex.: Aprendiz → Júnior → Sênior → Promotor → Advogado). Vale até o próximo cargo." className="flex flex-col lg:h-[34rem]">
          <div className="min-h-0 max-h-[24rem] flex-1 space-y-2 overflow-auto rounded-lg border bg-muted/10 p-2 lg:max-h-none">
            {[...titulos].sort((a, b) => a.nivel_min - b.nivel_min).map((t) => {
              const i = titulos.indexOf(t)
              return (
                <div key={i} className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Briefcase className="h-5 w-5" /></span>
                  <label className="w-28 space-y-1">
                    <span className="block text-[11px] font-medium text-muted-foreground">A partir do nível</span>
                    <Input type="number" min={1} value={t.nivel_min} onChange={(e) => setTitulo(i, { nivel_min: Math.max(1, Number(e.target.value || 1)) })} disabled={!podeGerenciar} />
                  </label>
                  <label className="min-w-[140px] flex-1 space-y-1">
                    <span className="block text-[11px] font-medium text-muted-foreground">Cargo / título</span>
                    <Input value={t.titulo} onChange={(e) => setTitulo(i, { titulo: e.target.value })} disabled={!podeGerenciar} placeholder="Ex.: Advogado" />
                  </label>
                  {podeGerenciar && <Button type="button" variant="ghost" size="icon" onClick={() => remTitulo(i)} aria-label={`Remover ${t.titulo}`} className="self-end text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>}
                </div>
              )
            })}
            {titulos.length === 0 && <p className="rounded-lg border bg-muted/30 p-4 text-center text-sm text-muted-foreground">Nenhum cargo. Adicione o primeiro (a partir do nível 1).</p>}
          </div>
          {podeGerenciar && <Button type="button" variant="outline" onClick={addTitulo} className="mt-3 self-start"><Plus className="h-4 w-4" /> Adicionar cargo</Button>}
        </SectionCard>
      </div>
    </form>
  )
}
