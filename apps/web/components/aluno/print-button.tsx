'use client'

import { useEffect } from 'react'
import { Printer } from 'lucide-react'

export function PrintButton({ label = 'Imprimir / Salvar PDF' }: { label?: string }) {
  // Aberto por um botão de download (?print=1) → dispara "Salvar como PDF" automaticamente.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('print') !== '1') return
    let disparado = false
    const go = () => {
      if (disparado) return
      disparado = true
      setTimeout(() => { try { window.focus(); window.print() } catch { /* noop */ } }, 500)
    }
    if (document.readyState === 'complete') go()
    else window.addEventListener('load', go, { once: true })
    return () => window.removeEventListener('load', go)
  }, [])

  return (
    <div className="no-print sticky top-0 z-10 flex items-center gap-2 border-b bg-background px-4 py-2">
      <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">
        <Printer className="h-4 w-4" /> {label}
      </button>
      <span className="ml-auto text-xs text-muted-foreground">Na impressão do navegador, escolha “Salvar como PDF”.</span>
    </div>
  )
}
