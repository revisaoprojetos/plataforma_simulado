'use client'

import { Suspense } from 'react'
import { VoltarCronogramas } from '@/components/admin/cronograma/voltar-cronogramas'
import { CriarProvider } from './criar-context'

export default function CriarCronogramaLayout({ children }: { children: React.ReactNode }) {
  return (
    <CriarProvider>
      <div className="animate-page space-y-4">
        <Suspense fallback={null}><VoltarCronogramas tela="criar" /></Suspense>
        {children}
      </div>
    </CriarProvider>
  )
}
