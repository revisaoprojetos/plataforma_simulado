'use client'

import { useMemo } from 'react'
import type { DadosPreview } from '@/lib/revisao/cursos'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  MODELOS, BANCAS, ABAS_MATERIAL, LIB_OPCOES, nomeModelo, type CursoCfg, type ModeloId,
} from '@/lib/revisao/cursos-defs'
import { Campo, Chip, ToggleRow, inputCls } from './ui-cursos'

// Peças de "Como o aluno vê": galeria de modelos, ajustes do modelo e pré-visualização no celular.
// Usadas na criação (#novocurso) e na aba "Como o aluno vê" (#curso). Fiel ao protótipo (MODELOS_C / mOpts / mPreview).

const A = 'bg-primary', G = 'bg-amber-500', N = 'bg-foreground/10'
const bar = (cls: string, w: string, h = 12) => <i className={cn('block rounded-sm', cls)} style={{ width: w, height: h }} />

function Wire({ id }: { id: ModeloId }) {
  const box = 'flex w-full flex-col gap-1.5 rounded-lg bg-muted p-2.5'
  if (id === 'trilha') return <div className={box}>{bar(A, '40%')}{bar(A, '55%')}{bar(G, '70%')}{bar(N, '50%')}{bar(N, '62%')}</div>
  if (id === 'materia') return <div className={cn(box, 'flex-row flex-wrap')}>{bar(A, '47%', 32)}{bar(A, '47%', 32)}{bar(N, '47%', 32)}{bar(N, '47%', 32)}</div>
  if (id === 'contagem') return (
    <div className={cn(box, 'items-center')}>
      {bar(A, '38%', 26)}
      <div className="flex w-full gap-1">{[A, A, G, N, N, N].map((c, i) => <i key={i} className={cn('block h-4 flex-1 rounded-sm', c)} />)}</div>
      {bar(N, '100%')}
    </div>
  )
  if (id === 'semana') return <div className={box}>{bar(A, '100%', 14)}{bar(G, '100%', 30)}{bar(N, '100%', 14)}{bar(N, '100%', 14)}</div>
  if (id === 'temas') return <div className={box}>{bar(A, '92%', 10)}{bar(A, '78%', 10)}{bar(G, '64%', 10)}{bar(N, '48%', 10)}{bar(N, '34%', 10)}</div>
  if (id === 'material') return (
    <div className={box}>
      <div className="flex gap-1">{bar(A, '22%')}{bar(N, '22%')}{bar(N, '22%')}</div>
      {bar(N, '100%', 14)}{bar(N, '100%', 14)}{bar(N, '100%', 14)}
    </div>
  )
  return (
    <div className={box}>
      {[G, A, A].map((c, i) => <div key={i} className="flex gap-1"><i className={cn('block h-[22px] w-6 rounded-sm', c)} /><i className={cn('block h-[22px] flex-1 rounded-sm', N)} /></div>)}
    </div>
  )
}

export function ModeloGaleria({ atual, onPick }: { atual: string; onPick: (m: ModeloId) => void }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-3">
      {MODELOS.map((m) => {
        const on = atual === m.id
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => onPick(m.id)}
            aria-pressed={on}
            className={cn('flex flex-col gap-2 rounded-2xl border-2 bg-card p-3 text-left transition-colors hover:border-primary/60', on ? 'border-primary' : 'border-border')}
          >
            <Wire id={m.id} />
            <b className="flex items-center gap-1.5 text-sm">{on && <Check className="size-4" />}{m.nome}</b>
            <span className="text-xs text-muted-foreground">{m.desc}</span>
            <em className="self-start rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-bold not-italic text-amber-800 dark:text-amber-300">Bom para: {m.bom}</em>
          </button>
        )
      })}
    </div>
  )
}

