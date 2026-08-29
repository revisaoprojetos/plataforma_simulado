'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { CriarProvider, useCriar } from './criar-context'
import { CriarStepper } from './criar-stepper'

// Link "voltar" SEPARADO do card de progresso (como nas outras telas). O texto/destino dependem
// de onde o usuário abriu o fluxo: pelo Início (dashboard) ou pela Aplicação de Simulado.
// A origem chega pela query `?de=` na 1ª etapa e fica guardada no rascunho (persiste entre etapas).
function VoltarLink() {
  const { draft, patch } = useCriar()
  useEffect(() => {
    try {
      const de = new URLSearchParams(window.location.search).get('de')
      if (de === 'inicio' || de === 'aplicacao') patch({ origem: de })
    } catch { /* ignora */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const inicio = draft.origem === 'inicio'
  return (
    <Link href={inicio ? '/admin' : '/admin/simulados'} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
      <ArrowLeft className="h-4 w-4" /> {inicio ? 'Voltar para o início' : 'Voltar para a aplicação'}
    </Link>
  )
}

export default function CriarLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  return (
    <CriarProvider>
      <div className="space-y-4">
        <VoltarLink />
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
