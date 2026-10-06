'use client'

// DESAFIO DE LEI SECA — tela LISTA (porte fiel do mock LeiSecaRevisao.dc.html, região de conteúdo).
// Substitui a grade de módulos antiga. SÓ a região de conteúdo (o shell sidebar/header é injetado fora).
// Tokens HERDADOS do root do pai (var(--surface)/--line/--ink/--muted/--brand/--brand2/--chip/--track/
// --goldInk/--surface2/--line2); chamamos useTemaInterno p/ reagir ao toggle dark ao vivo.
// REGRA: sem dados fabricados — a aba Desempenho usa só "Acerto por lei" e "Seu progresso" (dados reais).

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Columns3, Check, ClipboardCheck, Target, Zap, Clock, Play, RotateCcw, ChevronRight, BarChart3 } from 'lucide-react'
import { type Brand, type InternaTheme } from '../interna-tokens'
import { useTemaInterno } from '../use-tema-interno'

const GOLD = '#F1C232'
const OK = '#1FA868'
const WARN = '#D99A1E'

type LeiSecaModulo = {
  id: string
  nome: string
  cor: string | null
  capa: string | null
  capaCard: string | null
  total: number
  done: number
  pendentes?: number
  acerto?: number | null
}

type PlatformLeiSecaProps = {
  brand: 'revisao' | 'vnd' | 'meq'
  theme: 'claro' | 'escuro' | 'azul'
  modulos: LeiSecaModulo[]
  stats: { leis: number; aulasConcluidas: number; questoesRespondidas: number; acertoMedio: number | null }
  /** Último módulo com atividade (último desafio feito) → destaque do card "Continue de onde parou". */
  ultimoModuloId?: string | null
}

/** Estado de um módulo a partir de done/total. */
type Situacao = 'and' | 'done' | 'new'
function situacaoDe(m: LeiSecaModulo): Situacao {
  if (m.total > 0 && m.done >= m.total) return 'done'
  if (m.done === 0) return 'new'
  return 'and'
}
function pctDe(m: LeiSecaModulo): number {
  if (m.total <= 0) return 0
  return Math.min(100, Math.round((m.done / m.total) * 100))
}
/** Abreviação curta do nome da lei p/ a capa (iniciais em maiúsculas, máx ~10 chars). */
function abreviar(nome: string): string {
  const limpo = nome.trim()
  if (!limpo) return 'LEI'
  const palavras = limpo.split(/\s+/).filter((p) => /[A-Za-zÀ-ú0-9]/.test(p))
  const relevantes = palavras.filter((p) => p.length > 2 && !/^(de|da|do|das|dos|e|a|o)$/i.test(p))
  const base = relevantes.length ? relevantes : palavras
  if (base.length >= 2) {
    const sigla = base.map((p) => p[0].toUpperCase()).join('')
    if (sigla.length >= 2) return sigla.slice(0, 10)
  }
  return limpo.slice(0, 10).toUpperCase()
}

const fmt = (n: number) => n.toLocaleString('pt-BR')

