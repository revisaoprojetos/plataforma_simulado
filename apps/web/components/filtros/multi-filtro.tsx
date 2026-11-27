'use client'

// Filtros de MULTI-SELEÇÃO COMPARTILHADOS (Banco do aluno + telas do admin). Cores só por tokens: o aluno usa --brand/--line/...;
// o admin envolve em <EscopoFiltroAdmin> que define --mf-* a partir dos tokens do shadcn (--primary/--border/--card/...).
// - MultiFiltro: lista de opções com caixas de seleção + busca; texto longo ROLA na horizontal (sem quebrar/cortar).
// - ArvoreAssuntos: assuntos em árvore (sub-assuntos por pai_id) + "tópicos específicos" (assunto_detalhe) expansíveis.
// O painel abre INLINE (empurra o conteúdo) — funciona na sidebar fixa e no mobile, sem popover cortado.

import { createContext, useContext, useLayoutEffect, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, ChevronRight, Search } from 'lucide-react'
import { useCm } from '@/lib/brand/cor-marca'

/** Mapeia os tokens do filtro para os do shadcn (admin). No aluno NÃO usar: os --brand/--line/... do tema interno valem. */
export const TOKENS_ADMIN: CSSProperties = {
  ['--mf-brand' as string]: 'var(--primary)', ['--mf-line' as string]: 'var(--border)', ['--mf-surface' as string]: 'var(--background)',
  ['--mf-surface2' as string]: 'var(--card)', ['--mf-chip' as string]: 'color-mix(in srgb, var(--primary) 12%, transparent)',
  ['--mf-ink' as string]: 'var(--foreground)', ['--mf-muted' as string]: 'var(--muted-foreground)',
}
export function EscopoFiltroAdmin({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={className} style={TOKENS_ADMIN}>{children}</div>
}

export type OpcaoMulti = { v: string; label: string }

// ── Layout HORIZONTAL (admin): cada filtro vira um botão numa barra e a lista abre como painel flutuante logo abaixo dele.
// Envolva os MultiFiltro/ArvoreAssuntos em <BarraFiltrosHorizontal> (+ <CampoFiltro label> por filtro): o contexto liga o modo
// popover (position:absolute, fecha ao clicar fora). Fora dele (aluno/sidebar) o comportamento é o inline de sempre.
const HorizCtx = createContext(false)

export function BarraFiltrosHorizontal({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <HorizCtx.Provider value={true}>
      <div className={className} style={{ position: 'relative', zIndex: 40, display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: '10px 12px' }}>{children}</div>
    </HorizCtx.Provider>
  )
}

/** Rótulo pequeno acima do botão do filtro, em coluna de largura flexível (170–260px). */
export function CampoFiltro({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ flex: '1 1 170px', minWidth: 170, maxWidth: 260, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--mf-muted, var(--muted))' }}>{label}</span>
      {children}
    </div>
  )
}

/** Painel de opções. Inline (sidebar do aluno) ou, no modo horizontal, FLUTUANTE: renderizado no <body> com position:fixed medido pelo
 *  botão (não é cortado por overflow de ancestrais), alinhado ao botão mas empurrado para dentro da tela, abre para CIMA se faltar
 *  espaço embaixo, e fecha ao clicar fora / Esc / rolar a página. Como sai do wrapper, leva os tokens --mf-* junto. */
