'use client'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Painel lateral que abre POR CIMA da grade (spec 02: 370–420px, z-40, não empurra o conteúdo).
 * Fecha no Esc e no clique fora. Entra deslizando da direita. `largura` em px (default 400).
 * Usa portal p/ document.body; renderiza null no SSR.
 */
export function DrawerLateral({
  aberto,
  onFechar,
  titulo,
  subtitulo,
  acoesHeader,
  children,
  rodape,
  largura = 400,
}: {
  aberto: boolean
  onFechar: () => void
  titulo?: React.ReactNode
  subtitulo?: React.ReactNode
  acoesHeader?: React.ReactNode
  children: React.ReactNode
  rodape?: React.ReactNode
  largura?: number
}) {
  const [montado, setMontado] = useState(false)
  useEffect(() => setMontado(true), [])
  useEffect(() => {
    if (!aberto) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [aberto, onFechar])

  if (!montado) return null
  return createPortal(
    <div className={cn('fixed inset-0 z-40', aberto ? 'pointer-events-auto' : 'pointer-events-none')} aria-hidden={!aberto}>
      {/* scrim leve — mantém a grade visível por trás, fecha ao clicar fora */}
      <div
        onClick={onFechar}
        className={cn('absolute inset-0 bg-foreground/10 transition-opacity duration-200', aberto ? 'opacity-100' : 'opacity-0')}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={typeof titulo === 'string' ? titulo : 'Painel'}
        style={{ width: largura, maxWidth: '100vw' }}
        className={cn(
          'absolute right-0 top-0 flex h-full flex-col border-l bg-card shadow-2xl transition-transform duration-300 ease-out',
          aberto ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        {(titulo || acoesHeader) && (
          <header className="flex items-start gap-2 border-b px-4 py-3">
            <div className="min-w-0 flex-1">
              {titulo && <div className="truncate text-sm font-semibold text-foreground">{titulo}</div>}
              {subtitulo && <div className="truncate text-xs text-muted-foreground">{subtitulo}</div>}
            </div>
            {acoesHeader}
            <button
              type="button"
              onClick={onFechar}
              aria-label="Fechar"
              className="-mr-1 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </header>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        {rodape && <footer className="border-t bg-muted/40 px-4 py-3">{rodape}</footer>}
      </aside>
    </div>,
    document.body,
  )
}
