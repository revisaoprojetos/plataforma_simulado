'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Check, Copy, ExternalLink } from 'lucide-react'

export function CopyLink({ url }: { url: string }) {
  const [copiado, setCopiado] = useState(false)

  async function copiar() {
    try {
      await navigator.clipboard.writeText(url)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      /* clipboard indisponível */
    }
  }

  return (
    <div className="flex items-center gap-2">
      <code className="flex-1 rounded bg-muted px-3 py-2 text-xs break-all">{url}</code>
      <Button variant="outline" size="icon-sm" onClick={copiar} title="Copiar link">
        {copiado ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
      </Button>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex h-7 w-7 items-center justify-center rounded-lg border hover:bg-muted"
        title="Abrir em nova aba"
      >
        <ExternalLink className="h-3.5 w-3.5" />
      </a>
    </div>
  )
}
