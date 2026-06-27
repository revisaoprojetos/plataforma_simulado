'use client'

import { Printer, Eye, EyeOff } from 'lucide-react'

export function CadernoPrintControls({ cadernoId, gabarito }: { cadernoId: string; gabarito: boolean }) {
  return (
    <div className="no-print sticky top-0 z-10 flex items-center gap-2 border-b bg-background px-4 py-2">
      <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">
        <Printer className="h-4 w-4" /> Imprimir / Salvar PDF
      </button>
      <a
        href={`/imprimir/caderno/${cadernoId}${gabarito ? '' : '?gabarito=1'}`}
        className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
      >
        {gabarito ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        {gabarito ? 'Ocultar gabarito' : 'Mostrar gabarito'}
      </a>
      <span className="ml-auto text-xs text-muted-foreground">Use “Salvar como PDF” na impressão do navegador.</span>
    </div>
  )
}
