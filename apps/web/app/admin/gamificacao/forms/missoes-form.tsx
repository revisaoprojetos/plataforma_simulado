'use client'

import { useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Plus, Trash2, Target, Sparkles, CalendarClock } from 'lucide-react'
import type { GamConfig, MissaoDef, MissaoTipo, MissoesConfig } from '@/lib/gamificacao/config'
import { DEFAULT_MISSOES } from '@/lib/gamificacao/config'
import { missoesDoDia } from '@/lib/gamificacao/rodizio'
import { diaLocal } from '@/lib/gamificacao/datas'
import { salvarMissoes } from '../actions'
import { SaveBar, SectionCard } from './_campos'
import { useUnsavedGuard } from '@/components/admin/use-unsaved-guard'

let seq = 0
const novoId = () => `m_${Date.now()}_${seq++}`
const TIPOS: { v: MissaoTipo; label: string }[] = [
  { v: 'finalizar_simulado', label: 'Concluir simulados' },
  { v: 'acertar_n', label: 'Acertar questões' },
  { v: 'praticar_n', label: 'Praticar questões' },
]
const selectCls = 'h-9 w-full rounded-lg border bg-background px-2 text-sm disabled:cursor-not-allowed disabled:opacity-60'

export function MissoesForm({ config, podeGerenciar }: { config: GamConfig; podeGerenciar: boolean }) {
  const [missoes, setMissoes] = useState<MissaoDef[]>(config.missoes_def)
  const [cfg, setCfg] = useState<MissoesConfig>(config.missoes_config)
  const [salvando, start] = useTransition()
  const { dirty, markSaved } = useUnsavedGuard({ missoes, cfg })

  const setById = (id: string, patch: Partial<MissaoDef>) => setMissoes((l) => l.map((x) => (x.id === id ? { ...x, ...patch } : x)))
  const remById = (id: string) => setMissoes((l) => l.filter((x) => x.id !== id))
  const add = () => setMissoes((l) => [{ id: novoId(), titulo: 'Nova missão', tipo: 'finalizar_simulado', meta: 1, xp: 20, ativa: true }, ...l])
  const addSugeridas = () => {
    const ids = new Set(missoes.map((m) => m.id))
    const faltando = DEFAULT_MISSOES.filter((m) => !ids.has(m.id))
    if (!faltando.length) { toast.info('Todas as missões sugeridas já estão na lista.'); return }
    setMissoes((l) => [...l, ...faltando.map((m) => ({ ...m }))])
    toast.success(`${faltando.length} missão(ões) sugerida(s) adicionada(s).`)
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    start(async () => {
      const r: any = await salvarMissoes(missoes, cfg)
      if (r?.error) toast.error(r.error)
      else { toast.success(r?.aviso ?? 'Missões salvas.'); markSaved() }
    })
  }

  const ativas = missoes.filter((m) => m.ativa !== false)
  // Prévia de hoje (mesma lógica do portal do aluno).
  const hoje = diaLocal(config.timezone)
  const doDia = useMemo(() => missoesDoDia(missoes, cfg, hoje), [missoes, cfg, hoje])

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {podeGerenciar && <SaveBar salvando={salvando} dirty={dirty} hint="Missões diárias do aluno." />}

      {/* Exibição / rodízio */}
      <SectionCard titulo="Como as missões aparecem" icon={CalendarClock} descricao="Escolha exibir todas as ativas ou fazer um rodízio de algumas por dia (renova à meia-noite, no fuso do tenant).">
        <div className="flex flex-wrap items-end gap-4">
          <label className="space-y-1">
            <span className="block text-[11px] font-medium text-muted-foreground">Modo</span>
            <select className={`${selectCls} w-56`} value={cfg.modo} onChange={(e) => setCfg({ ...cfg, modo: e.target.value as MissoesConfig['modo'] })} disabled={!podeGerenciar}>
              <option value="todas">Todas as ativas</option>
              <option value="rodizio">Rodízio (algumas por dia)</option>
            </select>
          </label>
          {cfg.modo === 'rodizio' && (
            <label className="space-y-1">
              <span className="block text-[11px] font-medium text-muted-foreground">Missões por dia</span>
              <Input type="number" min={1} max={Math.max(1, ativas.length)} value={cfg.por_dia} onChange={(e) => setCfg({ ...cfg, por_dia: Math.max(1, Number(e.target.value || 1)) })} disabled={!podeGerenciar} className="w-28 text-right tabular-nums" />
            </label>
          )}
          <div className="ml-auto rounded-lg border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{ativas.length}</span> ativa(s) · hoje aparece(m) <span className="font-medium text-foreground">{doDia.length}</span>
          </div>
        </div>

        {/* Prévia de hoje */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-medium text-muted-foreground">Hoje:</span>
          {doDia.length ? doDia.map((m) => (
            <span key={m.id} className="inline-flex items-center gap-1.5 rounded-full border bg-primary/5 px-2.5 py-1 text-xs">
              <Target className="h-3 w-3 text-primary" /> {m.titulo} <span className="text-muted-foreground">+{m.xp}</span>
            </span>
          )) : <span className="text-xs text-muted-foreground">nenhuma missão ativa</span>}
        </div>
      </SectionCard>

      {/* Catálogo de missões */}
      <SectionCard titulo="Missões" descricao="Ative/desative para escolher quais entram no rodízio. O aluno ganha o XP ao atingir a meta.">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">{missoes.length} missão(ões) · {ativas.length} ativa(s)</span>
          {podeGerenciar && (
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={addSugeridas}><Sparkles className="h-4 w-4" /> Sugeridas</Button>
              <Button type="button" variant="outline" onClick={add}><Plus className="h-4 w-4" /> Nova</Button>
            </div>
          )}
        </div>

        <div className="space-y-2">
          {missoes.map((m) => {
            const inativa = m.ativa === false
            return (
              <div key={m.id} className={`flex flex-wrap items-end gap-3 rounded-xl border p-3 transition-colors ${inativa ? 'bg-muted/10 opacity-70' : 'bg-card shadow-sm'}`}>
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${inativa ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary'}`}><Target className="h-5 w-5" /></span>
                <label className="min-w-[180px] flex-1 space-y-1">
                  <span className="block text-[11px] font-medium text-muted-foreground">Título</span>
                  <Input value={m.titulo} onChange={(e) => setById(m.id, { titulo: e.target.value })} disabled={!podeGerenciar} />
                </label>
                <label className="w-48 space-y-1">
                  <span className="block text-[11px] font-medium text-muted-foreground">Tipo</span>
                  <select className={selectCls} value={m.tipo} onChange={(e) => setById(m.id, { tipo: e.target.value as MissaoTipo })} disabled={!podeGerenciar}>
                    {TIPOS.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
                  </select>
                </label>
                <label className="w-24 space-y-1">
                  <span className="block text-[11px] font-medium text-muted-foreground">Meta</span>
                  <Input type="number" min={1} value={m.meta} onChange={(e) => setById(m.id, { meta: Number(e.target.value || 1) })} disabled={!podeGerenciar} className="text-right tabular-nums" />
                </label>
                <label className="w-24 space-y-1">
                  <span className="block text-[11px] font-medium text-muted-foreground">XP</span>
                  <Input type="number" min={0} value={m.xp} onChange={(e) => setById(m.id, { xp: Number(e.target.value || 0) })} disabled={!podeGerenciar} className="text-right tabular-nums" />
                </label>
                <div className="flex items-center gap-2 self-center pt-4">
                  <label className="flex items-center gap-1.5" title={inativa ? 'Ativar' : 'Desativar'}>
                    <Switch checked={!inativa} onCheckedChange={(v) => setById(m.id, { ativa: v })} disabled={!podeGerenciar} />
                    <span className="text-[11px] text-muted-foreground">{inativa ? 'Inativa' : 'Ativa'}</span>
                  </label>
                  {podeGerenciar && <Button type="button" variant="ghost" size="icon" onClick={() => remById(m.id)} aria-label={`Remover ${m.titulo}`} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>}
                </div>
              </div>
            )
          })}
          {missoes.length === 0 && <p className="rounded-lg border bg-muted/30 p-4 text-center text-sm text-muted-foreground">Nenhuma missão. Use “Sugeridas” ou “Nova”.</p>}
        </div>
      </SectionCard>
    </form>
  )
}
