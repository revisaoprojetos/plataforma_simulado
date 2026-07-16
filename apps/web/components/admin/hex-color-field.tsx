'use client'

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'

/** Normaliza um texto de cor hex: aceita "f7f3ec", "#f7f3ec", "FFF" (3 dígitos) → "#f7f3ec". */
export function normalizeHex(v: string): string | null {
  let s = v.trim().replace(/^#/, '')
  if (/^[0-9a-fA-F]{3}$/.test(s)) s = s.split('').map((ch) => ch + ch).join('')
  return /^[0-9a-fA-F]{6}$/.test(s) ? '#' + s.toLowerCase() : null
}
const hexParaPicker = (v: string) => normalizeHex(v) ?? '#000000'

/**
 * Campo de cor: quadradinho clicável (seletor visual nativo) + campo de texto para
 * digitar o código hexadecimal direto (ex.: f7f3ec). O texto só é aplicado quando é um
 * hex válido (no blur ou Enter); valor inválido reverte para o atual.
 */
export function HexColorField({ value, onChange, className, swatchClassName }: {
  value: string
  onChange: (v: string) => void
  className?: string
  swatchClassName?: string
}) {
  const [texto, setTexto] = useState(value)
  useEffect(() => { setTexto(value) }, [value])
  const confirmar = () => {
    const norm = normalizeHex(texto)
    if (norm) { onChange(norm); setTexto(norm) }
    else setTexto(value)
  }
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1.5', className)}>
      {/* Quadradinho: clique abre o seletor visual */}
      <span className={cn('relative inline-flex h-7 w-8 shrink-0 overflow-hidden rounded-md border', swatchClassName)} title="Escolher no seletor de cores">
        <span className="absolute inset-0" style={{ background: value }} />
        <input type="color" value={hexParaPicker(value)} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
      </span>
      {/* Campo de hex: digite o código da cor */}
      <span className="relative inline-flex items-center">
        <span className="pointer-events-none absolute left-1.5 text-[11px] font-medium text-muted-foreground">#</span>
        <input
          type="text"
          value={texto.replace(/^#/, '')}
          onChange={(e) => setTexto(e.target.value)}
          onBlur={confirmar}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); confirmar(); (e.target as HTMLInputElement).blur() } }}
          spellCheck={false}
          maxLength={6}
          aria-label="Código hexadecimal da cor"
          className="h-7 w-[68px] rounded-md border bg-background py-0 pl-4 pr-1.5 font-mono text-[11px] uppercase tabular-nums outline-none focus:ring-1 focus:ring-primary"
        />
      </span>
    </span>
  )
}