function PainelBox({ horiz, ancora, onFechar, children }: { horiz: boolean; ancora: RefObject<HTMLDivElement | null>; onFechar: () => void; children: ReactNode }) {
  const painel = useRef<HTMLDivElement | null>(null)
  const [pos, setPos] = useState<CSSProperties | null>(null)

  useLayoutEffect(() => {
    if (!horiz) return
    const medir = () => {
      const a = ancora.current; if (!a) return
      const r = a.getBoundingClientRect()
      const vw = window.innerWidth, vh = window.innerHeight, margem = 8
      const largura = Math.min(Math.max(r.width, 320), 460, vw - margem * 2)
      const left = Math.max(margem, Math.min(r.left, vw - largura - margem))
      const abaixo = vh - r.bottom - margem, acima = r.top - margem
      const paraCima = abaixo < 260 && acima > abaixo
      const espaco = Math.max(160, (paraCima ? acima : abaixo) - 6)
      setPos(paraCima
        ? { left, width: largura, bottom: vh - r.top + 6, maxHeight: espaco }
        : { left, width: largura, top: r.bottom + 6, maxHeight: espaco })
    }
    medir()
    window.addEventListener('resize', medir)
    window.addEventListener('scroll', medir, true)
    return () => { window.removeEventListener('resize', medir); window.removeEventListener('scroll', medir, true) }
  }, [horiz, ancora])

  useEffect(() => {
    if (!horiz) return
    const down = (e: MouseEvent) => {
      const t = e.target as Node
      if (painel.current?.contains(t) || ancora.current?.contains(t)) return
      onFechar()
    }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar() }
    document.addEventListener('mousedown', down); document.addEventListener('keydown', key)
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key) }
  }, [horiz, ancora, onFechar])

  if (!horiz) return <div style={PAINEL}>{children}</div>
  if (typeof document === 'undefined' || !pos) return null
  return createPortal(
    <div ref={painel} style={{ ...TOKENS_ADMIN, ...PAINEL, position: 'fixed', zIndex: 1000, display: 'flex', flexDirection: 'column', marginTop: 0, boxShadow: '0 18px 40px -16px rgba(0,0,0,.35)', ...pos }}>{children}</div>,
    document.body,
  )
}


const CAIXA: CSSProperties = { width: 16, height: 16, borderRadius: 5, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }

function Caixa({ on, dim }: { on: boolean; dim?: boolean }) {
  const cm = useCm()
  return (
    <span style={{ ...CAIXA, border: `1.5px solid ${on ? 'var(--mf-brand, var(--brand))' : 'var(--mf-line, var(--line))'}`, background: on ? 'var(--mf-brand, var(--brand))' : 'var(--mf-surface, var(--surface))', opacity: dim ? 0.5 : 1 }}>
      {on && <Check size={11} strokeWidth={3} style={{ color: cm('#FFFFFF') }} />}
    </span>
  )
}

/** Número de questões ao lado da opção (some quando ainda não foi calculado). */
function Qtd({ n }: { n?: number }) {
  if (n === undefined) return null
  return <span style={{ minWidth: 40, textAlign: 'left', paddingRight: 9, marginRight: 1, borderRight: '1px solid var(--mf-line, var(--line))', flexShrink: 0, fontSize: 11.5, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--mf-muted, var(--muted))' }}>{n.toLocaleString('pt-BR')}</span>
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

function CampoBusca({ valor, onChange, placeholder }: { valor: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 34, padding: '0 10px', borderRadius: 10, border: '1px solid var(--mf-line, var(--line))', background: 'var(--mf-surface, var(--surface))', margin: '8px 8px 4px' }}>
      <Search size={13} style={{ color: 'var(--mf-muted, var(--muted))', flexShrink: 0 }} />
      <input value={valor} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder}
        style={{ flex: 1, minWidth: 0, border: 0, outline: 'none', background: 'transparent', color: 'var(--mf-ink, var(--ink))', fontSize: 12.5 }} />
    </div>
  )
}

function Gatilho({ aberto, onClick, resumo, qtd, vazio }: { aberto: boolean; onClick: () => void; resumo: string; qtd: number; vazio: string }) {
  const cm = useCm()
  const horiz = useContext(HorizCtx)
  return (
    <button type="button" onClick={onClick} aria-expanded={aberto}
      style={{ width: '100%', height: horiz ? 38 : 42, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '0 10px', borderRadius: 12, border: `1px solid ${qtd ? 'var(--mf-brand, var(--brand))' : 'var(--mf-line, var(--line))'}`, background: 'var(--mf-surface2, var(--surface2))', color: 'var(--mf-ink, var(--ink))', fontSize: 13, fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}>
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: qtd ? 'var(--mf-ink, var(--ink))' : 'var(--mf-muted, var(--muted))' }}>{qtd ? resumo : vazio}</span>
      {qtd > 1 && <span style={{ flexShrink: 0, minWidth: 20, height: 20, padding: '0 6px', borderRadius: 99, background: 'var(--mf-brand, var(--brand))', color: cm('#FFFFFF'), fontSize: 11, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{qtd}</span>}
      <ChevronDown size={15} style={{ flexShrink: 0, color: 'var(--mf-muted, var(--muted))', transform: aberto ? 'rotate(180deg)' : undefined, transition: 'transform .15s' }} />
    </button>
  )
}

const PAINEL: CSSProperties = { marginTop: 6, borderRadius: 12, border: '1px solid var(--mf-line, var(--line))', background: 'var(--mf-surface2, var(--surface2))', overflow: 'hidden' }
const ROLAGEM: CSSProperties = { maxHeight: 264, flex: '1 1 auto', minHeight: 0, overflow: 'auto', padding: '4px 6px 8px' }

function Rodape({ qtd, onLimpar }: { qtd: number; onLimpar: () => void }) {
  if (!qtd) return null
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 12px', borderTop: '1px solid var(--mf-line, var(--line))', fontSize: 11.5, color: 'var(--mf-muted, var(--muted))' }}>
      <span>{qtd} selecionada{qtd > 1 ? 's' : ''}</span>
      <button type="button" onClick={onLimpar} style={{ border: 0, background: 'none', color: 'var(--mf-brand, var(--brand))', fontWeight: 700, fontSize: 11.5, cursor: 'pointer' }}>Limpar seleção</button>
    </div>
  )
}

