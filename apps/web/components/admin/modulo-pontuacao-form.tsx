'use client'

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Trophy, Check, Plus, Minus, Trash2, BookOpen, ListChecks, Target, Flame, CalendarDays, Filter, Link2, Unlink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { salvarPontuacaoModulo } from '@/app/admin/leitura/actions'
import { type PontuacaoLeitura, type MarcoSequencia, bonusSequenciaLeitura, bonusConclusaoLeitura } from '@/lib/leitura/pontuacao'
import { useRegistrarSalvavel } from '@/components/admin/config-modulo-salvar'

type CampoNum = 'pontos_aula' | 'pontos_quiz' | 'pontos_acerto' | 'combo_bonus' | 'bonus_semana' | 'dias_ativo'

// Valor padrão ao LIGAR um item que estava zerado (desligado).
const PADRAO_AO_LIGAR: Record<CampoNum, number> = { pontos_aula: 5, pontos_quiz: 5, pontos_acerto: 1, combo_bonus: 10, bonus_semana: 10, dias_ativo: 7 }

/** Seletor liga/desliga (switch) — é a "condição" de cada regra: define se aquele ponto é concedido. */
function Switch({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)}
      className={cn('relative h-5 w-9 shrink-0 rounded-full transition-colors', checked ? 'bg-primary' : 'bg-muted', disabled && 'opacity-40')}>
      <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all', checked ? 'left-[18px]' : 'left-0.5')} />
    </button>
  )
}

/** Stepper com botões −/+ (substitui as setinhas nativas, feias e inconsistentes entre navegadores). */
function Stepper({ value, onChange, min = 0, step = 1, disabled, largura = 'w-14' }: { value: number; onChange: (n: number) => void; min?: number; step?: number; disabled?: boolean; largura?: string }) {
  const set = (n: number) => onChange(Math.max(min, Math.round(n)))
  const Btn = ({ children, delta, canto }: { children: React.ReactNode; delta: number; canto: string }) => (
    <button type="button" tabIndex={-1} disabled={disabled || (delta < 0 && value <= min)} onClick={() => set(value + delta)}
      className={cn('flex h-9 w-8 items-center justify-center text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary disabled:pointer-events-none disabled:opacity-30', canto)}>
      {children}
    </button>
  )
  return (
    <div className={cn('inline-flex items-center overflow-hidden rounded-lg border bg-[var(--input-bg,transparent)] shadow-sm transition-opacity focus-within:ring-1 focus-within:ring-ring', disabled && 'opacity-40')}>
      <Btn delta={-step} canto="rounded-l-lg border-r"><Minus className="h-3.5 w-3.5" /></Btn>
      <input type="text" inputMode="numeric" value={value} disabled={disabled}
        onChange={(e) => set(Number(e.target.value.replace(/[^\d]/g, '')) || 0)}
        className={cn('h-9 bg-transparent text-center text-sm font-medium tabular-nums outline-none', largura)} />
      <Btn delta={step} canto="rounded-r-lg border-l"><Plus className="h-3.5 w-3.5" /></Btn>
    </div>
  )
}

/**
 * Bônus por quantidade de dias, em DOIS modos: AUTOMÁTICO (+X a cada N dias, repetindo) ou
 * PERSONALIZADO (marcos editáveis dia→bônus). Serve p/ SEQUÊNCIA ("Ao atingir") e CONCLUSÃO ("Ao concluir").
 */
