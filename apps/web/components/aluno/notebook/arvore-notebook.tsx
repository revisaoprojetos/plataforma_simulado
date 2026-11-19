'use client'
// Árvore Seções -> Páginas (role=tree). Setas navegam, Direita/Esquerda expande/recolhe, Enter abre, F2 renomeia.
import { useRef, useState } from 'react'
import { ChevronDown, ChevronRight, FilePlus2, FileText, FolderPlus, Pencil, PenLine, Trash2, Star, XCircle } from 'lucide-react'

export type Secao = { id: string; nome: string; cor?: string | null; ordem: number; tipo: string; qtd_paginas: number }
export type TipoNovaPagina = 'texto' | 'folha_livre'
export type PaginaLeve = { id: string; secao_id: string; titulo: string; tipo_pagina?: string; ordem: number; atualizado_em?: string }
export type Selecao = { tipo: 'pagina'; id: string } | { tipo: 'auto'; secaoId: string; auto: 'erros' | 'favoritos' } | null

type Props = {
  secoes: Secao[]; paginas: PaginaLeve[]; selecao: Selecao
  onSelecionarPagina: (id: string) => void
  onSelecionarAuto: (s: Secao) => void
  onCriarSecao: () => void
  onCriarPagina: (secaoId: string, tipo: TipoNovaPagina) => void
  onRenomearSecao: (id: string, nome: string) => void
  onFocarTitulo: () => void
  onExcluirSecao: (s: Secao) => void
  onExcluirPagina: (p: PaginaLeve) => void
}

const ehAuto = (s: Secao) => s.tipo === 'auto_erros' || s.tipo === 'auto_favoritos'
const itemMenu: React.CSSProperties = { minHeight: 44, display: 'flex', alignItems: 'center', gap: 8, padding: '0 10px', border: 0, borderRadius: 8, background: 'transparent', color: 'var(--ink)', fontSize: 14, fontWeight: 700, textAlign: 'left', cursor: 'pointer' }
const mini: React.CSSProperties = { width: 36, height: 36, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 9, border: 0, background: 'transparent', color: 'var(--muted)', cursor: 'pointer' }