export function MultiFiltro({ options, selecionados, onChange, vazio, busca, contagens, aberto, onToggle }: {
  options: OpcaoMulti[]; selecionados: string[]; onChange: (v: string[]) => void; vazio: string; busca?: string
  /** questões por opção (faceta); ausente = ainda calculando. */
  contagens?: Record<string, number>
  /** acordeão controlado pelo pai: só UM painel aberto por vez. */
  aberto: boolean; onToggle: () => void
}) {
  const [q, setQ] = useState('')
  const horiz = useContext(HorizCtx)
  const ref = useRef<HTMLDivElement | null>(null)
  const sel = new Set(selecionados)
  const nomes = options.filter((o) => sel.has(o.v)).map((o) => o.label)
  // Selecionados que não estão mais nas opções (ex.: disciplina trocada) ainda contam, pelo valor cru.
  const resumo = nomes.length === 1 ? nomes[0] : `${nomes.length || selecionados.length} selecionados`
  const lista = useMemo(() => (q ? options.filter((o) => norm(o.label).includes(norm(q))) : options), [options, q])
  const alternar = (v: string) => onChange(sel.has(v) ? selecionados.filter((x) => x !== v) : [...selecionados, v])

  return (
    <div ref={ref} style={horiz ? { position: 'relative' } : undefined}>
      <Gatilho aberto={aberto} onClick={onToggle} resumo={resumo} qtd={selecionados.length} vazio={vazio} />
      {aberto && (
        <PainelBox horiz={horiz} ancora={ref} onFechar={onToggle}>
          {(busca || options.length > 8) && <CampoBusca valor={q} onChange={setQ} placeholder={busca ?? 'Buscar…'} />}
          <div style={ROLAGEM}>
            {lista.length === 0 && <div style={{ padding: '10px 8px', fontSize: 12.5, color: 'var(--mf-muted, var(--muted))' }}>Nada encontrado.</div>}
            {/* min-width:max-content → a linha cresce com o texto e o painel rola na horizontal. */}
            {lista.map((o) => {
              const n = contagens ? contagens[o.v] ?? 0 : undefined
              const semQuestoes = n === 0 && !sel.has(o.v)
              return (
                <button key={o.v} type="button" onClick={() => alternar(o.v)} role="checkbox" aria-checked={sel.has(o.v)} title={o.label}
                  style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', minWidth: 'max-content', padding: '7px 8px', borderRadius: 8, border: 0, background: sel.has(o.v) ? 'var(--mf-chip, var(--chip))' : 'transparent', color: sel.has(o.v) ? 'var(--mf-brand, var(--brand))' : 'var(--mf-ink, var(--ink))', fontSize: 12.5, fontWeight: sel.has(o.v) ? 700 : 500, cursor: 'pointer', textAlign: 'left', whiteSpace: 'nowrap', opacity: semQuestoes ? 0.45 : 1 }}>
                  <Caixa on={sel.has(o.v)} /><Qtd n={n} />{o.label}
                </button>
              )
            })}
          </div>
          <Rodape qtd={selecionados.length} onLimpar={() => onChange([])} />
        </PainelBox>
      )}
    </div>
  )
}

export type AssuntoNo = { id: string; nome: string; pai_id: string | null }
export type DetalheNo = { assunto_id: string; nome: string }

