'use client'

import { Printer } from 'lucide-react'

export function CadernoPrintControls() {
  const imprimir = () => {
    try {
      window.focus()
      window.print()
    } catch {
      /* noop */
    }
  }
  return (
    <div className="no-print sticky top-0 z-10 flex items-center gap-2 border-b bg-background px-4 py-2">
      <button
        type="button"
        onClick={imprimir}
        className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
      >
        <Printer className="h-4 w-4" /> Imprimir / Salvar PDF
      </button>
      <span className="ml-auto text-xs text-muted-foreground">Use “Salvar como PDF” na impressão do navegador.</span>
    </div>
  )
}