export function ArvoreNotebook(p: Props) {
  const [fechadas, setFechadas] = useState<Record<string, boolean>>({})
  const [editando, setEditando] = useState<string | null>(null)
  const [menuNovo, setMenuNovo] = useState<string | null>(null)
  const raiz = useRef<HTMLDivElement>(null)

  const visiveis = () => Array.from(raiz.current?.querySelectorAll<HTMLElement>('[data-ti]') ?? [])
  const foco = (delta: number, atual: HTMLElement) => {
    const l = visiveis(); const i = l.indexOf(atual)
    l[Math.max(0, Math.min(l.length - 1, i + delta))]?.focus()
  }

  const teclaSecao = (e: React.KeyboardEvent<HTMLElement>, s: Secao) => {
    if (e.target !== e.currentTarget) return
    if (e.key === 'ArrowDown') { e.preventDefault(); foco(1, e.currentTarget) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); foco(-1, e.currentTarget) }
    else if (e.key === 'ArrowRight') { e.preventDefault(); setFechadas((f) => ({ ...f, [s.id]: false })) }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); setFechadas((f) => ({ ...f, [s.id]: true })) }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ehAuto(s) ? p.onSelecionarAuto(s) : setFechadas((f) => ({ ...f, [s.id]: !f[s.id] })) }
    else if (e.key === 'F2' && !ehAuto(s)) { e.preventDefault(); setEditando(s.id) }
  }
  const teclaPagina = (e: React.KeyboardEvent<HTMLElement>, pg: PaginaLeve) => {
    if (e.target !== e.currentTarget) return
    if (e.key === 'ArrowDown') { e.preventDefault(); foco(1, e.currentTarget) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); foco(-1, e.currentTarget) }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); const sec = raiz.current?.querySelector<HTMLElement>(`[data-sec="${pg.secao_id}"]`); sec?.focus() }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); p.onSelecionarPagina(pg.id) }
    else if (e.key === 'F2') { e.preventDefault(); p.onSelecionarPagina(pg.id); setTimeout(p.onFocarTitulo, 50) }
    else if (e.key === 'Delete') { e.preventDefault(); p.onExcluirPagina(pg) }
  }

  const porSecao = new Map<string, PaginaLeve[]>()
  for (const pg of p.paginas) { const l = porSecao.get(pg.secao_id); if (l) l.push(pg); else porSecao.set(pg.secao_id, [pg]) }

  return (
    <div ref={raiz} style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px 6px 12px' }}>
        <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--muted)' }}>Seções</span>
        <button type="button" aria-label="Nova seção" title="Nova seção" onClick={p.onCriarSecao} style={{ ...mini, color: 'var(--brand)' }}><FolderPlus size={18} aria-hidden /></button>
      </div>
      <div role="tree" aria-label="Seções e páginas" style={{ overflowY: 'auto', flex: 1, padding: '0 6px 12px' }}>
        {p.secoes.length === 0 ? <p style={{ padding: 12, fontSize: 13, color: 'var(--muted)' }}>Nenhuma seção ainda. Crie a primeira no botão acima.</p> : null}
        {p.secoes.map((s) => {
          const aberta = !fechadas[s.id]
          const auto = ehAuto(s)
          const pgs = porSecao.get(s.id) ?? []
          const selAuto = p.selecao?.tipo === 'auto' && p.selecao.secaoId === s.id
          return (
            <div key={s.id} role="none">
              <div role="treeitem" aria-level={1} aria-expanded={auto ? undefined : aberta} aria-selected={selAuto} data-ti data-sec={s.id} tabIndex={0}
                onKeyDown={(e) => teclaSecao(e, s)}
                style={{ display: 'flex', alignItems: 'center', gap: 2, minHeight: 44, borderRadius: 10, paddingLeft: 4, background: selAuto ? 'var(--chip)' : 'transparent' }}>
                {auto ? <span style={{ width: 28, display: 'inline-flex', justifyContent: 'center', color: 'var(--muted)' }}>{s.tipo === 'auto_erros' ? <XCircle size={16} aria-hidden /> : <Star size={16} aria-hidden />}</span> : (
                  <button type="button" tabIndex={-1} aria-label={aberta ? `Recolher ${s.nome}` : `Expandir ${s.nome}`} onClick={() => setFechadas((f) => ({ ...f, [s.id]: aberta }))} style={{ ...mini, width: 28 }}>
                    {aberta ? <ChevronDown size={16} aria-hidden /> : <ChevronRight size={16} aria-hidden />}
                  </button>
                )}
                <span aria-hidden style={{ width: 8, height: 8, borderRadius: 99, background: s.cor ? s.cor : 'var(--brand)', flexShrink: 0 }} />
                {editando === s.id ? (
                  <input autoFocus defaultValue={s.nome} aria-label="Nome da seção" maxLength={100}
                    onBlur={(e) => { const v = e.target.value.trim(); setEditando(null); if (v && v !== s.nome) p.onRenomearSecao(s.id, v) }}
                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { setEditando(null) } e.stopPropagation() }}
                    style={{ flex: 1, minWidth: 0, height: 36, margin: '0 6px', padding: '0 8px', borderRadius: 8, border: '1px solid var(--brand)', background: 'var(--surface)', color: 'var(--ink)', fontSize: 14 }} />
                ) : (
                  <button type="button" tabIndex={-1} onClick={() => (auto ? p.onSelecionarAuto(s) : setFechadas((f) => ({ ...f, [s.id]: aberta })))} onDoubleClick={() => { if (!auto) setEditando(s.id) }}
                    style={{ flex: 1, minWidth: 0, textAlign: 'left', border: 0, background: 'transparent', color: 'var(--ink)', fontSize: 14, fontWeight: 800, cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minHeight: 40 }}>
                    {s.nome}
                  </button>
                )}
                <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--muted)', padding: '0 4px' }}>{s.qtd_paginas}</span>
                {!auto ? (
                  <>
                    <button type="button" aria-label={`Nova página em ${s.nome}`} title="Nova página" aria-haspopup="menu" aria-expanded={menuNovo === s.id} onClick={() => { setFechadas((f) => ({ ...f, [s.id]: false })); setMenuNovo((m) => (m === s.id ? null : s.id)) }} style={{ ...mini, color: 'var(--brand)' }}><FilePlus2 size={17} aria-hidden /></button>
                    <button type="button" aria-label={`Renomear ${s.nome}`} title="Renomear (F2)" onClick={() => setEditando(s.id)} style={mini}><Pencil size={15} aria-hidden /></button>
                    <button type="button" aria-label={`Excluir ${s.nome}`} title="Excluir" onClick={() => p.onExcluirSecao(s)} style={mini}><Trash2 size={15} aria-hidden /></button>
                  </>
                ) : null}
              </div>
              {!auto && aberta ? (
                <div role="group">
                  {menuNovo === s.id ? (
                    <div role="menu" aria-label="Tipo de página" style={{ display: 'flex', flexDirection: 'column', gap: 2, margin: '2px 8px 6px 28px', padding: 4, border: '1px solid var(--line)', borderRadius: 12, background: 'var(--surface)' }}>
                      <button type="button" role="menuitem" onClick={() => { setMenuNovo(null); p.onCriarPagina(s.id, 'texto') }} style={itemMenu}><FileText size={16} aria-hidden />Página de texto</button>
                      <button type="button" role="menuitem" onClick={() => { setMenuNovo(null); p.onCriarPagina(s.id, 'folha_livre') }} style={itemMenu}><PenLine size={16} aria-hidden />Folha livre (caneta)</button>
                    </div>
                  ) : null}
                  {pgs.length === 0 ? <p style={{ padding: '4px 12px 8px 40px', fontSize: 12.5, color: 'var(--muted)' }}>Seção vazia.</p> : null}
                  {pgs.map((pg) => {
                    const on = p.selecao?.tipo === 'pagina' && p.selecao.id === pg.id
                    return (
                      <div key={pg.id} role="treeitem" aria-level={2} aria-selected={on} data-ti tabIndex={0} onKeyDown={(e) => teclaPagina(e, pg)}
                        style={{ display: 'flex', alignItems: 'center', gap: 2, minHeight: 44, marginLeft: 22, borderRadius: 10, background: on ? 'var(--chip)' : 'transparent' }}>
                        <button type="button" tabIndex={-1} onClick={() => p.onSelecionarPagina(pg.id)}
                          style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left', border: 0, background: 'transparent', color: on ? 'var(--brand)' : 'var(--ink)', fontSize: 14, fontWeight: on ? 800 : 600, cursor: 'pointer', minHeight: 44, padding: '0 8px' }}>
                          {pg.tipo_pagina === 'folha_livre' ? <PenLine size={15} aria-hidden aria-label="Folha livre" style={{ flexShrink: 0 }} /> : <FileText size={15} aria-hidden style={{ flexShrink: 0 }} />}
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pg.titulo || 'Sem título'}</span>
                        </button>
                        <button type="button" aria-label={`Excluir página ${pg.titulo || 'sem título'}`} title="Excluir" onClick={() => p.onExcluirPagina(pg)} style={mini}><Trash2 size={15} aria-hidden /></button>
                      </div>
                    )
                  })}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}
