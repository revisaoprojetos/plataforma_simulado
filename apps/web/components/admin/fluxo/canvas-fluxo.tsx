'use client'

// CANVAS GENÉRICO (React Flow / @xyflow/react). Converte DiagramaFluxo (posição px vinda de `mesclar`) em nodes/edges.
// Modo VER: nós fixos. Modo CONSTRUIR: arrastar nós (salva posição), conectar entre handles, Delete remove, soltar da paleta cria nó,
// duplo clique edita, menu de contexto (botão direito) e "Conectar a…". Cores só por tokens (CSS vars do tema).
import '@xyflow/react/dist/style.css'
import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { Background, BackgroundVariant, Controls, Handle, MarkerType, MiniMap, Panel, Position, ReactFlow, ReactFlowProvider, useEdgesState, useNodesState, useReactFlow, type Connection, type Edge, type Node, type NodeProps } from '@xyflow/react'
import { AlertTriangle, Ban, Box, CheckCircle2, Copy, EyeOff, Filter, GitBranch, HelpCircle, Link2, Maximize2, Pencil, Play, Plus, StickyNote, Trash2, User, X, Zap, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DiagramaFluxo, NoFluxo, TipoNo } from '@/lib/admin/fluxo/adaptador'
import { posicaoBase } from '@/lib/admin/fluxo/overlay'
import { ESTILO_NO, GEO, ROTULO_NO } from './estilo-no'

interface DadosNo extends Record<string, unknown> { no: NoFluxo; ativo: boolean; forte: boolean; apagado: boolean; editavel: boolean; construir: boolean; resumo?: string; problema?: 'erro' | 'aviso' }
type NoRF = Node<DadosNo, 'fluxo'>

const oculto = { opacity: 0, width: 1, height: 1, border: 'none', background: 'transparent' } as const
const visivel = { width: 12, height: 12, background: 'var(--primary)', border: '2px solid var(--background)' } as const
const alca = (construir: boolean) => (construir ? visivel : oculto)
const ICONE_NO: Record<TipoNo, LucideIcon> = { inicio: Play, etapa: Box, decisao: GitBranch, resultado: CheckCircle2, rejeicao: Ban, aberto: HelpCircle, condicao: Filter, acao: Zap, aviso: AlertTriangle, nota: StickyNote }
const FORMA_ARREDONDADA: ReadonlySet<TipoNo> = new Set<TipoNo>(['decisao', 'condicao'])

const NoCustom = memo(function NoCustom({ data }: NodeProps<NoRF>) {
  const { no, ativo, forte, apagado, editavel, construir, resumo, problema } = data
  const Ic = ICONE_NO[no.tipo]
  return (
    <div
      className={cn('relative flex flex-col justify-center gap-1 border-2 px-3 py-2 text-left text-[13px] shadow-sm transition-all duration-150 hover:shadow-md', FORMA_ARREDONDADA.has(no.tipo) ? 'rounded-3xl' : 'rounded-lg', ESTILO_NO[no.tipo],
        construir && 'cursor-grab active:cursor-grabbing',
        forte && 'ring-2 ring-primary ring-offset-2 ring-offset-background', apagado && 'opacity-60', ativo && 'outline outline-2 outline-offset-2 outline-foreground',
        problema === 'erro' && 'ring-2 ring-destructive ring-offset-2 ring-offset-background', problema === 'aviso' && 'ring-2 ring-amber-500 ring-offset-2 ring-offset-background')}
      style={{ width: GEO.W, height: GEO.H }} title={no.titulo}>
      <Handle id="tl" type="target" position={Position.Left} style={alca(construir)} isConnectable={construir} />
      <Handle id="tt" type="target" position={Position.Top} style={alca(construir)} isConnectable={construir} />
      <Handle id="tb" type="target" position={Position.Bottom} style={oculto} isConnectable={false} />
      <span className="flex items-start gap-1.5"><Ic className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden /><span className="line-clamp-2 font-semibold leading-snug">{no.titulo}</span></span>
      {no.valor && <span className="line-clamp-2 w-fit max-w-full rounded bg-background/80 px-1.5 py-0.5 text-[11px] font-bold leading-tight text-foreground">{no.valor}</span>}
      {resumo && <span className="line-clamp-2 w-fit max-w-full rounded bg-background/80 px-1.5 py-0.5 text-[11px] leading-tight text-foreground">{resumo}</span>}
      {editavel && <Pencil className="absolute right-2 top-2 h-3 w-3 opacity-60" aria-label="Editável" />}
      {no.origem === 'usuario' && <User className="absolute bottom-1 right-1.5 h-3 w-3 opacity-60" aria-label="Criado por você" />}
      <Handle id="sr" type="source" position={Position.Right} style={alca(construir)} isConnectable={construir} />
      <Handle id="sb" type="source" position={Position.Bottom} style={alca(construir)} isConnectable={construir} />
      <Handle id="st" type="source" position={Position.Top} style={oculto} isConnectable={false} />
    </div>
  )
})
const NODE_TYPES = { fluxo: NoCustom }

