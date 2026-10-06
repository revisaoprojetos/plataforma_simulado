'use client'

// BANCO DE QUESTÕES (spec 03 §5) — PORTE FIEL do mockup BancoRevisao.dc.html.
// Layout de 2 COLUNAS: barra de filtros fixa à esquerda (dropdowns reais + toggles + "Filtrar N") e a
// lista de questões à direita (QCore novo), com herói + 4 KPIs + chips de filtro ativo + segmento
// (Todas / Não resolvidas / Que errei). A navegação reusa o motor funcional existente (useBancoNav +
// URL por searchParams), então o filtro continua server-side e otimizado — só o VISUAL é o novo.

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ClipboardCheck, Check, Percent, BookOpen, Search, SlidersHorizontal, X, FileText, Star, Loader2 } from 'lucide-react'
import { internaTokensStyle, internaVars, INTERNA_FONT, type Brand, type InternaTheme } from '../interna-tokens'
import { useTemaInterno } from '../use-tema-interno'
import type { QuestaoAluno } from '@/components/aluno/questao-resolvivel'
import { QCore } from '../qcore'
import { useBancoNav } from '@/components/aluno/banco-questoes-client'
import type { Opt, AssuntoOpt, FiltrosParams } from '@/components/aluno/questoes-filtros-aluno'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export interface BancoStats { resolvidas: number; acertos: number; aproveitamento: number; total: number }
export type BancoFiltroData = { disciplinas: Opt[]; assuntos: AssuntoOpt[]; bancas: Opt[]; anos: number[]; params: FiltrosParams }

const DIFICULDADES = [{ v: 'facil', r: 'Fácil' }, { v: 'medio', r: 'Médio' }, { v: 'dificil', r: 'Difícil' }]
const SEGMENTOS = [{ v: '', r: 'Todas' }, { v: 'nao_resolvidas', r: 'Não resolvidas' }, { v: 'errei', r: 'Que errei' }]

const fmt = (n: number) => n.toLocaleString('pt-BR')

// Estilo do POPUP dos selects de filtro — resolvido por marca×tema no PlatformBanco e consumido pelo
// FiltroSelect. O popup é portalado p/ fora do `.app`, perdendo os tokens herdados; sem isto cai no
// branco + accent roxo do shadcn (ignora a marca, pior ainda no tema escuro/azul).
const SelectCorCtx = createContext<React.CSSProperties | undefined>(undefined)