export function ModeloOpcoes({ modelo, cfg, onCfg }: { modelo: string; cfg: CursoCfg; onCfg: (p: Partial<CursoCfg>) => void }) {
  if (modelo === 'trilha') {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">Como as etapas abrem</span>
        <div className="flex flex-wrap gap-2">{LIB_OPCOES.map((o) => <Chip key={o.v} on={cfg.lib === o.v} onClick={() => onCfg({ lib: o.v })}>{o.l}</Chip>)}</div>
      </div>
    )
  }
  if (modelo === 'contagem') {
    return <Campo rotulo="Data da prova" dica="A contagem e as metas de cada dia se ajustam a essa data."><input type="date" className={inputCls} value={cfg.prova} onChange={(e) => onCfg({ prova: e.target.value })} /></Campo>
  }
  if (modelo === 'semana') {
    return (
      <>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo="Começa em"><input type="date" className={inputCls} value={cfg.inicio} onChange={(e) => onCfg({ inicio: e.target.value })} /></Campo>
          <Campo rotulo="Quantas semanas"><input type="number" min={1} max={52} className={inputCls} value={cfg.semanas} onChange={(e) => onCfg({ semanas: Math.min(52, Math.max(1, Number(e.target.value) || 1)) })} /></Campo>
        </div>
        <ToggleRow checked={cfg.semana_a_semana} onChange={(v) => onCfg({ semana_a_semana: v })}>Liberar uma semana por vez</ToggleRow>
      </>
    )
  }
  if (modelo === 'temas') {
    return (
      <Campo rotulo="Banca" dica="A ordem dos temas vem da incidência nas provas dessa banca.">
        <select className={inputCls} value={cfg.banca} onChange={(e) => onCfg({ banca: e.target.value })}>{BANCAS.map((b) => <option key={b}>{b}</option>)}</select>
      </Campo>
    )
  }
  if (modelo === 'material') {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">Abas que o aluno vê</span>
        <div className="flex flex-wrap gap-2">
          {ABAS_MATERIAL.map((o) => (
            <Chip key={o} on={cfg.abas.includes(o)} onClick={() => onCfg({ abas: cfg.abas.includes(o) ? cfg.abas.filter((x) => x !== o) : [...cfg.abas, o] })}>{o}</Chip>
          ))}
        </div>
      </div>
    )
  }
  if (modelo === 'materia') {
    return (
      <>
        <div className="flex flex-col gap-1"><span className="text-sm font-semibold">Ordem das matérias</span><small className="text-xs text-muted-foreground">Arraste no produto final. Aqui a ordem segue o cadastro das aulas.</small></div>
        <ToggleRow checked={cfg.progresso} onChange={(v) => onCfg({ progresso: v })}>Mostrar o progresso em cada capa</ToggleRow>
      </>
    )
  }
  if (modelo === 'agenda') {
    return (
      <>
        <ToggleRow checked={cfg.gravacao} onChange={(v) => onCfg({ gravacao: v })}>Mostrar a gravação depois do encontro</ToggleRow>
        <ToggleRow checked={cfg.lembrete} onChange={(v) => onCfg({ lembrete: v })}>Lembrar o aluno 1 hora antes</ToggleRow>
        <p className="text-xs text-muted-foreground">Os encontros vêm do Calendário de eventos, pelo grupo deste curso.</p>
      </>
    )
  }
  return null
}