function BotaoAjustar() {
  const rf = useReactFlow()
  return (
    <Panel position="top-right">
      <button type="button" onClick={() => rf.fitView({ padding: 0.12, duration: 250 })} className="inline-flex h-8 items-center gap-1.5 rounded-md border bg-card px-2.5 text-xs font-medium text-foreground shadow-sm hover:bg-muted">
        <Maximize2 className="h-3.5 w-3.5" />Ajustar à tela
      </button>
    </Panel>
  )
}

const COR_MINIMAPA: Record<string, string> = { inicio: 'var(--primary)', decisao: 'var(--primary)', condicao: 'var(--primary)', resultado: 'var(--muted-foreground)', rejeicao: 'var(--destructive)', aberto: 'var(--muted-foreground)', etapa: 'var(--border)' }
export const TIPO_DRAG = 'application/x-fluxo-no'

export interface CanvasFluxoProps {
  diagrama: DiagramaFluxo
  sel: string | null
  onSel: (id: string | null) => void
  selAresta?: string | null
  onSelAresta?: (id: string | null) => void
  marcados: ReadonlySet<string>
  /** ids dos nós com campo editável (ícone de lápis). */
  editaveis: ReadonlySet<string>
  construir?: boolean
  resumos?: Readonly<Record<string, string>>
  /** nó → severidade do problema de validação (anel colorido). */
  problemas?: Readonly<Record<string, 'erro' | 'aviso'>>
  onMover?: (id: string, x: number, y: number) => void
  onConectar?: (de: string, para: string) => void
  onRemover?: (nos: string[], arestas: string[]) => void
  onSoltar?: (tipo: TipoNo, x: number, y: number) => void
  /** tipos oferecidos no menu de contexto do fundo. */
  tiposNo?: readonly TipoNo[]
  /** duplo clique / "Editar" no menu: foca o título no painel. */
  onEditarNo?: (id: string) => void
  onDuplicarNo?: (id: string) => void
  /** centraliza o nó (id); `n` muda a cada pedido. */
  foco?: { id: string; n: number } | null
  /** muda quando o espaço do canvas muda (painel recolhido): reenquadra. */
  refitKey?: string
}

type Menu = { x: number; y: number; kind: 'no' | 'aresta' | 'painel'; id?: string; fx?: number; fy?: number }
const itemMenu = 'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted'

const px = (n: NoFluxo) => (n.x != null && n.y != null ? { x: n.x, y: n.y } : posicaoBase(n))

