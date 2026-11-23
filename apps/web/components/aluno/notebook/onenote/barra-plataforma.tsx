'use client'
// Barra da plataforma (topo, marca do tenant) + barra de título do caderno (abaixo).
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ArrowLeft, BookOpen, ChevronDown, FileText, Menu, MoreHorizontal, Redo2, Search, Share2, Undo2, X } from 'lucide-react'
import { rotuloIndicador } from '@/lib/aluno/notebook-autosave'
import { IndicadorSalvo } from '../indicador-salvo'
import { useOneNoteCmd, useTemCmd } from './contexto-cmd'
import { useMenuAncorado } from './menu-flutuante'
import { FONTE_UI, type EstadoSalvo } from './tipos'

export type Escopo = 'pagina' | 'secao' | 'caderno'
export const ROTULO_ESCOPO: Record<Escopo, string> = { pagina: 'Esta página', secao: 'Esta seção', caderno: 'Este caderno' }

type PropsPlataforma = {
  voltarHref: string; salvo: EstadoSalvo | null
  busca: string; onBusca: (v: string) => void; onAbrirBusca: () => void; onLimparBusca: () => void
  escopo: Escopo; onEscopo: (e: Escopo) => void
  buscaRef: React.RefObject<HTMLInputElement | null>
  onMenuMobile: () => void
  onLista?: () => void
}

