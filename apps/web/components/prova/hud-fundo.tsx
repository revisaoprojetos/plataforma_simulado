import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Camada de imagem de fundo da tela do simulado. Lê as CSS vars emitidas por `hudCssVars`
 * (--prova-bg-image / --prova-bg-opacity / --prova-bg-blur / --prova-bg-size / --prova-bg-repeat).
 * Fica atrás do conteúdo (via -z-10) e acima da cor de fundo do container.
 */
export function HudFundo() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div
        className="absolute -inset-4"
        style={{
          backgroundImage: 'var(--prova-bg-image, none)',
          backgroundSize: 'var(--prova-bg-size, cover)',
          backgroundPosition: 'var(--prova-bg-position, center)',
          backgroundRepeat: 'var(--prova-bg-repeat, no-repeat)',
          opacity: 'var(--prova-bg-opacity, 1)' as unknown as number,
          filter: 'blur(var(--prova-bg-blur, 0px))',
        }}
      />
    </div>
  )
}

/**
 * Envolve a raiz de uma tela do HUD adicionando a camada de imagem de fundo.
 * `isolate` cria um contexto de empilhamento para o -z-10 do fundo ficar contido,
 * sem `overflow-hidden` (que quebraria o header sticky da prova).
 */
export function TelaFundo({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn('relative isolate', className)}>
      <HudFundo />
      {children}
    </div>
  )
}
