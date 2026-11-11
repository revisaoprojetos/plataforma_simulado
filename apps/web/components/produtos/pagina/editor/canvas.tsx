'use client'

// CANVAS: prévia REAL da página (mesmos renderers do aluno, modo 'edicao') com overlay de edição por bloco,
// reordenação por arrastar (@dnd-kit sortable: mouse, touch e teclado), "+" entre blocos e estado vazio.
// Largura por dispositivo; layout interno responde ao CONTAINER (@container), nunca à viewport.
import { useMemo, useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ArrowDown, ArrowUp, Copy, Eye, EyeOff, GripVertical, Plus, Trash2 } from 'lucide-react'
import { getElemento } from '@/lib/produtos/pagina/catalogo'
import { corCss } from '@/lib/produtos/pagina/tokens'
import type { BlocoAny, Dispositivo, TipoElemento } from '@/lib/produtos/pagina/tipos'
import { cn } from '@/lib/utils'
import { useEditor } from './store'
import { BlocoRender, EdicaoProvider } from './pontes'
import { IconeElemento, SeletorElemento } from './seletor-elemento'
import { ID_CANVAS_VAZIO, useDropPaleta } from './dnd-area'

const LARGURA: Record<Dispositivo, string> = { desktop: '100%', tablet: '820px', mobile: '390px' }

function BotaoBarra({ titulo, onClick, children, perigo, desabilitado }: { titulo: string; onClick(): void; children: React.ReactNode; perigo?: boolean; desabilitado?: boolean }) {
  return (
    <button type="button" title={titulo} aria-label={titulo} disabled={desabilitado}
      onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onClick() }}
      className={cn('flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40', perigo && 'hover:bg-destructive/10 hover:text-destructive')}>
      {children}
    </button>
  )
}

function Insercao({ aposId, onAbrir }: { aposId: string | null; onAbrir(): void }) {
  const drop = useDropPaleta()
  const alvo = drop.ativo && drop.apos === aposId
  return (
    <div className="group/ins relative -my-1 flex h-6 items-center justify-center">
      <div className={cn('absolute inset-x-0 h-0.5 rounded-full transition-opacity', alvo ? 'bg-primary opacity-100' : 'bg-primary/40 opacity-0 group-hover/ins:opacity-100')} />
      <button type="button" title="Adicionar elemento aqui" aria-label="Adicionar elemento aqui" onClick={onAbrir}
        className={cn('relative z-10 flex h-6 w-6 items-center justify-center rounded-full border bg-card text-muted-foreground shadow-sm transition-all hover:border-primary hover:bg-primary hover:text-primary-foreground', alvo ? 'opacity-100' : 'opacity-0 focus:opacity-100 group-hover/ins:opacity-100')}>
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

function BlocoEditavel({ bloco, indice, total }: { bloco: BlocoAny; indice: number; total: number }) {
  const { selecaoId, selecionar, mover, duplicar, remover, alternarAtivo, dispositivo, dadosAmostra } = useEditor()
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: bloco.id })
  const def = getElemento(bloco.tipo)
  const sel = selecaoId === bloco.id
  const rotulo = bloco.nome?.trim() || def.rotulo
  // Bloco oculto continua visível (esmaecido) no editor para poder ser reativado.
  const paraRender = bloco.ativo ? bloco : ({ ...bloco, ativo: true } as BlocoAny)
  return (
    <div
      ref={setNodeRef} data-editor-bloco={bloco.id}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      onClickCapture={(e) => { const a = (e.target as HTMLElement).closest('a'); if (a) e.preventDefault() }}
      onClick={(e) => { e.stopPropagation(); selecionar(bloco.id) }}
      className={cn('group/bloco relative rounded-xl outline-2 -outline-offset-2 transition-[outline-color,opacity]', sel ? 'outline outline-primary' : 'outline-transparent hover:outline hover:outline-primary/40', isDragging && 'z-30 opacity-40')}
    >
      <div className={cn('pointer-events-none absolute left-2 top-2 z-20 flex items-center gap-1.5 rounded-md bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground shadow-sm transition-opacity', sel ? 'opacity-100' : 'opacity-0 group-hover/bloco:opacity-100')}>
        <IconeElemento nome={def.icone} className="h-3 w-3" />{rotulo}{!bloco.ativo && ' (oculto)'}
      </div>
      <div className={cn('absolute right-2 top-2 z-20 flex items-center gap-0.5 rounded-lg border bg-card p-0.5 shadow-md transition-opacity', sel ? 'opacity-100' : 'pointer-events-none opacity-0 group-hover/bloco:pointer-events-auto group-hover/bloco:opacity-100')}>
        <button ref={setActivatorNodeRef} type="button" title="Arrastar para mover" aria-label="Arrastar para mover" {...attributes} {...listeners}
          onClick={(e) => e.stopPropagation()}
          className="flex h-7 w-7 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:cursor-grabbing">
          <GripVertical className="h-4 w-4" />
        </button>
        <BotaoBarra titulo="Mover para cima" onClick={() => mover(bloco.id, indice - 1)} desabilitado={indice === 0}><ArrowUp className="h-4 w-4" /></BotaoBarra>
        <BotaoBarra titulo="Mover para baixo" onClick={() => mover(bloco.id, indice + 1)} desabilitado={indice === total - 1}><ArrowDown className="h-4 w-4" /></BotaoBarra>
        {!def.unico && <BotaoBarra titulo="Duplicar" onClick={() => duplicar(bloco.id)}><Copy className="h-4 w-4" /></BotaoBarra>}
        <BotaoBarra titulo={bloco.ativo ? 'Ocultar' : 'Mostrar'} onClick={() => alternarAtivo(bloco.id)}>{bloco.ativo ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}</BotaoBarra>
        <BotaoBarra titulo="Excluir" perigo onClick={() => remover(bloco.id)}><Trash2 className="h-4 w-4" /></BotaoBarra>
      </div>
      <div className={cn(!bloco.ativo && 'opacity-40 grayscale')}>
        <BlocoRender bloco={paraRender} modo="edicao" dados={dadosAmostra} dispositivo={dispositivo} primeiro={indice === 0} />
      </div>
    </div>
  )
}

