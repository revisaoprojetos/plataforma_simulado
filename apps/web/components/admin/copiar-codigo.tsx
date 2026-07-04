'use client'

import { useState } from 'react'
import { Copy, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Selo com o código da questão + botão de copiar. */
export function CopiarCodigo({ codigo, className }: { codigo: string; className?: string }) {
  const [copiado, setCopiado] = useState(false)

  function copiar(e: React.MouseEvent) {
    e.stopPropagation()
    e.preventDefault()
    navigator.clipboard?.writeText(codigo).then(() => {
      setCopiado(true)
      setTimeout(() => setCopiado(false), 1200)
    })
  }

  return (
    <button type="button" onClick={copiar} title="Copiar código da questão"
      className={cn('group inline-flex items-center gap-1 rounded-md border bg-muted/40 px-1.5 py-0.5 font-mono text-xs text-muted-foreground transition-colors hover:border-primary hover:text-foreground', className)}>
      <span>{codigo}</span>
      {copiado ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />}
    </button>
  )
}
