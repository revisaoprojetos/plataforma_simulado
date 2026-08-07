'use client'

// Primitivas do canvas do editor (nó recursivo + slots + paginação de preview).
// Portadas do editor v2 SEM mudar comportamento — recebem tudo por `ctx`/props (render puro,
// desacoplado do store). Assim editor e impressão continuam usando o MESMO BlockRender/geometria.

import { Fragment, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ArrowUp, ArrowDown, Columns2, Plus, Minus, Copy, Trash2, Repeat, GitBranch, Wallpaper } from 'lucide-react'
import { cn } from '@/lib/utils'
import { BlockRender, cardStyle, dataComQuestao, larguraDaColuna, avaliarCondicao } from '@/lib/caderno-designer/blocks'
import type { CadernoTheme } from '@/lib/caderno-designer/theme'
import { SHEET_W, SHEET_H, PAD_H, type Block, type CadernoData } from '@/lib/caderno-designer/types'
import type { Pos, Alvo } from '../store/editor-store'

const REALCE = 'var(--primary)'

export type NodeCtx = {
  theme: CadernoTheme; data: CadernoData; selId: string | null; overId: string | null; overPos: Pos | null; arrastando: boolean
  select: (b: Block) => void; addInto: (id: string) => void
  mover: (id: string, dir: -1 | 1) => void; remover: (id: string) => void; duplicar: (id: string) => void
  aoLado: (id: string) => void; setCols: (id: string, n: number) => void
  setOver: (id: string | null, pos?: Pos) => void
  dragStart: (e: React.DragEvent, id: string) => void
  drop: (e: React.DragEvent, alvo: Alvo) => void
}

/** Camada de fundo full-bleed da página (com aviso de imagem 404). */
export function FundoPagina({ bloco, selecionado, corPrimaria, onSelect }: { bloco: Block; selecionado: boolean; corPrimaria: string; onSelect: () => void }) {
  const a = bloco.attributes as any
  const [erro, setErro] = useState(false)
  const temImagem = !!a.url && !erro
  const placeholder = !temImagem
  return (
    <div onClick={placeholder ? (e) => { e.stopPropagation(); onSelect() } : undefined}
      style={{ position: 'absolute', inset: 0, zIndex: placeholder ? 4 : 0, pointerEvents: placeholder ? 'auto' : 'none',
        cursor: placeholder ? 'pointer' : 'default', outline: selecionado ? `3px solid ${corPrimaria}` : 'none' }}>
      {a.url && (
        <img src={a.url} alt="" onError={() => setErro(true)} onLoad={() => setErro(false)}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: (a.opacidade ?? 100) / 100, display: erro ? 'none' : 'block' }} />
      )}
      {placeholder && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, textAlign: 'center', padding: 16,
          border: `2px dashed ${erro ? '#f59e0b' : selecionado ? corPrimaria : '#cbd5e1'}`, background: erro ? 'rgba(245,158,11,0.10)' : 'rgba(148,163,184,0.07)' }}>
          <Wallpaper className="h-9 w-9" style={{ color: erro ? '#f59e0b' : '#94a3b8' }} />
          <span style={{ fontSize: 17, fontWeight: 600, color: erro ? '#b45309' : '#94a3b8' }}>{erro ? 'Imagem de fundo não encontrada' : 'Imagem de fundo'}</span>
          <span style={{ fontSize: 13, color: erro ? '#b45309' : '#94a3b8' }}>{erro ? 'O arquivo não existe mais no servidor — clique aqui e reenvie (ou remova) no inspetor.' : 'Clique aqui e envie a imagem no inspetor (aba “Bloco”).'}</span>
        </div>
      )}
    </div>
  )
}

/** Chip “Fundo” — sempre clicável acima do conteúdo para selecionar a camada de fundo. */
export function ChipFundo({ selecionado, corPrimaria, onSelect }: { selecionado: boolean; corPrimaria: string; onSelect: () => void }) {
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); onSelect() }}
      style={{ position: 'absolute', top: 8, left: 8, zIndex: 20, display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '3px 8px', borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer', color: '#fff',
        background: selecionado ? corPrimaria : 'rgba(15,23,42,0.72)', border: '1px solid rgba(255,255,255,.25)', backdropFilter: 'blur(2px)' }}
      title="Selecionar a imagem de fundo (trocar/remover)">
      <Wallpaper style={{ width: 13, height: 13 }} /> Fundo
    </button>
  )
}

