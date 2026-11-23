'use client'
// Lista de páginas (direita, ~220px, redimensionável): + Adicionar página, subpáginas em 2 níveis, ordenação,
// arrastar p/ reordenar e mudar de nível, menu de contexto.
// DESEMPENHO: cada linha é um <LinhaPaginaItem> memoizado (handlers por id, estáveis); a lista recebe `linhas` já calculadas da casca
// (organizarPaginas roda UMA vez) e, acima de LIMIAR_VIRTUAL_LINHAS, renderiza só a janela visível (altura fixa por linha).
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowDownUp, ChevronDown, ChevronRight, FilePlus2, Plus, Trash2 } from 'lucide-react'
import { DND_PAGINA } from './abas-secao'
import { useMenuAncorado } from './menu-flutuante'
import type { LinhaPagina } from './organizar-paginas'
import { janelaVirtual, ALTURA_LINHA_VIRTUAL, LIMIAR_VIRTUAL_LINHAS } from '@/lib/aluno/notebook-janela'
import { FONTE_UI, ROTULO_ORDENACAO, type Ordenacao, type Pagina, type Secao } from './tipos'
import type { Entre } from './cliente-caderno'
import { aquecerEditores } from '../aquecer'

export const LARGURA_LISTA = { min: 160, max: 420, padrao: 224 }

type Drop = { id: string; pos: 'antes' | 'depois'; nivel: 0 | 1 }

type LinhaProps = {
  pg: Pagina; nivel: number; temFilhos: boolean; idx: number; total: number
  on: boolean; recolhida: boolean; arrastavel: boolean; virtual: boolean
  /** página criada de forma otimista, ainda sem confirmação do servidor. */
  criando: boolean
  /** só definido na linha que é o alvo do arrasto (nas outras fica null => memo estável). */
  dropPos: 'antes' | 'depois' | null; dropNivel: 0 | 1
  onSelecionar: (id: string) => void
  onAlternarRecolher: (id: string) => void
  onMenu: (e: React.MouseEvent, pg: Pagina) => void
  onExcluir: (pg: Pagina) => void
  onDragOverLinha: (e: React.DragEvent<HTMLElement>, id: string) => void
  onDragLeaveLinha: (id: string) => void
  onSoltarLinha: (e: React.DragEvent, id: string) => void
  onFimArrasto: () => void
}

