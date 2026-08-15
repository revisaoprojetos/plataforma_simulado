'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Power, Flame, Gift, Shield, CalendarDays, Target, Clock, Sparkles, Route, Check } from 'lucide-react'
import type { GamConfig, TrilhaEstilo } from '@/lib/gamificacao/config'
import { cn } from '@/lib/utils'
import { salvarRegrasGerais } from '../actions'
import { NumberField, TextField, SaveBar } from './_campos'
import { useUnsavedGuard } from '@/components/admin/use-unsaved-guard'
import { confirmar } from '@/components/ui/confirm-dialog'

// Card de regra "inovador": faixa colorida + ícone + toggle opcional, com o corpo desabilitável.
function RuleCard({ icon: Icon, tom, titulo, descricao, ativo, onToggle, disabled, children }: {
  icon: any; tom: string; titulo: string; descricao: string; ativo?: boolean; onToggle?: (v: boolean) => void; disabled?: boolean; children?: React.ReactNode
}) {
  const ligavel = onToggle != null
  const off = ligavel && !ativo
  return (
    <div className="overflow-hidden rounded-2xl border bg-card shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start gap-3 p-4" style={{ background: `linear-gradient(180deg, color-mix(in oklab, ${tom} 10%, transparent), transparent)` }}>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: `color-mix(in oklab, ${tom} 18%, transparent)`, color: tom }}><Icon className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">{titulo}</h3>
            {ligavel && <Switch checked={!!ativo} onCheckedChange={onToggle} disabled={disabled} />}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{descricao}</p>
        </div>
      </div>
      {children && <div className={`space-y-2.5 px-4 pb-4 ${off ? 'pointer-events-none opacity-50' : ''}`}>{children}</div>}
    </div>
  )
}