/** Animação de layout (FLIP) dos blocos no preview. */
function useFlip(ativo: boolean) {
  const ref = useRef<HTMLDivElement>(null)
  const pos = useRef(new Map<string, DOMRect>())
  const ordem = useRef('')
  const montado = useRef(false)
  useLayoutEffect(() => {
    const el = ref.current; if (!el || !ativo) return
    const filhos = Array.from(el.children) as HTMLElement[]
    const assinatura = filhos.map((c) => c.dataset.flipKey ?? '').filter(Boolean).join('|')
    const anima = montado.current && assinatura !== ordem.current
    const novo = new Map<string, DOMRect>()
    for (const c of filhos) {
      const key = c.dataset.flipKey; if (!key) continue
      const r = c.getBoundingClientRect(); novo.set(key, r)
      if (!anima) continue
      const old = pos.current.get(key)
      if (old) {
        const dx = old.left - r.left, dy = old.top - r.top
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
          c.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0,0)' }], { duration: 240, easing: 'cubic-bezier(0.22,1,0.36,1)' })
        }
      } else {
        c.animate([{ opacity: 0, transform: 'translateY(-4px) scale(0.98)' }, { opacity: 1, transform: 'none' }], { duration: 200, easing: 'ease-out' })
      }
    }
    pos.current = novo
    ordem.current = assinatura
    montado.current = true
  })
  return ref
}

export function AutoAnim({ ativo, className, style, children }: { ativo: boolean; className?: string; style?: React.CSSProperties; children: React.ReactNode }) {
  const ref = useFlip(ativo)
  return <div ref={ref} className={className} style={style}>{children}</div>
}

function DropZoneVazia({ onClick }: { onClick: () => void }) {
  return (
    <div onClick={(e) => { e.stopPropagation(); onClick() }}
      className="flex items-center justify-center rounded-md border-2 border-dashed border-slate-300 py-5 text-xs text-slate-400 transition-colors">
      solte um bloco aqui dentro
    </div>
  )
}

function NodeToolbar({ block, ctx }: { block: Block; ctx: NodeCtx }) {
  const isColunas = block.type === 'colunas'
  const sel = ctx.selId === block.id
  return (
    <div className={cn('absolute -right-1 -top-2.5 z-10 gap-0.5 rounded-md bg-primary px-1 py-0.5 shadow', sel ? 'flex' : 'hidden group-hover/b:flex')} onClick={(e) => e.stopPropagation()}>
      <button title="Subir" onClick={() => ctx.mover(block.id, -1)} className="text-primary-foreground/90 hover:text-white"><ArrowUp className="h-3.5 w-3.5" /></button>
      <button title="Descer" onClick={() => ctx.mover(block.id, 1)} className="text-primary-foreground/90 hover:text-white"><ArrowDown className="h-3.5 w-3.5" /></button>
      {block.type !== 'colunas' && block.type !== 'coluna' && (
        <button title="Adicionar ao lado" onClick={() => ctx.aoLado(block.id)} className="text-primary-foreground/90 hover:text-white"><Columns2 className="h-3.5 w-3.5" /></button>
      )}
      {isColunas && <button title="+ coluna" onClick={() => ctx.setCols(block.id, (block.innerBlocks?.length ?? 0) + 1)} className="text-primary-foreground/90 hover:text-white"><Plus className="h-3.5 w-3.5" /></button>}
      {isColunas && <button title="− coluna" onClick={() => ctx.setCols(block.id, (block.innerBlocks?.length ?? 1) - 1)} className="text-primary-foreground/90 hover:text-white"><Minus className="h-3.5 w-3.5" /></button>}
      <button title="Duplicar" onClick={() => ctx.duplicar(block.id)} className="text-primary-foreground/90 hover:text-white"><Copy className="h-3.5 w-3.5" /></button>
      <button title="Excluir" onClick={() => ctx.remover(block.id)} className="text-primary-foreground/90 hover:text-white"><Trash2 className="h-3.5 w-3.5" /></button>
    </div>
  )
}