function BonusDias({ Icon, titulo, descricao, termo, modo, onModo, cada, onCada, pts, onPts, marcos, onMarcos }: {
  Icon: any; titulo: string; descricao: string; termo: string
  modo: 'auto' | 'custom'; onModo: (m: 'auto' | 'custom') => void
  cada: number; onCada: (n: number) => void; pts: number; onPts: (n: number) => void
  marcos: MarcoSequencia[]; onMarcos: (m: MarcoSequencia[]) => void
}) {
  const add = () => { const u = marcos.length ? marcos[marcos.length - 1].dias : 7; onMarcos([...marcos, { dias: u + 7, bonus: 10 }]) }
  const setM = (i: number, patch: Partial<MarcoSequencia>) => onMarcos(marcos.map((m, j) => (j === i ? { ...m, ...patch } : m)))
  const rem = (i: number) => onMarcos(marcos.filter((_, j) => j !== i))
  const Tab = ({ v, label }: { v: 'auto' | 'custom'; label: string }) => (
    <button type="button" onClick={() => onModo(v)}
      className={cn('rounded-md px-2.5 py-1 text-xs font-medium transition-colors', modo === v ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>{label}</button>
  )
  return (
    <div className="rounded-xl border bg-background/40 p-3">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="h-4 w-4" /></span>
          <div>
            <div className="text-sm font-medium">{titulo}</div>
            <div className="text-[11px] text-muted-foreground">{descricao}</div>
          </div>
        </div>
        <div className="inline-flex rounded-lg border bg-card p-0.5">
          <Tab v="auto" label="Automático" />
          <Tab v="custom" label="Personalizado" />
        </div>
      </div>

      {modo === 'auto' ? (
        <div className="flex flex-wrap items-center gap-1.5 rounded-lg border bg-card px-2.5 py-2 text-sm">
          <span className="text-xs text-muted-foreground">a cada</span>
          <Stepper value={cada} min={1} onChange={onCada} />
          <span className="text-xs text-muted-foreground">dias →</span>
          <span className="text-xs font-semibold text-primary">+</span>
          <Stepper value={pts} onChange={onPts} />
          <span className="text-xs text-muted-foreground">pts</span>
          <span className="ml-1 text-[11px] text-muted-foreground">(repete a cada ciclo)</span>
        </div>
      ) : (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">Defina quantos marcos quiser — cada dia com seu bônus.</span>
            <button type="button" onClick={add} className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium hover:bg-muted"><Plus className="h-3.5 w-3.5" /> Adicionar</button>
          </div>
          {marcos.length === 0 && <p className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">Nenhum marco. Clique em “Adicionar”.</p>}
          {marcos.map((m, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg border bg-card px-2.5 py-2 text-sm">
              <span className="text-xs text-muted-foreground">{termo}</span>
              <Stepper value={m.dias} min={1} onChange={(n) => setM(i, { dias: Math.max(1, n) })} />
              <span className="text-xs text-muted-foreground">dias →</span>
              <span className="text-xs font-semibold text-primary">+</span>
              <Stepper value={m.bonus} onChange={(n) => setM(i, { bonus: n })} />
              <span className="text-xs text-muted-foreground">pts</span>
              <button type="button" onClick={() => rem(i)} className="ml-auto text-muted-foreground hover:text-destructive" aria-label="Remover marco"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** Parâmetro editável do cálculo do máximo (aulas / questões / dias) com o subtotal ao lado. */
function ParamMax({ label, extra, value, onChange, min = 0 }: { label: string; extra: React.ReactNode; value: number; onChange: (n: number) => void; min?: number }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border bg-card/70 px-2.5 py-1.5">
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-medium leading-tight">{label}</div>
        <div className="text-[10px] leading-tight text-muted-foreground">{extra}</div>
      </div>
      <Stepper value={value} onChange={onChange} min={min} largura="w-10" />
    </div>
  )
}

/**
 * Config de PONTUAÇÃO do módulo (LegProc) — usada pelo ranking/gamificação. Fica DORMENTE enquanto a
 * gamificação do tenant estiver desligada (o ranking usa só acertos). Cada regra tem um seletor
 * (liga/desliga) = a condição do que será pontuado; desligar zera aquele ponto.
 */
export function ModuloPontuacaoForm({ pastaId, atual, totalAulas }: { pastaId: string; atual: PontuacaoLeitura; totalAulas?: number }) {
  const [cfg, setCfg] = useState<PontuacaoLeitura>(atual)
  // Parâmetros do cálculo do máximo (puxados do módulo quando dá; editáveis p/ simular).
  const [aulasSim, setAulasSim] = useState<number>(totalAulas ?? 0)              // nº de aulas
  const [qPorAula, setQPorAula] = useState<number>(0)                            // questões por aula (p/ "por acerto")
  const [diasSim, setDiasSim] = useState<number>(totalAulas && totalAulas > 0 ? totalAulas : 30) // dias de sequência (1 aula/dia)
  const [vincular, setVincular] = useState(true)                                 // aulas e dias mudam juntos (1 aula/dia)
  const [salvando, setSalvando] = useState(false)
  const baseRef = useRef(JSON.stringify(atual))
  const dirty = JSON.stringify(cfg) !== baseRef.current
  // Lembra o último valor positivo digitado, p/ restaurar ao religar um item (em vez de voltar ao padrão).
  const ultimoRef = useRef<Partial<Record<CampoNum, number>>>({})

  function setNum(k: CampoNum, v: string | number) {
    const n = Math.max(0, Math.round(Number(v) || 0))
    if (n > 0) ultimoRef.current[k] = n
    setCfg((c) => ({ ...c, [k]: n }))
  }
  function toggle(k: CampoNum, on: boolean) {
    setCfg((c) => ({ ...c, [k]: on ? (ultimoRef.current[k] ?? PADRAO_AO_LIGAR[k]) : 0 }))
  }

  // Marcos: SEQUÊNCIA (dias seguidos) e CONCLUSÃO (dias no total) — editados em dois blocos.
  const marcos = cfg.marcos_sequencia ?? []
  const marcosConcl = cfg.marcos_conclusao ?? []

  async function salvar(): Promise<boolean> {
    setSalvando(true)
    // Ordena por dias e remove inválidos antes de salvar (ambas as listas).
    const limpar = (arr: MarcoSequencia[]) => [...arr].filter((m) => m.dias > 0).sort((a, b) => a.dias - b.dias)
    const payload = { ...cfg, marcos_sequencia: limpar(marcos), marcos_conclusao: limpar(marcosConcl) }
    const r = await salvarPontuacaoModulo(pastaId, payload)
    setSalvando(false)
    if (r.ok) { setCfg(payload); baseRef.current = JSON.stringify(payload); return true }
    return false
  }
  async function salvarSozinho() {
    const ok = await salvar()
    if (ok) toast.success('Pontuação salva'); else toast.error('Erro ao salvar')
  }
  const noSalvarUnico = useRegistrarSalvavel(`${pastaId}:pontuacao`, dirty, salvar)

  /** Linha de regra: seletor (liga/desliga) + rótulo/descrição + valor. Uma embaixo da outra. */
  function Linha({ Icon, label, dica, k, ativo, onToggle, sufixo }: { Icon: any; label: string; dica: string; k: CampoNum; ativo: boolean; onToggle: (v: boolean) => void; sufixo?: string }) {
    return (
      <div className={cn('flex items-center gap-3 rounded-xl border bg-background/40 p-3 transition-opacity', !ativo && 'opacity-70')}>
        <Switch checked={ativo} onChange={onToggle} />
        <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', ativo ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}><Icon className="h-4 w-4" /></span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">{label}</div>
          <div className="text-[11px] text-muted-foreground">{dica}</div>
        </div>
        <div className="flex items-center gap-1.5">
          <Stepper value={cfg[k]} onChange={(n) => setNum(k, n)} disabled={!ativo} />
          <span className="w-10 text-[11px] text-muted-foreground">{sufixo ?? 'pts'}</span>
        </div>
      </div>
    )
  }

  const Titulo = ({ children }: { children: React.ReactNode }) => (
    <p className="pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{children}</p>
  )

  // ── Potencial de pontos com a configuração atual ──
  // Por AULA 100% (leitura + quiz + combo). O "por acerto" depende do nº de questões de cada quiz e a
  // sequência depende dos dias — por isso entram como complemento (não no número fixo do módulo).
  const temSeq = cfg.sequencia_modo === 'auto' ? cfg.bonus_semana > 0 : marcos.length > 0
  const temConcl = cfg.conclusao_modo === 'auto' ? cfg.conclusao_bonus > 0 : marcosConcl.length > 0
  const fmtNum = (n: number) => n.toLocaleString('pt-BR')
  // Componentes do máximo: conteúdo + acerto + sequência (streak) + conclusão (total de dias feitos).
  const maxPorAula = cfg.pontos_aula + cfg.pontos_quiz + (cfg.combo_ativo ? cfg.combo_bonus : 0)
  const maxConteudo = maxPorAula * aulasSim
  const maxAcerto = cfg.pontos_acerto * qPorAula * aulasSim
  const maxSeq = bonusSequenciaLeitura(diasSim, cfg)        // pelos dias consecutivos (streak)
  const maxConclusao = bonusConclusaoLeitura(diasSim, cfg)  // também pelos consecutivos
  const maxTotal = maxConteudo + maxAcerto + maxSeq + maxConclusao

  return (
    <div className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm">
      <div className="flex items-start gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Trophy className="h-5 w-5" /></span>
        <div>
          <h3 className="text-sm font-semibold tracking-tight">Pontuação (gamificação)</h3>
          <p className="text-xs text-muted-foreground">Ligue/desligue cada regra e defina quantos pontos ela vale. <strong>Fica dormente até a gamificação ser ativada</strong> — enquanto isso o ranking usa só os acertos.</p>
        </div>
      </div>

      {/* Pontos por atividade — uma embaixo da outra, cada uma com seu seletor. */}
      <Titulo>Pontos por atividade</Titulo>
      <div className="space-y-2">
        <Linha Icon={BookOpen} label="Pontos por leitura" dica="Ao concluir a leitura da aula." k="pontos_aula" ativo={cfg.pontos_aula > 0} onToggle={(v) => toggle('pontos_aula', v)} />
        <Linha Icon={ListChecks} label="Pontos por quiz" dica="Ao concluir o quiz (independe de acerto)." k="pontos_quiz" ativo={cfg.pontos_quiz > 0} onToggle={(v) => toggle('pontos_quiz', v)} />
        <Linha Icon={Target} label="Pontos por acerto" dica="Cada questão certa no quiz." k="pontos_acerto" ativo={cfg.pontos_acerto > 0} onToggle={(v) => toggle('pontos_acerto', v)} />
        <Linha Icon={Flame} label="Bônus de combo" dica="Por aula gabaritada (100% do quiz)." k="combo_bonus" ativo={cfg.combo_ativo} onToggle={(v) => setCfg((c) => ({ ...c, combo_ativo: v, combo_bonus: v && !c.combo_bonus ? (ultimoRef.current.combo_bonus ?? PADRAO_AO_LIGAR.combo_bonus) : c.combo_bonus }))} />
      </div>

      {/* Conclusão (dias consecutivos concluídos) — modo Automático (ciclo) OU Personalizado (marcos). */}
      <Titulo>Conclusão de dias</Titulo>
      <BonusDias Icon={CalendarDays} titulo="Bônus de conclusão" termo="Ao concluir"
        descricao="Pelos dias CONSECUTIVOS concluídos (zera se pular um dia)."
        modo={cfg.conclusao_modo} onModo={(m) => setCfg((c) => ({ ...c, conclusao_modo: m }))}
        cada={cfg.conclusao_cada} onCada={(n) => setCfg((c) => ({ ...c, conclusao_cada: Math.max(1, n) }))}
        pts={cfg.conclusao_bonus} onPts={(n) => setCfg((c) => ({ ...c, conclusao_bonus: Math.max(0, n) }))}
        marcos={marcosConcl} onMarcos={(m) => setCfg((c) => ({ ...c, marcos_conclusao: m }))} />

      {/* Sequência — mesma mecânica: Automático OU Personalizado. */}
      <Titulo>Sequência</Titulo>
      <BonusDias Icon={Flame} titulo="Bônus de sequência" termo="Ao atingir"
        descricao="Pelos dias de sequência (streak)."
        modo={cfg.sequencia_modo} onModo={(m) => setCfg((c) => ({ ...c, sequencia_modo: m }))}
        cada={cfg.semana_dias} onCada={(n) => setCfg((c) => ({ ...c, semana_dias: Math.max(1, n) }))}
        pts={cfg.bonus_semana} onPts={(n) => setNum('bonus_semana', n)}
        marcos={marcos} onMarcos={(m) => setCfg((c) => ({ ...c, marcos_sequencia: m }))} />

      {/* Ranking — filtro de recência (não é ponto, é condição de quem aparece). */}
      <Titulo>Ranking</Titulo>
      <div className="space-y-2">
        <Linha Icon={Filter} label="Filtrar “praticando” por recência" dica="Só entram no ranking quem fez aula nos últimos N dias (desligado = todos com atividade)." k="dias_ativo" ativo={cfg.dias_ativo > 0} onToggle={(v) => toggle('dias_ativo', v)} sufixo="dias" />
      </div>

      {/* Pontuação máxima possível — SOMA conteúdo + acerto + sequência (com a config atual). */}
      <div className="mt-1 rounded-xl border border-primary/30 bg-primary/[0.06] p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary"><Trophy className="h-4 w-4" /></span>
            <div>
              <p className="text-sm font-semibold">Pontuação máxima possível</p>
              <p className="text-[11px] text-muted-foreground">Tudo somado: leitura + quiz{cfg.combo_ativo ? ' + combo' : ''}{cfg.pontos_acerto > 0 ? ' + acerto' : ''}{temSeq ? ' + sequência' : ''}{temConcl ? ' + conclusão' : ''}.</p>
            </div>
          </div>
          <div className="text-right">
            <span className="text-2xl font-extrabold tabular-nums text-primary">{fmtNum(maxTotal)}</span>
            <span className="ml-1 text-xs font-medium text-muted-foreground">pts</span>
          </div>
        </div>

        {/* Vínculo aulas × dias: juntos (1 aula/dia) ou separados. Só quando há bônus de sequência. */}
        {temSeq && (
          <div className="mt-2.5 flex items-center gap-2 border-t pt-2.5">
            <Switch checked={vincular} onChange={(v) => { setVincular(v); if (v) setDiasSim(aulasSim) }} />
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
              {vincular ? <Link2 className="h-3.5 w-3.5 text-primary" /> : <Unlink className="h-3.5 w-3.5" />}
              {vincular ? 'Aulas e dias juntos (1 aula/dia)' : 'Aulas e dias separados'}
            </span>
          </div>
        )}

        {/* Parâmetros editáveis (puxados do módulo quando dá; ajuste para simular). */}
        <div className={cn('mt-2.5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3', !temSeq && 'border-t pt-2.5')}>
          <ParamMax label={vincular && temSeq ? 'Aulas no módulo (= dias)' : 'Aulas no módulo'} value={aulasSim}
            onChange={(n) => { setAulasSim(n); if (vincular) setDiasSim(n) }}
            extra={<>× {fmtNum(maxPorAula)} = <b className="text-foreground">{fmtNum(maxConteudo)} pts</b></>} />
          {cfg.pontos_acerto > 0 && (
            <ParamMax label="Questões por aula" value={qPorAula} onChange={setQPorAula}
              extra={<>× {cfg.pontos_acerto} × {fmtNum(aulasSim)} = <b className="text-foreground">{fmtNum(maxAcerto)} pts</b></>} />
          )}
          {temSeq && (
            <ParamMax label={vincular ? 'Dias de sequência (= aulas)' : 'Dias de sequência'} value={diasSim} min={0}
              onChange={(n) => { setDiasSim(n); if (vincular) setAulasSim(n) }}
              extra={<>sequência = <b className="text-foreground">{fmtNum(maxSeq)} pts</b></>} />
          )}
        </div>

        {/* Composição do total + ação para usar o nº detectado. */}
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="rounded-full border bg-card px-2 py-0.5">Conteúdo <b>{fmtNum(maxConteudo)}</b></span>
          {cfg.pontos_acerto > 0 && <span className="rounded-full border bg-card px-2 py-0.5">Acerto <b>{fmtNum(maxAcerto)}</b></span>}
          {temSeq && <span className="rounded-full border bg-card px-2 py-0.5">Sequência <b>{fmtNum(maxSeq)}</b></span>}
          {temConcl && <span className="rounded-full border bg-card px-2 py-0.5">Conclusão <b>{fmtNum(maxConclusao)}</b></span>}
          <span className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-primary">Total <b>{fmtNum(maxTotal)}</b></span>
          {totalAulas != null && totalAulas > 0 && totalAulas !== aulasSim && (
            <button type="button" onClick={() => { setAulasSim(totalAulas); setDiasSim(totalAulas) }} className="font-medium text-primary underline-offset-2 hover:underline">usar detectado ({fmtNum(totalAulas)})</button>
          )}
          {(totalAulas == null || totalAulas === 0) && <span className="text-amber-600 dark:text-amber-400">nº de aulas não detectado — digite acima</span>}
        </div>
        {temSeq && <p className="mt-2 text-[11px] text-muted-foreground">A sequência assume 1 aula por dia (atividade em dias consecutivos). Ajuste “Dias de sequência” para outro cenário.</p>}
      </div>

      {!noSalvarUnico && (
        <div className="flex justify-end pt-1">
          <button type="button" onClick={salvarSozinho} disabled={salvando}
            className={cn('inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50')}>
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Salvar pontuação
          </button>
        </div>
      )}
    </div>
  )
}
