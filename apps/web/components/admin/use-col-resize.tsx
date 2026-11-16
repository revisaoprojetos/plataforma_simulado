'use client'

/**
 * Redimensionamento de colunas (arrastar) — implementação ÚNICA reusada por <DataTable redimensionavel>,
 * pelas tabelas <table> feitas à mão (estudantes-lista, abas do perfil do aluno, matriz de regras) e por
 * <TabelaRedimensionavel> (tabelas de server components).
 *
 * Uso numa tabela à mão:
 *   const rs = useColResize('minha-tabela')
 *   <table style={rs.tableStyle()}>
 *     <thead><tr>
 *       <th data-col="nome" className="relative" style={rs.style('nome')}>Nome <ColResizeHandle rs={rs} k="nome" /></th>
 *     …
 *   {rs.custom && <ColResizeReset rs={rs} />}
 *
 * - Mouse + toque (pointer events; a alça tem touch-action:none). Largura mínima 96 px (~6rem).
 * - Persistência por tabela em localStorage (try/catch). Ao primeiro arrasto todas as colunas `th[data-col]`
 *   visíveis são "congeladas" em px, para que alargar uma não esprema as outras; a soma passando do container
 *   gera rolagem horizontal (o container da tabela precisa de overflow-x).
 */

import * as React from 'react'
import { RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'

const MIN_PX = 96
const LS = 'colw:v1:'

export interface ColResize {
  widths: Record<string, number>
  /** true quando o usuário já ajustou alguma largura. */
  custom: boolean
  /** Largura salva da coluna (ou undefined → usa o padrão da tabela). */
  w: (k: string) => number | undefined
  /** `style` p/ <th>/<col> (width + minWidth) — undefined enquanto não ajustado. */
  style: (k: string) => React.CSSProperties | undefined
  /** `style` p/ <table> (layout fixo + largura = soma). `extraPx` = colunas sem alça (checkbox/ações). */
  tableStyle: (extraPx?: number) => React.CSSProperties | undefined
  start: (k: string, e: React.PointerEvent<HTMLElement>) => void
  reset: () => void
}

export function useColResize(id: string): ColResize {
  const [widths, setWidths] = React.useState<Record<string, number>>({})
  const ref = React.useRef(widths)
  ref.current = widths

  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(LS + id)
      const v = raw ? (JSON.parse(raw) as Record<string, number>) : {}
      const ok: Record<string, number> = {}
      for (const [k, n] of Object.entries(v)) if (typeof n === 'number' && n >= MIN_PX && n < 4000) ok[k] = Math.round(n)
      setWidths(ok)
    } catch { setWidths({}) }
  }, [id])

  const persist = React.useCallback((v: Record<string, number>) => {
    try { window.localStorage.setItem(LS + id, JSON.stringify(v)) } catch { /* modo privado / cheio */ }
  }, [id])

  const start = React.useCallback((k: string, e: React.PointerEvent<HTMLElement>) => {
    e.preventDefault(); e.stopPropagation()
    const th = e.currentTarget.closest('th')
    const table = th?.closest('table')
    if (!th || !table) return
    // Congela as larguras atuais de todas as colunas visíveis (uma única vez por coluna).
    const base: Record<string, number> = { ...ref.current }
    table.querySelectorAll<HTMLElement>('th[data-col]').forEach((el) => {
      const key = el.dataset.col!
      const w = Math.round(el.getBoundingClientRect().width)
      if (base[key] == null && w > 0) base[key] = Math.max(MIN_PX, w)
    })
    const startX = e.clientX
    const startW = base[k] ?? Math.round(th.getBoundingClientRect().width)
    setWidths(base)
    let ultimo = base
    const move = (ev: PointerEvent) => {
      const nw = Math.max(MIN_PX, Math.min(2000, Math.round(startW + ev.clientX - startX)))
      ultimo = { ...base, [k]: nw }
      setWidths(ultimo)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
      persist(ultimo)
    }
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }, [persist])

  const reset = React.useCallback(() => {
    setWidths({})
    try { window.localStorage.removeItem(LS + id) } catch { /* ignore */ }
  }, [id])

  const custom = Object.keys(widths).length > 0
  return {
    widths, custom,
    w: (k) => widths[k],
    style: (k) => (widths[k] ? { width: widths[k], minWidth: widths[k] } : undefined),
    tableStyle: (extraPx = 0) => custom
      ? { tableLayout: 'fixed', minWidth: '100%', width: Object.values(widths).reduce((s, n) => s + n, 0) + extraPx }
      : undefined,
    start, reset,
  }
}

/** Alça de arrasto na borda direita do <th> (o <th> precisa ser `relative`/`sticky` e ter `data-col`). */
export function ColResizeHandle({ rs, k, className }: { rs: Pick<ColResize, 'start'>; k: string; className?: string }) {
  return (
    <span
      role="separator" aria-orientation="vertical" aria-label="Arraste para ajustar a largura da coluna"
      title="Arraste para ajustar a largura"
      onPointerDown={(e) => rs.start(k, e)}
      onClick={(e) => e.stopPropagation()}
      className={cn('group/ch absolute right-0 top-0 z-40 flex h-full w-3 cursor-col-resize touch-none select-none justify-center', className)}
    >
      <span className="h-full w-px bg-border transition-all group-hover/ch:w-0.5 group-hover/ch:bg-primary" />
    </span>
  )
}

/** Botão discreto "Restaurar larguras". */
export function ColResizeReset({ rs, className }: { rs: Pick<ColResize, 'reset' | 'custom'>; className?: string }) {
  if (!rs.custom) return null
  return (
    <button type="button" onClick={rs.reset}
      className={cn('inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline', className)}>
      <RotateCcw className="h-3 w-3" />Restaurar larguras
    </button>
  )
}

/**
 * Tabela simples redimensionável para SERVER components: o servidor passa os cabeçalhos e o <tbody> já renderizado.
 */
export function TabelaRedimensionavel({
  id, colunas, children, className, theadClassName, thClassName,
}: {
  id: string
  colunas: { key: string; label: React.ReactNode; className?: string }[]
  children: React.ReactNode
  className?: string
  theadClassName?: string
  thClassName?: string
}) {
  const rs = useColResize(id)
  return (
    <div>
      <div className="overflow-x-auto">
        <table className={cn('w-full text-sm', className)} style={rs.tableStyle()}>
          <thead className={theadClassName}>
            <tr>
              {colunas.map((c) => (
                <th key={c.key} data-col={c.key} style={rs.style(c.key)} className={cn('relative', thClassName, c.className)}>
                  {c.label}<ColResizeHandle rs={rs} k={c.key} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
      {rs.custom && <div className="flex justify-end px-3 py-1.5"><ColResizeReset rs={rs} /></div>}
    </div>
  )
}
