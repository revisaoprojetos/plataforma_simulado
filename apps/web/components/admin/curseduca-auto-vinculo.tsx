'use client'

import { useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Loader2, Play, Check, X, Clock, CalendarClock, Plus, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getAutoVinculoPassaporte, salvarAutoVinculoPassaporte, rodarAutoVinculoPassaporteAgora, type AutoVinculoDTO } from '@/app/admin/curseduca/actions'

const HORAS = Array.from({ length: 24 }, (_, h) => h)
const INTERVALOS: [number, string][] = [[720, 'A cada 12 horas'], [1440, '1× por dia (24h)'], [2880, 'A cada 2 dias'], [10080, '1× por semana']]

/** Editor de chips (termos incluir/excluir). */
function Chips({ titulo, valores, onChange, cor, placeholder, disabled }: { titulo: string; valores: string[]; onChange: (v: string[]) => void; cor: 'emerald' | 'rose'; placeholder: string; disabled?: boolean }) {
  const [novo, setNovo] = useState('')
  const add = () => { const t = novo.trim().toLowerCase(); if (t && !valores.includes(t)) onChange([...valores, t]); setNovo('') }
  const tom = cor === 'emerald' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30' : 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/30'
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">{titulo}</label>
      <div className="flex flex-wrap gap-1.5">
        {valores.map((v) => (
          <span key={v} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${tom}`}>
            {v}
            {!disabled && <button type="button" onClick={() => onChange(valores.filter((x) => x !== v))} className="opacity-70 hover:opacity-100"><X className="h-3 w-3" /></button>}
          </span>
        ))}
        {!valores.length && <span className="text-xs text-muted-foreground">nenhum</span>}
      </div>
      {!disabled && (
        <div className="flex gap-2">
          <Input value={novo} onChange={(e) => setNovo(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }} placeholder={placeholder} className="h-8 text-sm" />
          <Button type="button" variant="outline" size="sm" onClick={add} disabled={!novo.trim()}><Plus className="h-3.5 w-3.5" /></Button>
        </div>
      )}
    </div>
  )
}

export function CurseducaAutoVinculo() {
  const [cfg, setCfg] = useState<AutoVinculoDTO | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, startSalvar] = useTransition()
  const [rodando, startRodar] = useTransition()

  useEffect(() => {
    getAutoVinculoPassaporte().then((r) => { if (r.ok && r.dados) setCfg(r.dados); else setErro(r.error ?? 'Falha ao carregar.') })
  }, [])

  if (erro) return <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-700 dark:text-amber-400">{erro}</div>
  if (!cfg) return <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Carregando…</div>

  const set = (patch: Partial<AutoVinculoDTO>) => setCfg((c) => (c ? { ...c, ...patch } : c))

  const salvar = () => startSalvar(async () => {
    const r = await salvarAutoVinculoPassaporte({ ativo: cfg.ativo, modo: cfg.modo, horario: cfg.horario, intervalo_min: cfg.intervalo_min, termos_incluir: cfg.termos_incluir, termos_excluir: cfg.termos_excluir })
    if (r.ok) toast.success('Automação salva.'); else toast.error(r.error ?? 'Erro ao salvar.')
  })

  const rodar = () => startRodar(async () => {
    const r = await rodarAutoVinculoPassaporteAgora()
    if (!r.ok && r.error) { toast.error(r.error); return }
    const res = r.resultado ?? {}
    if (res.status === 'sem_turmas') toast.info('Nenhuma turma casou os termos agora.')
    else if (res.gruposEncontrados != null) toast.success(`${res.gruposEncontrados} turma(s) encontrada(s) — import ${res.status === 'agendado' ? 'agendado' : 'iniciado'}.`)
    else toast.success('Execução disparada.')
    const rr = await getAutoVinculoPassaporte(); if (rr.ok && rr.dados) setCfg(rr.dados)
  })

  const fmt = (s: string | null) => (s ? new Date(s).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—')
  const ur = cfg.ultimoResultado

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-2xl border bg-card p-4 shadow-sm">
        <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><ShieldCheck className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Auto-vínculo Passaporte</p>
          <p className="text-sm text-muted-foreground">Todo dia varre as turmas da Curseduca cujo nome casa os termos abaixo e concede passaporte automaticamente (entra no grupo “Passaporte” + acesso aos simulados). Assim, turmas novas de passaporte entram sozinhas.</p>
        </div>
        <button type="button" onClick={() => set({ ativo: !cfg.ativo })}
          className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition-colors ${cfg.ativo ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-muted text-muted-foreground'}`}>
          {cfg.ativo ? '● Ativa' : '○ Inativa'}
        </button>
      </div>

      {/* Termos (regra dinâmica) */}
      <div className="grid gap-4 rounded-2xl border bg-card p-4 shadow-sm sm:grid-cols-2">
        <Chips titulo="Incluir (nome contém)" valores={cfg.termos_incluir} onChange={(v) => set({ termos_incluir: v })} cor="emerald" placeholder="ex.: passaporte" />
        <Chips titulo="Excluir (nome NÃO pode conter)" valores={cfg.termos_excluir} onChange={(v) => set({ termos_excluir: v })} cor="rose" placeholder="ex.: amostra" />
      </div>

      {/* Agendamento */}
      <div className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm">
        <p className="text-sm font-semibold">Agendamento</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => set({ modo: 'horario' })}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm ${cfg.modo === 'horario' ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'}`}>
            <Clock className="h-4 w-4" /> Horário fixo do dia
          </button>
          <button type="button" onClick={() => set({ modo: 'intervalo' })}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm ${cfg.modo === 'intervalo' ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'}`}>
            <CalendarClock className="h-4 w-4" /> Por intervalo
          </button>
        </div>
        {cfg.modo === 'horario' ? (
          <label className="block space-y-1">
            <span className="text-xs text-muted-foreground">Roda todo dia às (horário de Brasília)</span>
            <select value={cfg.horario} onChange={(e) => set({ horario: Number(e.target.value) })}
              className="h-9 w-40 rounded-lg border bg-[var(--input-bg,transparent)] px-3 text-sm outline-none focus:ring-2 focus:ring-ring">
              {HORAS.map((h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
            </select>
          </label>
        ) : (
          <label className="block space-y-1">
            <span className="text-xs text-muted-foreground">Frequência</span>
            <select value={cfg.intervalo_min} onChange={(e) => set({ intervalo_min: Number(e.target.value) })}
              className="h-9 w-52 rounded-lg border bg-[var(--input-bg,transparent)] px-3 text-sm outline-none focus:ring-2 focus:ring-ring">
              {INTERVALOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
        )}
      </div>

      {/* Último resultado */}
      <div className="rounded-2xl border bg-card p-4 text-sm shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-muted-foreground">Última execução: <b className="text-foreground">{fmt(cfg.ultimaExecucao)}</b></span>
          {ur && (
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ur.ok === false ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400' : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'}`}>
              {ur.ok === false ? 'erro' : ur.status ?? 'ok'}
            </span>
          )}
        </div>
        {ur && (
          <p className="mt-1 text-xs text-muted-foreground">
            {ur.error ? ur.error
              : ur.status === 'sem_turmas' ? 'Nenhuma turma casou os termos.'
                : `${ur.gruposEncontrados ?? 0} turma(s)${ur.jobId ? ` · import ${ur.dedup ? 'já agendado' : 'agendado'}` : ''}${Array.isArray(ur.gruposNomes) && ur.gruposNomes.length ? ` · ex.: ${ur.gruposNomes.slice(0, 3).join(', ')}${ur.gruposNomes.length > 3 ? '…' : ''}` : ''}`}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={salvar} disabled={salvando}>{salvando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />} Salvar</Button>
        <Button variant="outline" onClick={rodar} disabled={rodando}>{rodando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />} Rodar agora</Button>
      </div>
    </div>
  )
}