export function BarraPlataforma(p: PropsPlataforma) {
  const { abrir, menu } = useMenuAncorado()
  const fg = 'var(--onBrand, #fff)'
  return (
    <header style={{ display: 'flex', alignItems: 'center', gap: 12, height: 44, padding: '0 12px', flexShrink: 0, background: 'var(--sidebar)', color: fg, fontFamily: FONTE_UI }}>
      <button type="button" className="lg:hidden" onClick={p.onMenuMobile} aria-label="Abrir painel de navegação"
        style={{ order: 5, width: 40, height: 40, border: 0, background: 'transparent', color: 'inherit', cursor: 'pointer', flexShrink: 0 }}><Menu size={18} aria-hidden /></button>
      <button type="button" className="lg:hidden" onClick={p.onLista} aria-label="Abrir lista de páginas" title="Lista de páginas" style={{ order: 6, width: 40, height: 40, border: 0, background: 'transparent', color: 'inherit', cursor: 'pointer', flexShrink: 0 }}><FileText size={18} aria-hidden /></button>
      <Link href={p.voltarHref} title="Voltar ao portal" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'inherit', textDecoration: 'none', fontSize: 13, fontWeight: 600, opacity: 0.92 }}>
        <ArrowLeft size={16} aria-hidden /><span className="hidden sm:inline">Voltar ao portal</span>
      </Link>
      <span aria-hidden style={{ width: 1, height: 20, background: 'currentColor', opacity: 0.3 }} />
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: 14, whiteSpace: 'nowrap' }}>
        <BookOpen size={18} aria-hidden style={{ color: 'var(--gold)' }} />Meus Cadernos
      </span>

      <div role="search" style={{ flex: 1, display: 'flex', justifyContent: 'center', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', width: 'min(100%, 520px)', height: 30, borderRadius: 4, background: 'color-mix(in srgb, #000 22%, transparent)', border: '1px solid color-mix(in srgb, #fff 22%, transparent)' }}>
          <Search size={15} aria-hidden style={{ margin: '0 8px', opacity: 0.85, flexShrink: 0 }} />
          <input ref={p.buscaRef} value={p.busca} onChange={(e) => p.onBusca(e.target.value)} onFocus={p.onAbrirBusca} maxLength={100}
            placeholder={`Pesquisar (${ROTULO_ESCOPO[p.escopo].toLowerCase()}) — Ctrl+E`} aria-label="Pesquisar no caderno"
            style={{ flex: 1, minWidth: 0, height: '100%', background: 'transparent', border: 0, outline: 'none', color: 'inherit', fontSize: 13, fontFamily: 'inherit' }} />
          {p.busca ? <button type="button" aria-label="Limpar pesquisa" onClick={p.onLimparBusca} style={{ width: 26, height: 26, border: 0, background: 'transparent', color: 'inherit', cursor: 'pointer' }}><X size={14} aria-hidden /></button> : null}
          <button type="button" aria-label="Escopo da pesquisa" aria-haspopup="menu" title="Escopo da pesquisa"
            onClick={(e) => abrir(e.currentTarget, (['pagina', 'secao', 'caderno'] as Escopo[]).map((s) => ({ rotulo: ROTULO_ESCOPO[s], marcado: p.escopo === s, onClick: () => p.onEscopo(s) })))}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 2, height: 28, padding: '0 8px', border: 0, borderLeft: '1px solid color-mix(in srgb, #fff 22%, transparent)', background: 'transparent', color: 'inherit', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
            <span className="hidden md:inline">{ROTULO_ESCOPO[p.escopo]}</span><ChevronDown size={13} aria-hidden />
          </button>
          {menu}
        </div>
      </div>

      <span style={{ order: 4, fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', opacity: 0.95 }} role="status" aria-live="polite">
        {p.salvo ? rotuloIndicador(p.salvo.fase, p.salvo.online, p.salvo.semPersistencia) : ''}
      </span>
    </header>
  )
}

export type MarcaTenant = { logo: string | null; nome: string }

function BtnCmdTb({ id, rotulo, I, atalho }: { id: string; rotulo: string; I: typeof Undo2; atalho: string }) {
  const cmd = useOneNoteCmd()
  const tem = useTemCmd(id)
  return (
    <button type="button" className="onenote-tb" disabled={!tem} title={`${rotulo} (${atalho})`} aria-label={rotulo} onMouseDown={(e) => e.preventDefault()} onClick={() => cmd.executar(id)}
      style={{ ...TB, width: 34, padding: 0, opacity: tem ? 1 : 0.4, cursor: tem ? 'pointer' : 'default' }}>
      <I size={18} aria-hidden />
    </button>
  )
}

/** `.tb` do leitor (leitor-jus.html:119): 34px, raio 8, rótulo opcional. Cores/hover/aberto vêm de .onenote-tb (CSS_GLOBAL). */
const TB: React.CSSProperties = { height: 34, minWidth: 34, padding: '0 8px', border: 0, borderRadius: 8, background: 'transparent', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, fontSize: 13, fontWeight: 500, fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0, textDecoration: 'none', cursor: 'pointer' }
const BRANCO_75 = 'color-mix(in srgb, var(--onBrand,#fff) 72%, transparent)'

/**
 * Barra de cima do DESKTOP (>=1024px), no padrão da barra do LEITOR (public/leitura/leitor-jus.html, `.app.brand-on .top`):
 *  - l.86 altura 52px + safe-area, fundo da marca (--sidebar), sem borda; l.88 grade 32px com máscara;
 *  - l.1453 Voltar com rótulo, l.1455 + l.94 logo do tenant em branco (26px, máx. 132px), l.1456 + l.102 separador vertical;
 *  - l.1457 + l.79-82/103-106 trilha `.crumbs` (13.5px, chevrons, atual em negrito, truncada);
 *  - l.95-97 `.tb` (raio 8, hover 16%, aberto 26%); l.107 busca (14% / borda 28%); l.1075 rótulos somem <=1400px.
 * Funções do caderno mantidas: voltar, desfazer/refazer, pesquisa com escopo (Ctrl+E), Salvo, Compartilhar (desabilitado).
 */
export function BarraDesktop(p: Omit<PropsPlataforma, 'onMenuMobile' | 'onLista'> & { marca: MarcaTenant; caderno: string; secao: string; pagina: string }) {
  const { abrir, menu } = useMenuAncorado()
  const fg = 'var(--onBrand, #fff)'
  const vsep = <span aria-hidden style={{ width: 1, height: 20, margin: '0 4px', flexShrink: 0, background: 'color-mix(in srgb, var(--onBrand,#fff) 28%, transparent)' }} />
  const s = p.salvo
  const rot = s ? rotuloIndicador(s.fase, s.online, s.semPersistencia) : ''
  const ruim = !!s && (s.fase === 'erro' || s.fase === 'conflito')
  const pontoCor = ruim ? 'var(--danger)' : s && (s.fase === 'offline' || !s.online) ? 'var(--gold)' : 'var(--ok)'
  return (
    <header className="onenote-top" style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 4, height: 'calc(52px + env(safe-area-inset-top, 0px))', padding: 'env(safe-area-inset-top, 0px) 12px 0', flexShrink: 0, background: 'var(--sidebar)', color: fg, fontFamily: FONTE_UI }}>
      <span aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', backgroundSize: '32px 32px',
        backgroundImage: 'linear-gradient(color-mix(in srgb, var(--onBrand,#fff) 6%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb, var(--onBrand,#fff) 6%, transparent) 1px, transparent 1px)',
        WebkitMaskImage: 'linear-gradient(90deg, #000, rgba(0,0,0,.35))', maskImage: 'linear-gradient(90deg, #000, rgba(0,0,0,.35))' }} />
      <Link href={p.voltarHref} className="onenote-tb" title="Voltar ao portal" aria-label="Voltar ao portal" style={{ ...TB, position: 'relative', padding: '0 10px 0 6px' }}>
        <ArrowLeft size={18} aria-hidden /><span>Voltar</span>
      </Link>
      {p.marca.logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', padding: '0 10px 0 4px', flexShrink: 0 }}>
          <img src={p.marca.logo} alt={p.marca.nome} style={{ height: 26, maxWidth: 132, objectFit: 'contain', display: 'block', filter: 'brightness(0) invert(1)' }} />
        </span>
      ) : p.marca.nome ? (
        <span style={{ position: 'relative', padding: '0 10px 0 4px', fontWeight: 800, fontSize: 14, whiteSpace: 'nowrap', flexShrink: 0 }}>{p.marca.nome}</span>
      ) : null}
      <span style={{ position: 'relative', display: 'inline-flex' }}>{vsep}</span>
      <nav aria-label="Trilha" style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: '0 1 auto', overflow: 'hidden', fontSize: 13.5, color: BRANCO_75, whiteSpace: 'nowrap' }}>
        <b aria-current="page" style={{ color: fg, fontWeight: 600, whiteSpace: 'nowrap' }}>Meus Cadernos</b>
      </nav>
      {s ? (
        <span role="status" aria-live="polite" style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 6, height: 22, padding: '0 9px', marginLeft: 6, borderRadius: 99, flexShrink: 0, fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap', background: 'color-mix(in srgb, var(--onBrand,#fff) 20%, transparent)', color: fg }}>
          <i aria-hidden style={{ width: 6, height: 6, borderRadius: 99, background: pontoCor }} />{rot}
          {s.fase === 'erro' ? <button type="button" onClick={s.retry} style={{ border: 0, background: 'transparent', color: 'inherit', textDecoration: 'underline', cursor: 'pointer', fontSize: 'inherit', fontWeight: 700, padding: 0 }}>Tentar de novo</button> : null}
        </span>
      ) : null}
      <div style={{ flex: 1, minWidth: 0 }} />

      <span style={{ position: 'relative', display: 'inline-flex', gap: 2, flexShrink: 0 }}>
        <BtnCmdTb id="edicao.desfazer" rotulo="Desfazer" I={Undo2} atalho="Ctrl+Z" />
        <BtnCmdTb id="edicao.refazer" rotulo="Refazer" I={Redo2} atalho="Ctrl+Y" />
      </span>
      <span style={{ position: 'relative', display: 'inline-flex' }}>{vsep}</span>

      <div role="search" className="onenote-busca" style={{ position: 'relative', display: 'flex', alignItems: 'center', flex: '0 1 auto', width: 'clamp(150px, 20vw, 300px)', minWidth: 0, height: 34, borderRadius: 8, background: 'color-mix(in srgb, var(--onBrand,#fff) 14%, transparent)', border: '1px solid color-mix(in srgb, var(--onBrand,#fff) 28%, transparent)' }}>
        <Search size={16} aria-hidden style={{ margin: '0 8px 0 10px', flexShrink: 0 }} />
        <input ref={p.buscaRef} value={p.busca} onChange={(e) => p.onBusca(e.target.value)} onFocus={p.onAbrirBusca} maxLength={100}
          placeholder={`Buscar · ${ROTULO_ESCOPO[p.escopo].toLowerCase()}`} aria-label="Pesquisar no caderno" title="Pesquisar (Ctrl+E)"
          style={{ flex: 1, minWidth: 0, height: '100%', background: 'transparent', border: 0, outline: 'none', color: 'inherit', fontSize: 13, fontFamily: 'inherit' }} />
        {p.busca ? <button type="button" className="onenote-tb" aria-label="Limpar pesquisa" onClick={p.onLimparBusca} style={{ ...TB, width: 28, minWidth: 28, height: 28, padding: 0 }}><X size={14} aria-hidden /></button> : null}
        <button type="button" className="onenote-tb" aria-label="Escopo da pesquisa" aria-haspopup="menu" title="Escopo da pesquisa"
          onClick={(e) => abrir(e.currentTarget, (['pagina', 'secao', 'caderno'] as Escopo[]).map((sc) => ({ rotulo: ROTULO_ESCOPO[sc], marcado: p.escopo === sc, onClick: () => p.onEscopo(sc) })))}
          style={{ ...TB, height: 28, minWidth: 28, padding: '0 6px', gap: 2, marginRight: 3 }}>
          <ChevronDown size={14} aria-hidden />
        </button>
        {menu}
      </div>

      <button type="button" disabled title="Compartilhar (em breve)" aria-label="Compartilhar" className="onenote-tb" style={{ ...TB, position: 'relative', opacity: 0.55, cursor: 'default' }}>
        <Share2 size={18} aria-hidden /><span className="onenote-lbl">Compartilhar</span>
      </button>
    </header>
  )
}

