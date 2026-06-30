'use client'

import { Fragment, useLayoutEffect, useMemo, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Loader2, Save, Printer, Plus, Trash2, ArrowUp, ArrowDown, FileText, Palette, LayoutTemplate, ChevronLeft, ChevronRight, Columns2, PanelTop, PanelBottom, Minus, Wallpaper, Database, Users, Repeat } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { BLOCKS, blocksByCategory, createBlock, getBlockMeta, BlockRender, cardStyle, dataComQuestao } from '@/lib/caderno-designer/blocks'
import { BlockInspector } from '@/lib/caderno-designer/inspectors'
import { resolveTheme, type CadernoTheme } from '@/lib/caderno-designer/theme'
import * as tree from '@/lib/caderno-designer/block-tree'
import { SHEET_W, SHEET_H, PAD_H, PAD_V, PAGE_KINDS, MODALIDADES_PADRAO, RUNNING_PADRAO, novoDoc, genId, type CadernoDoc, type Modalidade, type Block, type PageKind, type CadernoData } from '@/lib/caderno-designer/types'
import { salvarCadernoDesignerV2 } from '@/app/admin/cadernos/actions'

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
  const montado = useRef(false)
  useLayoutEffect(() => {
    const el = ref.current; if (!el || !ativo) return // durante o arrasto os slots já animam
    const novo = new Map<string, DOMRect>()
    for (const c of Array.from(el.children) as HTMLElement[]) {
      const key = c.dataset.flipKey; if (!key) continue
      const r = c.getBoundingClientRect(); novo.set(key, r)
      if (!montado.current) continue
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
  mover: (id: string, dir: -1 | 1) => void; remover: (id: string) => void
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
        active ? 'my-0.5 h-9 border-2 border-primary bg-primary/10 opacity-100' : 'h-1 border-0 opacity-0')}>
      soltar aqui
    </div>
  )
}

// Lista de blocos com slots (top/bottom) sempre presentes, animando na posição do cursor.
function ListaBlocos({ blocks, ctx }: { blocks: Block[]; ctx: NodeCtx }) {
  return (
    <>
      {blocks.map((block) => (
        <Fragment key={block.id}>
          <InsertSlot ctx={ctx} blockId={block.id} pos="top" active={ctx.overId === block.id && ctx.overPos === 'top'} />
          <EditorNode block={block} ctx={ctx} />
          <InsertSlot ctx={ctx} blockId={block.id} pos="bottom" active={ctx.overId === block.id && ctx.overPos === 'bottom'} />
        </Fragment>
      ))}
    </>
  )
}

