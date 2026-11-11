'use client'

// ÚNICO DndContext do editor: paleta (P2: useDraggable `paleta:<tipo>[:<variacao>]`, data {origem:'paleta',tipo,variacao?}) e blocos do canvas
// (useSortable). Soltar item da paleta = adicionar na posição indicada; reordenar blocos = mover. Mouse, touch e teclado.
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type CollisionDetection, type DragEndEvent, type DragMoveEvent, type DragStartEvent } from '@dnd-kit/core'
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { GripVertical } from 'lucide-react'
import { CATALOGO } from '@/lib/produtos/pagina/catalogo'
import type { TipoElemento } from '@/lib/produtos/pagina/tipos'
import { useEditor } from './store'

export const ID_CANVAS_VAZIO = 'canvas-vazio'
/** `apos`: undefined = sem arrasto da paleta; null = no início; string = após esse bloco. */
const DropCtx = createContext<{ ativo: boolean; apos: string | null | undefined }>({ ativo: false, apos: undefined })
export const useDropPaleta = () => useContext(DropCtx)

interface Origem { origem: 'paleta'; tipo: TipoElemento; variacao?: string }
const dadosPaleta = (d: unknown): Origem | null => (d && (d as Origem).origem === 'paleta' && (d as Origem).tipo in CATALOGO ? (d as Origem) : null)

// Item da paleta só "acerta" o canvas quando o ponteiro está sobre ele (soltar na paleta/barra cancela).
const colisao: CollisionDetection = (args) => {
  if (dadosPaleta(args.active.data.current)) {
    const c = args.pointerCoordinates, r = document.querySelector('[data-canvas]')?.getBoundingClientRect()
    if (!c || !r || c.x < r.left || c.x > r.right || c.y < r.top || c.y > r.bottom) return []
  }
  return closestCenter(args)
}

export function DndArea({ children }: { children: ReactNode }) {
  const { blocos, mover, adicionar } = useEditor()
  const [ativo, setAtivo] = useState<{ id: string; paleta: Origem | null } | null>(null)
  const [apos, setApos] = useState<string | null | undefined>(undefined)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  const ids = useMemo(() => blocos.map((b) => b.id), [blocos])

  const posicao = (e: DragMoveEvent | DragEndEvent): string | null | undefined => {
    const over = e.over; if (!over) return undefined
    if (over.id === ID_CANVAS_VAZIO) return null
    const i = ids.indexOf(String(over.id)); if (i < 0) return undefined
    const t = e.active.rect.current.translated
    const abaixo = t ? t.top + t.height / 2 > over.rect.top + over.rect.height / 2 : true
    return abaixo ? ids[i] : (ids[i - 1] ?? null)
  }

  const inicio = (e: DragStartEvent) => setAtivo({ id: String(e.active.id), paleta: dadosPaleta(e.active.data.current) })
  const move = (e: DragMoveEvent) => setApos(dadosPaleta(e.active.data.current) ? posicao(e) : undefined)
  const fim = (e: DragEndEvent) => {
    const p = dadosPaleta(e.active.data.current)
    const destino = p ? posicao(e) : undefined
    setAtivo(null); setApos(undefined)
    if (p) { if (destino !== undefined) adicionar(p.tipo, destino, p.variacao); return }
    const { active, over } = e
    if (!over || active.id === over.id) return
    const de = ids.indexOf(String(active.id)), para = ids.indexOf(String(over.id))
    if (de < 0 || para < 0) return
    mover(String(active.id), arrayMove(ids, de, para).indexOf(String(active.id)))
  }
  const cancela = () => { setAtivo(null); setApos(undefined) }

  const bloco = ativo && !ativo.paleta ? blocos.find((b) => b.id === ativo.id) : null
  const rotulo = ativo?.paleta ? CATALOGO[ativo.paleta.tipo].rotulo : bloco ? bloco.nome?.trim() || CATALOGO[bloco.tipo].rotulo : null

  return (
    <DndContext sensors={sensors} collisionDetection={colisao} onDragStart={inicio} onDragMove={move} onDragEnd={fim} onDragCancel={cancela}>
      <DropCtx.Provider value={{ ativo: !!ativo?.paleta, apos }}>{children}</DropCtx.Provider>
      <DragOverlay dropAnimation={null}>
        {rotulo && <div className="flex w-fit items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm font-medium shadow-lg"><GripVertical className="h-4 w-4 text-muted-foreground" />{rotulo}</div>}
      </DragOverlay>
    </DndContext>
  )
}
