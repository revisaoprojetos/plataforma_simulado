'use client'

// Seleção múltipla da Biblioteca (admin): checkbox acessível, hook de seleção (shift-click para intervalo,
// persiste entre card/tabela) e a barra de ações em lote (fixa no rodapé, com contador).

import { useCallback, useRef, useState } from 'react'
import { Check, Minus, X, MoreHorizontal, FolderInput, Eye, EyeOff, Trash2, Users2, Layers, Settings2, History, Type, CircleDot } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

/** Checkbox acessível (role=checkbox / aria-checked, incl. "mixed"). Não propaga o clique ao card/linha. */
export function CheckSelecao({ marcado, onToggle, rotulo, className }: {
  marcado: boolean | 'mixed'
  onToggle: (shift: boolean) => void
  rotulo: string
  className?: string
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={marcado}
      aria-label={rotulo}
      onClick={(e) => { e.stopPropagation(); onToggle(e.shiftKey) }}
      onKeyDown={(e) => { e.stopPropagation(); if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); onToggle(e.shiftKey) } }}
      className={cn(
        'grid h-5 w-5 shrink-0 cursor-pointer place-items-center rounded-md border-2 bg-background text-primary-foreground shadow-sm outline-none transition-colors',
        'focus-visible:ring-2 focus-visible:ring-primary/50',
        marcado ? 'border-primary bg-primary' : 'border-muted-foreground/50 hover:border-primary',
        className,
      )}
    >
      {marcado === 'mixed' ? <Minus className="h-3.5 w-3.5" /> : marcado ? <Check className="h-3.5 w-3.5" /> : null}
    </button>
  )
}

/** Estado da seleção de UM tipo de item (documentos ou pastas). Shift-click seleciona o intervalo
 *  entre o último item tocado e o atual, segundo a ORDEM visível passada em `ordem`. */
export function useSelecaoIds() {
  const [sel, setSel] = useState<Set<string>>(() => new Set())
  const ancora = useRef<string | null>(null)

  const alternar = useCallback((id: string, shift: boolean, ordem: string[]) => {
    setSel((prev) => {
      const prox = new Set(prev)
      const a = ancora.current
      if (shift && a && a !== id) {
        const i = ordem.indexOf(a), j = ordem.indexOf(id)
        if (i >= 0 && j >= 0) {
          const [de, ate] = i < j ? [i, j] : [j, i]
          const marcar = !prev.has(id) // o intervalo segue o novo estado do item clicado
          for (let k = de; k <= ate; k++) { if (marcar) prox.add(ordem[k]); else prox.delete(ordem[k]) }
          return prox
        }
      }
      if (prox.has(id)) prox.delete(id); else prox.add(id)
      return prox
    })
    ancora.current = id
  }, [])
  const todos = useCallback((ids: string[]) => setSel((prev) => (ids.length > 0 && ids.every((i) => prev.has(i)) ? new Set([...prev].filter((i) => !ids.includes(i))) : new Set([...prev, ...ids]))), [])
  const limpar = useCallback(() => { setSel(new Set()); ancora.current = null }, [])
  const manter = useCallback((ids: string[]) => setSel(new Set(ids)), [])
  return { sel, alternar, todos, limpar, manter }
}

export type AcaoBarra = 'mover' | 'status' | 'categoria' | 'acesso' | 'visibilidade_mostrar' | 'visibilidade_ocultar' | 'legenda' | 'configurar' | 'atualizacao' | 'lixeira'

/** Barra de ação em lote: fixa no rodapé, sem ocupar largura útil da página. */
export function BarraLote({ nDocs, nPastas, totalVisivel, todosMarcados, ehModelo, onTodos, onLimpar, onSair, onAcao }: {
  nDocs: number; nPastas: number; totalVisivel: number; todosMarcados: boolean; ehModelo: boolean
  onTodos: () => void; onLimpar: () => void; onSair: () => void; onAcao: (a: AcaoBarra) => void
}) {
  const n = nDocs + nPastas
  const btn = 'inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-50'
  const off = n === 0
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[90] flex justify-center px-3" role="region" aria-label="Ações em lote">
      <div className="pointer-events-auto flex w-full max-w-full flex-wrap items-center gap-2 rounded-2xl border bg-card px-3 py-2 shadow-xl sm:w-auto">
        <span className="px-1 text-sm font-semibold tabular-nums" aria-live="polite">
          {n} {n === 1 ? 'selecionado' : 'selecionados'}
          {nPastas > 0 && <span className="ml-1.5 text-xs font-normal text-muted-foreground">({nPastas} {nPastas === 1 ? 'pasta' : 'pastas'}, {nDocs} {nDocs === 1 ? 'doc.' : 'docs.'})</span>}
        </span>
        <button type="button" onClick={onTodos} className={btn}>{todosMarcados ? 'Desmarcar todos' : `Selecionar todos (${totalVisivel})`}</button>
        <button type="button" onClick={onLimpar} disabled={off} className={btn}>Limpar</button>
        <span className="mx-0.5 hidden h-5 w-px bg-border sm:block" />
        <button type="button" onClick={() => onAcao('mover')} disabled={off} className={btn}><FolderInput className="h-3.5 w-3.5" />Mover</button>
        <button type="button" onClick={() => onAcao('status')} disabled={off} className={btn}><CircleDot className="h-3.5 w-3.5" />Status</button>
        {!ehModelo && <button type="button" onClick={() => onAcao('acesso')} disabled={off} className={btn}><Users2 className="h-3.5 w-3.5" />Acesso</button>}
        {!ehModelo && <button type="button" onClick={() => onAcao('atualizacao')} disabled={off} className={btn}><History className="h-3.5 w-3.5" />Registrar atualização</button>}
        <DropdownMenu>
          <DropdownMenuTrigger aria-label="Mais ações em lote" disabled={off} className={cn(btn, 'outline-none focus-visible:ring-2 focus-visible:ring-ring')}>
            <MoreHorizontal className="h-4 w-4" />Mais
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuItem onClick={() => onAcao('configurar')}><Settings2 className="mr-2 h-4 w-4" /> Configurar em lote…</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAcao('categoria')}><Layers className="mr-2 h-4 w-4" /> Alterar categoria</DropdownMenuItem>
            {!ehModelo && <DropdownMenuItem onClick={() => onAcao('visibilidade_mostrar')}><Eye className="mr-2 h-4 w-4" /> Mostrar ao aluno</DropdownMenuItem>}
            {!ehModelo && <DropdownMenuItem onClick={() => onAcao('visibilidade_ocultar')}><EyeOff className="mr-2 h-4 w-4" /> Ocultar do aluno</DropdownMenuItem>}
            {!ehModelo && <DropdownMenuItem onClick={() => onAcao('legenda')}><Type className="mr-2 h-4 w-4" /> Legenda de grifos</DropdownMenuItem>}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onAcao('lixeira')} className="text-destructive focus:text-destructive"><Trash2 className="mr-2 h-4 w-4" /> Enviar para a lixeira</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <button type="button" onClick={onSair} aria-label="Sair da seleção (Esc)" title="Sair da seleção (Esc)" className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
      </div>
    </div>
  )
}