function EditorNode({ block, ctx }: { block: Block; ctx: NodeCtx }) {
  const a = block.attributes as any
  const selected = ctx.selId === block.id

  const over = ctx.overId === block.id

  if (block.type === 'coluna') {
    const filhos = block.innerBlocks ?? []
    const vazia = filhos.length === 0
    return (
      <div data-flip-key={block.id} onClick={(e) => { e.stopPropagation(); ctx.select(block) }}
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); ctx.setOver(block.id) }}
        onDrop={(e) => ctx.drop(e, { kind: 'into', containerId: block.id })}
        style={over ? { outline: `2px solid ${REALCE}`, outlineOffset: -2, borderRadius: 6 } : undefined}
        className={cn('min-w-0 flex-1 rounded transition-colors', over && 'bg-primary/10')}>
        {vazia ? <DropZoneVazia onClick={() => ctx.addInto(block.id)} /> : <AutoAnim ativo={!ctx.arrastando} className="flex flex-col"><ListaBlocos blocks={filhos} ctx={ctx} /></AutoAnim>}
      </div>
    )
  }

  const isCard = block.type === 'card'
  const ehContainer = block.type === 'card' || block.type === 'repeticao' // detecta meio (dentro)
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
    inner = (
      <div style={{ display: 'flex', justifyContent: al === 'left' ? 'flex-start' : al === 'right' ? 'flex-end' : 'center' }}>
        <div style={cardStyle(a, ctx.theme)}>
          {filhos.length > 0 ? (
            <AutoAnim ativo={!ctx.arrastando} className="flex flex-col"><ListaBlocos blocks={filhos} ctx={ctx} /></AutoAnim>
          ) : <DropZoneVazia onClick={() => ctx.addInto(block.id)} />}
        </div>
      </div>
    )
  } else if (block.type === 'colunas') {
    inner = (
      <AutoAnim ativo={!ctx.arrastando} style={{ display: 'flex', gap: a.gap ?? 16, alignItems: 'flex-start' }}>
        {(block.innerBlocks ?? []).map((col) => <EditorNode key={col.id} block={col} ctx={ctx} />)}
      </AutoAnim>
    )
  } else if (block.type === 'repeticao') {
    const filhos = block.innerBlocks ?? []
    // preview do template com a 1ª questão do banco (no print repete por todas)
    const ctxQ: NodeCtx = ctx.data.questoes[0] ? { ...ctx, data: dataComQuestao(ctx.data, ctx.data.questoes[0]) } : ctx
    const n = ctx.data.questoes.length || ctx.data.numQuestoes
    inner = (
      <div style={{ border: `1.5px dashed ${ctx.theme.cores.secundaria}`, borderRadius: 8, padding: 12, background: 'color-mix(in oklab, var(--primary) 4%, transparent)' }}>
        <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: ctx.theme.cores.secundaria }}>
          <Repeat className="h-3.5 w-3.5" /> Repete por questão — {n} no banco
        </div>
        {filhos.length > 0
          ? <AutoAnim ativo={!ctx.arrastando} className="flex flex-col"><ListaBlocos blocks={filhos} ctx={ctxQ} /></AutoAnim>
          : <DropZoneVazia onClick={() => ctx.addInto(block.id)} />}
      </div>
    )
  } else {
    inner = <BlockRender block={block} theme={ctx.theme} data={ctx.data} />
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
      {/* conteúdo + espaço lateral que encolhe/expande com animação */}
      <div className="flex items-stretch">
        <div className={cn('overflow-hidden transition-all duration-200 ease-out', guiaLado === 'left' ? 'mr-2 w-[44%]' : 'w-0')}>
          <div className="flex h-full min-h-[44px] items-center justify-center whitespace-nowrap rounded-md border-2 border-dashed border-primary bg-primary/10 text-[10px] font-medium text-primary">soltar aqui</div>
        </div>
        <div className="min-w-0 flex-1">{inner}</div>
        <div className={cn('overflow-hidden transition-all duration-200 ease-out', guiaLado === 'right' ? 'ml-2 w-[44%]' : 'w-0')}>
          <div className="flex h-full min-h-[44px] items-center justify-center whitespace-nowrap rounded-md border-2 border-dashed border-primary bg-primary/10 text-[10px] font-medium text-primary">soltar aqui</div>
        </div>
      </div>
      <NodeToolbar block={block} ctx={ctx} />
    </div>
  )
}