export function ArvoreAssuntos({ assuntos, detalhes, selAssuntos, selDetalhes, onAssuntos, onDetalhes, vazio, contAssunto, contDetalhe, aberto, onToggle }: {
  assuntos: AssuntoNo[]; detalhes: DetalheNo[]
  selAssuntos: string[]; selDetalhes: string[]
  onAssuntos: (v: string[]) => void; onDetalhes: (v: string[]) => void; vazio: string
  /** questões por assunto (DIRETAS; a árvore soma os sub-assuntos) e por tópico específico. */
  contAssunto?: Record<string, number>; contDetalhe?: Record<string, number>
  aberto: boolean; onToggle: () => void
}) {
  const [q, setQ] = useState('')
  const horiz = useContext(HorizCtx)
  const ref = useRef<HTMLDivElement | null>(null)
  const [exp, setExp] = useState<Set<string>>(new Set())

  const ids = useMemo(() => new Set(assuntos.map((a) => a.id)), [assuntos])
  const filhos = useMemo(() => {
    const m = new Map<string, AssuntoNo[]>()
    for (const a of assuntos) if (a.pai_id && ids.has(a.pai_id)) m.set(a.pai_id, [...(m.get(a.pai_id) ?? []), a])
    return m
  }, [assuntos, ids])
  const raizes = useMemo(() => assuntos.filter((a) => !a.pai_id || !ids.has(a.pai_id)), [assuntos, ids])
  const detPor = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const d of detalhes) m.set(d.assunto_id, [...(m.get(d.assunto_id) ?? []), d.nome])
    return m
  }, [detalhes])

  // Total por assunto = diretas + todos os sub-assuntos (escolher o pai abrange os filhos).
  const subtotal = useMemo(() => {
    if (!contAssunto) return undefined
    const memo = new Map<string, number>()
    const calc = (id: string, vis: Set<string>): number => {
      if (memo.has(id)) return memo.get(id)!
      if (vis.has(id)) return 0
      vis.add(id)
      const n = (contAssunto[id] ?? 0) + (filhos.get(id) ?? []).reduce((t, f) => t + calc(f.id, vis), 0)
      memo.set(id, n); return n
    }
    for (const a of assuntos) calc(a.id, new Set())
    return memo
  }, [contAssunto, filhos, assuntos])

  const sa = new Set(selAssuntos); const sd = new Set(selDetalhes)
  const total = selAssuntos.length + selDetalhes.length
  const nomeDe = (id: string) => assuntos.find((a) => a.id === id)?.nome
  const resumo = total === 1 ? (selAssuntos[0] ? nomeDe(selAssuntos[0]) ?? '1 selecionado' : selDetalhes[0]) : `${total} selecionados`
  const alt = (v: string[], x: string) => (v.includes(x) ? v.filter((y) => y !== x) : [...v, x])
  const tog = (id: string) => setExp((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  function Linha({ children, nivel, on, dim, onClick, expandivel, aberta, onExpandir, titulo, n }: {
    children: ReactNode; n?: number; nivel: number; on: boolean; dim?: boolean; onClick: () => void; expandivel?: boolean; aberta?: boolean; onExpandir?: () => void; titulo: string
  }) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', minWidth: 'max-content', paddingLeft: nivel * 16, borderRadius: 8, background: on && !dim ? 'var(--mf-chip, var(--chip))' : 'transparent', opacity: n === 0 && !on ? 0.45 : 1 }}>
        <button type="button" onClick={onExpandir} disabled={!expandivel} aria-label={aberta ? 'Recolher' : 'Expandir'} aria-expanded={expandivel ? aberta : undefined}
          style={{ width: 24, height: 28, flexShrink: 0, border: 0, background: 'none', color: 'var(--mf-muted, var(--muted))', cursor: expandivel ? 'pointer' : 'default', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', visibility: expandivel ? 'visible' : 'hidden' }}>
          {aberta ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <button type="button" onClick={onClick} role="checkbox" aria-checked={on} title={titulo}
          style={{ display: 'flex', alignItems: 'center', gap: 9, flex: 1, minWidth: 'max-content', padding: '6px 8px 6px 2px', border: 0, background: 'none', color: on && !dim ? 'var(--mf-brand, var(--brand))' : 'var(--mf-ink, var(--ink))', fontSize: 12.5, fontWeight: on && !dim ? 700 : 500, cursor: dim ? 'default' : 'pointer', whiteSpace: 'nowrap', textAlign: 'left' }}>
          <Caixa on={on} dim={dim} /><Qtd n={n} />{children}
        </button>
      </div>
    )
  }

  function No({ a, nivel, herdado }: { a: AssuntoNo; nivel: number; herdado: boolean }) {
    const fs = filhos.get(a.id) ?? []; const ds = detPor.get(a.id) ?? []
    const expandivel = fs.length > 0 || ds.length > 0
    const aberta = exp.has(a.id)
    const marcado = sa.has(a.id) || herdado
    return (
      <>
        <Linha nivel={nivel} n={subtotal ? subtotal.get(a.id) ?? 0 : undefined} on={marcado} dim={herdado && !sa.has(a.id)} titulo={a.nome} expandivel={expandivel} aberta={aberta} onExpandir={() => tog(a.id)}
          onClick={() => { if (!herdado || sa.has(a.id)) onAssuntos(alt(selAssuntos, a.id)) }}>{a.nome}</Linha>
        {aberta && fs.map((f) => <No key={f.id} a={f} nivel={nivel + 1} herdado={marcado} />)}
        {aberta && ds.length > 0 && (
          <>
            <div style={{ paddingLeft: (nivel + 1) * 16 + 26, margin: '4px 0 2px', fontSize: 10, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--mf-muted, var(--muted))', whiteSpace: 'nowrap' }}>Tópicos específicos</div>
            {ds.map((d) => (
              <Linha key={a.id + d} nivel={nivel + 1} n={contDetalhe ? contDetalhe[d] ?? 0 : undefined} on={sd.has(d) || marcado} dim={marcado} titulo={d} onClick={() => { if (!marcado) onDetalhes(alt(selDetalhes, d)) }}>{d}</Linha>
            ))}
          </>
        )}
      </>
    )
  }

  // Com busca: lista PLANA (assuntos e tópicos que casam), sem árvore.
  const termo = norm(q.trim())
  const achados = useMemo(() => {
    if (!termo) return null
    const a = assuntos.filter((x) => norm(x.nome).includes(termo)).map((x) => ({ tipo: 'a' as const, chave: x.id, nome: x.nome }))
    const d = [...new Set(detalhes.filter((x) => norm(x.nome).includes(termo)).map((x) => x.nome))].map((n) => ({ tipo: 'd' as const, chave: n, nome: n }))
    return [...a, ...d]
  }, [termo, assuntos, detalhes])

  return (
    <div ref={ref} style={horiz ? { position: 'relative' } : undefined}>
      <Gatilho aberto={aberto} onClick={onToggle} resumo={resumo ?? ''} qtd={total} vazio={vazio} />
      {aberto && (
        <PainelBox horiz={horiz} ancora={ref} onFechar={onToggle}>
          <CampoBusca valor={q} onChange={setQ} placeholder="Buscar assunto ou tópico…" />
          <div style={ROLAGEM}>
            {achados ? (
              achados.length === 0 ? <div style={{ padding: '10px 8px', fontSize: 12.5, color: 'var(--mf-muted, var(--muted))' }}>Nada encontrado.</div>
                : achados.map((x) => (
                  <Linha key={x.tipo + x.chave} nivel={0} n={x.tipo === 'a' ? (subtotal ? subtotal.get(x.chave) ?? 0 : undefined) : (contDetalhe ? contDetalhe[x.chave] ?? 0 : undefined)} on={x.tipo === 'a' ? sa.has(x.chave) : sd.has(x.chave)} titulo={x.nome}
                    onClick={() => (x.tipo === 'a' ? onAssuntos(alt(selAssuntos, x.chave)) : onDetalhes(alt(selDetalhes, x.chave)))}>
                    {x.nome}{x.tipo === 'd' && <em style={{ fontStyle: 'normal', fontSize: 10.5, color: 'var(--mf-muted, var(--muted))' }}> · tópico</em>}
                  </Linha>
                ))
            ) : raizes.length === 0 ? (
              <div style={{ padding: '10px 8px', fontSize: 12.5, color: 'var(--mf-muted, var(--muted))' }}>Sem assuntos para esta disciplina.</div>
            ) : raizes.map((a) => <No key={a.id} a={a} nivel={0} herdado={false} />)}
          </div>
          <Rodape qtd={total} onLimpar={() => { onAssuntos([]); onDetalhes([]) }} />
        </PainelBox>
      )}
    </div>
  )
}
