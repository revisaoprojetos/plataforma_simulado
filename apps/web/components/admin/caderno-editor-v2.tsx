'use client'

import { Fragment, useLayoutEffect, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Loader2, Save, Printer, Plus, Trash2, ArrowUp, ArrowDown, FileText, Palette, LayoutTemplate, ChevronLeft, ChevronRight, Columns2, PanelTop, PanelBottom, Minus, Wallpaper, Database, Users, Repeat, Copy, GripVertical, Undo2, Redo2, FileUp } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { BLOCKS, blocksByCategory, createBlock, getBlockMeta, BlockRender, cardStyle, dataComQuestao, larguraDaColuna, avaliarCondicao } from '@/lib/caderno-designer/blocks'
import { BlockInspector } from '@/lib/caderno-designer/inspectors'
import { resolveTheme, type CadernoTheme } from '@/lib/caderno-designer/theme'
import * as tree from '@/lib/caderno-designer/block-tree'
import { SHEET_W, SHEET_H, PAD_H, PAD_V, PAGE_KINDS, RUNNING_PADRAO, HUD_CORES_PADRAO, novoDoc, docCadernoCompleto, docCadernoPerguntas, genId, mesclarModalidades, faixaNaPagina, type CadernoDoc, type Modalidade, type Block, type PageKind, type CadernoData, type HudCores, type HudPorPagina, type FaixaPaginas } from '@/lib/caderno-designer/types'
import { HudSimuladoEditor } from '@/components/admin/hud-simulado-editor'
import { HexColorField } from '@/components/admin/hex-color-field'
import { GerarPdfServidor } from '@/components/admin/gerar-pdf-servidor'
import { MonitorPlay, GitBranch } from 'lucide-react'
import { salvarCadernoDesignerV2, hospedarImagemCadernoAction, getGruposBanco, getAssuntosBanco, converterWordAction } from '@/app/admin/cadernos/actions'
import { PRESETS_CADERNO, type CadernoPreset } from '@/lib/caderno-designer/presets'
import { OCULTAR_DISCURSIVA } from '@/lib/flags'
import { confirmar, pedirTexto } from '@/components/ui/confirm-dialog'

/** Camada de fundo full-bleed da página. Detecta imagem quebrada (404) e mostra
 * um aviso claro para reenviar. Como a coluna de conteúdo cobre a folha inteira,
 * a camada só captura clique no estado placeholder (sem imagem/erro); com imagem
 * válida ela fica não-interativa e a seleção acontece pelo chip “Fundo” do canto. */
