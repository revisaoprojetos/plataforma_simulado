'use client'

import { createContext, useContext, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

// Navegação por filtro do banco com estado de TRANSIÇÃO compartilhado: o filtro chama `nav(url)`
// (dentro de startTransition) e a área dos cards lê `pending` para mostrar um overlay — assim,
// enquanto o servidor re-busca, não parece que a tela travou.
const BancoNavCtx = createContext<{ pending: boolean; nav: (url: string) => void }>({ pending: false, nav: () => {} })
export const useBancoNav = () => useContext(BancoNavCtx)

export function BancoNavProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const nav = (url: string) => start(() => router.push(url))
  return <BancoNavCtx.Provider value={{ pending, nav }}>{children}</BancoNavCtx.Provider>
}

/** Área dos cards com overlay de carregamento enquanto um filtro está navegando. */
export function CardsComOverlay({ children }: { children: ReactNode }) {
  const { pending } = useBancoNav()
  return (
    <div data-tour="banco-lista" className="relative min-h-[240px]">
      {pending && (
        <div className="absolute inset-0 z-20 flex items-start justify-center rounded-2xl bg-background/55 pt-16 backdrop-blur-[1.5px] duration-200 animate-in fade-in">
          <span className="inline-flex items-center gap-2 rounded-full border bg-card px-4 py-2 text-sm font-medium text-muted-foreground shadow-sm">
            <Loader2 className="h-4 w-4 animate-spin text-primary" /> Carregando questões…
          </span>
        </div>
      )}
      <div className={cn('space-y-5 transition-opacity duration-200', pending && 'pointer-events-none opacity-50')}>
        {children}
      </div>
    </div>
  )
}