export function PlatformLeiSeca({ brand, theme, modulos, stats, ultimoModuloId }: PlatformLeiSecaProps) {
  const liveTheme: InternaTheme = useTemaInterno(theme)
  const [tab, setTab] = useState<'mod' | 'des'>('mod')
  const [filtro, setFiltro] = useState<'all' | 'and' | 'done' | 'new'>('all')

  // Contagens dos chips de filtro (dados reais).
  const counts = useMemo(() => {
    let and = 0, done = 0, novo = 0
    for (const m of modulos) {
      const s = situacaoDe(m)
      if (s === 'and') and++
      else if (s === 'done') done++
      else novo++
    }
    return { all: modulos.length, and, done, new: novo }
  }, [modulos])

  // "Continue de onde parou": o ÚLTIMO desafio com atividade (último dia feito) tem prioridade — assim o
  // card reflete o que o aluno mexeu por último, com a imagem e as infos DELE. Fallbacks: maior progresso
  // em andamento → qualquer com done>0 → primeiro.
  const atual = useMemo(() => {
    if (ultimoModuloId) { const m = modulos.find((x) => x.id === ultimoModuloId); if (m) return m }
    const emAndamento = modulos.filter((m) => m.done > 0 && m.done < m.total)
    if (emAndamento.length) return [...emAndamento].sort((a, b) => pctDe(b) - pctDe(a))[0]
    const comProgresso = modulos.find((m) => m.done > 0)
    if (comProgresso) return comProgresso
    return modulos[0] ?? null
  }, [modulos, ultimoModuloId])

  const modulosFiltrados = useMemo(() => {
    if (filtro === 'all') return modulos
    return modulos.filter((m) => situacaoDe(m) === filtro)
  }, [modulos, filtro])

  const comAcerto = useMemo(() => modulos.filter((m) => m.acerto != null), [modulos])

  // Gradiente da capa derivado da cor do módulo (ou da marca).
  const gradienteCapa = (cor: string | null) =>
    cor
      ? `linear-gradient(135deg, color-mix(in oklab, ${cor} 70%, #000), ${cor})`
      : 'linear-gradient(135deg, color-mix(in oklab, var(--brand) 55%, #000), var(--brand))'

  const gridTexture: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    backgroundImage:
      'linear-gradient(rgba(255,255,255,.07) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.07) 1px,transparent 1px)',
    backgroundSize: '18px 18px',
  }

  const tabBtn = (ativo: boolean): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    whiteSpace: 'nowrap',
    height: 40,
    padding: '0 14px',
    border: 0,
    borderRadius: 11,
    background: ativo ? 'var(--surface)' : 'transparent',
    color: ativo ? 'var(--brand)' : 'var(--muted)',
    fontSize: 13.5,
    fontWeight: 700,
    cursor: 'pointer',
  })

  const chipBtn = (ativo: boolean): React.CSSProperties => ({
    flexShrink: 0,
    height: 34,
    padding: '0 13px',
    borderRadius: 99,
    border: '1px solid var(--line)',
    background: ativo ? 'var(--brand)' : 'var(--surface)',
    color: ativo ? '#FFFFFF' : 'var(--muted)',
    fontSize: 12.5,
    fontWeight: 700,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    whiteSpace: 'nowrap',
    cursor: 'pointer',
  })

  const kpis: { icon: React.ReactNode; valor: string; rotulo: string }[] = [
    { icon: <Columns3 size={17} />, valor: fmt(stats.leis), rotulo: 'leis no desafio' },
    { icon: <Check size={17} />, valor: fmt(stats.aulasConcluidas), rotulo: 'aulas concluídas' },
    { icon: <ClipboardCheck size={17} />, valor: fmt(stats.questoesRespondidas), rotulo: 'questões respondidas' },
    {
      icon: <Target size={17} />,
      valor: stats.acertoMedio != null ? `${fmt(stats.acertoMedio)}%` : '—',
      rotulo: 'acerto médio',
    },
  ]

  return (
    <div className="flex flex-col gap-[22px]" data-tema={liveTheme}>
      {/* 1. Hero */}
      <div>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 11, fontWeight: 800, letterSpacing: '.22em', color: 'var(--goldInk)' }}>
          LEI SECA
        </span>
        <h1 style={{ margin: '6px 0 0', fontSize: 32, fontWeight: 800, letterSpacing: '-0.045em', color: 'var(--ink)' }}>
          Desafio de Lei Seca
        </h1>
        <p style={{ margin: '6px 0 0', fontSize: 14, color: 'var(--muted)' }}>
          Estude a letra da lei aula por aula e fixe com questões dos dispositivos.
        </p>
      </div>

      {/* 2. KPIs */}
      <div className="grid grid-cols-2 gap-[10px] lg:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.rotulo} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 16, background: 'var(--surface)', border: '1px solid var(--line)' }}>
            <span style={{ width: 36, height: 36, borderRadius: 11, background: 'var(--chip)', color: 'var(--brand)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {k.icon}
            </span>
            <div style={{ lineHeight: 1.2, minWidth: 0 }}>
              <b style={{ display: 'block', fontSize: 19, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--ink)' }}>{k.valor}</b>
              <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{k.rotulo}</span>
            </div>
          </div>
        ))}
      </div>

      {/* 3. Continue de onde parou */}
      {atual && (
        <div className="flex flex-col sm:flex-row" style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 20, overflow: 'hidden' }}>
          <div
            className="w-full sm:w-[270px]"
            style={{
              position: 'relative',
              overflow: 'hidden',
              flexShrink: 0,
              padding: 24,
              background: 'linear-gradient(150deg, color-mix(in oklab, var(--brand) 85%, #000), var(--brand))',
              color: '#FFFFFF',
              textShadow: '0 1px 10px rgba(0,0,0,.78), 0 1px 3px rgba(0,0,0,.6)',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            {/* Imagem do desafio (banner/capa) ao fundo — IMAGEM PURA, sem filtro roxo. O texto fica
                legível pelo text-shadow herdado (aplicado no container). */}
            {(atual.capaCard || atual.capa) ? (
              <>
                {/* Imagem NORMAL do desafio (capaCard = capa do card), não a larga (banner). */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={atual.capaCard || atual.capa || ''} alt="" aria-hidden style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                {/* Fade preto BEM LEVE (neutro, sem roxo) só p/ o texto ficar legível sobre a imagem. */}
                <span aria-hidden style={{ position: 'absolute', inset: 0, background: 'linear-gradient(150deg, rgba(0,0,0,.15) 0%, rgba(0,0,0,.3) 55%, rgba(0,0,0,.5) 100%)', pointerEvents: 'none' }} />
              </>
            ) : (
              <span aria-hidden style={{ ...gridTexture, backgroundSize: '22px 22px' }} />
            )}
            <span style={{ position: 'relative', fontSize: 10.5, fontWeight: 800, letterSpacing: '.2em', color: GOLD }}>
              CONTINUE DE ONDE PAROU
            </span>
            <b style={{ position: 'relative', fontSize: 44, fontWeight: 800, letterSpacing: '-0.05em', lineHeight: 1 }}>
              Aula {Math.min(atual.done + 1, Math.max(atual.total, 1))}
              <span style={{ fontSize: 16, fontWeight: 700, color: 'rgba(255,255,255,.72)', letterSpacing: 0 }}> / {atual.total}</span>
            </b>
            <span style={{ position: 'relative', fontSize: 13, color: 'rgba(255,255,255,.88)' }}>{atual.nome}</span>
            <div style={{ position: 'relative', marginTop: 'auto', paddingTop: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: 'rgba(255,255,255,.8)', marginBottom: 6 }}>
                <span>Progresso do módulo</span>
                <b style={{ color: '#FFFFFF' }}>{pctDe(atual)}%</b>
              </div>
              <div style={{ height: 6, borderRadius: 99, background: 'rgba(255,255,255,.18)', overflow: 'hidden' }}>
                <span style={{ display: 'block', width: `${pctDe(atual)}%`, height: '100%', borderRadius: 99, background: GOLD }} />
              </div>
            </div>
          </div>

          <div style={{ flex: 1, minWidth: 0, padding: '22px 26px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <b style={{ display: 'block', fontSize: 20, letterSpacing: '-0.03em', color: 'var(--ink)' }}>{atual.nome}</b>
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>
                {atual.done > 0 ? 'Continue de onde você parou nesta lei.' : 'Comece a estudar a letra da lei.'}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 28, padding: '0 10px', borderRadius: 99, background: 'var(--surface2)', border: '1px solid var(--line)', fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>
                <Columns3 size={13} />
                {fmt(atual.total)} aulas
              </span>
              {atual.pendentes != null && atual.pendentes > 0 && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 28, padding: '0 10px', borderRadius: 99, background: 'var(--surface2)', border: '1px solid var(--line)', fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>
                  <Clock size={13} />
                  {fmt(atual.pendentes)} pendentes
                </span>
              )}
            </div>
            <div style={{ marginTop: 'auto', display: 'flex', gap: 8 }}>
              <Link
                href={`/aluno/leitura?modulo=${atual.id}`}
                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 44, padding: '0 16px', borderRadius: 12, background: GOLD, color: '#2A1A55', fontSize: 13.5, fontWeight: 800, whiteSpace: 'nowrap' }}
              >
                <Play size={14} />
                Continuar aula
              </Link>
              <Link
                href={`/aluno/leitura?modulo=${atual.id}`}
                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 44, padding: '0 14px', borderRadius: 12, border: '1px solid var(--line)', color: 'var(--ink)', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' }}
              >
                Ver módulo
                <ChevronRight size={14} />
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* 4. Tabs + filtros */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div role="tablist" style={{ display: 'inline-flex', gap: 3, padding: 4, borderRadius: 15, background: 'var(--surface2)' }}>
          <button type="button" role="tab" aria-selected={tab === 'mod'} onClick={() => setTab('mod')} style={tabBtn(tab === 'mod')}>
            <Columns3 size={15} />
            Módulos
          </button>
          <button type="button" role="tab" aria-selected={tab === 'des'} onClick={() => setTab('des')} style={tabBtn(tab === 'des')}>
            <BarChart3 size={15} />
            Desempenho
          </button>
        </div>
        {tab === 'mod' && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(
              [
                { k: 'all', rotulo: 'Todas', n: counts.all },
                { k: 'and', rotulo: 'Em andamento', n: counts.and },
                { k: 'done', rotulo: 'Concluídas', n: counts.done },
                { k: 'new', rotulo: 'Não iniciadas', n: counts.new },
              ] as const
            ).map((f) => (
              <button key={f.k} type="button" onClick={() => setFiltro(f.k)} style={chipBtn(filtro === f.k)}>
                {f.rotulo}
                <span style={{ opacity: 0.7, fontWeight: 600 }}>{f.n}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 5. Módulos */}
      {tab === 'mod' && (
        modulos.length === 0 ? (
          <div className="rounded-2xl border border-dashed p-12 text-center" style={{ borderColor: 'var(--line)', background: 'var(--surface)', color: 'var(--muted)', fontSize: 14 }}>
            Nenhum módulo disponível ainda.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-[14px] md:grid-cols-2 xl:grid-cols-3">
            {modulosFiltrados.map((m) => {
              const s = situacaoDe(m)
              const pct = pctDe(m)
              const capa = m.capaCard || m.capa // ticket usa a imagem NORMAL (card), não a larga (banner)
              const statusCfg =
                s === 'done'
                  ? { cor: OK, icon: <Check size={13} />, rotulo: 'Concluída' }
                  : s === 'and'
                    ? { cor: 'var(--goldInk)', icon: <Zap size={13} />, rotulo: 'Em andamento' }
                    : { cor: 'var(--muted)', icon: <Clock size={13} />, rotulo: 'Não iniciada' }
              const botao =
                s === 'done'
                  ? { rotulo: 'Revisar', icon: <RotateCcw size={14} /> }
                  : s === 'and'
                    ? { rotulo: 'Continuar', icon: <Play size={14} /> }
                    : { rotulo: 'Começar', icon: <Play size={14} /> }
              const acertoCor = m.acerto != null && m.acerto >= 60 ? OK : WARN
              return (
                <Link
                  key={m.id}
                  href={`/aluno/leitura?modulo=${m.id}`}
                  className="group block transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_22px_40px_-24px_rgba(0,0,0,.5)]"
                  style={{ display: 'flex', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 18, overflow: 'hidden', minHeight: 164, color: 'inherit' }}
                >
                  {/* capa (maior — menos espaço em branco) */}
                  <div style={{ width: 150, flexShrink: 0, overflow: 'hidden' }}>
                    {capa ? (
                      <img src={capa} alt="" className="transition-transform duration-500 group-hover:scale-105" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <div className="transition-transform duration-500 group-hover:scale-105" style={{ position: 'relative', overflow: 'hidden', width: '100%', height: '100%', background: gradienteCapa(m.cor), color: '#FFFFFF', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '14px 16px' }}>
                        <span aria-hidden style={gridTexture} />
                        <svg viewBox="0 0 68 66" aria-hidden style={{ position: 'absolute', right: -14, bottom: -16, width: 104, height: 100, opacity: 0.14 }}>
                          <path fill="#FFFFFF" fillRule="evenodd" d="M6 5.5H32C43.5 5.5 49 13 49 23C49 31 45 37 39.5 40.5L62 61H6Z M9.2 9.2H19.2V57.6H9.2Z" />
                        </svg>
                        <span style={{ position: 'relative', fontSize: 9, fontWeight: 800, letterSpacing: '.14em', opacity: 0.85, marginTop: 4 }}>LEI SECA</span>
                        <span style={{ position: 'relative', fontFamily: 'Montserrat, sans-serif', fontStyle: 'italic', fontWeight: 800, fontSize: 22, lineHeight: 1, letterSpacing: '-0.02em', marginTop: 4, textShadow: '0 2px 12px rgba(0,0,0,.25)' }}>
                          {abreviar(m.nome)}
                        </span>
                      </div>
                    )}
                  </div>
                  {/* corpo */}
                  <div style={{ flex: 1, minWidth: 0, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700, color: statusCfg.cor }}>
                      {statusCfg.icon}
                      {statusCfg.rotulo}
                    </span>
                    <b style={{ fontSize: 14.5, lineHeight: 1.3, color: 'var(--ink)' }}>{m.nome}</b>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--muted)', marginBottom: 5 }}>
                        <span>{fmt(m.done)} de {fmt(m.total)} aulas</span>
                        <b style={{ color: 'var(--ink)' }}>{pct}%</b>
                      </div>
                      <div style={{ height: 6, borderRadius: 99, background: 'var(--track)', overflow: 'hidden' }}>
                        <span style={{ display: 'block', width: `${pct}%`, height: '100%', borderRadius: 99, background: `linear-gradient(90deg,var(--brand),var(--brand2) 70%,${GOLD})` }} />
                      </div>
                    </div>
                    <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      {m.acerto != null ? (
                        <span title="Acerto nas questões" style={{ display: 'inline-flex', gap: 6, height: 26, padding: '0 9px', borderRadius: 8, background: `color-mix(in oklab, ${acertoCor} 14%, transparent)`, color: acertoCor, fontSize: 11.5, fontWeight: 700, alignItems: 'center' }}>
                          Acerto<b style={{ fontSize: 13 }}>{fmt(m.acerto)}%</b>
                        </span>
                      ) : (
                        <span />
                      )}
                      <span
                        className="transition group-hover:brightness-110"
                        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 32, padding: '0 16px', borderRadius: 12, background: 'var(--brand)', color: '#FFFFFF', fontSize: 12.5, fontWeight: 800, whiteSpace: 'nowrap' }}
                      >
                        {botao.icon}
                        {botao.rotulo}
                      </span>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )
      )}

      {/* 6. Desempenho (só dados reais) */}
      {tab === 'des' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2" style={{ alignItems: 'start' }}>
          {/* Acerto por lei */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 20, padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <Target size={18} style={{ color: 'var(--brand)' }} />
              <div>
                <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--ink)' }}>Acerto por lei</h3>
                <span style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--muted)', marginTop: 2 }}>Questões respondidas nas aulas</span>
              </div>
            </div>
            {comAcerto.length === 0 ? (
              <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>Resolva questões nas aulas para ver seu acerto por lei.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {comAcerto.map((m) => {
                  const a = m.acerto as number
                  const cor = a >= 60 ? OK : WARN
                  return (
                    <div key={m.id} style={{ display: 'grid', gridTemplateColumns: '190px 1fr 48px', alignItems: 'center', gap: 12 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.nome}</span>
                      <div style={{ height: 8, borderRadius: 99, background: 'var(--track)', overflow: 'hidden' }}>
                        <span style={{ display: 'block', width: `${Math.min(100, Math.max(0, a))}%`, height: '100%', borderRadius: 99, background: cor }} />
                      </div>
                      <b style={{ textAlign: 'right', fontSize: 13, color: cor }}>{fmt(a)}%</b>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Seu progresso */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 20, padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <BarChart3 size={18} style={{ color: 'var(--brand)' }} />
              <div>
                <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--ink)' }}>Seu progresso</h3>
                <span style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--muted)', marginTop: 2 }}>Aulas concluídas por lei</span>
              </div>
            </div>
            {modulos.length === 0 ? (
              <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>Nenhum módulo disponível ainda.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {modulos.map((m) => {
                  const pct = pctDe(m)
                  return (
                    <div key={m.id} style={{ display: 'grid', gridTemplateColumns: '190px 1fr 48px', alignItems: 'center', gap: 12 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.nome}</span>
                      <div style={{ height: 8, borderRadius: 99, background: 'var(--track)', overflow: 'hidden' }}>
                        <span style={{ display: 'block', width: `${pct}%`, height: '100%', borderRadius: 99, background: `linear-gradient(90deg,var(--brand),var(--brand2) 70%,${GOLD})` }} />
                      </div>
                      <b style={{ textAlign: 'right', fontSize: 12.5, color: 'var(--ink)', whiteSpace: 'nowrap' }}>{fmt(m.done)}/{fmt(m.total)}</b>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