// ----------------- Editor -----------------
export function CadernoEditorV2({
  cadernoId, nome, inicial, previewData, bancos = [], bancoIdInicial = null, registros = [],
}: {
  cadernoId: string
  nome: string
  inicial: { docsV2?: Record<string, CadernoDoc>; modalidadesV2?: Modalidade[]; cores?: Record<string, string> }
  previewData: CadernoData
  bancos?: { id: string; nome: string }[]
  bancoIdInicial?: string | null
  registros?: { id: string; nome: string; vars: Record<string, string>; respostas?: Record<string, string> }[]
}) {
  const mods0 = inicial.modalidadesV2?.length ? inicial.modalidadesV2 : MODALIDADES_PADRAO
  const [modalidades, setModalidades] = useState<Modalidade[]>(mods0)
  const [docs, setDocs] = useState<Record<string, CadernoDoc>>(() => {
    const d = { ...(inicial.docsV2 ?? {}) }
    for (const m of mods0) {
      if (!d[m.id]) d[m.id] = novoDoc()
      else d[m.id] = { ...novoDoc(), ...d[m.id], cabecalho: d[m.id].cabecalho ?? [], rodape: d[m.id].rodape ?? [], running: d[m.id].running ?? { ...RUNNING_PADRAO } }
    }
    return d
  })
  const [cores, setCores] = useState<Record<string, string>>(inicial.cores ?? {})
  const [bancoId, setBancoId] = useState<string | null>(bancoIdInicial)
  const [regIndex, setRegIndex] = useState(0)
  const [modAtiva, setModAtiva] = useState<string>(mods0[0].id)
  const [selPage, setSelPage] = useState<string | null>(null)
  const [selBlock, setSelBlock] = useState<string | null>(null)
  const [regiao, setRegiao] = useState<Regiao>('pagina')
  const [overId, setOverId] = useState<string | null>(null)
  const [overPos, setOverPos] = useState<Pos | null>(null)
  const [arrastando, setArrastando] = useState(false)
  const [aba, setAba] = useState<'bloco' | 'tema' | 'pagina' | 'layout'>('bloco')
  const setOver = (id: string | null, pos: Pos = 'in') => { setOverId(id); setOverPos(id ? pos : null) }
  const [pending, start] = useTransition()

  const theme = useMemo(() => resolveTheme(cores), [cores])
  const regAtual = registros[regIndex] ?? null
  const dataAtual = useMemo(() => regAtual ? { ...previewData, vars: { ...previewData.vars, ...regAtual.vars }, respostas: regAtual.respostas } : previewData, [regAtual, previewData])
  const doc = docs[modAtiva] ?? novoDoc()
  const cats = blocksByCategory()
  const running = doc.running ?? RUNNING_PADRAO

  function setDoc(updater: (d: CadernoDoc) => CadernoDoc) {
    setDocs((prev) => ({ ...prev, [modAtiva]: updater(prev[modAtiva] ?? novoDoc()) }))
  }
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
      const pid = selPage ?? doc.pages[0]?.id; if (!pid) { toast.error('Selecione uma página primeiro.'); return }
      setDoc((d) => ({ ...d, pages: d.pages.map((p) => p.id === pid ? { ...p, blocks: [novo, ...p.blocks] } : p) }))
      setSelBlock(novo.id); setSelPage(pid); setAba('bloco')
      toast.info('Imagem de fundo adicionada — envie a imagem no inspetor à direita.')
      return
    }
    // alvo: container selecionado > região ativa
    const sel = blocoSel
    if (sel && (sel.type === 'card' || sel.type === 'coluna' || sel.type === 'repeticao')) { mutarTudo((bs) => tree.insertInto(bs, sel.id, novo)); setSelBlock(novo.id); return }
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
    aoLado: (id) => { mutarTudo((bs) => tree.wrapAoLado(bs, id)) },
    setCols: (id, n) => mutarTudo((bs) => tree.setNumColunas(bs, id, n)),
    setOver,
    dragStart: (e, id) => { e.stopPropagation(); setArrastando(true); e.dataTransfer.setData('text/plain', `mover:${id}`); e.dataTransfer.effectAllowed = 'move' },
    drop: aoSoltar,
  }

  function patchBlock(blockId: string, patch: Record<string, unknown>) { mutarTudo((bs) => tree.updateAttrs(bs, blockId, patch)) }
  function addPage(kind: PageKind) { setDoc((d) => ({ ...d, pages: [...d.pages, { id: genId('page'), kind, titulo: `Página ${d.pages.length + 1}`, blocks: [] }] })) }
  function removePage(pageId: string) { setDoc((d) => d.pages.length <= 1 ? d : ({ ...d, pages: d.pages.filter((p) => p.id !== pageId) })) }

  // modalidades
  function addModalidade() { const nm = prompt('Nome da modalidade (ex.: Gabarito Discursivo):')?.trim(); if (!nm) return; const m = { id: genId('mod'), nome: nm }; setModalidades((ms) => [...ms, m]); setDocs((d) => ({ ...d, [m.id]: novoDoc() })); setModAtiva(m.id) }
  function renameModalidade(id: string) { const atual = modalidades.find((m) => m.id === id)?.nome ?? ''; const nm = prompt('Renomear modalidade:', atual)?.trim(); if (!nm) return; setModalidades((ms) => ms.map((m) => m.id === id ? { ...m, nome: nm } : m)) }
  function removeModalidade(id: string) { if (modalidades.length <= 1) { toast.error('Mantenha ao menos uma modalidade.'); return } if (!confirm('Excluir esta modalidade e seu documento?')) return; setModalidades((ms) => ms.filter((m) => m.id !== id)); setDocs((d) => { const cp = { ...d }; delete cp[id]; return cp }); setModAtiva((cur) => cur === id ? modalidades.filter((m) => m.id !== id)[0].id : cur) }

  function salvar() {
    start(async () => {
      const r = await salvarCadernoDesignerV2(cadernoId, { docsV2: docs, modalidadesV2: modalidades, cores, bancoId })
      r.ok ? toast.success('Caderno salvo') : toast.error(r.error ?? 'Erro ao salvar')
    })
  }
  function vincularBanco(novoId: string | null) {
    setBancoId(novoId)
    start(async () => {
      const r = await salvarCadernoDesignerV2(cadernoId, { docsV2: docs, modalidadesV2: modalidades, cores, bancoId: novoId })
      if (r.ok) window.location.reload() // refaz o preview com os dados do banco
      else toast.error(r.error ?? 'Erro ao vincular banco')
    })
  }

  // ---- faixa cabeçalho/rodapé (zona editável) ----
  function FaixaRegiao({ reg, blocks }: { reg: 'cabecalho' | 'rodape'; blocks: Block[] }) {
    const ativa = regiao === reg
    const overReg = overId === `regiao:${reg}`
    return (
      <div onClick={() => { setRegiao(reg); setSelBlock(null) }}
        onDragOver={(e) => { e.preventDefault(); setOver(`regiao:${reg}`) }}
        onDrop={(e) => ctx.drop(e, { kind: 'regiao', regiao: reg })}
        style={{ width: SHEET_W * ZOOM }}
        className={cn('rounded-md border border-dashed bg-white/70 p-2 transition-colors', overReg ? 'border-primary ring-2 ring-primary/40' : ativa ? 'border-primary ring-1 ring-primary/30' : 'border-slate-300')}>
        <p className="mb-1 flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {reg === 'cabecalho' ? <PanelTop className="h-3 w-3" /> : <PanelBottom className="h-3 w-3" />} {reg === 'cabecalho' ? 'Cabeçalho' : 'Rodapé'}
        </p>
        <div style={{ transform: `scale(${ZOOM})`, transformOrigin: 'top left', width: SHEET_W - PAD_H * 2 }}>
          <div className="flex flex-col">
            {blocks.length === 0 ? <p className="text-xs text-slate-400">Clique aqui e adicione blocos à esquerda.</p> : <ListaBlocos blocks={blocks} ctx={ctx} />}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col" onDragEnd={() => { setArrastando(false); setOver(null) }}>
      {/* Topo */}
      <div className="flex items-center justify-between gap-3 border-b pb-3">
        <div className="flex items-center gap-3">
          <Link href="/admin/cadernos" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><ChevronLeft className="h-5 w-5" /></Link>
          <div>
            <h1 className="text-lg font-bold leading-tight">{nome}</h1>
            <p className="text-xs text-muted-foreground">Editor de blocos · {modalidades.length} modalidade(s)</p>
          </div>
          {/* Vínculo com banco: alimenta as variáveis com os dados reais daquele banco */}
          <label className="ml-3 flex items-center gap-1.5 rounded-lg border bg-muted/40 px-2.5 py-1.5 text-xs">
            <Database className="h-3.5 w-3.5 text-primary" />
            <span className="text-muted-foreground">Banco:</span>
            <select value={bancoId ?? ''} onChange={(e) => vincularBanco(e.target.value || null)} className="bg-transparent text-sm font-medium outline-none">
              <option value="">Nenhum (exemplo)</option>
              {bancos.map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}
            </select>
          </label>
        </div>
        <div className="flex items-center gap-2">
          {registros.length > 0 && (
            <div className="flex items-center gap-1 rounded-lg border bg-muted/40 px-1.5 py-1 text-xs">
              <Users className="ml-0.5 h-3.5 w-3.5 text-primary" />
              <button onClick={() => setRegIndex((i) => Math.max(0, i - 1))} disabled={regIndex === 0} className="rounded p-0.5 hover:bg-muted disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button>
              <span className="min-w-[110px] truncate text-center font-medium" title={regAtual?.nome}>{regAtual?.nome}</span>
              <span className="text-muted-foreground">{regIndex + 1}/{registros.length}</span>
              <button onClick={() => setRegIndex((i) => Math.min(registros.length - 1, i + 1))} disabled={regIndex >= registros.length - 1} className="rounded p-0.5 hover:bg-muted disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
            </div>
          )}
          <a href={`/imprimir/caderno/${cadernoId}?mod=${modAtiva}${regAtual ? `&aluno=${regAtual.id}` : ''}`} target="_blank" rel="noreferrer">
            <Button variant="outline" size="sm"><Printer className="mr-1.5 h-4 w-4" /> Imprimir/PDF</Button>
          </a>
          {registros.length > 0 && (
            <a href={`/imprimir/caderno/${cadernoId}?mod=${modAtiva}&todos=1`} target="_blank" rel="noreferrer">
              <Button variant="outline" size="sm"><Users className="mr-1.5 h-4 w-4" /> Mala direta ({registros.length})</Button>
            </a>
          )}
          <Button onClick={salvar} disabled={pending} size="sm">
            {pending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />} Salvar
          </Button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[188px_1fr_236px]">
        {/* Esquerda */}
        <div className="scroll-claro flex min-h-0 flex-col gap-4 overflow-y-auto border-r bg-muted/20 p-2.5">
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Modalidade</p>
            <select value={modAtiva} onChange={(e) => { setModAtiva(e.target.value); setSelBlock(null) }} className="w-full rounded-lg border bg-background px-2.5 py-2 text-sm shadow-sm">
              {modalidades.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
            </select>
            <div className="mt-1.5 flex gap-2 text-[11px]">
              <button onClick={addModalidade} className="text-primary hover:underline">+ Nova</button>
              <button onClick={() => renameModalidade(modAtiva)} className="text-muted-foreground hover:underline">Renomear</button>
              <button onClick={() => removeModalidade(modAtiva)} className="text-destructive hover:underline">Excluir</button>
            </div>
          </div>

          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Adicionar bloco</p>
            <div className="space-y-3">
              {(['conteudo', 'avaliacao', 'identificacao', 'estrutura'] as const).map((cat) => (
                <div key={cat}>
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">{CAT_NOMES[cat]}</p>
                  <div className="flex flex-col gap-1.5">
                    {cats[cat].map((b) => {
                      const Icon = b.icon
                      const dis = b.unico && tiposUsados.has(b.type)
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
            {running.cabecalhoAtivo && <FaixaRegiao reg="cabecalho" blocks={doc.cabecalho ?? []} />}

            {doc.pages.map((page, pi) => {
              const bg = page.blocks.find((b) => b.type === 'plano-fundo')
              const conteudo = page.blocks.filter((b) => b.type !== 'plano-fundo')
              return (
                <div key={page.id} className="group/p relative">
                  <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground" style={{ width: SHEET_W * ZOOM }}>
                    <span className="font-medium">{page.titulo} · {PAGE_KINDS.find((k) => k.id === page.kind)?.nome}{running.mostrarNumeroPagina ? ` · pág. ${pi + 1}` : ''}</span>
                    <button onClick={() => removePage(page.id)} className="opacity-0 transition-opacity hover:text-destructive group-hover/p:opacity-100"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                  <div style={{ width: SHEET_W * ZOOM, height: SHEET_H * ZOOM }} className="relative">
                    <div onClick={() => { setSelPage(page.id); setSelBlock(null); setRegiao('pagina') }}
                      onDragOver={(e) => { e.preventDefault(); setOver(page.id) }}
                      onDrop={(e) => ctx.drop(e, { kind: 'page', pageId: page.id })}
                      style={{ width: SHEET_W, height: SHEET_H, padding: `${PAD_V}px ${PAD_H}px`, transform: `scale(${ZOOM})`, transformOrigin: 'top left', background: theme.cores.fundo, boxShadow: '0 2px 16px rgba(0,0,0,.13)',
                        ...(overId === page.id ? { outline: `2.5px solid ${REALCE}`, outlineOffset: -2 } : arrastando ? { outline: `1.5px solid ${REALCE}`, outlineOffset: -2 } : {}) }}
                      className={cn('relative overflow-hidden', !arrastando && selPage === page.id && regiao === 'pagina' && 'ring-2 ring-primary/40')}>
                      {/* camada de fundo full-bleed (com placeholder quando sem imagem) */}
                      {bg && (() => {
                        const ba = bg.attributes as any
                        const sel = selBlock === bg.id
                        return (
                          <div onClick={(e) => { e.stopPropagation(); setSelBlock(bg.id); setAba('bloco') }}
                            style={{ position: 'absolute', inset: 0, cursor: 'pointer', outline: sel ? `3px solid ${theme.cores.primaria}` : 'none',
                              ...(ba.url ? { backgroundImage: `url(${ba.url})`, backgroundSize: 'cover', backgroundPosition: 'center', opacity: (ba.opacidade ?? 100) / 100 } : {}) }}>
                            {!ba.url && (
                              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, border: `2px dashed ${sel ? theme.cores.primaria : '#cbd5e1'}`, background: 'rgba(148,163,184,0.07)' }}>
                                <Wallpaper className="h-9 w-9 text-slate-400" />
                                <span style={{ fontSize: 17, color: '#94a3b8', fontWeight: 600 }}>Imagem de fundo</span>
                                <span style={{ fontSize: 13, color: '#94a3b8' }}>Clique aqui e envie a imagem no inspetor (aba “Bloco”)</span>
                              </div>
                            )}
                          </div>
                        )
                      })()}
                      <AutoAnim ativo={!arrastando} className="relative flex flex-col">
                        {conteudo.length === 0 && !bg && (
                          <div className={cn('flex h-[200px] items-center justify-center rounded-lg border-2 border-dashed text-sm transition-colors', arrastando ? 'border-primary/50 bg-primary/5 text-primary' : 'text-slate-400')}>{arrastando ? 'Solte o bloco aqui' : 'Arraste um bloco ou clique para começar'}</div>
                        )}
                        <ListaBlocos blocks={conteudo} ctx={ctx} />
                      </AutoAnim>
                    </div>
                  </div>
                </div>
              )
            })}

            {running.rodapeAtivo && <FaixaRegiao reg="rodape" blocks={doc.rodape ?? []} />}

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
                <BlockInspector block={blocoSel} onChange={(patch) => patchBlock(blocoSel.id, patch)} />
              </div>
            ) : <p className="text-sm text-muted-foreground">Selecione um bloco no canvas para editar suas opções.</p>)}

            {aba === 'tema' && (
              <div className="space-y-3">
                <p className="text-sm font-semibold">Cores do caderno</p>
                {([['primaria', 'Primária'], ['secundaria', 'Secundária'], ['acento', 'Acento'], ['texto', 'Texto'], ['fundo', 'Fundo']] as const).map(([k, label]) => (
                  <label key={k} className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-muted-foreground">{label}</span>
                    <input type="color" value={cores[k] ?? theme.cores[k]} onChange={(e) => setCores((c) => ({ ...c, [k]: e.target.value }))} className="h-8 w-12 cursor-pointer rounded border" />
                  </label>
                ))}
                <button onClick={() => setCores({})} className="text-xs text-muted-foreground hover:underline">Restaurar padrão</button>
              </div>
            )}

            {aba === 'pagina' && (
              <div className="space-y-3">
                <p className="text-sm font-semibold">Páginas ({doc.pages.length})</p>
                {doc.pages.map((p) => (
                  <div key={p.id} className={cn('rounded-md border bg-background p-2', selPage === p.id && 'border-primary')}>
                    <input value={p.titulo ?? ''} onChange={(e) => setDoc((d) => ({ ...d, pages: d.pages.map((x) => x.id === p.id ? { ...x, titulo: e.target.value } : x) }))} className="w-full bg-transparent text-sm font-medium outline-none" />
                    <select value={p.kind} onChange={(e) => setDoc((d) => ({ ...d, pages: d.pages.map((x) => x.id === p.id ? { ...x, kind: e.target.value as PageKind } : x) }))} className="mt-1 w-full rounded border bg-background px-1.5 py-1 text-xs">
                      {PAGE_KINDS.map((k) => <option key={k.id} value={k.id}>{k.nome}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            )}

            {aba === 'layout' && (
              <div className="space-y-4">
                <p className="text-sm font-semibold">Cabeçalho e rodapé</p>
                <label className="flex items-center justify-between gap-2 text-sm"><span className="flex items-center gap-1.5"><PanelTop className="h-4 w-4" /> Cabeçalho</span>
                  <input type="checkbox" checked={running.cabecalhoAtivo} onChange={(e) => setDoc((d) => ({ ...d, running: { ...(d.running ?? RUNNING_PADRAO), cabecalhoAtivo: e.target.checked } }))} /></label>
                <label className="flex items-center justify-between gap-2 text-sm"><span className="flex items-center gap-1.5"><PanelBottom className="h-4 w-4" /> Rodapé</span>
                  <input type="checkbox" checked={running.rodapeAtivo} onChange={(e) => setDoc((d) => ({ ...d, running: { ...(d.running ?? RUNNING_PADRAO), rodapeAtivo: e.target.checked } }))} /></label>
                <label className="flex items-center justify-between gap-2 text-sm"><span>Mostrar número de página</span>
                  <input type="checkbox" checked={running.mostrarNumeroPagina} onChange={(e) => setDoc((d) => ({ ...d, running: { ...(d.running ?? RUNNING_PADRAO), mostrarNumeroPagina: e.target.checked } }))} /></label>
                <p className="rounded bg-blue-50 px-2 py-1.5 text-xs text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">Ative a faixa, clique nela no canvas e adicione blocos (logo, texto, imagem…). Aparecem em todas as páginas na impressão.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