export function RegrasGeraisForm({ config, podeGerenciar }: { config: GamConfig; podeGerenciar: boolean }) {
  const [ativo, setAtivo] = useState(config.ativo)
  const [timezone, setTimezone] = useState(config.timezone)
  const [streak, setStreak] = useState(config.xp_regras.streak)
  const [chest, setChest] = useState(config.xp_regras.chest)
  const [fimSemana, setFimSemana] = useState(config.xp_regras.fim_semana)
  const [metaDia, setMetaDia] = useState(config.xp_regras.meta_dia)
  const [trilhaEstilo, setTrilhaEstilo] = useState<TrilhaEstilo>(config.trilha_estilo)
  const [trilhaVisiveis, setTrilhaVisiveis] = useState<number>(config.trilha_visiveis)
  const [salvando, start] = useTransition()
  const { dirty, markSaved } = useUnsavedGuard({ ativo, timezone, streak, chest, fimSemana, metaDia, trilhaEstilo, trilhaVisiveis })

  // Ativar/desativar a gamificação exige confirmação (impacto amplo no portal do aluno).
  async function pedirToggleAtivo(v: boolean) {
    const ok = await confirmar({
      titulo: v ? 'Ativar a gamificação?' : 'Desativar a gamificação?',
      mensagem: v
        ? 'XP, níveis, ligas, sequência (streak), missões e conquistas passarão a aparecer para TODOS os alunos desta plataforma, e o sistema voltará a creditar XP. Salve para aplicar.'
        : 'Todas as áreas de gamificação (Trilha, Ligas, XP, níveis, sequência, missões e conquistas) serão OCULTADAS dos alunos e o sistema deixa de creditar XP. O histórico é preservado. Salve para aplicar.',
      confirmar: v ? 'Sim, ativar' : 'Sim, desativar',
      destrutivo: !v,
    })
    if (ok) setAtivo(v)
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    // Só envia trilha_estilo/trilha_visiveis quando o usuário mexeu na trilha — assim um simples
    // ativar/desativar (ou editar streak/meta) salva limpo sem disparar o aviso de migração da trilha.
    const trilhaMudou = trilhaEstilo !== config.trilha_estilo || trilhaVisiveis !== config.trilha_visiveis
    start(async () => {
      const r: any = await salvarRegrasGerais({
        ativo, timezone, streak, chest, fim_semana: fimSemana, meta_dia: metaDia,
        ...(trilhaMudou ? { trilha_estilo: trilhaEstilo, trilha_visiveis: trilhaVisiveis } : {}),
      })
      if (r?.error) toast.error(r.error); else { toast.success(r?.aviso ?? 'Regras gerais salvas.'); markSaved() }
    })
  }

  const ESTILOS: { v: TrilhaEstilo; nome: string; desc: string }[] = [
    { v: 'cards', nome: 'Cards', desc: 'Cards largos com capa do banco, hover revela ações.' },
    { v: 'caminho', nome: 'Caminho (Duolingo)', desc: 'Nós centrais em caminho vertical, com desbloqueio em sequência.' },
  ]
  const dis = !podeGerenciar

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {podeGerenciar && <SaveBar salvando={salvando} dirty={dirty} hint="Ativação, streak, baú, fim de semana, meta diária e fuso." />}

      {/* Hero de ativação */}
      <div className={`flex items-center justify-between gap-4 overflow-hidden rounded-2xl border p-5 shadow-sm ${ativo ? 'border-emerald-500/40 bg-gradient-to-br from-emerald-500/[0.10] to-card' : 'bg-card'}`}>
        <div className="flex items-center gap-3">
          <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${ativo ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-muted text-muted-foreground'}`}><Power className="h-5 w-5" /></span>
          <div>
            <Label className="text-base font-semibold">Gamificação {ativo ? 'ativa' : 'inativa'}</Label>
            <p className="mt-0.5 text-xs text-muted-foreground">Liga XP, níveis, ligas, streak, missões e conquistas para os alunos desta plataforma.</p>
          </div>
        </div>
        <Switch checked={ativo} onCheckedChange={pedirToggleAtivo} disabled={dis} />
      </div>

      {/* Grade de regras */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <RuleCard icon={Flame} tom="#f97316" titulo="Sequência diária (streak)" descricao="Recompensa por manter dias seguidos de atividade — cresce com a sequência.">
          <NumberField stacked label="XP por dia" value={streak.por_dia} onChange={(v) => setStreak({ ...streak, por_dia: v })} suffix="XP × dias" hint="Multiplicado pela sequência atual." disabled={dis} />
          <NumberField stacked label="Teto do XP diário" value={streak.cap} onChange={(v) => setStreak({ ...streak, cap: v })} suffix="XP máx./dia" hint="Limite do bônus diário." disabled={dis} />
        </RuleCard>

        <RuleCard icon={Shield} tom="#0ea5e9" titulo="Proteção de sequência" descricao="Dias de folga que o aluno pode faltar sem perder a sequência.">
          <NumberField stacked label="Dias de tolerância" value={streak.tolerancia_dias} onChange={(v) => setStreak({ ...streak, tolerancia_dias: Math.max(0, v) })} suffix="dias de folga" hint="0 = perde ao faltar 1 dia. 1 = pode faltar 1 dia." disabled={dis} />
        </RuleCard>

        <RuleCard icon={Gift} tom="#8b5cf6" titulo="Baú de sequência" descricao="Prêmio extra em XP a cada ciclo de dias de sequência.">
          <NumberField stacked label="A cada N dias" value={chest.cada_n_dias} onChange={(v) => setChest({ ...chest, cada_n_dias: v })} suffix="dias" min={1} disabled={dis} />
          <NumberField stacked label="XP do baú" value={chest.xp} onChange={(v) => setChest({ ...chest, xp: v })} suffix="XP" disabled={dis} />
        </RuleCard>

        <RuleCard icon={CalendarDays} tom="#f59e0b" titulo="Bônus de fim de semana" descricao="Multiplica o XP de simulados e prática aos sábados e domingos." ativo={fimSemana.ativo} onToggle={(v) => setFimSemana({ ...fimSemana, ativo: v })} disabled={dis}>
          <NumberField stacked label="Multiplicador" value={fimSemana.multiplicador} onChange={(v) => setFimSemana({ ...fimSemana, multiplicador: Math.max(1, v) })} suffix="× no fim de semana" min={1} step={1} hint="Ex.: 2 = dobro de XP no sábado e domingo." disabled={dis} />
        </RuleCard>

        <RuleCard icon={Target} tom="#10b981" titulo="Meta diária de XP" descricao="Alvo de XP por dia exibido ao aluno. Opcionalmente concede um bônus ao ser atingida.">
          <div className="grid grid-cols-2 gap-2.5">
            <NumberField stacked label="Alvo do dia" value={metaDia.xp} onChange={(v) => setMetaDia({ ...metaDia, xp: Math.max(0, v) })} suffix="XP/dia" hint="0 = oculta a meta." disabled={dis} />
            <NumberField stacked label="Bônus ao atingir" value={metaDia.bonus} onChange={(v) => setMetaDia({ ...metaDia, bonus: Math.max(0, v) })} suffix="XP" hint="0 = só exibição, sem bônus." disabled={dis} />
          </div>
        </RuleCard>

        <RuleCard icon={Clock} tom="#64748b" titulo="Fuso horário" descricao="Define a virada do dia para streak, missões e meta diária.">
          <TextField label="Timezone" value={timezone} onChange={setTimezone} placeholder="America/Sao_Paulo" disabled={dis} />
        </RuleCard>
      </div>

      {/* Estilo (designer) da trilha no portal do aluno */}
      <div className="rounded-2xl border bg-card p-5 shadow-sm">
        <div className="mb-3 flex items-start gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: 'color-mix(in oklab, #6366f1 18%, transparent)', color: '#6366f1' }}><Route style={{ width: 18, height: 18 }} /></span>
          <div>
            <h3 className="text-sm font-semibold leading-tight">Estilo da trilha</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">Como a trilha de simulados aparece na Início do aluno.</p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {ESTILOS.map((e) => {
            const on = trilhaEstilo === e.v
            return (
              <button key={e.v} type="button" disabled={dis} onClick={() => setTrilhaEstilo(e.v)}
                className={cn('rounded-xl border p-3 text-left transition-colors', on ? 'border-primary/50 bg-primary/[0.06]' : 'hover:bg-muted/50', dis && 'cursor-not-allowed opacity-60')}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{e.nome}</span>
                  {on ? <span className="inline-flex items-center gap-1 text-xs font-medium text-primary"><Check className="h-3.5 w-3.5" /> selecionado</span> : <span className="text-[11px] text-muted-foreground">selecionar</span>}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{e.desc}</p>
              </button>
            )
          })}
        </div>
        <div className="mt-3 max-w-xs">
          <NumberField label="Simulados visíveis (0 = todos)" value={trilhaVisiveis} onChange={(v) => setTrilhaVisiveis(Math.max(0, v))} suffix="antes de rolar" min={0} hint="Ex.: 3 mostra 3 + início do 4º; 0 mostra a trilha inteira sem rolagem." disabled={dis} />
        </div>
      </div>

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Sparkles className="h-3.5 w-3.5" /> O bônus de fim de semana e a meta diária valem para XP de simulados e prática. A meta diária depende da migração 20260812000003; o estilo da trilha, da 20260813000000.</p>
    </form>
  )
}
