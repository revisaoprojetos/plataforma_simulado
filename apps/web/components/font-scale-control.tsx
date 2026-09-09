'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ALargeSmall, AArrowDown, AArrowUp, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  FONT_SCALE_LEVELS, FONT_SCALE_DEFAULT, lerEscala, salvarEscala, aplicarEscala, nivelDe, pctDe,
} from '@/lib/font-scale'

/**
 * Controle de acessibilidade "tamanho do texto" — botão-ícone que abre um popover com − / + e uma
 * trilha de níveis. Ajusta o `--font-scale` (html font-size) → afeta TODAS as páginas. Persiste por
 * usuário (prop `scope`) no localStorage, então acessos diferentes não interferem entre si.
 *
 * `openDir`: 'up' (default — usado no rodapé das sidebars) ou 'down' (top bar do simulado).
 */
export function FontScaleControl({
  scope, className, align = 'end', openDir = 'up',
}: { scope: string; className?: string; align?: 'start' | 'end' | 'center'; openDir?: 'up' | 'down' }) {
  const [scale, setScale] = useState<number>(FONT_SCALE_DEFAULT)
  const [open, setOpen] = useState(false)       // aberto (lógico)
  const [montado, setMontado] = useState(false) // fica no DOM durante a animação de SAÍDA
  const boxRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [coord, setCoord] = useState<{ left?: number; right?: number; top?: number; bottom?: number }>({})
  const abrir = () => {
    const r = triggerRef.current?.getBoundingClientRect()
    if (r) {
      const c: { left?: number; right?: number; top?: number; bottom?: number } = {}
      if (openDir === 'up') c.bottom = window.innerHeight - r.top + 8
      else c.top = r.bottom + 8
      if (align === 'start') c.left = r.left
      else c.right = window.innerWidth - r.right // 'end' (padrão) — ancora pela direita
      setCoord(c)
    }
    setMontado(true); setOpen(true)
  }
  const fechar = () => setOpen(false) // dispara a animação de saída; desmonta no onAnimationEnd

  // Hidrata do localStorage no mount (evita mismatch SSR) + sincroniza entre instâncias.
  useEffect(() => { setScale(lerEscala(scope)) }, [scope])
  useEffect(() => {
    const h = (e: Event) => { const v = (e as CustomEvent).detail; if (typeof v === 'number') setScale(v) }
    window.addEventListener('plt:fontscale', h)
    return () => window.removeEventListener('plt:fontscale', h)
  }, [])

  // Fecha ao clicar fora / Esc.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { const t = e.target as Node; if (boxRef.current?.contains(t) || panelRef.current?.contains(t)) return; fechar() }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') fechar() }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  const idx = nivelDe(scale)
  const aplica = (n: number) => {
    const v = FONT_SCALE_LEVELS[Math.min(FONT_SCALE_LEVELS.length - 1, Math.max(0, n))]
    setScale(v)
    aplicarEscala(v)
    salvarEscala(scope, v)
    window.dispatchEvent(new CustomEvent('plt:fontscale', { detail: v }))
  }

  return (
    <div ref={boxRef} className={cn('relative', className)}>
      <div className="group/fs relative">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => (open ? fechar() : abrir())}
          aria-label="Ajustar o tamanho do texto"
          aria-expanded={open}
          className={cn(
            // Sem preenchimento: só a borda no accent (dourado da marca), com aparência "ativado".
            // Hover (em qualquer estado) = fundo dourado + ícone branco.
            'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring border-[color:var(--brand-accent,var(--primary))] text-[color:var(--brand-accent,var(--primary))] hover:bg-[color:var(--brand-accent,var(--primary))] hover:text-white',
            open ? 'bg-[color:var(--brand-accent,var(--primary))]/15' : 'bg-transparent',
          )}
        >
          <ALargeSmall className="h-4 w-4" />
        </button>
        {/* Balão (tooltip) — aparece no hover; some quando o popover está aberto */}
        {!open && (
          <span
            role="tooltip"
            className={cn(
              'pointer-events-none absolute left-1/2 z-[121] -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-[11px] font-medium text-background opacity-0 shadow-md transition-opacity duration-150 group-hover/fs:opacity-100',
              openDir === 'up' ? 'bottom-full mb-1.5' : 'top-full mt-1.5',
            )}
          >
            Tamanho do texto
            <span
              className={cn(
                'absolute left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-foreground',
                openDir === 'up' ? '-bottom-1' : '-top-1',
              )}
            />
          </span>
        )}
      </div>

      {montado && typeof document !== 'undefined' && createPortal(
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Tamanho do texto"
          onAnimationEnd={() => { if (!open) setMontado(false) }}
          style={coord}
          className={cn(
            // Portalado no body (z-125) → fica ACIMA do balão de notificação (z-115) e escapa do
            // contexto de empilhamento da sidebar (fixed z-10). Posição via `coord` (calculada no abrir).
            'fixed z-[125] w-56 rounded-xl border bg-card p-3 shadow-xl duration-150',
            open
              ? cn('animate-in fade-in', openDir === 'up' ? 'slide-in-from-bottom-1' : 'slide-in-from-top-1')
              : cn('animate-out fade-out', openDir === 'up' ? 'slide-out-to-bottom-1' : 'slide-out-to-top-1'),
          )}
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground">Tamanho do texto</span>
            <span className="text-xs font-semibold tabular-nums text-muted-foreground">{pctDe(scale)}%</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => aplica(idx - 1)}
              disabled={idx === 0}
              title="Diminuir"
              aria-label="Diminuir o texto"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border bg-card text-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
            >
              <AArrowDown className="h-4 w-4" />
            </button>
            <div className="flex flex-1 items-center gap-1">
              {FONT_SCALE_LEVELS.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => aplica(i)}
                  aria-label={`Nível ${i + 1}`}
                  className={cn('h-2 flex-1 rounded-full transition-colors', i <= idx ? 'bg-primary' : 'bg-muted')}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => aplica(idx + 1)}
              disabled={idx === FONT_SCALE_LEVELS.length - 1}
              title="Aumentar"
              aria-label="Aumentar o texto"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border bg-card text-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
            >
              <AArrowUp className="h-4 w-4" />
            </button>
          </div>
          {scale !== FONT_SCALE_DEFAULT && (
            <button
              type="button"
              onClick={() => aplica(nivelDe(FONT_SCALE_DEFAULT))}
              className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <RotateCcw className="h-3 w-3" /> Restaurar padrão
            </button>
          )}
        </div>,
        document.body,
      )}
    </div>
  )
}