function FundoPagina({ bloco, selecionado, corPrimaria, onSelect }: { bloco: Block; selecionado: boolean; corPrimaria: string; onSelect: () => void }) {
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

/** Chip “Fundo” — fica acima do conteúdo (z alto) para sempre permitir selecionar
 * a camada de fundo e trocar/remover a imagem no inspetor. */
function ChipFundo({ selecionado, corPrimaria, onSelect }: { selecionado: boolean; corPrimaria: string; onSelect: () => void }) {
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

const CAT_NOMES: Record<string, string> = { conteudo: 'Conteúdo', avaliacao: 'Avaliação', identificacao: 'Identificação', estrutura: 'Estrutura' }
const ZOOM = 0.76
type Regiao = 'pagina' | 'cabecalho' | 'rodape'
type Pos = 'top' | 'bottom' | 'in' | 'left' | 'right'
type Alvo = { kind: 'page'; pageId: string } | { kind: 'after'; blockId: string } | { kind: 'before'; blockId: string } | { kind: 'into'; containerId: string } | { kind: 'lado'; blockId: string; lado: 'left' | 'right' } | { kind: 'regiao'; regiao: 'cabecalho' | 'rodape' }

// ----------------- Nó recursivo do editor (suporta aninhamento) -----------------
const REALCE = 'var(--primary)' // segue a cor primária configurada do sistema

// Animação de layout (FLIP): anima qualquer mudança dos blocos no preview —
// remover, mover, reordenar, colapso de colunas. Os filhos com data-flip-key
// deslizam da posição antiga para a nova; novos surgem com fade. Desligado
// durante o arrasto (os slots já têm a própria animação).
function useFlip(ativo: boolean) {
  const ref = useRef<HTMLDivElement>(null)
  const pos = useRef(new Map<string, DOMRect>())
  const ordem = useRef('')
  const montado = useRef(false)
  useLayoutEffect(() => {
    const el = ref.current; if (!el || !ativo) return // durante o arrasto os slots já animam
    const filhos = Array.from(el.children) as HTMLElement[]
    const assinatura = filhos.map((c) => c.dataset.flipKey ?? '').filter(Boolean).join('|')
    // Só anima quando o CONJUNTO/ORDEM de blocos muda (adicionar/remover/reordenar).
    // Em mudança de tamanho (ex.: arrastar a altura do espaçador) apenas registra as
    // posições — evita o "piscar" do FLIP re-disparando a cada passo do slider.
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

function AutoAnim({ ativo, className, style, children }: { ativo: boolean; className?: string; style?: React.CSSProperties; children: React.ReactNode }) {
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

type NodeCtx = {
  theme: CadernoTheme; data: CadernoData; selId: string | null; overId: string | null; overPos: Pos | null; arrastando: boolean
  select: (b: Block) => void; addInto: (id: string) => void
  mover: (id: string, dir: -1 | 1) => void; remover: (id: string) => void; duplicar: (id: string) => void
  aoLado: (id: string) => void; setCols: (id: string, n: number) => void
  setOver: (id: string | null, pos?: Pos) => void
  dragStart: (e: React.DragEvent, id: string) => void
  drop: (e: React.DragEvent, alvo: Alvo) => void
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

// Slot de inserção independente (in-flow): sempre montado e anima a altura — quando
// ativo abre o espaço (o bloco desce) e ao sair volta ao lugar. Ele mesmo é a zona
// de drop e "segura" o cursor, então não pisca.
function InsertSlot({ ctx, blockId, pos, active }: { ctx: NodeCtx; blockId: string; pos: 'top' | 'bottom'; active: boolean }) {
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); ctx.setOver(blockId, pos) }}
      onDrop={(e) => ctx.drop(e, pos === 'top' ? { kind: 'before', blockId } : { kind: 'after', blockId })}
      className={cn('flex shrink-0 items-center justify-center overflow-hidden whitespace-nowrap rounded-md border-dashed text-[10px] font-medium text-primary transition-all duration-200 ease-out',
        // Inativo = altura ZERO: no editor os blocos ficam colados (gap 0), idêntico ao PDF.
        // Só ocupa espaço quando ativo (durante o arraste), abrindo a zona de "soltar aqui".
        active ? 'my-0.5 h-9 border-2 border-primary bg-primary/10 opacity-100' : 'h-0 border-0 opacity-0')}>
      soltar aqui
    </div>
  )
}

// Lista de blocos com slots (top/bottom) sempre presentes, animando na posição do cursor.
function ListaBlocos({ blocks, ctx, emColuna }: { blocks: Block[]; ctx: NodeCtx; emColuna?: boolean }) {
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

/**
 * Pagina o conteúdo de UMA página do editor em folhas A4 de verdade (estilo Word):
 * mede a altura real de cada bloco (num passe escondido, com a MESMA largura útil da folha)
 * e distribui em grupos que cabem na área segura (SHEET_H − cabeçalho − rodapé). Cada grupo
 * é uma folha nova — o bloco que não cabe vai INTEIRO para a próxima (nunca é cortado).
 * `renderSheet` desenha cada folha (com cabeçalho/rodapé/fundo e os blocos interativos).
 */
function FolhasPaginadas({ blocks, theme, data, cabH, rodH, renderSheet }: {
  blocks: Block[]; theme: any; data: any; cabH: number; rodH: number
  renderSheet: (grupo: Block[], sheetIndex: number, total: number) => React.ReactNode
}) {
  const [grupos, setGrupos] = useState<Block[][] | null>(null)
  const medRef = useRef<HTMLDivElement>(null)
  // Repetição aparece compacta no editor (template com a questão em preview) — mede igual.
  const dataMed = useMemo(() => { const qs = data?.questoes ?? []; const q = qs[data?.previewIndex ?? 0] ?? qs[0]; return { ...data, previewIndex: 0, questoes: q ? [q] : [] } }, [data])
  const chave = useMemo(() => JSON.stringify(blocks.map((b) => [b.id, b.type, b.attributes, b.innerBlocks])), [blocks])
  // Assinatura das variáveis (troca de aluno muda o conteúdo e a altura dos blocos). String →
  // comparação por valor: só re-mede quando o VALOR muda, mesmo que `data` mude de identidade.
  const chaveVars = useMemo(() => JSON.stringify(data?.vars ?? {}), [data])
  useLayoutEffect(() => {
    const cont = medRef.current
    if (!cont) return
    const filhos = Array.from(cont.children) as HTMLElement[]
    const alturas = filhos.map((f) => f.getBoundingClientRect().height)
    const safe = SHEET_H - cabH - rodH - 4 // folga anti-arredondamento
    const gi: number[][] = []
    let atual: number[] = []
    let h = 0
    for (let i = 0; i < alturas.length; i++) {
      const alt = alturas[i]
      if (atual.length && h + alt > safe) { gi.push(atual); atual = []; h = 0 } // não cabe → próxima folha
      atual.push(i); h += alt
    }
    if (atual.length) gi.push(atual)
    setGrupos(gi.length ? gi.map((g) => g.map((i) => blocks[i])) : [[]])
  }, [chave, chaveVars, cabH, rodH, data?.previewIndex])
  const paginas = grupos ?? (blocks.length ? [blocks] : [[]])
  return (
    <>
      {/* Passe de medição (escondido, não interativo) — mesma largura útil da folha. */}
      <div ref={medRef} aria-hidden className="pointer-events-none" style={{ position: 'absolute', left: -99999, top: 0, width: SHEET_W - 2 * PAD_H, display: 'flex', flexDirection: 'column' }}>
        {blocks.map((b) => <div key={b.id}><BlockRender block={b} theme={theme} data={dataMed} editor /></div>)}
      </div>
      {paginas.map((grupo, si) => <Fragment key={si}>{renderSheet(grupo, si, paginas.length)}</Fragment>)}
    </>
  )
}

function EditorNode({ block, ctx, emColuna, divStyle }: { block: Block; ctx: NodeCtx; emColuna?: boolean; divStyle?: React.CSSProperties }) {
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
  const ehContainer = block.type === 'card' || block.type === 'repeticao' || block.type === 'condicao' // detecta meio (dentro)
  const guiaLado = over && (ctx.overPos === 'left' || ctx.overPos === 'right') ? ctx.overPos : null
  const overIn = over && ctx.overPos === 'in'
  // posição do cursor: laterais (esquerda/direita) → ao lado; senão topo/base; containers têm meio (dentro)
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
    const cardA = emColuna ? { ...a, largura: 100 } : a // em coluna, o card preenche (a coluna já define a largura)
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
    // preview do template com a 1ª questão do banco (no print repete por todas)
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
      {/* conteúdo + espaço lateral que encolhe/expande com animação.
          A zona lateral só renderiza conteúdo (e min-h) quando ativa — senão, com items-stretch,
          o min-h-[44px] empurraria a altura de TODO bloco para ≥44px (só no editor), criando falso espaçamento. */}
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

// ----------------- Editor -----------------
export function CadernoEditorV2({
  cadernoId, nome, inicial, previewData, bancos = [], bancoIdInicial = null, registros = [], branding = null, pastaId = null,
}: {
  cadernoId: string
  nome: string
  inicial: { docsV2?: Record<string, CadernoDoc>; modalidadesV2?: Modalidade[]; cores?: Record<string, string>; hudCores?: Partial<HudCores>; hudPorPagina?: HudPorPagina }
  previewData: CadernoData
  bancos?: { id: string; nome: string }[]
  bancoIdInicial?: string | null
  registros?: { id: string; nome: string; vars: Record<string, string>; respostas?: Record<string, string> }[]
  branding?: { nome?: string; logoUrl?: string | null; logoGrandeUrl?: string | null; logoBg?: string; logoEstilo?: string } | null
  /** Pasta (folder) organizadora do caderno — o "voltar" retorna a ela. */
  pastaId?: string | null
}) {
  const ehDiscursiva = (m: Modalidade) => /discursiv|reda[çc][ãa]o/i.test(`${m.id} ${m.nome}`)
  const mods0 = mesclarModalidades(inicial.modalidadesV2)
  const mods0Vis = OCULTAR_DISCURSIVA ? mods0.filter((m) => !ehDiscursiva(m)) : mods0
  const [modalidades, setModalidades] = useState<Modalidade[]>(mods0)
  const [importando, setImportando] = useState(false)
  const fileWordRef = useRef<HTMLInputElement>(null)
  const modalidadesVisiveis = OCULTAR_DISCURSIVA ? modalidades.filter((m) => !ehDiscursiva(m)) : modalidades
  const [docs, setDocs] = useState<Record<string, CadernoDoc>>(() => {
    const d = { ...(inicial.docsV2 ?? {}) }
    for (const m of mods0) {
      if (!d[m.id]) d[m.id] = m.id === 'caderno_completo' ? docCadernoCompleto() : m.id === 'caderno_perguntas' ? docCadernoPerguntas() : novoDoc()
      else d[m.id] = { ...novoDoc(), ...d[m.id], cabecalho: d[m.id].cabecalho ?? [], rodape: d[m.id].rodape ?? [], running: d[m.id].running ?? { ...RUNNING_PADRAO } }
    }
    return d
  })
  const [cores, setCores] = useState<Record<string, string>>(inicial.cores ?? {})
  const [hudCores, setHudCores] = useState<HudCores>({ ...HUD_CORES_PADRAO, ...(inicial.hudCores ?? {}) })
  const [hudPorPagina, setHudPorPagina] = useState<HudPorPagina>(inicial.hudPorPagina ?? {})
  const [hudMode, setHudMode] = useState(false)
  const [bancoId, setBancoId] = useState<string | null>(bancoIdInicial)
  // Grupos de disciplinas definidos no banco (para o bloco Cabeçalho de Grupo).
  const [gruposBanco, setGruposBanco] = useState<{ id: string; nome: string; disciplinas: string[] }[]>([])
  useEffect(() => { let vivo = true; if (bancoId) getGruposBanco(bancoId).then((r) => { if (vivo && r.ok) setGruposBanco(r.grupos ?? []) }); else setGruposBanco([]); return () => { vivo = false } }, [bancoId])
  const [assuntosBanco, setAssuntosBanco] = useState<Record<string, string[]>>({})
  useEffect(() => { let vivo = true; if (bancoId) getAssuntosBanco(bancoId).then((r) => { if (vivo && r.ok) setAssuntosBanco(r.porDisciplina ?? {}) }); else setAssuntosBanco({}); return () => { vivo = false } }, [bancoId])

  const [regIndex, setRegIndex] = useState(0)
  const [previewQ, setPreviewQ] = useState(0) // índice da questão exibida no preview do repetidor
  const [modAtiva, setModAtiva] = useState<string>((mods0Vis[0] ?? mods0[0]).id)
  const [selPage, setSelPage] = useState<string | null>(null)
  const [pageDrag, setPageDrag] = useState<number | null>(null)
  const [pageOver, setPageOver] = useState<number | null>(null)
  const [selBlock, setSelBlock] = useState<string | null>(null)
  const [regiao, setRegiao] = useState<Regiao>('pagina')
  const [overId, setOverId] = useState<string | null>(null)
  const [overPos, setOverPos] = useState<Pos | null>(null)
  const [arrastando, setArrastando] = useState(false)
  const [aba, setAba] = useState<'bloco' | 'tema' | 'pagina' | 'layout'>('bloco')
  const setOver = (id: string | null, pos: Pos = 'in') => { setOverId(id); setOverPos(id ? pos : null) }
  const [pending, start] = useTransition()

  const theme = useMemo(() => resolveTheme(cores), [cores])
  // Variáveis dinâmicas deste simulado (disciplinas + pilares) para o painel de variáveis.
  const varsExtra = useMemo(() => {
    const vars = (registros[0]?.vars ?? previewData.vars ?? {}) as Record<string, string>
    const keys = Object.keys(vars)
    const human = (s: string) => s.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())
    const discSlugs = [...new Set(keys.filter((k) => k.startsWith('pct_') && !k.startsWith('pct_pilar_')).map((k) => k.slice(4)))].sort()
    const pilarSlugs = [...new Set(keys.filter((k) => k.startsWith('pct_pilar_')).map((k) => k.slice('pct_pilar_'.length)))].sort()
    const grupos: { grupo: string; itens: { token: string; label: string }[] }[] = []
    if (pilarSlugs.length) grupos.push({ grupo: 'Pilares (deste simulado)', itens: pilarSlugs.flatMap((s) => [
      { token: `{pct_pilar_${s}}`, label: `${human(s)} · %` }, { token: `{acerto_pilar_${s}}`, label: `${human(s)} · acertos` }, { token: `{total_pilar_${s}}`, label: `${human(s)} · total` },
    ]) })
    if (discSlugs.length) grupos.push({ grupo: 'Disciplinas (deste simulado)', itens: discSlugs.flatMap((s) => [
      { token: `{pct_${s}}`, label: `${human(s)} · %` }, { token: `{acerto_${s}}`, label: `${human(s)} · acertos` }, { token: `{total_${s}}`, label: `${human(s)} · total` },
    ]) })
    return grupos
  }, [registros, previewData])
  const regAtual = registros[regIndex] ?? null
  const totalQPreview = previewData.questoes.length
  const qIdx = totalQPreview ? Math.min(previewQ, totalQPreview - 1) : 0
  const dataAtual = useMemo(() => ({ ...(regAtual ? { ...previewData, vars: { ...previewData.vars, ...regAtual.vars }, respostas: regAtual.respostas } : previewData), previewIndex: qIdx }), [regAtual, previewData, qIdx])
  const doc = docs[modAtiva] ?? novoDoc()
  const cats = blocksByCategory()
  const running = doc.running ?? RUNNING_PADRAO

  // ── Histórico (desfazer/refazer) do documento da modalidade ativa ──────────────
  const [undoStack, setUndoStack] = useState<CadernoDoc[]>([])
  const [redoStack, setRedoStack] = useState<CadernoDoc[]>([])
  const docsRef = useRef(docs); useEffect(() => { docsRef.current = docs }, [docs])
  const ultimaMudanca = useRef(0)
  // Ao trocar de modalidade, o histórico não vale mais (docs diferentes).
  useEffect(() => { setUndoStack([]); setRedoStack([]) }, [modAtiva])

  function setDoc(updater: (d: CadernoDoc) => CadernoDoc) {
    const atual = docsRef.current[modAtiva] ?? novoDoc()
    const novo = updater(atual)
    if (novo === atual) return
    // Coalesce mudanças rápidas (digitação) num único passo de desfazer.
    const agora = Date.now()
    if (agora - ultimaMudanca.current > 350) { setUndoStack((s) => [...s.slice(-59), atual]); setRedoStack([]) }
    ultimaMudanca.current = agora
    docsRef.current = { ...docsRef.current, [modAtiva]: novo }
    setDocs((prev) => ({ ...prev, [modAtiva]: novo }))
  }

  function desfazer() {
    setUndoStack((s) => {
      if (!s.length) return s
      const anterior = s[s.length - 1]
      const cur = docsRef.current[modAtiva] ?? novoDoc()
      setRedoStack((r) => [...r, cur])
      docsRef.current = { ...docsRef.current, [modAtiva]: anterior }
      setDocs((d) => ({ ...d, [modAtiva]: anterior }))
      ultimaMudanca.current = 0
      return s.slice(0, -1)
    })
  }
  function refazer() {
    setRedoStack((r) => {
      if (!r.length) return r
      const proximo = r[r.length - 1]
      const cur = docsRef.current[modAtiva] ?? novoDoc()
      setUndoStack((u) => [...u, cur])
      docsRef.current = { ...docsRef.current, [modAtiva]: proximo }
      setDocs((d) => ({ ...d, [modAtiva]: proximo }))
      ultimaMudanca.current = 0
      return r.slice(0, -1)
    })
  }

  // Atalhos: Ctrl/Cmd+Z = desfazer, Ctrl/Cmd+Shift+Z ou Ctrl+Y = refazer.
  // (Ignora quando o foco está num campo de texto — lá o Ctrl+Z é o desfazer nativo do texto.)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      const el = e.target as HTMLElement
      const digitando = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
      if (digitando) return
      const k = e.key.toLowerCase()
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); desfazer() }
      else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); refazer() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  // aplica uma transformação de árvore a TODAS as regiões (páginas + cabeçalho + rodapé)
  function mutarTudo(fn: (blocks: Block[]) => Block[]) {
    setDoc((d) => ({ ...d, pages: d.pages.map((p) => ({ ...p, blocks: fn(p.blocks) })), cabecalho: fn(d.cabecalho ?? []), rodape: fn(d.rodape ?? []) }))
  }
  const tiposUsados = useMemo(() => {
    const all = [...doc.pages.flatMap((p) => p.blocks), ...(doc.cabecalho ?? []), ...(doc.rodape ?? [])]
    return tree.tiposNaArvore(all)
  }, [doc])

  const blocoSel = useMemo(() => {
    for (const arr of [...doc.pages.map((p) => p.blocks), doc.cabecalho ?? [], doc.rodape ?? []]) {
      const f = tree.findBlock(arr, selBlock ?? ''); if (f) return f
    }
    return null
  }, [doc, selBlock])

  function addBlock(type: string) {
    const meta = getBlockMeta(type)
    if (meta?.unico && tiposUsados.has(type)) { toast.error(`"${meta.title}" já existe neste caderno.`); return }
    const novo = createBlock(type)
    // Imagem de fundo (full-bleed) sempre no nível da página — nunca dentro de container.
    if (meta?.fullBleed) {
      let pid = selPage ?? doc.pages[0]?.id; if (!pid) { toast.error('Selecione uma página primeiro.'); return }
      if (meta.unicoPorPagina) {
        const pgSel = doc.pages.find((p) => p.id === pid)
        if (pgSel?.blocks.some((b) => b.type === type)) {
          // Página atual já tem imagem de fundo → adiciona na primeira página sem uma.
          const livre = doc.pages.find((p) => !p.blocks.some((b) => b.type === type))
          if (!livre) { toast.error('Todas as páginas já têm imagem de fundo. Adicione uma nova página.'); return }
          pid = livre.id
        }
      }
      setDoc((d) => ({ ...d, pages: d.pages.map((p) => p.id === pid ? { ...p, blocks: [novo, ...p.blocks] } : p) }))
      setSelBlock(novo.id); setSelPage(pid); setAba('bloco')
      toast.info('Imagem de fundo adicionada — envie a imagem no inspetor à direita.')
      return
    }
    // alvo: container selecionado > região ativa
    const sel = blocoSel
    if (sel && (sel.type === 'card' || sel.type === 'coluna' || sel.type === 'repeticao' || sel.type === 'condicao')) { mutarTudo((bs) => tree.insertInto(bs, sel.id, novo)); setSelBlock(novo.id); return }
    if (sel && sel.type === 'colunas') { const col0 = sel.innerBlocks?.[0]; if (col0) { mutarTudo((bs) => tree.insertInto(bs, col0.id, novo)); setSelBlock(novo.id); return } }
    if (regiao === 'cabecalho') { setDoc((d) => ({ ...d, cabecalho: [...(d.cabecalho ?? []), novo] })); setSelBlock(novo.id); return }
    if (regiao === 'rodape') { setDoc((d) => ({ ...d, rodape: [...(d.rodape ?? []), novo] })); setSelBlock(novo.id); return }
    const pid = selPage ?? doc.pages[0]?.id; if (!pid) return
    setDoc((d) => ({ ...d, pages: d.pages.map((p) => p.id === pid ? { ...p, blocks: [...p.blocks, novo] } : p) }))
    setSelBlock(novo.id); setSelPage(pid)
  }

  // ---------- Drag-and-drop ----------
  function aplicarInsercao(alvo: Alvo, bloco: Block) {
    if (alvo.kind === 'page') { setDoc((d) => ({ ...d, pages: d.pages.map((p) => p.id === alvo.pageId ? { ...p, blocks: [...p.blocks, bloco] } : p) })); return }
    if (alvo.kind === 'regiao') { setDoc((d) => ({ ...d, [alvo.regiao]: [...(((d as any)[alvo.regiao] as Block[]) ?? []), bloco] })); return }
    if (alvo.kind === 'after') { mutarTudo((bs) => tree.insertAfter(bs, alvo.blockId, bloco)); return }
    if (alvo.kind === 'before') { mutarTudo((bs) => tree.insertBefore(bs, alvo.blockId, bloco)); return }
    if (alvo.kind === 'lado') { mutarTudo((bs) => tree.wrapLado(bs, alvo.blockId, bloco, alvo.lado)); return }
    mutarTudo((bs) => tree.insertInto(bs, alvo.containerId, bloco))
  }
  function inserirNovo(type: string, alvo: Alvo) {
    const meta = getBlockMeta(type)
    if (meta?.unico && tiposUsados.has(type)) { toast.error(`"${meta.title}" já existe neste caderno.`); return }
    const novo = createBlock(type)
    if (meta?.fullBleed) {
      const pid = alvo.kind === 'page' ? alvo.pageId : (selPage ?? doc.pages[0]?.id); if (!pid) return
      if (meta.unicoPorPagina) {
        const pg = doc.pages.find((p) => p.id === pid)
        if (pg?.blocks.some((b) => b.type === type)) { toast.error(`Esta página já tem "${meta.title}".`); return }
      }
      setDoc((d) => ({ ...d, pages: d.pages.map((p) => p.id === pid ? { ...p, blocks: [novo, ...p.blocks] } : p) }))
    } else {
      aplicarInsercao(alvo, novo)
    }
    setSelBlock(novo.id); setAba('bloco')
  }
  function moverBloco(dragId: string, alvo: Alvo) {
    const alvoId = alvo.kind === 'after' || alvo.kind === 'before' || alvo.kind === 'lado' ? alvo.blockId : alvo.kind === 'into' ? alvo.containerId : null
    if (alvoId === dragId) return
    setDoc((d) => {
      let found: Block | null = null
      const ex = (bs: Block[]) => { const r = tree.extractBlock(bs, dragId); if (r.found) found = r.found; return r.blocks }
      let pages = d.pages.map((p) => ({ ...p, blocks: ex(p.blocks) }))
      let cab = ex(d.cabecalho ?? [])
      let rod = ex(d.rodape ?? [])
      if (!found) return d
      if (alvoId && tree.findBlock([found], alvoId)) return d // alvo está dentro do próprio bloco arrastado
      const fb = found as Block
      if (alvo.kind === 'page') pages = pages.map((p) => p.id === alvo.pageId ? { ...p, blocks: [...p.blocks, fb] } : p)
      else if (alvo.kind === 'regiao') { if (alvo.regiao === 'cabecalho') cab = [...cab, fb]; else rod = [...rod, fb] }
      else {
        const ins = (bs: Block[]) => alvo.kind === 'after' ? tree.insertAfter(bs, alvo.blockId, fb)
          : alvo.kind === 'before' ? tree.insertBefore(bs, alvo.blockId, fb)
          : alvo.kind === 'lado' ? tree.wrapLado(bs, alvo.blockId, fb, alvo.lado)
          : tree.insertInto(bs, (alvo as { containerId: string }).containerId, fb)
        pages = pages.map((p) => ({ ...p, blocks: ins(p.blocks) })); cab = ins(cab); rod = ins(rod)
      }
      // limpa colunas vazias na origem do movimento (e desembrulha as de 1 coluna)
      return { ...d, pages: pages.map((p) => ({ ...p, blocks: tree.limparArvore(p.blocks) })), cabecalho: tree.limparArvore(cab), rodape: tree.limparArvore(rod) }
    })
    setSelBlock(dragId)
  }
  function aoSoltar(e: React.DragEvent, alvo: Alvo) {
    e.preventDefault(); e.stopPropagation(); setOver(null); setArrastando(false)
    const t = e.dataTransfer.getData('text/plain')
    if (t.startsWith('novo:')) inserirNovo(t.slice(5), alvo)
    else if (t.startsWith('mover:')) { const id = t.slice(6); if (id) moverBloco(id, alvo) }
  }

  const ctx: NodeCtx = {
    theme, data: dataAtual, selId: selBlock, overId, overPos, arrastando,
    select: (b) => { setSelBlock(b.id); setAba('bloco') },
    addInto: (id) => { setSelBlock(id); toast.info('Container selecionado — escolha um bloco à esquerda para inserir dentro.') },
    mover: (id, dir) => mutarTudo((bs) => tree.moveBlock(bs, id, dir)),
    remover: (id) => { mutarTudo((bs) => tree.limparArvore(tree.removeBlock(bs, id))); if (selBlock === id) setSelBlock(null) },
    duplicar: (id) => mutarTudo((bs) => tree.duplicateBlock(bs, id)),
    aoLado: (id) => { mutarTudo((bs) => tree.wrapAoLado(bs, id)) },
    setCols: (id, n) => mutarTudo((bs) => tree.setNumColunas(bs, id, n)),
    setOver,
    dragStart: (e, id) => { e.stopPropagation(); setArrastando(true); e.dataTransfer.setData('text/plain', `mover:${id}`); e.dataTransfer.effectAllowed = 'move' },
    drop: aoSoltar,
  }

  function patchBlock(blockId: string, patch: Record<string, unknown>) { mutarTudo((bs) => tree.updateAttrs(bs, blockId, patch)) }
  function addPage(kind: PageKind) { setDoc((d) => ({ ...d, pages: [...d.pages, { id: genId('page'), kind, titulo: `Página ${d.pages.length + 1}`, blocks: [] }] })) }
  function removePage(pageId: string) { setDoc((d) => d.pages.length <= 1 ? d : ({ ...d, pages: d.pages.filter((p) => p.id !== pageId) })) }
  function moverPagina(from: number, to: number) {
    if (to < 0 || from === to) return
    setDoc((d) => { if (to >= d.pages.length) return d; const arr = [...d.pages]; const [it] = arr.splice(from, 1); arr.splice(to, 0, it); return { ...d, pages: arr } })
  }

  // modalidades
  async function addModalidade() { const nm = (await pedirTexto({ titulo: 'Nova modalidade', label: 'Nome', placeholder: 'ex.: Gabarito Discursivo', confirmar: 'Criar' }))?.trim(); if (!nm) return; const m = { id: genId('mod'), nome: nm }; setModalidades((ms) => [...ms, m]); setDocs((d) => ({ ...d, [m.id]: novoDoc() })); setModAtiva(m.id) }
  async function renameModalidade(id: string) { const atual = modalidades.find((m) => m.id === id)?.nome ?? ''; const nm = (await pedirTexto({ titulo: 'Renomear modalidade', label: 'Nome', valorInicial: atual, confirmar: 'Salvar' }))?.trim(); if (!nm) return; setModalidades((ms) => ms.map((m) => m.id === id ? { ...m, nome: nm } : m)) }
  async function removeModalidade(id: string) { if (modalidades.length <= 1) { toast.error('Mantenha ao menos uma modalidade.'); return } if (!(await confirmar({ mensagem: 'Excluir esta modalidade e seu documento?', destrutivo: true }))) return; setModalidades((ms) => ms.filter((m) => m.id !== id)); setDocs((d) => { const cp = { ...d }; delete cp[id]; return cp }); setModAtiva((cur) => cur === id ? modalidades.filter((m) => m.id !== id)[0].id : cur) }

  async function aplicarPreset(p: CadernoPreset) {
    const nomeMod = modalidades.find((m) => m.id === modAtiva)?.nome ?? 'atual'
    if (!(await confirmar({ titulo: 'Aplicar modelo', mensagem: `Aplicar o modelo "${p.nome}"? Isso substitui todo o conteúdo da modalidade "${nomeMod}".`, confirmar: 'Aplicar' }))) return
    setDocs((d) => ({ ...d, [modAtiva]: p.build() }))
    setSelBlock(null); setSelPage(null); setRegiao('pagina')
    toast.success(`Modelo "${p.nome}" aplicado`)
  }

  // Sobe os fundos base64 pro storage (requests pequenos, 1 por imagem, com dedupe) e devolve
  // os docs com URLs no lugar do base64 — assim o SAVE final vai leve e não estoura o limite.
  async function hospedarFundos(atual: Record<string, CadernoDoc>): Promise<Record<string, CadernoDoc>> {
    const cache = new Map<string, string>()
    const up = async (b64: string): Promise<string> => {
      if (cache.has(b64)) return cache.get(b64)!
      try { const r = await hospedarImagemCadernoAction(b64); const u = r.ok && r.url ? r.url : b64; cache.set(b64, u); return u } catch { cache.set(b64, b64); return b64 }
    }
    // Sobe QUALQUER base64 de imagem em QUALQUER atributo (não só `url`): fundo, capa,
    // cabeçalho, etc. podem guardar a imagem em outra chave — se escapar, o config vai pesado
    // e o save estoura. Varre recursivamente o objeto de atributos.
    const hostAttrs = async (o: any): Promise<void> => {
      if (!o || typeof o !== 'object') return
      for (const k of Object.keys(o)) {
        const v = o[k]
        if (typeof v === 'string' && v.startsWith('data:image')) o[k] = await up(v)
        else if (v && typeof v === 'object') await hostAttrs(v)
      }
    }
    const walk = async (blocks: any[]) => {
      for (const b of blocks ?? []) {
        if (b?.attributes) await hostAttrs(b.attributes)
        if (Array.isArray(b?.innerBlocks)) await walk(b.innerBlocks)
      }
    }
    const copia: Record<string, CadernoDoc> = JSON.parse(JSON.stringify(atual))
    for (const doc of Object.values(copia)) {
      for (const p of (doc as any).pages ?? []) await walk(p.blocks)
      await walk((doc as any).cabecalho ?? [])
      await walk((doc as any).rodape ?? [])
    }
    return copia
  }

  function salvar() {
    start(async () => {
      try {
        // 1) Sobe as imagens (base64 → URL) em requests pequenos. 2) Salva o doc já leve.
        const docsLeves = await hospedarFundos(docs)
        setDocs(docsLeves)
        const r = await salvarCadernoDesignerV2(cadernoId, { docsV2: docsLeves, modalidadesV2: modalidades, cores, hudCores, hudPorPagina, bancoId })
        if (r.ok) {
          if (r.docsV2) setDocs(r.docsV2 as any)
          toast.success('Caderno salvo')
        } else toast.error(r.error ?? 'Erro ao salvar')
      } catch (e) {
        // NUNCA deixa o erro subir (senão a tela quebra e perde o trabalho). O estado local
        // fica intacto — o admin tenta de novo.
        console.error(e)
        toast.error('Não consegui salvar agora (caderno grande ou conexão instável). Seu trabalho NÃO foi perdido — tente salvar de novo.')
      }
    })
  }
  async function importarWord(file: File) {
    const nomeMod = modalidades.find((m) => m.id === modAtiva)?.nome ?? 'esta modalidade'
    if (!(await confirmar({ titulo: 'Importar Word (.docx)', mensagem: `Isso vai SUBSTITUIR o conteúdo de "${nomeMod}" pelo do arquivo "${file.name}". Você revisa no editor e salva depois. Continuar?`, confirmar: 'Importar', destrutivo: true }))) return
    setImportando(true)
    try {
      const dataUri = await new Promise<string>((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.onerror = () => rej(new Error('leitura')); fr.readAsDataURL(file) })
      const r = await converterWordAction(dataUri)
      if (!r.ok || !r.doc) { toast.error(r.error ?? 'Falha ao importar o Word.'); return }
      const imp = r.doc as CadernoDoc
      setDoc((d) => ({ ...d, pages: imp.pages.length ? imp.pages : d.pages }))
      setSelBlock(null); setSelPage(null)
      toast.success(`Word importado: ${r.resumo?.blocos ?? 0} bloco(s)${r.resumo?.imagens ? ` · ${r.resumo.imagens} imagem(ns)` : ''}. Revise e salve.`)
    } catch (e) { toast.error('Erro ao ler o arquivo.'); console.error(e) }
    finally { setImportando(false) }
  }

  function vincularBanco(novoId: string | null) {
    setBancoId(novoId)
    start(async () => {
      const r = await salvarCadernoDesignerV2(cadernoId, { docsV2: docs, modalidadesV2: modalidades, cores, hudCores, hudPorPagina, bancoId: novoId })
      if (r.ok) window.location.reload() // refaz o preview com os dados do banco
      else toast.error(r.error ?? 'Erro ao vincular banco')
    })
  }

  // ---- zona de cabeçalho/rodapé DENTRO da folha (área reservada; conteúdo não invade) ----
  function ZonaFaixa({ reg, blocks, altura }: { reg: 'cabecalho' | 'rodape'; blocks: Block[]; altura?: number }) {
    const ativa = regiao === reg
    const overReg = overId === `regiao:${reg}`
    const isCab = reg === 'cabecalho'
    const temAltura = !!altura && altura > 0
    const h = temAltura ? { minHeight: altura, display: 'flex', flexDirection: 'column' as const, justifyContent: isCab ? 'flex-start' as const : 'flex-end' as const } : {}
    return (
      <div
        onClick={(e) => { e.stopPropagation(); setRegiao(reg); setSelBlock(null); setSelPage(null) }}
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setOver(`regiao:${reg}`) }}
        onDrop={(e) => { e.stopPropagation(); ctx.drop(e, { kind: 'regiao', regiao: reg }) }}
        style={{
          transition: 'min-height 0.25s ease-out, background-color 0.15s, box-shadow 0.15s',
          // Área reservada visível (editor): tint + contorno tracejado para VER a faixa crescer.
          ...(temAltura ? { background: 'color-mix(in oklab, var(--primary) 7%, transparent)' } : {}),
          ...(isCab
            ? { borderBottom: `1px solid ${theme.cores.secundaria}55`, paddingTop: 10, paddingBottom: 8, marginBottom: 8, ...h }
            : { borderTop: `1px solid ${theme.cores.secundaria}55`, paddingTop: 8, paddingBottom: 10, marginTop: 8, ...h }),
        }}
        className={cn('relative z-[1] shrink-0 cursor-pointer rounded-sm',
          temAltura && 'outline-dashed outline-1 -outline-offset-1 outline-primary/30',
          overReg ? 'ring-2 ring-primary/50' : ativa ? 'ring-1 ring-primary/40' : 'hover:ring-1 hover:ring-primary/25')}>
        {/* Selo com a altura reservada — cresce junto e deixa claro que a faixa está aumentando. */}
        {temAltura && (
          <span className={cn('pointer-events-none absolute right-1.5 z-[2] rounded bg-primary/80 px-1.5 py-0.5 text-[9px] font-semibold text-primary-foreground', isCab ? 'top-1.5' : 'bottom-1.5')}>
            {isCab ? 'Cabeçalho' : 'Rodapé'} · {altura}px
          </span>
        )}
        {blocks.length === 0
          ? <div className={cn('flex items-center justify-center gap-1.5 text-[11px] font-medium text-muted-foreground', temAltura ? 'flex-1' : 'py-3')}>{isCab ? <PanelTop className="h-3.5 w-3.5" /> : <PanelBottom className="h-3.5 w-3.5" />} Área de {isCab ? 'cabeçalho' : 'rodapé'}{temAltura ? '' : ' — clique e adicione blocos'}</div>
          : <div className="flex flex-col"><ListaBlocos blocks={blocks} ctx={ctx} /></div>}
      </div>
    )
  }

  return (
    <div className="-m-6 flex h-[calc(100vh-3.5rem)] flex-col overflow-hidden bg-background" onDragEnd={() => { setArrastando(false); setOver(null) }}>
      {/* Topo */}
      <div className="flex min-w-0 items-center justify-between gap-3 border-b bg-card/60 px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <Link href={pastaId ? `/admin/cadernos?pasta=${pastaId}` : '/admin/cadernos'} className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><ChevronLeft className="h-5 w-5" /></Link>
          <div className="min-w-0 max-w-[160px] xl:max-w-[240px]">
            <h1 className="truncate text-lg font-bold leading-tight" title={nome}>{nome}</h1>
            <p className="truncate text-xs text-muted-foreground">Editor de blocos · {modalidadesVisiveis.length} modalidade(s)</p>
          </div>
          {/* Vínculo com banco: alimenta as variáveis com os dados reais daquele banco */}
          <label className="ml-3 flex shrink-0 items-center gap-1.5 rounded-lg border bg-muted/40 px-2.5 py-1.5 text-xs">
            <Database className="h-3.5 w-3.5 text-primary" />
            <span className="text-muted-foreground">Banco:</span>
            <select value={bancoId ?? ''} onChange={(e) => vincularBanco(e.target.value || null)} className="bg-transparent text-sm font-medium outline-none">
              <option value="">Nenhum (exemplo)</option>
              {bancos.map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}
            </select>
          </label>
          <button onClick={() => setHudMode(true)} title="Personalizar as cores da interface da prova (HUD do simulado)"
            className="inline-flex items-center gap-1.5 rounded-lg border border-primary/50 bg-gradient-to-r from-primary/20 to-primary/5 px-3 py-1.5 text-xs font-semibold text-primary shadow-sm transition-all hover:-translate-y-px hover:from-primary/30 hover:to-primary/10 hover:shadow">
            <MonitorPlay className="h-4 w-4" /> HUD de Simulado
          </button>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {registros.length > 0 && (
            <div className="flex items-center gap-1 rounded-lg border bg-muted/40 px-1.5 py-1 text-xs">
              <Users className="ml-0.5 h-3.5 w-3.5 text-primary" />
              <button onClick={() => setRegIndex((i) => Math.max(0, i - 1))} disabled={regIndex === 0} className="rounded p-0.5 hover:bg-muted disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button>
              <span className="min-w-[110px] truncate text-center font-medium" title={regAtual?.nome}>{regAtual?.nome}</span>
              <span className="text-muted-foreground">{regIndex + 1}/{registros.length}</span>
              <button onClick={() => setRegIndex((i) => Math.min(registros.length - 1, i + 1))} disabled={regIndex >= registros.length - 1} className="rounded p-0.5 hover:bg-muted disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
            </div>
          )}
          {totalQPreview > 1 && (
            <div className="flex items-center gap-1 rounded-lg border bg-muted/40 px-1.5 py-1 text-xs" title="Navegar pelas questões do repetidor (preview)">
              <Repeat className="ml-0.5 h-3.5 w-3.5 text-primary" />
              <button onClick={() => setPreviewQ((i) => Math.max(0, Math.min(totalQPreview - 1, i) - 1))} disabled={qIdx === 0} className="rounded p-0.5 hover:bg-muted disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button>
              <span className="min-w-[62px] text-center font-medium">Questão {qIdx + 1}</span>
              <span className="text-muted-foreground">/{totalQPreview}</span>
              <button onClick={() => setPreviewQ((i) => Math.min(totalQPreview - 1, i + 1))} disabled={qIdx >= totalQPreview - 1} className="rounded p-0.5 hover:bg-muted disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
            </div>
          )}
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={desfazer} disabled={undoStack.length === 0} title="Desfazer (Ctrl+Z)"><Undo2 className="h-4 w-4" /></Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={refazer} disabled={redoStack.length === 0} title="Refazer (Ctrl+Shift+Z)"><Redo2 className="h-4 w-4" /></Button>
          </div>
          <input ref={fileWordRef} type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) importarWord(f); e.target.value = '' }} />
          <Button variant="outline" size="sm" onClick={() => fileWordRef.current?.click()} disabled={importando} title="Importar um Word (.docx) para esta modalidade">
            {importando ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <FileUp className="mr-1.5 h-4 w-4" />} Importar Word
          </Button>
          <a href={`/imprimir/caderno/${cadernoId}?mod=${modAtiva}${regAtual ? `&aluno=${regAtual.id}` : ''}`} target="_blank" rel="noreferrer">
            <Button variant="outline" size="sm"><Printer className="mr-1.5 h-4 w-4" /> Imprimir/PDF</Button>
          </a>
          {registros.length > 0 && (
            <GerarPdfServidor
              payload={{ tipo: 'caderno', cadernoId, mod: modAtiva, todos: true, titulo: `Mala direta — ${nome}` }}
              label={`Mala direta (${registros.length})`}
              icon={<Users className="mr-1.5 h-4 w-4" />}
            />
          )}
          <Button onClick={salvar} disabled={pending} size="sm">
            {pending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />} Salvar
          </Button>
        </div>
      </div>

      {hudMode ? (
        <HudSimuladoEditor base={hudCores} porPagina={hudPorPagina} onChangePorPagina={setHudPorPagina} onVoltar={() => setHudMode(false)} titulo={nome} branding={branding} />
      ) : (
      <div className="grid min-h-0 flex-1 grid-cols-[208px_1fr_248px]">
        {/* Esquerda */}
        <div className="scroll-claro flex min-h-0 flex-col gap-4 overflow-y-auto border-r bg-muted/20 p-3">
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Modalidade</p>
            <select value={modAtiva} onChange={(e) => { setModAtiva(e.target.value); setSelBlock(null) }} className="w-full rounded-lg border bg-background px-2.5 py-2 text-sm shadow-sm">
              {modalidadesVisiveis.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
            </select>
            <div className="mt-1.5 flex gap-2 text-[11px]">
              <button onClick={addModalidade} className="text-primary hover:underline">+ Nova</button>
              <button onClick={() => renameModalidade(modAtiva)} className="text-muted-foreground hover:underline">Renomear</button>
              <button onClick={() => removeModalidade(modAtiva)} className="text-destructive hover:underline">Excluir</button>
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Modelos prontos</p>
            <div className="flex flex-col gap-1.5">
              {PRESETS_CADERNO.filter((p) => !OCULTAR_DISCURSIVA || !/discursiv|reda[çc][ãa]o/i.test(`${p.id} ${p.nome}`)).map((p) => (
                <button key={p.id} type="button" onClick={() => aplicarPreset(p)} title={p.descricao}
                  className="rounded-lg border bg-background px-2.5 py-2 text-left shadow-sm transition-all hover:border-primary hover:bg-primary/5">
                  <span className="block text-xs font-medium leading-tight">{p.nome}</span>
                  <span className="mt-0.5 block text-[10px] leading-snug text-muted-foreground">{p.descricao}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Adicionar bloco</p>
            <div className="space-y-3">
              {(['conteudo', 'avaliacao', 'identificacao', 'estrutura'] as const).map((cat) => (
                <div key={cat}>
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">{CAT_NOMES[cat]}</p>
                  <div className="flex flex-col gap-1.5">
                    {cats[cat].filter((b) => !b.oculto).map((b) => {
                      const Icon = b.icon
                      const dis = (b.unico && tiposUsados.has(b.type)) || (b.unicoPorPagina && doc.pages.length > 0 && doc.pages.every((p) => p.blocks.some((x) => x.type === b.type)))
                      return (
                        <button key={b.type} disabled={dis} onClick={() => addBlock(b.type)}
                          draggable={!dis} onDragStart={(e) => { setArrastando(true); e.dataTransfer.setData('text/plain', `novo:${b.type}`) }}
                          className={cn('group flex items-center gap-2 rounded-lg border bg-background px-2.5 py-2 text-left text-xs font-medium shadow-sm transition-all', dis ? 'cursor-not-allowed opacity-40' : 'cursor-grab hover:border-primary hover:shadow hover:translate-x-0.5 active:cursor-grabbing')}>
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground"><Icon size={14} /></span>
                          <span className="leading-tight">{b.title}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Centro: canvas */}
        <div className="scroll-claro min-h-0 overflow-auto bg-[radial-gradient(circle,theme(colors.slate.300)_1px,transparent_1px)] [background-size:18px_18px] px-4 py-5 dark:bg-[radial-gradient(circle,theme(colors.slate.700)_1px,transparent_1px)]">
          <div className="mx-auto flex flex-col items-center gap-3" style={{ width: SHEET_W * ZOOM }}>
            {doc.pages.map((page, pi) => {
              const bg = page.blocks.find((b) => b.type === 'plano-fundo')
              const conteudo = page.blocks.filter((b) => b.type !== 'plano-fundo')
              const mostraCab = running.cabecalhoAtivo && faixaNaPagina(running.cabecalhoPaginas, pi, page.kind)
              const mostraRod = running.rodapeAtivo && faixaNaPagina(running.rodapePaginas, pi, page.kind)
              // Reserva de cabeçalho/rodapé na área segura (o +24 cobre o padding/borda da faixa no editor).
              const cabH = mostraCab ? (running.cabecalhoAltura || PAD_V) + 24 : PAD_V
              const rodH = mostraRod ? (running.rodapeAltura || PAD_V) + 24 : PAD_V
              // Uma folha A4 (fixa) com fundo + cabeçalho + blocos desta folha + rodapé.
              const renderSheet = (grupo: Block[], si: number, total: number) => (
                <div style={{ width: SHEET_W * ZOOM, height: SHEET_H * ZOOM }} className="relative">
                  <div onClick={() => { setSelPage(page.id); setSelBlock(null); setRegiao('pagina') }}
                    onDragOver={(e) => { e.preventDefault(); setOver(page.id) }}
                    onDrop={(e) => ctx.drop(e, { kind: 'page', pageId: page.id })}
                    style={{ width: SHEET_W, height: SHEET_H, transform: `scale(${ZOOM})`, transformOrigin: 'top left', background: theme.cores.fundo, boxShadow: '0 2px 16px rgba(0,0,0,.13)',
                      ...(overId === page.id ? { outline: `2.5px solid ${REALCE}`, outlineOffset: -2 } : arrastando ? { outline: `1.5px solid ${REALCE}`, outlineOffset: -2 } : {}) }}
                    className={cn('relative', !arrastando && selPage === page.id && regiao === 'pagina' && 'ring-2 ring-primary/40')}>
                    {bg && (
                      <FundoPagina key={(bg.attributes as any).url || 'sem'} bloco={bg} selecionado={selBlock === bg.id}
                        corPrimaria={theme.cores.primaria} onSelect={() => { setSelBlock(bg.id); setAba('bloco') }} />
                    )}
                    <div className="relative flex h-full flex-col">
                      {mostraCab && <ZonaFaixa reg="cabecalho" blocks={doc.cabecalho ?? []} altura={running.cabecalhoAltura} />}
                      <AutoAnim ativo={!arrastando} style={{ paddingTop: mostraCab ? 0 : PAD_V, paddingBottom: mostraRod ? 0 : PAD_V, paddingLeft: PAD_H, paddingRight: PAD_H }} className={cn('relative flex min-h-0 flex-1 flex-col', page.valign === 'center' && 'justify-center', page.valign === 'bottom' && 'justify-end')}>
                        {grupo.length === 0 && !bg && (
                          <div className={cn('flex h-[200px] items-center justify-center rounded-lg border-2 border-dashed text-sm transition-colors', arrastando ? 'border-primary/50 bg-primary/5 text-primary' : 'border-border text-muted-foreground')}>{arrastando ? 'Solte o bloco aqui' : 'Arraste um bloco ou clique para começar'}</div>
                        )}
                        <ListaBlocos blocks={grupo} ctx={ctx} />
                      </AutoAnim>
                      {mostraRod && <ZonaFaixa reg="rodape" blocks={doc.rodape ?? []} altura={running.rodapeAltura} />}
                    </div>
                    {bg && si === 0 && <ChipFundo selecionado={selBlock === bg.id} corPrimaria={theme.cores.primaria} onSelect={() => { setSelBlock(bg.id); setAba('bloco') }} />}
                    {total > 1 && <span style={{ position: 'absolute', right: 6, bottom: 6, zIndex: 16, fontSize: 11, fontWeight: 600, color: '#64748b', background: '#fff', padding: '1px 6px', borderRadius: 5, border: '1px solid #e2e8f0' }}>folha {si + 1}/{total}</span>}
                  </div>
                </div>
              )
              return (
                <div key={page.id} className="group/p relative flex flex-col items-center gap-2">
                  <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground" style={{ width: SHEET_W * ZOOM }}>
                    <span className="font-medium">{page.titulo} · {PAGE_KINDS.find((k) => k.id === page.kind)?.nome}{running.mostrarNumeroPagina ? ` · pág. ${pi + 1}` : ''}</span>
                    <button onClick={() => removePage(page.id)} className="opacity-0 transition-opacity hover:text-destructive group-hover/p:opacity-100"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                  <FolhasPaginadas blocks={conteudo} theme={theme} data={ctx.data} cabH={cabH} rodH={rodH} renderSheet={renderSheet} />
                </div>
              )
            })}

            <div className="flex flex-wrap justify-center gap-1.5 py-2 pb-10">
              {PAGE_KINDS.map((k) => (
                <button key={k.id} onClick={() => addPage(k.id)} className="flex items-center gap-1 rounded-md border bg-background px-2.5 py-1.5 text-xs shadow-sm hover:border-primary hover:bg-primary/5">
                  <Plus className="h-3.5 w-3.5" /> {k.nome}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Direita: inspetor */}
        <div className="scroll-claro flex min-h-0 flex-col overflow-y-auto border-l bg-muted/10">
          <div className="grid grid-cols-2 border-b bg-background text-sm">
            {([['bloco', 'Bloco', FileText], ['tema', 'Tema', Palette], ['pagina', 'Páginas', LayoutTemplate], ['layout', 'Faixas', PanelTop]] as const).map(([id, label, Icon], i) => (
              <button key={id} onClick={() => setAba(id)} className={cn('flex items-center justify-center gap-1.5 border-b py-2.5 text-xs', i % 2 === 0 && 'border-r', aba === id ? 'border-b-2 border-b-primary font-semibold text-primary' : 'text-muted-foreground hover:text-foreground')}>
                <Icon className="h-3.5 w-3.5" /> {label}
              </button>
            ))}
          </div>
          <div className="flex-1 p-4">
            {aba === 'bloco' && (blocoSel ? (
              <div className="space-y-3">
                <p className="flex items-center gap-1.5 text-sm font-semibold">{getBlockMeta(blocoSel.type)?.title}</p>
                <BlockInspector block={blocoSel} onChange={(patch) => patchBlock(blocoSel.id, patch)} varsExtra={varsExtra} gruposBanco={gruposBanco} assuntosBanco={assuntosBanco} />
              </div>
            ) : <p className="text-sm text-muted-foreground">Selecione um bloco no canvas para editar suas opções.</p>)}

            {aba === 'tema' && (
              <div className="space-y-3">
                <p className="text-sm font-semibold">Cores do caderno</p>
                {([['primaria', 'Primária'], ['secundaria', 'Secundária'], ['acento', 'Acento'], ['texto', 'Texto'], ['fundo', 'Fundo']] as const).map(([k, label]) => (
                  <label key={k} className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-muted-foreground">{label}</span>
                    <HexColorField value={cores[k] ?? theme.cores[k]} onChange={(v) => setCores((c) => ({ ...c, [k]: v }))} />
                  </label>
                ))}
                <button onClick={() => setCores({})} className="text-xs text-muted-foreground hover:underline">Restaurar padrão</button>
              </div>
            )}

            {aba === 'pagina' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">Páginas ({doc.pages.length})</p>
                  <span className="text-[10px] text-muted-foreground">arraste ou use as setas</span>
                </div>
                {doc.pages.map((p, i) => (
                  <div key={p.id}
                    draggable
                    onDragStart={() => setPageDrag(i)}
                    onDragOver={(e) => { if (pageDrag !== null) { e.preventDefault(); setPageOver(i) } }}
                    onDrop={(e) => { if (pageDrag !== null) { e.preventDefault(); moverPagina(pageDrag, i); setPageDrag(null); setPageOver(null) } }}
                    onDragEnd={() => { setPageDrag(null); setPageOver(null) }}
                    onClick={() => setSelPage(p.id)}
                    className={cn('flex items-start gap-1.5 rounded-md border bg-background p-2 transition-colors', selPage === p.id && 'border-primary', pageOver === i && pageDrag !== null && 'border-t-2 border-t-primary', pageDrag === i && 'opacity-50')}>
                    <span className="mt-1 flex cursor-grab flex-col items-center gap-0.5 text-muted-foreground active:cursor-grabbing" title="Arraste para reordenar">
                      <GripVertical className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <input value={p.titulo ?? ''} onChange={(e) => setDoc((d) => ({ ...d, pages: d.pages.map((x) => x.id === p.id ? { ...x, titulo: e.target.value } : x) }))} onClick={(e) => e.stopPropagation()} className="w-full bg-transparent text-sm font-medium outline-none" />
                      <select value={p.kind} onChange={(e) => setDoc((d) => ({ ...d, pages: d.pages.map((x) => x.id === p.id ? { ...x, kind: e.target.value as PageKind } : x) }))} onClick={(e) => e.stopPropagation()} className="mt-1 w-full rounded border bg-background px-1.5 py-1 text-xs">
                        {PAGE_KINDS.map((k) => <option key={k.id} value={k.id}>{k.nome}</option>)}
                      </select>
                      <div className="mt-1 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <span className="mr-0.5 text-[9px] uppercase tracking-wide text-muted-foreground">Alinh. vertical</span>
                        {([['top', 'Topo'], ['center', 'Centro'], ['bottom', 'Rodapé']] as const).map(([v, label]) => (
                          <button key={v} type="button" onClick={() => setDoc((d) => ({ ...d, pages: d.pages.map((x) => x.id === p.id ? { ...x, valign: v } : x) }))}
                            className={cn('flex-1 rounded border px-1 py-0.5 text-[10px] transition-colors', (p.valign ?? 'top') === v ? 'border-primary bg-primary/10 font-medium text-primary' : 'text-muted-foreground hover:bg-muted')}>
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="mt-0.5 flex flex-col">
                      <button type="button" onClick={(e) => { e.stopPropagation(); moverPagina(i, i - 1) }} disabled={i === 0} title="Subir" className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button>
                      <button type="button" onClick={(e) => { e.stopPropagation(); moverPagina(i, i + 1) }} disabled={i === doc.pages.length - 1} title="Descer" className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {aba === 'layout' && (
              <div className="space-y-4">
                <p className="text-sm font-semibold">Cabeçalho e rodapé</p>
                {(() => {
                  const setRun = (patch: Partial<typeof running>) => setDoc((d) => ({ ...d, running: { ...(d.running ?? RUNNING_PADRAO), ...patch } }))
                  const FaixaCfg = ({ reg }: { reg: 'cabecalho' | 'rodape' }) => {
                    const isCab = reg === 'cabecalho'
                    const ativo = isCab ? running.cabecalhoAtivo : running.rodapeAtivo
                    const altura = (isCab ? running.cabecalhoAltura : running.rodapeAltura) ?? 0
                    const paginas = (isCab ? running.cabecalhoPaginas : running.rodapePaginas) ?? 'todas'
                    return (
                      <div className="rounded-lg border p-2.5">
                        <label className="flex items-center justify-between gap-2 text-sm font-medium">
                          <span className="flex items-center gap-1.5">{isCab ? <PanelTop className="h-4 w-4" /> : <PanelBottom className="h-4 w-4" />} {isCab ? 'Cabeçalho' : 'Rodapé'}</span>
                          <input type="checkbox" checked={ativo} onChange={(e) => setRun(isCab ? { cabecalhoAtivo: e.target.checked } : { rodapeAtivo: e.target.checked })} />
                        </label>
                        {ativo && (
                          <div className="mt-2.5 space-y-2.5 border-t pt-2.5">
                            <div>
                              <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground"><span>Altura (px) — 0 = automática</span><span className="font-medium">{altura || 'auto'}</span></div>
                              <div className="flex items-center gap-2">
                                <input type="range" min={0} max={Math.round(SHEET_H / 2)} value={altura} onChange={(e) => setRun(isCab ? { cabecalhoAltura: Number(e.target.value) } : { rodapeAltura: Number(e.target.value) })} className="flex-1" />
                                <input type="number" min={0} max={Math.round(SHEET_H / 2)} value={altura} onChange={(e) => setRun(isCab ? { cabecalhoAltura: Number(e.target.value) } : { rodapeAltura: Number(e.target.value) })} className="w-16 rounded-md border bg-[var(--input-bg,transparent)] px-2 py-1 text-sm" />
                              </div>
                            </div>
                            <label className="block text-xs text-muted-foreground">
                              <span className="mb-1 block">Aparece em</span>
                              <select value={paginas} onChange={(e) => setRun(isCab ? { cabecalhoPaginas: e.target.value as FaixaPaginas } : { rodapePaginas: e.target.value as FaixaPaginas })} className="w-full rounded-md border bg-[var(--input-bg,transparent)] px-2 py-1.5 text-sm text-foreground">
                                <option value="todas">Todas as páginas</option>
                                <option value="exceto_capa">Todas, exceto a capa</option>
                                <option value="exceto_primeira">Todas, exceto a 1ª</option>
                                <option value="somente_primeira">Somente a 1ª página</option>
                              </select>
                            </label>
                          </div>
                        )}
                      </div>
                    )
                  }
                  return (<div className="space-y-2.5"><FaixaCfg reg="cabecalho" /><FaixaCfg reg="rodape" /></div>)
                })()}
                <label className="flex items-center justify-between gap-2 text-sm"><span>Mostrar número de página</span>
                  <input type="checkbox" checked={running.mostrarNumeroPagina} onChange={(e) => setDoc((d) => ({ ...d, running: { ...(d.running ?? RUNNING_PADRAO), mostrarNumeroPagina: e.target.checked } }))} /></label>
                <p className="rounded-md border border-primary/20 bg-primary/5 px-2 py-1.5 text-xs text-muted-foreground">Ative a faixa, clique nela na folha e adicione blocos (logo, texto, imagem…). A área fica reservada — o conteúdo do meio não a invade.</p>
              </div>
            )}
          </div>
        </div>
      </div>
      )}
    </div>
  )
}