function InsertSlot({ ctx, blockId, pos, active }: { ctx: NodeCtx; blockId: string; pos: 'top' | 'bottom'; active: boolean }) {
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); ctx.setOver(blockId, pos) }}
      onDrop={(e) => ctx.drop(e, pos === 'top' ? { kind: 'before', blockId } : { kind: 'after', blockId })}
      className={cn('flex shrink-0 items-center justify-center overflow-hidden whitespace-nowrap rounded-md border-dashed text-[10px] font-medium text-primary transition-all duration-200 ease-out',
        active ? 'my-0.5 h-9 border-2 border-primary bg-primary/10 opacity-100' : 'h-0 border-0 opacity-0')}>
      soltar aqui
    </div>
  )
}

export function ListaBlocos({ blocks, ctx, emColuna }: { blocks: Block[]; ctx: NodeCtx; emColuna?: boolean }) {
  return (
    <>
      {blocks.map((block) => (
        <Fragment key={block.id}>
          <InsertSlot ctx={ctx} blockId={block.id} pos="top" active={ctx.overId === block.id && ctx.overPos === 'top'} />
          <EditorNode block={block} ctx={ctx} emColuna={emColuna} />
          <InsertSlot ctx={ctx} blockId={block.id} pos="bottom" active={ctx.overId === block.id && ctx.overPos === 'bottom'} />
        </Fragment>
      ))}
    </>
  )
}

/** Pagina o conteúdo de UMA página do editor em folhas A4 (mede alturas e distribui). */
export function FolhasPaginadas({ blocks, theme, data, cabH, rodH, renderSheet }: {
  blocks: Block[]; theme: any; data: any; cabH: number; rodH: number
  renderSheet: (grupo: Block[], sheetIndex: number, total: number) => React.ReactNode
}) {
  const [grupos, setGrupos] = useState<Block[][] | null>(null)
  const medRef = useRef<HTMLDivElement>(null)
  const dataMed = useMemo(() => { const qs = data?.questoes ?? []; const q = qs[data?.previewIndex ?? 0] ?? qs[0]; return { ...data, previewIndex: 0, questoes: q ? [q] : [] } }, [data])
  const chave = useMemo(() => JSON.stringify(blocks.map((b) => [b.id, b.type, b.attributes, b.innerBlocks])), [blocks])
  const chaveVars = useMemo(() => JSON.stringify(data?.vars ?? {}), [data])
  useLayoutEffect(() => {
    const cont = medRef.current
    if (!cont) return
    const filhos = Array.from(cont.children) as HTMLElement[]
    const alturas = filhos.map((f) => f.getBoundingClientRect().height)
    const safe = SHEET_H - cabH - rodH - 4
    const gi: number[][] = []
    let atual: number[] = []
    let h = 0
    for (let i = 0; i < alturas.length; i++) {
      const alt = alturas[i]
      if (atual.length && h + alt > safe) { gi.push(atual); atual = []; h = 0 }
      atual.push(i); h += alt
    }
    if (atual.length) gi.push(atual)
    setGrupos(gi.length ? gi.map((g) => g.map((i) => blocks[i])) : [[]])
  }, [chave, chaveVars, cabH, rodH, data?.previewIndex]) // eslint-disable-line react-hooks/exhaustive-deps
  const paginas = grupos ?? (blocks.length ? [blocks] : [[]])
  return (
    <>
      <div ref={medRef} aria-hidden className="pointer-events-none" style={{ position: 'absolute', left: -99999, top: 0, width: SHEET_W - 2 * PAD_H, display: 'flex', flexDirection: 'column' }}>
        {blocks.map((b) => <div key={b.id}><BlockRender block={b} theme={theme} data={dataMed} editor /></div>)}
      </div>
      {paginas.map((grupo, si) => <Fragment key={si}>{renderSheet(grupo, si, paginas.length)}</Fragment>)}
    </>
  )
}

