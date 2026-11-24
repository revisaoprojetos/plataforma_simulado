'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'

/** Boundary de erro das telas de Cronogramas: nunca deixa a tela branca; mostra mensagem + digest e permite tentar de novo. */
export function ErroTela({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[cronogramas] erro de render:', error)
  }, [error])
  return (
    <div role="alert" className="m-6 rounded-xl border border-border bg-card p-6 text-foreground">
      <h2 className="text-lg font-semibold">Não foi possível abrir esta tela</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Ocorreu um erro ao carregar. Tente de novo; se persistir, informe o código abaixo ao suporte.
      </p>
      {error?.message ? <p className="mt-3 break-words text-xs text-muted-foreground">{error.message}</p> : null}
      {error?.digest ? <p className="mt-1 text-xs text-muted-foreground">Código: {error.digest}</p> : null}
      <Button className="mt-4" onClick={() => reset()}>Tentar de novo</Button>
    </div>
  )
}