function EstadoVazio({ onAdicionar }: { onAdicionar(): void }) {
  const { setNodeRef, isOver } = useDroppable({ id: ID_CANVAS_VAZIO })
  return (
    <div ref={setNodeRef} className={cn('flex min-h-[50vh] flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-8 text-center', isOver && 'border-primary bg-primary/5')}>
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground"><Plus className="h-6 w-6" /></span>
      <h3 className="text-base font-semibold">Página vazia</h3>
      <p className="max-w-sm text-sm text-muted-foreground">Adicione o primeiro elemento ou arraste um da lista à esquerda.</p>
      <button type="button" onClick={(e) => { e.stopPropagation(); onAdicionar() }}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"><Plus className="h-4 w-4" />Adicionar elemento</button>
    </div>
  )
}

export function Canvas() {
  const { blocos, pagina, dispositivo, selecionar, selecaoId, adicionar, atualizarConteudo, dadosAmostra } = useEditor()
  const [seletor, setSeletor] = useState<{ apos: string | null } | null>(null)
  const ids = useMemo(() => blocos.map((b) => b.id), [blocos])
  const cores = { cor: dadosAmostra.cor, cor2: dadosAmostra.cor2 }
  const fundo = corCss(pagina.tema?.fundo, cores)


  return (
    <div className="min-h-0 flex-1 overflow-auto bg-muted/40 p-4" onClick={() => selecionar(null)}>
      <div
        data-canvas data-dispositivo={dispositivo}
        className={cn('@container mx-auto min-h-[60vh] rounded-2xl border bg-background p-4 text-foreground shadow-sm transition-[max-width] duration-200', dadosAmostra.produto.tema === 'escuro' && 'dark')}
        style={{ maxWidth: LARGURA[dispositivo], ...(fundo ? { backgroundColor: fundo } : {}) }}
      >
        <EdicaoProvider ativo selecionado={selecaoId} onTexto={(id: string, campo: string, valor: string) => atualizarConteudo(id, campo, valor)}>
          {blocos.length === 0 ? (
            <EstadoVazio onAdicionar={() => setSeletor({ apos: null })} />
          ) : (
            <SortableContext items={ids} strategy={verticalListSortingStrategy}>
              <div onClick={(e) => e.stopPropagation()}>
                <Insercao aposId={null} onAbrir={() => setSeletor({ apos: null })} />
                {blocos.map((b, i) => (
                  <div key={b.id}>
                    <BlocoEditavel bloco={b} indice={i} total={blocos.length} />
                    <Insercao aposId={b.id} onAbrir={() => setSeletor({ apos: b.id })} />
                  </div>
                ))}
              </div>
            </SortableContext>
          )}
        </EdicaoProvider>
      </div>
      <SeletorElemento
        aberto={!!seletor} onFechar={() => setSeletor(null)}
        onEscolher={(tipo: TipoElemento) => { const apos = seletor?.apos ?? null; setSeletor(null); adicionar(tipo, apos) }}
      />
    </div>
  )
}
