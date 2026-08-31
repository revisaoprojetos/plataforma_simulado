'use client'

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { CriarProvider } from './criar-context'

export default function CriarCronogramaLayout({ children }: { children: React.ReactNode }) {
  return (
    <CriarProvider>
      <div className="animate-page space-y-4">
        <Link
          href="/admin/cronogramas"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar ao catálogo
        </Link>
        {children}
      </div>
    </CriarProvider>
  )
}
