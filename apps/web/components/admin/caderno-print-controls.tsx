'use client'

import { useEffect } from 'react'
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

  // Quando aberto por um botão de download (?print=1), dispara o diálogo "Salvar como PDF"
  // automaticamente — assim o clique leva direto ao salvamento, sem etapa extra.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('print') !== '1') return
    let disparado = false
    const go = () => {
      if (disparado) return
      disparado = true
      // Pequeno atraso para o layout/imagens de fundo terminarem de carregar.
      setTimeout(() => { try { window.focus(); window.print() } catch { /* noop */ } }, 500)
    }
    if (document.readyState === 'complete') go()
    else window.addEventListener('load', go, { once: true })
    return () => window.removeEventListener('load', go)
  }, [])
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
