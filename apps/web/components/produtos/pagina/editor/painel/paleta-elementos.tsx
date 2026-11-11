'use client'

// PALETA DE ELEMENTOS (coluna esquerda). Lista o CATALOGO com busca e agrupamento; clique adiciona; arrastar para o canvas também.
//
// CONTRATO DE DRAG (para o P1 tratar o drop no DndContext do canvas):
//   useDraggable({ id: `paleta:${tipo}`, data: { origem: "paleta", tipo, variacao? } })  // => active.data.current
//   Ou seja, em onDragEnd: `active.data.current?.origem === 'paleta'` → ed.adicionar(active.data.current.tipo, aposId, active.data.current.variacao).
//   Cada variação tem seu próprio draggable com id `paleta:<tipo>:<variacao>` e a mesma forma de data.
import { useMemo, useState } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { ChevronDown, GripVertical, Lock, Search } from 'lucide-react'
import { CATALOGO, TIPOS_ELEMENTO } from '@/lib/produtos/pagina/catalogo'
import type { ElementoDef } from '@/lib/produtos/pagina/registro'
import type { TipoElemento } from '@/lib/produtos/pagina/tipos'
import { useEditor } from '../store'
import { iconeDe } from './icones'
import { Miniatura } from './miniaturas'
import { cx } from './util'

export interface PayloadPaleta { origem: 'paleta'; tipo: TipoElemento; variacao?: string }

const GRUPOS: { cat: ElementoDef['categoria']; titulo: string }[] = [
  { cat: 'estrutura', titulo: 'Estrutura' }, { cat: 'conteudo', titulo: 'Conteúdo' }, { cat: 'midia', titulo: 'Mídia' }, { cat: 'acao', titulo: 'Engajamento' },
]

function Arrastavel({ id, payload, disabled, children, className }: { id: string; payload: PayloadPaleta; disabled?: boolean; children: React.ReactNode; className?: string }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id, data: payload, disabled })
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} className={cx(className, isDragging && 'opacity-40')} style={{ touchAction: 'none' }}>{children}</div>
  )
}

function Item({ def, motivoBloqueio, aberto, onAbrir, onAdicionar }: {
  def: ElementoDef; motivoBloqueio: string | null; aberto: boolean; onAbrir: () => void; onAdicionar: (tipo: TipoElemento, variacao?: string) => void
}) {
  const Icone = iconeDe(def.icone)
  const bloqueado = !!motivoBloqueio
  return (
    <div className={cx('rounded-xl border bg-card transition-colors', bloqueado ? 'opacity-60' : 'hover:border-primary/40')}>
      <Arrastavel id={`paleta:${def.tipo}`} payload={{ origem: 'paleta', tipo: def.tipo }} disabled={bloqueado} className="group flex items-start gap-2.5 p-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icone className="h-4.5 w-4.5" /></span>
        <button type="button" disabled={bloqueado} onClick={() => onAdicionar(def.tipo)} className="min-w-0 flex-1 text-left disabled:cursor-not-allowed" aria-label={`Adicionar ${def.rotulo}`}>
          <div className="flex items-center gap-1 text-sm font-semibold">{def.rotulo}{bloqueado && <Lock className="h-3 w-3 text-muted-foreground" />}</div>
          <div className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">{motivoBloqueio ?? def.descricao}</div>
        </button>
        {!bloqueado && <GripVertical className="mt-1 h-4 w-4 shrink-0 text-muted-foreground/60 group-hover:text-muted-foreground" aria-hidden />}
      </Arrastavel>
      {def.variacoes.length > 1 && (
        <>
          <button type="button" onClick={onAbrir} aria-expanded={aberto} className="flex w-full items-center justify-between border-t px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground">
            {def.variacoes.length} variações<ChevronDown className={cx('h-3.5 w-3.5 transition-transform', aberto && 'rotate-180')} />
          </button>
          {aberto && (
            <div className="grid grid-cols-2 gap-1.5 border-t p-2">
              {def.variacoes.map((v) => (
                <Arrastavel key={v.id} id={`paleta:${def.tipo}:${v.id}`} payload={{ origem: 'paleta', tipo: def.tipo, variacao: v.id }} disabled={bloqueado}
                  className="rounded-lg border bg-background p-1">
                  <button type="button" disabled={bloqueado} onClick={() => onAdicionar(def.tipo, v.id)} className="block w-full text-left disabled:cursor-not-allowed" aria-label={`Adicionar ${def.rotulo}: ${v.rotulo}`}>
                    <div className="rounded-md bg-muted/40 p-0.5"><Miniatura tipo={def.tipo} variacao={v.id} className="h-8 w-full" /></div>
                    <div className="mt-0.5 truncate px-0.5 text-[10px] text-muted-foreground">{v.rotulo}</div>
                  </button>
                </Arrastavel>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

export function PaletaElementos({ onAdicionar, temInstrutores = false }: { onAdicionar: (tipo: TipoElemento, variacao?: string) => void; temInstrutores?: boolean }) {
  const ed = useEditor()
  const [q, setQ] = useState('')
  const [aberto, setAberto] = useState<string | null>(null)
  const temInstr = temInstrutores || ed.dadosAmostra.instrutores.length > 0 || ed.blocos.some((b) => b.tipo === 'instrutores')

  const grupos = useMemo(() => {
    const t = q.trim().toLowerCase()
    return GRUPOS.map((g) => ({
      ...g,
      itens: TIPOS_ELEMENTO.map((k) => CATALOGO[k] as ElementoDef).filter((d) => d.categoria === g.cat && (!t || `${d.rotulo} ${d.descricao}`.toLowerCase().includes(t))),
    })).filter((g) => g.itens.length)
  }, [q])

  const motivo = (d: ElementoDef): string | null => {
    if (d.podeAdicionar({ blocos: ed.blocos, temInstrutores: temInstr })) return null
    if (d.unico && ed.blocos.some((b) => b.tipo === d.tipo)) return 'Já está na página (elemento único).'
    if (d.tipo === 'instrutores') return 'Cadastre instrutores no produto para usar.'
    return 'Indisponível no momento.'
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b px-4 py-3">
        <div className="text-sm font-semibold">Elementos</div>
        <div className="mb-2 text-[11px] text-muted-foreground">Clique ou arraste para a página.</div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar elemento…" aria-label="Buscar elemento"
            className="h-9 w-full rounded-lg border bg-background pl-8 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/30" />
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
        {grupos.length === 0 && <p className="py-6 text-center text-xs text-muted-foreground">Nenhum elemento encontrado.</p>}
        {grupos.map((g) => (
          <section key={g.cat}>
            <h4 className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{g.titulo}</h4>
            <div className="space-y-1.5">
              {g.itens.map((d) => <Item key={d.tipo} def={d} motivoBloqueio={motivo(d)} aberto={aberto === d.tipo} onAbrir={() => setAberto(aberto === d.tipo ? null : d.tipo)} onAdicionar={onAdicionar} />)}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