function Interno({ diagrama, sel, onSel, selAresta, onSelAresta, marcados, editaveis, construir = false, resumos, problemas, onMover, onConectar, onRemover, onSoltar, tiposNo, onEditarNo, onDuplicarNo, foco, refitKey }: CanvasFluxoProps) {
  const rf = useReactFlow()
  const [menu, setMenu] = useState<Menu | null>(null)
  const [conectando, setConectando] = useState<string | null>(null)
  // enquadra ao abrir/trocar de diagrama (o pai remonta por `key`) e quando o espaço do canvas muda
  useEffect(() => { const t = setTimeout(() => rf.fitView({ padding: 0.12, duration: 200 }), 80); return () => clearTimeout(t) }, [rf, refitKey])
  useEffect(() => {
    if (!foco) return
    const t = setTimeout(() => rf.fitView({ nodes: [{ id: foco.id }], padding: 0.6, maxZoom: 1.1, duration: 300 }), 140)
    return () => clearTimeout(t)
  }, [rf, foco])
  useEffect(() => {
    const fechar = () => setMenu(null)
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') { setMenu(null); setConectando(null) } }
    window.addEventListener('click', fechar); window.addEventListener('keydown', tecla)
    return () => { window.removeEventListener('click', fechar); window.removeEventListener('keydown', tecla) }
  }, [])
  useEffect(() => { if (!construir) { setMenu(null); setConectando(null) } }, [construir])

  const temCaminho = marcados.size > 0
  const nodesProp = useMemo<NoRF[]>(() => diagrama.nos.map((n) => ({
    id: n.id, type: 'fluxo', position: px(n), width: GEO.W, height: GEO.H, draggable: construir, connectable: construir, selected: sel === n.id,
    data: { no: n, ativo: sel === n.id, forte: marcados.has(n.id), apagado: temCaminho && !marcados.has(n.id), editavel: editaveis.has(n.id), construir, resumo: resumos?.[n.id], problema: problemas?.[n.id] },
  })), [diagrama, sel, marcados, temCaminho, editaveis, construir, resumos, problemas])
  const edgesProp = useMemo<Edge[]>(() => {
    const porId = new Map(diagrama.nos.map((n) => [n.id, n]))
    return diagrama.arestas.flatMap((e, k) => {
      const a = porId.get(e.de), b = porId.get(e.para)
      if (!a || !b) return []
      const pa = px(a), pb = px(b)
      const forte = marcados.has(e.de) && marcados.has(e.para)
      const frente = pb.x >= pa.x + GEO.W * 0.9, baixo = pb.y >= pa.y
      const cor = e.id && e.id === selAresta ? 'var(--foreground)' : forte ? 'var(--primary)' : 'var(--muted-foreground)'
      return [{
        id: e.id ?? `${e.de}>${e.para}#${k}`, source: e.de, target: e.para, type: 'smoothstep',
        sourceHandle: frente ? 'sr' : baixo ? 'sb' : 'st', targetHandle: frente ? 'tl' : baixo ? 'tt' : 'tb',
        label: e.rotulo, animated: forte, selected: !!e.id && e.id === selAresta,
        style: { stroke: cor, strokeWidth: forte || (e.id && e.id === selAresta) ? 2.5 : 1.5, opacity: temCaminho && !forte ? 0.4 : 1, strokeDasharray: e.origem === 'usuario' ? '6 3' : undefined },
        markerEnd: { type: MarkerType.ArrowClosed, color: cor, width: 18, height: 18 },
        labelStyle: { fill: 'var(--foreground)', fontSize: 10, fontWeight: 600 },
        labelBgStyle: { fill: 'var(--card)', fillOpacity: 0.9 }, labelBgPadding: [4, 2] as [number, number], labelBgBorderRadius: 4,
      } satisfies Edge]
    })
  }, [diagrama, marcados, temCaminho, selAresta])

  // estado local de nodes/edges (necessário p/ o arraste fluir no modo controlado); ressincroniza quando o dado muda.
  const [nodes, setNodes, onNodesChange] = useNodesState<NoRF>(nodesProp)
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(edgesProp)
  useEffect(() => setNodes(nodesProp), [nodesProp, setNodes])
  useEffect(() => setEdges(edgesProp), [edgesProp, setEdges])

  const valido = useCallback((c: Connection | Edge) => !!c.source && !!c.target && c.source !== c.target && !diagrama.arestas.some((a) => a.de === c.source && a.para === c.target), [diagrama])
  const tema = {
    '--xy-background-color': 'transparent', '--xy-controls-button-background-color': 'var(--card)', '--xy-controls-button-background-color-hover': 'var(--muted)', '--xy-controls-button-color': 'var(--foreground)',
    '--xy-controls-button-border-color': 'var(--border)', '--xy-minimap-background-color': 'var(--card)', '--xy-attribution-background-color': 'transparent', '--xy-node-border-radius': '8px',
  } as React.CSSProperties
  return (
    <>
      <ReactFlow<NoRF, Edge>
        nodes={nodes} edges={edges} nodeTypes={NODE_TYPES} style={tema} className="bg-muted/20"
        onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
        nodesDraggable={construir} nodesConnectable={construir} elementsSelectable edgesFocusable={construir} snapToGrid={construir} snapGrid={[8, 8]}
        deleteKeyCode={construir ? ['Delete', 'Backspace'] : null} isValidConnection={valido}
        onNodeClick={(_, n) => {
          if (conectando) { if (conectando !== n.id) onConectar?.(conectando, n.id); setConectando(null); return }
          onSel(n.id); onSelAresta?.(null)
        }}
        onNodeDoubleClick={(_, n) => { if (construir) { onSel(n.id); onEditarNo?.(n.id) } }}
        onNodeContextMenu={(ev, n) => { if (!construir) return; ev.preventDefault(); onSel(n.id); setMenu({ x: ev.clientX, y: ev.clientY, kind: 'no', id: n.id }) }}
        onEdgeContextMenu={(ev, e) => { if (!construir) return; ev.preventDefault(); onSelAresta?.(e.id); setMenu({ x: ev.clientX, y: ev.clientY, kind: 'aresta', id: e.id }) }}
        onPaneContextMenu={(ev) => {
          if (!construir) return
          const e = ev as unknown as MouseEvent
          e.preventDefault()
          const p = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY })
          setMenu({ x: e.clientX, y: e.clientY, kind: 'painel', fx: p.x - GEO.W / 2, fy: p.y - GEO.H / 2 })
        }}
        onEdgeClick={(_, e) => { onSelAresta?.(e.id); onSel(null) }} onPaneClick={() => { onSel(null); onSelAresta?.(null); setConectando(null) }}
        onNodeDragStop={(_, n) => onMover?.(n.id, n.position.x, n.position.y)}
        onConnect={(c) => { if (c.source && c.target) onConectar?.(c.source, c.target) }}
        onNodesDelete={(ns) => onRemover?.(ns.map((n) => n.id), [])} onEdgesDelete={(es) => onRemover?.([], es.map((e) => e.id))}
        onDragOver={(ev) => { if (construir) { ev.preventDefault(); ev.dataTransfer.dropEffect = 'copy' } }}
        onDrop={(ev) => {
          const t = ev.dataTransfer.getData(TIPO_DRAG)
          if (!construir || !t) return
          ev.preventDefault()
          const p = rf.screenToFlowPosition({ x: ev.clientX, y: ev.clientY })
          onSoltar?.(t as TipoNo, p.x - GEO.W / 2, p.y - GEO.H / 2)
        }}
        fitView fitViewOptions={{ padding: 0.12 }} minZoom={0.15} maxZoom={1.8} proOptions={{ hideAttribution: false }}>
        <Background variant={BackgroundVariant.Lines} gap={28} lineWidth={0.5} color="color-mix(in oklab, var(--border) 55%, transparent)" />
        <Controls showInteractive={false} position="bottom-left" />
        <MiniMap pannable zoomable position="bottom-right" style={{ width: 130, height: 84, opacity: 0.85 }} nodeColor={(n) => COR_MINIMAPA[(n.data as DadosNo).no.tipo] ?? 'var(--border)'} nodeStrokeWidth={0} maskColor="color-mix(in oklab, var(--background) 70%, transparent)" />
        <BotaoAjustar />
        {conectando && (
          <Panel position="top-center">
            <span className="inline-flex items-center gap-2 rounded-md border bg-card px-3 py-1.5 text-xs font-medium shadow-sm"><Link2 className="h-3.5 w-3.5" />Clique no nó de destino (Esc cancela)
              <button type="button" onClick={() => setConectando(null)} className="rounded p-0.5 hover:bg-muted" aria-label="Cancelar conexão"><X className="h-3.5 w-3.5" /></button></span>
          </Panel>
        )}
      </ReactFlow>
      {menu && construir && (
        <div role="menu" className="fixed z-50 w-48 rounded-lg border bg-popover p-1 text-popover-foreground shadow-md" style={{ left: Math.min(menu.x, (typeof window !== 'undefined' ? window.innerWidth : 9999) - 200), top: menu.y }} onClick={(e) => e.stopPropagation()}>
          {menu.kind === 'no' && menu.id && (() => {
            const id = menu.id, eBase = diagrama.nos.find((n) => n.id === id)?.origem !== 'usuario'
            return (
              <>
                <button type="button" role="menuitem" className={itemMenu} onClick={() => { onEditarNo?.(id); setMenu(null) }}><Pencil className="h-3.5 w-3.5" />Editar</button>
                <button type="button" role="menuitem" className={itemMenu} onClick={() => { onDuplicarNo?.(id); setMenu(null) }}><Copy className="h-3.5 w-3.5" />Duplicar</button>
                <button type="button" role="menuitem" className={itemMenu} onClick={() => { setConectando(id); setMenu(null) }}><Link2 className="h-3.5 w-3.5" />Conectar a…</button>
                <button type="button" role="menuitem" className={cn(itemMenu, 'text-destructive')} onClick={() => { onRemover?.([id], []); setMenu(null) }}>{eBase ? <EyeOff className="h-3.5 w-3.5" /> : <Trash2 className="h-3.5 w-3.5" />}{eBase ? 'Ocultar' : 'Excluir'}</button>
              </>
            )
          })()}
          {menu.kind === 'aresta' && menu.id && (() => {
            const id = menu.id, eBase = diagrama.arestas.find((a) => a.id === id)?.origem !== 'usuario'
            return (
              <>
                <button type="button" role="menuitem" className={itemMenu} onClick={() => { onSelAresta?.(id); setMenu(null) }}><Pencil className="h-3.5 w-3.5" />Editar rótulo</button>
                <button type="button" role="menuitem" className={cn(itemMenu, 'text-destructive')} onClick={() => { onRemover?.([], [id]); setMenu(null) }}>{eBase ? <EyeOff className="h-3.5 w-3.5" /> : <Trash2 className="h-3.5 w-3.5" />}{eBase ? 'Ocultar conexão' : 'Excluir conexão'}</button>
              </>
            )
          })()}
          {menu.kind === 'painel' && (
            <>
              <p className="px-2 py-1 text-[11px] font-semibold text-muted-foreground">Adicionar nó aqui</p>
              {(tiposNo ?? []).map((t) => <button key={t} type="button" role="menuitem" className={itemMenu} onClick={() => { onSoltar?.(t, menu.fx ?? 0, menu.fy ?? 0); setMenu(null) }}><Plus className="h-3.5 w-3.5" />{ROTULO_NO[t]}</button>)}
            </>
          )}
        </div>
      )}
    </>
  )
}

/** Um canvas por diagrama (o pai usa `key={diagrama.id}` para reenquadrar ao trocar de diagrama). Ocupa toda a altura do contêiner. */
export default function CanvasFluxo(props: CanvasFluxoProps) {
  return (
    <div className="h-full min-h-[420px] w-full overflow-hidden rounded-xl border bg-background" data-testid="canvas-fluxo">
      <ReactFlowProvider><Interno {...props} /></ReactFlowProvider>
    </div>
  )
}