// ───────── Pré-visualização no celular: usa os módulos, aulas, materiais e encontros REAIS do curso (sem exemplos) ─────────
const card = 'rounded-lg border bg-card p-2.5 text-xs'
const vazio = (t: string) => <p className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">{t}</p>
const brd = (iso: string) => (iso ? iso.split('-').reverse().slice(0, 2).join('/') : '')
const dm = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`

export function ModeloPreview({ modelo, cfg, nome, tipo, c1, c2, dados }: { modelo: string; cfg: CursoCfg; nome: string; tipo: string; c1: string; c2: string; dados: DadosPreview }) {
  const dias = useMemo(() => {
    if (!cfg.prova) return null
    return Math.max(0, Math.round((new Date(cfg.prova + 'T12:00:00').getTime() - new Date().setHours(12, 0, 0, 0)) / 864e5))
  }, [cfg.prova])
  const top = (sub: string) => (
    <div className="px-4 pb-4 pt-5 text-white" style={{ background: `linear-gradient(165deg, ${c1}, color-mix(in srgb, ${c1} 55%, black))` }}>
      <small className="block text-[10px] font-bold uppercase tracking-widest" style={{ color: c2 }}>{tipo} · {nomeModelo(modelo)}</small>
      <b className="mt-1 block text-lg leading-tight">{nome || 'Nome do curso'}</b>
      <span className="text-xs opacity-80">{sub}</span>
    </div>
  )
  const btn = (t: string) => <span className="mt-2 inline-block rounded-md px-2.5 py-1 text-[11px] font-bold text-black" style={{ background: c2 }}>{t}</span>
  const mods = dados.modulos
  const semMods = vazio('O curso ainda não tem módulos. Crie em Aulas e materiais.')
  let sub = ''
  let corpo: React.ReactNode = null

  if (modelo === 'trilha') {
    sub = mods.length ? `Etapa 1 de ${mods.length}` : 'Sem etapas ainda'
    corpo = !mods.length ? semMods : (
      <div className="flex flex-col gap-3">
        {mods.map((s, i) => {
          const k = i === 0 ? 'cur' : cfg.lib === 'tudo' ? 'open' : 'lock'
          return (
            <div key={i} className={cn('flex items-start gap-2.5', k === 'lock' && 'opacity-50')}>
              <span className={cn('grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-bold', k === 'cur' ? 'bg-foreground text-background' : 'border bg-card')}>{i + 1}</span>
              <span className="text-xs"><b className="block">Etapa {i + 1}</b><small className="text-muted-foreground">{s}{k === 'lock' ? (cfg.lib === 'data' ? ` · abre em ${i} dia${i > 1 ? 's' : ''}` : ' · abre ao concluir a anterior') : ''}</small>{k === 'cur' && btn('Continuar etapa')}</span>
            </div>
          )
        })}
      </div>
    )
  } else if (modelo === 'materia') {
    sub = `${mods.length} matéria${mods.length === 1 ? '' : 's'}`
    corpo = !mods.length ? semMods : (
      <div className="grid grid-cols-2 gap-2">
        {mods.map((n) => <div key={n} className={card}><b>{n}</b>{cfg.progresso && <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-muted"><i className="block h-full bg-primary" style={{ width: '0%' }} /></span>}</div>)}
      </div>
    )
  } else if (modelo === 'contagem') {
    sub = cfg.prova ? `Prova em ${brd(cfg.prova)}` : 'Defina a data da prova'
    corpo = dias === null ? vazio('Informe a data da prova nos ajustes para ver a contagem.') : (
      <>
        <div className="text-center"><b className="block text-4xl font-extrabold text-primary">{dias}</b><div className="text-xs text-muted-foreground">dias para a prova</div></div>
        <div className="my-3 flex flex-wrap justify-center gap-1">
          {Array.from({ length: 6 }, (_, i) => dias - i).filter((d) => d >= 0).map((d, i) => <span key={d} className={cn('rounded-md border px-1.5 py-0.5 text-[10px] font-bold', i === 0 && 'border-transparent bg-primary text-primary-foreground')}>D-{d}</span>)}
        </div>
        <div className={card}><b>Metas de hoje</b><div className="mt-1 text-muted-foreground">As metas de cada dia vêm do cronograma do aluno.</div>{btn('Começar o dia')}</div>
      </>
    )
  } else if (modelo === 'semana') {
    const n = Math.min(cfg.semanas || 6, 8)
    sub = `${cfg.semanas || 6} semanas`
    const ini = cfg.inicio ? new Date(cfg.inicio + 'T12:00:00') : null
    corpo = (
      <div className="flex flex-col gap-2">
        {Array.from({ length: n }, (_, i) => (
          <div key={i} className={cn(card, i === 0 && 'border-primary')}>
            <div className="flex justify-between font-bold">
              <span>Semana {i + 1}</span>
              <span className="font-normal text-muted-foreground">{ini ? `abre em ${dm(new Date(ini.getTime() + i * 7 * 864e5))}` : cfg.semana_a_semana && i > 0 ? 'abre depois da anterior' : 'aberta'}</span>
            </div>
            {i === 0 && (dados.aulas.length ? <ul className="mt-1.5 list-disc pl-4 text-muted-foreground">{dados.aulas.map((a) => <li key={a}>{a}</li>)}</ul> : <p className="mt-1.5 text-muted-foreground">Sem aulas cadastradas ainda.</p>)}
          </div>
        ))}
        {!cfg.inicio && <p className="text-[11px] text-muted-foreground">Informe a data de início para ver as datas de cada semana.</p>}
      </div>
    )
  } else if (modelo === 'temas') {
    sub = cfg.banca
    corpo = vazio(`Os temas aparecem em ordem de incidência na banca ${cfg.banca} quando a estatística por banca estiver cadastrada.`)
  } else if (modelo === 'material') {
    const ab = cfg.abas.length ? cfg.abas : ['PDFs']
    sub = `${ab.length} tipos de material`
    corpo = (
      <>
        <div className="mb-2 flex flex-wrap gap-1">{ab.map((a, i) => <span key={a} className={cn('rounded-md px-2 py-0.5 text-[11px] font-bold', i === 0 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>{a}</span>)}</div>
        {dados.materiais.length ? <div className="flex flex-col gap-2">{dados.materiais.map((x) => <div key={x} className={card}>{x}</div>)}</div> : vazio('Nenhum material no currículo ainda.')}
      </>
    )
  } else if (modelo === 'agenda') {
    const n = dados.eventos.length
    sub = n ? `${n} próximo${n === 1 ? '' : 's'} encontro${n === 1 ? '' : 's'}` : 'Sem encontros agendados'
    corpo = n ? (
      <div className="flex flex-col gap-2">
        {dados.eventos.map((e, i) => (
          <div key={i} className={cn(card, 'flex items-center gap-2.5')}>
            <span className="grid shrink-0 place-items-center rounded-md bg-primary/10 px-2 py-1 text-center text-sm font-extrabold text-primary">{e.dia}<small className="block text-[9px]">{e.mes}</small></span>
            <span className="min-w-0 flex-1"><b>{e.titulo}</b><br /><span className="text-muted-foreground">{e.hora}h</span></span>
            {i === 0 && btn('Entrar')}
          </div>
        ))}
      </div>
    ) : vazio('Nenhum encontro no Calendário de eventos para os grupos deste curso.')
  }

  return (
    <div className="mx-auto w-full max-w-[340px] overflow-hidden rounded-[2rem] border-[6px] border-foreground bg-background">
      {top(sub)}
      <div className="min-h-[300px] bg-background p-3.5">{corpo}</div>
    </div>
  )
}