export function EditorNode({ block, ctx, emColuna, divStyle }: { block: Block; ctx: NodeCtx; emColuna?: boolean; divStyle?: React.CSSProperties }) {
  const a = block.attributes as any
  const selected = ctx.selId === block.id
  const over = ctx.overId === block.id

  if (block.type === 'coluna') {
    const filhos = block.innerBlocks ?? []
    const vazia = filhos.length === 0
    const colLarg = larguraDaColuna(block)
    return (
      <div data-flip-key={block.id} onClick={(e) => { e.stopPropagation(); ctx.select(block) }}
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); ctx.setOver(block.id) }}
        onDrop={(e) => ctx.drop(e, { kind: 'into', containerId: block.id })}
        style={{ flex: colLarg ? `0 0 ${colLarg}%` : '1 1 0%', ...divStyle, ...(over ? { outline: `2px solid ${REALCE}`, outlineOffset: -2, borderRadius: 6 } : {}) }}
        className={cn('min-w-0 rounded transition-colors', over && 'bg-primary/10')}>
        {vazia ? <DropZoneVazia onClick={() => ctx.addInto(block.id)} /> : <AutoAnim ativo={!ctx.arrastando} className="flex flex-col"><ListaBlocos blocks={filhos} ctx={ctx} emColuna /></AutoAnim>}
      </div>
    )
  }

  const isCard = block.type === 'card'
  const ehContainer = block.type === 'card' || block.type === 'repeticao' || block.type === 'condicao'
  const guiaLado = over && (ctx.overPos === 'left' || ctx.overPos === 'right') ? ctx.overPos : null
  const overIn = over && ctx.overPos === 'in'
  const posDe = (e: React.DragEvent): Pos => {
    const r = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - r.left, y = e.clientY - r.top
    const margem = Math.min(r.width * 0.2, 90)
    if (x < margem) return 'left'
    if (x > r.width - margem) return 'right'
    if (ehContainer) return y < r.height * 0.3 ? 'top' : y > r.height * 0.7 ? 'bottom' : 'in'
    return y < r.height / 2 ? 'top' : 'bottom'
  }

  let inner: React.ReactNode
  if (block.type === 'card') {
    const al = a.alinhamento ?? 'center'
    const filhos = block.innerBlocks ?? []
    const cardA = emColuna ? { ...a, largura: 100 } : a
    inner = (
      <div style={{ display: 'flex', justifyContent: al === 'left' ? 'flex-start' : al === 'right' ? 'flex-end' : 'center' }}>
        <div style={cardStyle(cardA, ctx.theme)}>
          {filhos.length > 0 ? (
            <AutoAnim ativo={!ctx.arrastando} className="flex flex-col"><ListaBlocos blocks={filhos} ctx={ctx} /></AutoAnim>
          ) : <DropZoneVazia onClick={() => ctx.addInto(block.id)} />}
        </div>
      </div>
    )
  } else if (block.type === 'colunas') {
    const estilosDiv = { solido: 'solid', tracejado: 'dashed', pontilhado: 'dotted' } as Record<string, string>
    const temDiv = !!a.divisoria
    const bordaDiv = temDiv ? `${a.divisoriaEspessura ?? 1}px ${estilosDiv[a.divisoriaEstilo] ?? 'solid'} ${a.divisoriaCor || '#cbd5e1'}` : ''
    inner = (
      <AutoAnim ativo={!ctx.arrastando} style={{ display: 'flex', gap: a.gap ?? 16, alignItems: temDiv ? 'stretch' : 'flex-start' }}>
        {(block.innerBlocks ?? []).map((col, i) => (
          <EditorNode key={col.id} block={col} ctx={ctx} divStyle={(temDiv && i > 0) ? { borderLeft: bordaDiv, paddingLeft: (a.gap ?? 16) / 2 } : undefined} />
        ))}
      </AutoAnim>
    )
  } else if (block.type === 'repeticao') {
    const filhos = block.innerBlocks ?? []
    const qPrev = ctx.data.questoes[ctx.data.previewIndex ?? 0] ?? ctx.data.questoes[0]
    const ctxQ: NodeCtx = qPrev ? { ...ctx, data: dataComQuestao(ctx.data, qPrev) } : ctx
    const n = ctx.data.questoes.length || ctx.data.numQuestoes
    inner = (
      <div style={{ border: `1.5px dashed ${ctx.theme.cores.secundaria}`, borderRadius: 8, padding: 8, background: 'color-mix(in oklab, var(--primary) 4%, transparent)' }}>
        <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: ctx.theme.cores.secundaria }}>
          <Repeat className="h-3.5 w-3.5" /> Repete por questão — {n} no banco {qPrev ? <span className="rounded bg-primary/10 px-1.5 py-0.5 font-medium text-primary">preview: questão {(ctx.data.previewIndex ?? 0) + 1}</span> : null}
        </div>
        {filhos.length > 0
          ? <AutoAnim ativo={!ctx.arrastando} className="flex flex-col"><ListaBlocos blocks={filhos} ctx={ctxQ} /></AutoAnim>
          : <DropZoneVazia onClick={() => ctx.addInto(block.id)} />}
      </div>
    )
  } else if (block.type === 'condicao') {
    const filhos = block.innerBlocks ?? []
    const opLbl: Record<string, string> = { entre: 'entre', '>=': '≥', '<=': '≤', '>': '>', '<': '<', igual: '=', diferente: '≠', contem: 'contém' }
    const cond = `{${a.variavel || '—'}} ${opLbl[a.operador] ?? a.operador} ${a.valor ?? ''}${a.operador === 'entre' ? `–${a.valor2 ?? ''}` : ''}`
    const bate = avaliarCondicao(a, ctx.data.vars)
    inner = (
      <div style={{ border: `1.5px dashed ${ctx.theme.cores.secundaria}`, borderRadius: 8, padding: 8, background: 'color-mix(in oklab, var(--primary) 4%, transparent)', opacity: bate ? 1 : 0.55 }}>
        <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold" style={{ color: ctx.theme.cores.secundaria }}>
          <GitBranch className="h-3.5 w-3.5" /> SE {cond} <span className={cn('rounded px-1 text-[10px]', bate ? 'bg-emerald-500/15 text-emerald-600' : 'bg-muted text-muted-foreground')}>{bate ? 'aparece agora' : 'oculto no preview'}</span>
        </div>
        {filhos.length > 0
          ? <AutoAnim ativo={!ctx.arrastando} className="flex flex-col"><ListaBlocos blocks={filhos} ctx={ctx} /></AutoAnim>
          : <DropZoneVazia onClick={() => ctx.addInto(block.id)} />}
      </div>
    )
  } else {
    inner = <BlockRender block={block} theme={ctx.theme} data={ctx.data} full={emColuna} editor />
  }

  return (
    <div data-flip-key={block.id} draggable onClick={(e) => { e.stopPropagation(); ctx.select(block) }}
      onDragStart={(e) => ctx.dragStart(e, block.id)}
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); ctx.setOver(block.id, posDe(e)) }}
      onDrop={(e) => {
        const pos = posDe(e)
        if (pos === 'in') ctx.drop(e, { kind: 'into', containerId: block.id })
        else if (pos === 'left' || pos === 'right') ctx.drop(e, { kind: 'lado', blockId: block.id, lado: pos })
        else ctx.drop(e, pos === 'top' ? { kind: 'before', blockId: block.id } : { kind: 'after', blockId: block.id })
      }}
      style={ehContainer && overIn ? { outline: `2px solid ${REALCE}`, outlineOffset: -1, borderRadius: 8 } : undefined}
      className={cn('group/b relative cursor-grab rounded active:cursor-grabbing',
        ehContainer && overIn ? 'bg-primary/5' : isCard && ctx.arrastando ? 'outline outline-1 outline-dashed outline-primary/40' : selected ? 'outline outline-2 outline-primary' : 'hover:outline hover:outline-1 hover:outline-primary/40')}>
      <div className="flex items-stretch">
        <div className={cn('overflow-hidden transition-all duration-200 ease-out', guiaLado === 'left' ? 'mr-2 w-[44%]' : 'w-0')}>
          {guiaLado === 'left' && <div className="flex h-full min-h-[44px] items-center justify-center whitespace-nowrap rounded-md border-2 border-dashed border-primary bg-primary/10 text-[10px] font-medium text-primary">soltar aqui</div>}
        </div>
        <div className="min-w-0 flex-1">{inner}</div>
        <div className={cn('overflow-hidden transition-all duration-200 ease-out', guiaLado === 'right' ? 'ml-2 w-[44%]' : 'w-0')}>
          {guiaLado === 'right' && <div className="flex h-full min-h-[44px] items-center justify-center whitespace-nowrap rounded-md border-2 border-dashed border-primary bg-primary/10 text-[10px] font-medium text-primary">soltar aqui</div>}
        </div>
      </div>
      <NodeToolbar block={block} ctx={ctx} />
    </div>
  )
}