function BtnCmd({ id, rotulo, I, atalho }: { id: string; rotulo: string; I: typeof Undo2; atalho: string }) {
  const cmd = useOneNoteCmd()
  const tem = useTemCmd(id) // assina só este id
  return (
    <button type="button" className="onenote-hover" disabled={!tem} title={`${rotulo} (${atalho})`} aria-label={rotulo} onMouseDown={(e) => e.preventDefault()} onClick={() => cmd.executar(id)}
      style={{ width: 28, height: 28, border: '1px solid transparent', borderRadius: 4, background: 'transparent', color: 'var(--brand)', cursor: tem ? 'pointer' : 'default', opacity: tem ? 1 : 0.4, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
      <I size={16} aria-hidden />
    </button>
  )
}

export function BarraTitulo({ titulo, caderno, salvo }: { titulo: string; caderno: string; salvo: EstadoSalvo | null }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 34, padding: '0 12px', flexShrink: 0, background: 'var(--surface2)', borderBottom: '1px solid var(--line)', fontFamily: FONTE_UI }}>
      <BtnCmd id="edicao.desfazer" rotulo="Desfazer" I={Undo2} atalho="Ctrl+Z" />
      <BtnCmd id="edicao.refazer" rotulo="Refazer" I={Redo2} atalho="Ctrl+Y" />
      <span style={{ flex: 1, minWidth: 0, textAlign: 'center', fontSize: 13, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {titulo || 'Página sem título'} <span style={{ fontWeight: 400, color: 'var(--muted)' }}>· {caderno}</span>
      </span>
      {salvo ? <IndicadorSalvo fase={salvo.fase} online={salvo.online} semPersistencia={salvo.semPersistencia} onRetry={salvo.retry} /> : null}
      <button type="button" disabled title="Compartilhar (em breve)" aria-label="Compartilhar"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 26, padding: '0 10px', border: '1px solid var(--line2)', borderRadius: 4, background: 'transparent', color: 'var(--muted)', fontSize: 12.5, fontFamily: 'inherit', opacity: 0.55 }}>
        <Share2 size={14} aria-hidden /><span className="hidden sm:inline">Compartilhar</span>
      </button>
    </div>
  )
}

