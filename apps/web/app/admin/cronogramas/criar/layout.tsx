'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { CriarProvider } from './criar-context'
import { CriarStepper } from './criar-stepper'

export default function CriarCronogramaLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  return (
    <CriarProvider>
      <div className="space-y-4">
        <Link
          href="/admin/cronogramas"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar ao catálogo
        </Link>
        <div className="sticky top-2 z-20 rounded-2xl border bg-card/95 p-3 shadow-sm backdrop-blur supports-backdrop-filter:bg-card/80">
          <CriarStepper />
        </div>
        <div key={pathname} className="animate-page">
          {children}
        </div>
      </div>
    </CriarProvider>
  )
}