const LinhaPaginaItem = memo(function LinhaPaginaItem(l: LinhaProps) {
  const { pg } = l
  return (
    <li style={{ position: 'relative' }} aria-setsize={l.virtual ? l.total : undefined} aria-posinset={l.virtual ? l.idx + 1 : undefined}>
      {l.dropPos === 'antes' ? <span aria-hidden style={{ position: 'absolute', top: 0, left: 8 + l.dropNivel * 18, right: 8, height: 2, background: 'var(--brand)', zIndex: 1 }} /> : null}
      <div role="button" tabIndex={0} aria-current={l.on ? 'true' : undefined} className="onenote-hover onenote-linha"
        draggable={l.arrastavel}
        onClick={() => l.onSelecionar(pg.id)}
        onKeyDown={(e) => { if (e.target !== e.currentTarget) return; if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); l.onSelecionar(pg.id) } else if (e.key === 'Delete' && e.target === e.currentTarget) { e.preventDefault(); l.onExcluir(pg) } else if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) { e.preventDefault(); l.onMenu(e as unknown as React.MouseEvent, pg) } }}
        onContextMenu={(e) => l.onMenu(e, pg)}
        onDragStart={(e) => { e.dataTransfer.setData(DND_PAGINA, pg.id); e.dataTransfer.effectAllowed = 'move' }}
        onDragEnd={l.onFimArrasto}
        onDragOver={(e) => l.onDragOverLinha(e, pg.id)}
        onDragLeave={() => l.onDragLeaveLinha(pg.id)}
        onDrop={(e) => l.onSoltarLinha(e, pg.id)}
        style={{
          display: 'flex', alignItems: 'center', gap: 4, minHeight: ALTURA_LINHA_VIRTUAL, ...(l.virtual ? { height: ALTURA_LINHA_VIRTUAL, boxSizing: 'border-box' as const, overflow: 'hidden' } : null),
          padding: `4px 8px 4px ${10 + l.nivel * 18}px`, cursor: 'pointer',
          background: l.on ? 'var(--chip)' : 'transparent', color: 'var(--ink)', fontSize: 13, fontWeight: l.on ? 700 : 500, borderLeft: `3px solid ${l.on ? 'var(--brand)' : 'transparent'}`,
        }}>
        {l.temFilhos ? (
          <button type="button" aria-label={l.recolhida ? 'Expandir subpáginas' : 'Recolher subpáginas'} aria-expanded={!l.recolhida}
            onClick={(e) => { e.stopPropagation(); l.onAlternarRecolher(pg.id) }}
            style={{ width: 18, height: 18, flexShrink: 0, border: 0, background: 'transparent', color: 'var(--muted)', cursor: 'pointer', padding: 0 }}>
            {l.recolhida ? <ChevronRight size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />}
          </button>
        ) : null}
        <span style={{ flex: 1, minWidth: 0, display: '-webkit-box', WebkitLineClamp: l.virtual ? 1 : 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', overflowWrap: 'anywhere', lineHeight: 1.3 }}>
          {pg.titulo?.trim() || 'Página sem título'}
        </span>
        {l.criando ? <span role="status" style={{ flexShrink: 0, fontSize: 10.5, color: 'var(--muted)', fontStyle: 'italic' }}>criando…</span> : null}
        <button type="button" className="onenote-lixo onenote-hover" aria-label="Excluir página" title="Excluir página (Delete)" disabled={l.criando}
          onClick={(e) => { e.stopPropagation(); l.onExcluir(pg) }} onDoubleClick={(e) => e.stopPropagation()} draggable={false}
          style={{ width: 26, height: 26, flexShrink: 0, border: 0, borderRadius: 4, background: 'transparent', color: 'var(--danger)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
          <Trash2 size={14} aria-hidden />
        </button>
      </div>
      {l.dropPos === 'depois' ? <span aria-hidden style={{ position: 'absolute', bottom: 0, left: 8 + l.dropNivel * 18, right: 8, height: 2, background: 'var(--brand)', zIndex: 1 }} /> : null}
    </li>
  )
})

export const ListaPaginas = memo(function ListaPaginas({ secao, linhas, criando, selecionadaId, largura, onLargura, ordenacao, onOrdenacao, recolhidas, onAlternarRecolher,
  onSelecionar, onNova, onMenu, onExcluir, onMover, temMais, onMais }: {
  secao: Secao | null; linhas: LinhaPagina[]; criando: ReadonlySet<string>; selecionadaId: string | null
  largura: number; onLargura: (w: number) => void
  ordenacao: Ordenacao; onOrdenacao: (o: Ordenacao) => void
  recolhidas: ReadonlySet<string>; onAlternarRecolher: (id: string) => void
  onSelecionar: (id: string) => void; onNova: (tipo: 'texto' | 'folha_livre') => void
  onMenu: (e: React.MouseEvent, pg: Pagina) => void
  onExcluir: (pg: Pagina) => void
  onMover: (id: string, entre: Entre, nivel: 0 | 1) => void
  temMais: boolean; onMais: () => void
}) {
  const { abrir, menu } = useMenuAncorado()
  const [drop, setDrop] = useState<Drop | null>(null)
  const dropRef = useRef<Drop | null>(null); dropRef.current = drop
  const linhasRef = useRef(linhas); linhasRef.current = linhas
  const onMoverRef = useRef(onMover); onMoverRef.current = onMover
  const arrastavel = ordenacao === 'manual' && !!secao && !secao.tipo.startsWith('auto_')
  const auto = !!secao && secao.tipo.startsWith('auto_')
  const virtual = linhas.length > LIMIAR_VIRTUAL_LINHAS

  // ---- janela (virtualização) ----
  const ulRef = useRef<HTMLUListElement>(null)
  const [jan, setJan] = useState({ ini: 0, fim: Math.min(linhas.length, 40) })
  const medirJanela = useCallback(() => {
    const el = ulRef.current; if (!el) return
    const j = janelaVirtual(linhasRef.current.length, el.scrollTop, el.clientHeight)
    setJan((a) => (a.ini === j.ini && a.fim === j.fim ? a : j))
  }, [])
  useEffect(() => {
    if (!virtual) return
    const el = ulRef.current; if (!el) return
    let r = 0
    const agendar = () => { if (!r) r = requestAnimationFrame(() => { r = 0; medirJanela() }) }
    el.addEventListener('scroll', agendar, { passive: true })
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(agendar) : null
    ro?.observe(el)
    agendar()
    return () => { el.removeEventListener('scroll', agendar); ro?.disconnect(); if (r) cancelAnimationFrame(r) }
  }, [virtual, medirJanela])
  useLayoutEffect(() => { if (virtual) medirJanela() }, [virtual, linhas, medirJanela])
  // página selecionada fora da janela (abrir por busca/atalho): leva a linha para a vista
  useEffect(() => {
    if (!virtual || !selecionadaId) return
    const el = ulRef.current; if (!el) return
    const i = linhasRef.current.findIndex((l) => l.pg.id === selecionadaId); if (i < 0) return
    const topo = i * ALTURA_LINHA_VIRTUAL
    if (topo < el.scrollTop || topo + ALTURA_LINHA_VIRTUAL > el.scrollTop + el.clientHeight) el.scrollTop = Math.max(0, topo - el.clientHeight / 2)
  }, [virtual, selecionadaId])

  const iniciarRedimensao = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    const x0 = e.clientX, w0 = largura
    const mover = (ev: PointerEvent) => onLargura(Math.max(LARGURA_LISTA.min, Math.min(LARGURA_LISTA.max, w0 + (x0 - ev.clientX))))
    const fim = () => { window.removeEventListener('pointermove', mover); window.removeEventListener('pointerup', fim) }
    window.addEventListener('pointermove', mover); window.addEventListener('pointerup', fim)
  }
  /** Teclado no separador: ← alarga a lista (ela está à direita), → estreita; Shift = passo maior; Home/End = extremos. */
  const tecladoSeparador = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const passo = e.shiftKey ? 48 : 16
    const clamp = (w: number) => Math.max(LARGURA_LISTA.min, Math.min(LARGURA_LISTA.max, w))
    if (e.key === 'ArrowLeft') { e.preventDefault(); onLargura(clamp(largura + passo)) }
    else if (e.key === 'ArrowRight') { e.preventDefault(); onLargura(clamp(largura - passo)) }
    else if (e.key === 'Home') { e.preventDefault(); onLargura(LARGURA_LISTA.min) }
    else if (e.key === 'End') { e.preventDefault(); onLargura(LARGURA_LISTA.max) }
  }

  // ---- arrasto (handlers estáveis; leem linhas/drop por ref) ----
  const aoDragOverLinha = useCallback((e: React.DragEvent<HTMLElement>, id: string) => {
    if (!arrastavel || !e.dataTransfer.types.includes(DND_PAGINA)) return
    e.preventDefault()
    const r = e.currentTarget.getBoundingClientRect()
    const pos: 'antes' | 'depois' = e.clientY < r.top + r.height / 2 ? 'antes' : 'depois'
    const nivel: 0 | 1 = e.clientX > r.left + 44 ? 1 : 0
    setDrop((d) => (d && d.id === id && d.pos === pos && d.nivel === nivel ? d : { id, pos, nivel }))
  }, [arrastavel])
  const aoDragLeaveLinha = useCallback((id: string) => setDrop((d) => (d?.id === id ? null : d)), [])
  const aoFimArrasto = useCallback(() => setDrop(null), [])
  const aoSoltarLinha = useCallback((e: React.DragEvent, id: string) => {
    e.preventDefault()
    const d = dropRef.current; setDrop(null)
    const pid = e.dataTransfer.getData(DND_PAGINA)
    if (!pid || !d) return
    const lista = linhasRef.current.map((l) => l.pg.id)
    const idx = lista.indexOf(id); if (idx < 0) return
    // vizinhos no ponto de inserção, ignorando a própria página arrastada
    const pos = d.pos === 'antes' ? idx : idx + 1
    const antes = lista.slice(0, pos).filter((x) => x !== pid).pop() ?? null
    const depois = lista.slice(pos).filter((x) => x !== pid)[0] ?? null
    onMoverRef.current(pid, { antes_id: antes, depois_id: depois }, antes ? d.nivel : 0)
  }, [])

  const ordenarMenu = (el: HTMLElement) => abrir(el, (Object.keys(ROTULO_ORDENACAO) as Ordenacao[]).map((o) => ({ rotulo: ROTULO_ORDENACAO[o], marcado: o === ordenacao, onClick: () => onOrdenacao(o) })))
  const novaMenu = (el: HTMLElement) => abrir(el, [
    { rotulo: 'Folha livre (padrão)', icone: FilePlus2, atalho: 'Ctrl+O', onClick: () => onNova('folha_livre') },
    { rotulo: 'Página de texto', icone: FilePlus2, onClick: () => onNova('texto') },
  ])

  const ini = virtual ? Math.min(jan.ini, linhas.length) : 0
  const fim = virtual ? Math.min(jan.fim, linhas.length) : linhas.length
  const visiveis = virtual ? linhas.slice(ini, fim) : linhas

  return (
    <aside aria-label="Lista de páginas" style={{ position: 'relative', width: largura, flexShrink: 0, display: 'flex', flexDirection: 'column', minHeight: 0, background: 'var(--surface2)', borderLeft: '1px solid var(--line)', fontFamily: FONTE_UI }}>
      <div role="separator" aria-orientation="vertical" aria-label="Redimensionar lista de páginas (setas esquerda e direita)" tabIndex={0}
        aria-valuenow={Math.round(largura)} aria-valuemin={LARGURA_LISTA.min} aria-valuemax={LARGURA_LISTA.max}
        onPointerDown={iniciarRedimensao} onKeyDown={tecladoSeparador}
        style={{ position: 'absolute', left: -3, top: 0, bottom: 0, width: 6, cursor: 'col-resize', zIndex: 2, touchAction: 'none' }} />
      <div style={{ display: 'flex', borderBottom: '1px solid var(--line)' }}>
        <button type="button" disabled={!secao || auto} onClick={() => onNova('folha_livre')} onPointerEnter={aquecerEditores} onTouchStart={aquecerEditores} title="Adicionar página (Ctrl+O)" className="onenote-hover"
          style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, height: 36, padding: '0 12px', border: 0, background: 'transparent', color: 'var(--brand)', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, cursor: auto || !secao ? 'default' : 'pointer', opacity: auto || !secao ? 0.45 : 1 }}>
          <Plus size={16} aria-hidden />Adicionar página
        </button>
        <button type="button" disabled={!secao || auto} onClick={(e) => novaMenu(e.currentTarget)} aria-label="Tipos de página" aria-haspopup="menu" className="onenote-hover"
          style={{ width: 28, border: 0, background: 'transparent', color: 'var(--muted)', cursor: 'pointer', opacity: auto || !secao ? 0.45 : 1 }}><ChevronDown size={14} aria-hidden /></button>
      </div>
      <button type="button" onClick={(e) => ordenarMenu(e.currentTarget)} aria-haspopup="menu" className="onenote-hover"
        style={{ display: 'flex', alignItems: 'center', gap: 6, height: 28, padding: '0 12px', border: 0, borderBottom: '1px solid var(--line)', background: 'transparent', color: 'var(--muted)', fontFamily: 'inherit', fontSize: 11.5, cursor: 'pointer', textAlign: 'left' }}>
        <ArrowDownUp size={12} aria-hidden />Ordenar: {ROTULO_ORDENACAO[ordenacao]}
      </button>

      <ul ref={ulRef} role="list" style={{ listStyle: 'none', margin: 0, padding: 0, flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {auto ? <li style={{ padding: 14, fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.5 }}>Seção automática: reúne suas questões e é somente leitura.</li> : null}
        {!auto && secao && linhas.length === 0 ? <li style={{ padding: 14, fontSize: 12.5, color: 'var(--muted)' }}>Esta seção não tem páginas. Use “Adicionar página”.</li> : null}
        {virtual && ini > 0 ? <li aria-hidden style={{ height: ini * ALTURA_LINHA_VIRTUAL, listStyle: 'none' }} /> : null}
        {visiveis.map((l, k) => {
          const marca = drop?.id === l.pg.id
          return (
            <LinhaPaginaItem key={l.pg.id} pg={l.pg} nivel={l.nivel} temFilhos={l.temFilhos} idx={ini + k} total={linhas.length}
              on={l.pg.id === selecionadaId} criando={criando.has(l.pg.id)} recolhida={recolhidas.has(l.pg.id)} arrastavel={arrastavel} virtual={virtual}
              dropPos={marca ? drop!.pos : null} dropNivel={marca ? drop!.nivel : 0}
              onSelecionar={onSelecionar} onAlternarRecolher={onAlternarRecolher} onMenu={onMenu} onExcluir={onExcluir}
              onDragOverLinha={aoDragOverLinha} onDragLeaveLinha={aoDragLeaveLinha} onSoltarLinha={aoSoltarLinha} onFimArrasto={aoFimArrasto} />
          )
        })}
        {virtual && fim < linhas.length ? <li aria-hidden style={{ height: (linhas.length - fim) * ALTURA_LINHA_VIRTUAL, listStyle: 'none' }} /> : null}
        {temMais ? (
          <li><button type="button" onClick={onMais} className="onenote-hover" style={{ width: '100%', height: 34, border: 0, background: 'transparent', color: 'var(--brand)', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>Carregar mais páginas</button></li>
        ) : null}
      </ul>
      {ordenacao !== 'manual' && !auto ? <p style={{ margin: 0, padding: '6px 12px', fontSize: 11, color: 'var(--muted)', borderTop: '1px solid var(--line)' }}>Para arrastar e reordenar, use a ordem Manual.</p> : null}
      {menu}
    </aside>
  )
})