/**
 * Barra única para telas estreitas (<768), no padrão da barra do LEITOR (public/leitura/leitor-jus.html):
 *  - `.app.brand-on .top` (l.86): 52px + safe-area, fundo da marca, sem borda, texto claro; grade fina de 32px (l.88, copiada);
 *  - `.tb` (l.119/95-97): botões de 8px de raio, hover 16%, aberto 26% + anel (classe .onenote-tb no CSS_GLOBAL);
 *  - `.crumbs b` (l.79-80): título em negrito + linha secundária; ações à direita (busca, lista de páginas, "…").
 */
export function BarraCompacta(p: Omit<PropsPlataforma, 'onMenuMobile' | 'onLista'> & { titulo: string; caderno?: string; onNav: () => void; onLista: () => void; navAberto: boolean; listaAberta: boolean }) {
  const cmd = useOneNoteCmd()
  const { abrir, menu } = useMenuAncorado()
  const [buscando, setBuscando] = useState(false)
  const fg = 'var(--onBrand, #fff)'
  const ib: React.CSSProperties = { width: 40, height: 40, border: 0, borderRadius: 8, background: 'transparent', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }
  const sub = [p.caderno, p.salvo ? rotuloIndicador(p.salvo.fase, p.salvo.online, p.salvo.semPersistencia) : ''].filter(Boolean).join(' · ')
  useEffect(() => { if (buscando) p.buscaRef.current?.focus() }, [buscando, p.buscaRef])
  const mais = (el: HTMLElement) => abrir(el, [
    { rotulo: 'Desfazer', desabilitado: !cmd.tem('edicao.desfazer'), onClick: () => cmd.executar('edicao.desfazer') },
    { rotulo: 'Refazer', desabilitado: !cmd.tem('edicao.refazer'), onClick: () => cmd.executar('edicao.refazer') },
    { separador: true },
    { titulo: 'Escopo da pesquisa' },
    ...(['pagina', 'secao', 'caderno'] as Escopo[]).map((s) => ({ rotulo: ROTULO_ESCOPO[s], marcado: p.escopo === s, onClick: () => p.onEscopo(s) })),
    { separador: true },
    { rotulo: 'Compartilhar (em breve)', desabilitado: true },
  ])
  return (
    <header style={{ position: 'relative', flexShrink: 0, background: 'var(--sidebar)', color: fg, fontFamily: FONTE_UI, paddingTop: 'env(safe-area-inset-top, 0px)' }}>
      <span aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', backgroundSize: '32px 32px',
        backgroundImage: 'linear-gradient(color-mix(in srgb, var(--onBrand,#fff) 6%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb, var(--onBrand,#fff) 6%, transparent) 1px, transparent 1px)',
        WebkitMaskImage: 'linear-gradient(90deg, #000, rgba(0,0,0,.35))', maskImage: 'linear-gradient(90deg, #000, rgba(0,0,0,.35))' }} />
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 2, height: 52, padding: '0 6px' }}>
        <Link href={p.voltarHref} className="onenote-tb" aria-label="Voltar ao portal" title="Voltar ao portal" style={ib}><ArrowLeft size={18} aria-hidden /></Link>
        <div style={{ flex: 1, minWidth: 0, padding: '0 6px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 1 }}>
          <b style={{ fontSize: 14, fontWeight: 600, lineHeight: '18px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.titulo || 'Página sem título'}</b>
          <span role="status" aria-live="polite" style={{ fontSize: 11.5, lineHeight: '14px', color: 'color-mix(in srgb, var(--onBrand,#fff) 72%, transparent)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</span>
        </div>
        <button type="button" className="onenote-tb" onClick={() => { if (buscando) { setBuscando(false); p.onLimparBusca() } else setBuscando(true) }} aria-label="Pesquisar no caderno" aria-expanded={buscando} style={ib}><Search size={18} aria-hidden /></button>
        <button type="button" className="onenote-tb" onClick={p.onNav} aria-label="Painel de navegação" aria-expanded={p.navAberto} style={ib}><Menu size={18} aria-hidden /></button>
        <button type="button" className="onenote-tb" onClick={p.onLista} aria-label="Lista de páginas" aria-expanded={p.listaAberta} style={ib}><FileText size={18} aria-hidden /></button>
        <button type="button" className="onenote-tb" onClick={(e) => mais(e.currentTarget)} aria-label="Mais opções" aria-haspopup="menu" style={ib}><MoreHorizontal size={18} aria-hidden /></button>
        {menu}
      </div>
      {buscando ? (
        <div role="search" style={{ position: 'relative', display: 'flex', alignItems: 'center', height: 38, margin: '0 8px 8px', borderRadius: 8, background: 'color-mix(in srgb, #000 22%, transparent)', border: '1px solid color-mix(in srgb, #fff 22%, transparent)' }}>
          <Search size={15} aria-hidden style={{ margin: '0 8px', opacity: 0.85, flexShrink: 0 }} />
          <input ref={p.buscaRef} value={p.busca} onChange={(e) => p.onBusca(e.target.value)} onFocus={p.onAbrirBusca} maxLength={100}
            placeholder={`Pesquisar (${ROTULO_ESCOPO[p.escopo].toLowerCase()})`} aria-label="Pesquisar no caderno" enterKeyHint="search"
            style={{ flex: 1, minWidth: 0, height: '100%', background: 'transparent', border: 0, outline: 'none', color: 'inherit', fontSize: 16, fontFamily: 'inherit' }} />
          <button type="button" aria-label="Fechar pesquisa" onClick={() => { setBuscando(false); p.onLimparBusca() }} style={{ width: 38, height: 36, border: 0, background: 'transparent', color: 'inherit', cursor: 'pointer' }}><X size={15} aria-hidden /></button>
        </div>
      ) : null}
    </header>
  )
}