export function PlatformBanco({
  brand,
  theme: themeProp,
  stats,
  filtros,
  questoes,
  paginacao,
  desempenhoFiltro,
  porDia,
}: {
  brand: Brand
  theme: InternaTheme
  stats: BancoStats
  /** Dados dos filtros (opções + estado aplicado) — a sidebar nova os renderiza. */
  filtros: BancoFiltroData
  /** Lista de questões (dados) — renderizada com o QCore novo, uma por linha. */
  questoes: QuestaoAluno[]
  /** Slot de paginação (PaginationControls, navega por URL). */
  paginacao?: ReactNode
  /** Desempenho do aluno DENTRO do recorte de filtro atual (resolvidas/acertos/erros). */
  desempenhoFiltro?: { acertos: number; erros: number; resolvidas: number }
  /** Questões respondidas por dia da semana (seg→dom) — mini-gráfico. */
  porDia?: { label: string; n: number }[]
}) {
  const theme = useTemaInterno(themeProp)
  const { nav, pending } = useBancoNav()
  // Popup dos selects tematizado com os tokens MEQ do tema RESOLVIDO (inclui azul). Sem isto o dropdown
  // (portalado p/ fora do .app) fica branco com accent roxo do shadcn — o "branco em volta das opções".
  const corPopup = useMemo<React.CSSProperties>(() => {
    const c = internaVars(brand, theme)
    return {
      background: c.surface2, color: c.ink, border: `1px solid ${c.line}`,
      ['--popover' as never]: c.surface2, ['--popover-foreground' as never]: c.ink,
      ['--accent' as never]: c.chip, ['--accent-foreground' as never]: c.brand, ['--border' as never]: c.line,
    }
  }, [brand, theme])
  const { disciplinas, assuntos, bancas, anos, params } = filtros

  // Rascunho editável da sidebar (aplica só no "Filtrar"); ressincroniza quando a URL aplicada muda.
  const [f, setF] = useState<FiltrosParams>({ ...params })
  const paramsKey = JSON.stringify(params)
  useEffect(() => { setF({ ...params }) }, [paramsKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k: keyof FiltrosParams, v: string) => setF((p) => ({ ...p, [k]: v || undefined }))
  const toggle = (k: keyof FiltrosParams) => setF((p) => ({ ...p, [k]: p[k] ? undefined : '1' }))

  const assuntosDaDisc = useMemo(
    () => (f.disciplina ? assuntos.filter((a) => a.disciplina_id === f.disciplina) : assuntos),
    [assuntos, f.disciplina],
  )

  const urlDe = (merged: FiltrosParams) => {
    const usp = new URLSearchParams()
    for (const [k, v] of Object.entries(merged)) if (v) usp.set(k, String(v))
    return `/aluno/questoes${usp.toString() ? `?${usp}` : ''}`
  }
  const aplicar = () => nav(urlDe(f))
  const limparTudo = () => nav('/aluno/questoes')
  // Chips e segmento operam sobre o estado APLICADO (URL), navegando na hora.
  const removerAplicado = (k: keyof FiltrosParams) => nav(urlDe({ ...params, [k]: undefined }))
  const irSegmento = (v: string) => nav(urlDe({ ...params, minhas: v || undefined }))

  // Chips do que está aplicado (não do rascunho).
  const nomeDe = (arr: { id: string; nome: string }[], id?: string) => arr.find((x) => x.id === id)?.nome
  const chips: { k: keyof FiltrosParams; label: string }[] = []
  if (params.disciplina) chips.push({ k: 'disciplina', label: nomeDe(disciplinas, params.disciplina) ?? 'Disciplina' })
  if (params.assunto) chips.push({ k: 'assunto', label: nomeDe(assuntos, params.assunto) ?? 'Assunto' })
  if (params.banca) chips.push({ k: 'banca', label: nomeDe(bancas, params.banca) ?? 'Banca' })
  if (params.ano) chips.push({ k: 'ano', label: String(params.ano) })
  if (params.dificuldade) chips.push({ k: 'dificuldade', label: DIFICULDADES.find((d) => d.v === params.dificuldade)?.r ?? params.dificuldade })
  if (params.busca) chips.push({ k: 'busca', label: `"${params.busca}"` })
  if (params.comentadas) chips.push({ k: 'comentadas', label: 'Com comentário' })
  if (params.favoritas) chips.push({ k: 'favoritas', label: 'Favoritas' })

  const segAtivo = params.minhas ?? ''

  const kpis: { icon: ReactNode; cor: string; bg: string; valor: string; rotulo: string }[] = [
    { icon: <ClipboardCheck size={17} />, cor: 'var(--brand)', bg: 'var(--chip)', valor: fmt(stats.resolvidas), rotulo: 'resolvidas' },
    { icon: <Check size={17} />, cor: '#1FA868', bg: 'rgba(31,168,104,.14)', valor: fmt(stats.acertos), rotulo: 'acertos' },
    { icon: <Percent size={17} />, cor: '#D99A1E', bg: 'rgba(217,154,30,.16)', valor: `${stats.aproveitamento}%`, rotulo: 'aproveitamento' },
    { icon: <BookOpen size={17} />, cor: 'var(--brand)', bg: 'var(--chip)', valor: fmt(stats.total), rotulo: 'questões no filtro' },
  ]

  const LABEL: React.CSSProperties = { display: 'block', marginBottom: 6, fontSize: 10.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--muted)' }

  return (
    <SelectCorCtx.Provider value={corPopup}>
    <div style={{ ...internaTokensStyle(brand, theme), minHeight: '100%', padding: 24, fontFamily: INTERNA_FONT[brand] }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* Herói */}
        <div>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 11, fontWeight: 800, letterSpacing: '.22em', color: 'var(--goldInk)' }}>QUESTÕES</span>
          <h1 style={{ margin: '6px 0 0', fontSize: 32, fontWeight: 800, letterSpacing: '-0.045em', color: 'var(--ink)' }}>Banco de questões</h1>
          <p style={{ margin: '6px 0 0', fontSize: 14, color: 'var(--muted)' }}>Questões comentadas de procuradorias e carreiras jurídicas.</p>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 gap-[10px] lg:grid-cols-4">
          {kpis.map((k) => (
            <div key={k.rotulo} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 16, background: 'var(--surface)', border: '1px solid var(--line)' }}>
              <span style={{ width: 36, height: 36, borderRadius: 11, background: k.bg, color: k.cor, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{k.icon}</span>
              <div style={{ lineHeight: 1.2, minWidth: 0 }}>
                <b style={{ display: 'block', fontSize: 19, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--ink)' }}>{k.valor}</b>
                <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{k.rotulo}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Contagem + chips de filtro ativo */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}><b style={{ color: 'var(--ink)' }}>{fmt(stats.total)} questões</b> encontradas com os filtros</span>
          {chips.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              {chips.map((c) => (
                <button key={c.k} type="button" onClick={() => removerAplicado(c.k)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 28, padding: '0 6px 0 10px', borderRadius: 99, border: 0, background: 'var(--chip)', color: 'var(--brand)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                  {c.label}
                  <span style={{ width: 18, height: 18, borderRadius: 50, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', opacity: 0.7 }}><X size={11} /></span>
                </button>
              ))}
              <button type="button" onClick={limparTudo} style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textDecoration: 'underline', marginLeft: 4, background: 'none', border: 0, cursor: 'pointer' }}>Limpar</button>
            </div>
          )}
        </div>

        {/* 2 colunas: sidebar de filtros + lista */}
        <div className="grid grid-cols-1 gap-[18px] lg:grid-cols-[300px_minmax(0,1fr)] lg:items-start">
          {/* SIDEBAR */}
          <aside className="lg:sticky lg:top-[90px]" style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 20, padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <b style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 15, color: 'var(--ink)' }}><SlidersHorizontal size={16} style={{ color: 'var(--brand)' }} />Filtros</b>
              <button type="button" onClick={limparTudo} style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', background: 'none', border: 0, cursor: 'pointer' }}>Limpar</button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 42, padding: '0 12px', borderRadius: 12, border: '1px solid var(--line)', background: 'var(--surface2)', marginBottom: 14 }}>
              <Search size={15} style={{ color: 'var(--muted)', flexShrink: 0 }} />
              <input
                value={f.busca ?? ''}
                onChange={(e) => set('busca', e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') aplicar() }}
                placeholder="Palavra-chave ou nº da questão"
                style={{ flex: 1, minWidth: 0, border: 0, outline: 'none', background: 'transparent', color: 'var(--ink)', fontSize: 13 }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={LABEL}>Disciplina</label>
                <FiltroSelect value={f.disciplina ?? ''} placeholder="Todas" onChange={(v) => setF((p) => ({ ...p, disciplina: v || undefined, assunto: undefined }))}
                  options={[{ v: '', label: 'Todas' }, ...disciplinas.map((d) => ({ v: d.id, label: d.nome }))]} />
              </div>
              <div>
                <label style={LABEL}>Assunto</label>
                <FiltroSelect value={f.assunto ?? ''} placeholder="Todos" onChange={(v) => set('assunto', v)}
                  options={[{ v: '', label: 'Todos' }, ...assuntosDaDisc.map((a) => ({ v: a.id, label: a.nome }))]} />
              </div>
              <div>
                <label style={LABEL}>Banca</label>
                <FiltroSelect value={f.banca ?? ''} placeholder="Todas" onChange={(v) => set('banca', v)}
                  options={[{ v: '', label: 'Todas' }, ...bancas.map((b) => ({ v: b.id, label: b.nome }))]} />
              </div>
              <div>
                <label style={LABEL}>Ano</label>
                <FiltroSelect value={f.ano ?? ''} placeholder="Todos" onChange={(v) => set('ano', v)}
                  options={[{ v: '', label: 'Todos' }, ...anos.map((a) => ({ v: String(a), label: String(a) }))]} />
              </div>
              <div>
                <label style={LABEL}>Dificuldade</label>
                <FiltroSelect value={f.dificuldade ?? ''} placeholder="Todas" onChange={(v) => set('dificuldade', v)}
                  options={[{ v: '', label: 'Todas' }, ...DIFICULDADES.map((d) => ({ v: d.v, label: d.r }))]} />
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
              <ToggleLinha on={f.comentadas === '1'} onClick={() => toggle('comentadas')} icon={<FileText size={14} />} label="Somente com comentário" />
              <ToggleLinha on={f.favoritas === '1'} onClick={() => toggle('favoritas')} icon={<Star size={14} />} label="Somente favoritas" />
            </div>

            <button type="button" onClick={aplicar} style={{ width: '100%', marginTop: 16, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 46, borderRadius: 12, border: 0, background: 'var(--brand)', color: '#FFFFFF', fontSize: 13.5, fontWeight: 800, cursor: 'pointer', boxShadow: '0 10px 20px -12px color-mix(in oklab, var(--brand) 70%, transparent)' }}>
              <Search size={14} />Filtrar {fmt(stats.total)} questões
            </button>
          </aside>

          {/* LISTA */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {desempenhoFiltro && desempenhoFiltro.resolvidas > 0 && (
              <DesempenhoFiltroCard d={desempenhoFiltro} porDia={porDia} />
            )}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: 6, overflowX: 'auto' }}>
                {SEGMENTOS.map((s) => {
                  const ativo = segAtivo === s.v
                  return (
                    <button key={s.v || 'all'} type="button" onClick={() => irSegmento(s.v)} style={{ flexShrink: 0, height: 32, padding: '0 12px', borderRadius: 99, border: '1px solid var(--line)', background: ativo ? 'var(--brand)' : 'var(--surface)', color: ativo ? '#FFFFFF' : 'var(--muted)', fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap', cursor: 'pointer' }}>{s.r}</button>
                  )
                })}
              </div>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--muted)' }}>
                {pending && <Loader2 size={14} className="animate-spin" style={{ color: 'var(--brand)' }} />}
                Ordenar por
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 10px', borderRadius: 9, border: '1px solid var(--line)', color: 'var(--ink)', fontWeight: 700 }}>Mais recentes</span>
              </span>
            </div>

            {/* Área dos cards com overlay de carregamento durante a navegação (filtro/segmento). */}
            <div style={{ position: 'relative' }}>
              {pending && (
                <div style={{ position: 'absolute', inset: 0, zIndex: 10, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 48 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderRadius: 99, background: 'var(--surface)', border: '1px solid var(--line)', boxShadow: '0 10px 30px -12px rgba(0,0,0,.25)', fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>
                    <Loader2 size={15} className="animate-spin" style={{ color: 'var(--brand)' }} /> Carregando questões…
                  </span>
                </div>
              )}
              <div style={{ transition: 'opacity .2s', opacity: pending ? 0.5 : 1, pointerEvents: pending ? 'none' : undefined }}>
                {questoes.length === 0 ? (
                  <div style={{ padding: '40px 16px', borderRadius: 16, border: '1px dashed var(--line)', background: 'var(--surface)', textAlign: 'center', fontSize: 14, color: 'var(--muted)' }}>
                    Nenhuma questão encontrada com esses filtros.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {questoes.map((q, i) => <QCore key={q.id} brand={brand} questao={q} numero={i + 1} />)}
                  </div>
                )}
                {paginacao}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    </SelectCorCtx.Provider>
  )
}

/** Card compacto "Desempenho neste recorte" — resolvidas/acertos/erros do aluno dentro do filtro
 *  atual + mini-gráfico de questões por dia da semana. Só dado real (vindo do servidor). */
function DesempenhoFiltroCard({ d, porDia }: { d: { acertos: number; erros: number; resolvidas: number }; porDia?: { label: string; n: number }[] }) {
  const pct = d.resolvidas > 0 ? Math.round((d.acertos / d.resolvidas) * 100) : 0
  const maxDia = Math.max(1, ...(porDia ?? []).map((x) => x.n))
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16, padding: '14px 16px', borderRadius: 16, background: 'var(--surface)', border: '1px solid var(--line)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 1, minWidth: 200 }}>
        <div><b style={{ display: 'block', fontSize: 18, fontWeight: 800, color: 'var(--ink)' }}>{fmt(d.resolvidas)}</b><span style={{ fontSize: 11.5, color: 'var(--muted)' }}>resolvidas no filtro</span></div>
        <div><b style={{ display: 'block', fontSize: 18, fontWeight: 800, color: '#1FA868' }}>{fmt(d.acertos)}</b><span style={{ fontSize: 11.5, color: 'var(--muted)' }}>acertos</span></div>
        <div><b style={{ display: 'block', fontSize: 18, fontWeight: 800, color: '#E5484D' }}>{fmt(d.erros)}</b><span style={{ fontSize: 11.5, color: 'var(--muted)' }}>erros</span></div>
        <div><b style={{ display: 'block', fontSize: 18, fontWeight: 800, color: 'var(--brand)' }}>{pct}%</b><span style={{ fontSize: 11.5, color: 'var(--muted)' }}>aproveitamento</span></div>
      </div>
      {porDia && porDia.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 44 }}>
          {porDia.map((x) => (
            <div key={x.label} title={`${x.label}: ${x.n}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 14, height: Math.max(3, Math.round((x.n / maxDia) * 34)), borderRadius: 3, background: x.n > 0 ? 'var(--brand)' : 'var(--track)' }} />
              <span style={{ fontSize: 9, color: 'var(--muted)' }}>{x.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** Dropdown estilizado (base-ui Select) com a MESMA cara dos inputs da sidebar — substitui o
 *  `<select>` nativo (lista do SO feia). Usa sentinela '__all__' p/ a opção "Todas/Todos" (valor ''). */
function FiltroSelect({ value, onChange, options, placeholder }: { value: string; onChange: (v: string) => void; options: { v: string; label: string }[]; placeholder: string }) {
  const ALL = '__all__'
  const cor = useContext(SelectCorCtx)
  return (
    <Select value={value || ALL} onValueChange={(v) => onChange(v === ALL ? '' : String(v))}>
      <SelectTrigger
        className="w-full justify-between"
        style={{ height: 42, padding: '0 10px', borderRadius: 12, border: '1px solid var(--line)', background: 'var(--surface2)', color: 'var(--ink)', fontSize: 13, fontWeight: 600 }}
      >
        {/* base-ui renderiza o VALOR cru por padrão (mostrava "__all__"); função-filho mapeia p/ o rótulo. */}
        <SelectValue placeholder={placeholder}>
          {(val) => options.find((o) => (o.v || ALL) === val)?.label ?? placeholder}
        </SelectValue>
      </SelectTrigger>
      <SelectContent style={cor}>
        {options.map((o) => (
          <SelectItem key={o.v || ALL} value={o.v || ALL}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function ToggleLinha({ on, onClick, icon, label }: { on: boolean; onClick: () => void; icon: ReactNode; label: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, width: '100%', height: 40, padding: '0 12px', borderRadius: 12, border: '1px solid var(--line)', background: on ? 'var(--chip)' : 'var(--surface2)', color: on ? 'var(--brand)' : 'var(--ink)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>{icon}{label}</span>
      <span style={{ position: 'relative', width: 34, height: 20, borderRadius: 99, background: on ? 'var(--brand)' : 'var(--line)', flexShrink: 0, transition: 'background .15s' }}>
        <span style={{ position: 'absolute', top: 2, left: on ? 16 : 2, width: 16, height: 16, borderRadius: 50, background: '#FFFFFF', transition: 'left .15s' }} />
      </span>
    </button>
  )
}
