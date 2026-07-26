'use client'

import { forwardRef, useRef, useState } from 'react'
import type React from 'react'
import { Bold, Italic, Code, List, ListOrdered, Link2, Eye, Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MarkdownContent } from '@/components/markdown-content'

/** Botão da barra de formatação (não rouba o foco/seleção do textarea: onMouseDown preventDefault). */
function BtnFmt({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button type="button" title={title} aria-label={title}
      onMouseDown={(e) => e.preventDefault()} onClick={onClick}
      className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
      {children}
    </button>
  )
}

type Props = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  /** Prévia em modo inline (para alternativas curtas) em vez de blocos. */
  previewInline?: boolean
}

/**
 * Textarea com barra de formatação estilo Word: seleciona o texto e clica em Negrito/Itálico/… →
 * envolve a seleção com a sintaxe markdown correspondente. Tem alternância de Prévia (renderiza o
 * markdown). Compatível com react-hook-form: usa o setter nativo do <textarea> + evento `input`,
 * então `{...register('campo')}` continua funcionando.
 */
export const MarkdownTextarea = forwardRef<HTMLTextAreaElement, Props>(function MarkdownTextarea({ className, previewInline, ...props }, ref) {
  const innerRef = useRef<HTMLTextAreaElement | null>(null)
  const [preview, setPreview] = useState(false)
  const [previewVal, setPreviewVal] = useState('')

  const setRefs = (el: HTMLTextAreaElement | null) => {
    innerRef.current = el
    if (typeof ref === 'function') ref(el)
    else if (ref) (ref as React.MutableRefObject<HTMLTextAreaElement | null>).current = el
  }

  function aplicar(tipo: 'bold' | 'italic' | 'code' | 'ul' | 'ol' | 'link') {
    const ta = innerRef.current
    if (!ta) return
    const start = ta.selectionStart ?? 0, end = ta.selectionEnd ?? 0
    const val = ta.value
    const sel = val.slice(start, end)
    let novo = val, ini = start, fim = end
    const envolver = (mark: string, ph: string) => {
      const txt = sel || ph
      novo = val.slice(0, start) + mark + txt + mark + val.slice(end)
      ini = start + mark.length; fim = ini + txt.length
    }
    if (tipo === 'bold') envolver('**', 'negrito')
    else if (tipo === 'italic') envolver('*', 'itálico')
    else if (tipo === 'code') envolver('`', 'código')
    else if (tipo === 'link') {
      const txt = sel || 'texto'
      novo = val.slice(0, start) + `[${txt}](https://)` + val.slice(end)
      ini = start + 1; fim = ini + txt.length
    } else {
      const prefixo = tipo === 'ul' ? '- ' : '1. '
      const bloco = (sel || 'item').split('\n').map((l) => prefixo + l).join('\n')
      novo = val.slice(0, start) + bloco + val.slice(end)
      ini = start; fim = start + bloco.length
    }
    // Atualiza via setter nativo para o React/RHF capturarem o onChange.
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
    setter?.call(ta, novo)
    ta.dispatchEvent(new Event('input', { bubbles: true }))
    ta.focus()
    requestAnimationFrame(() => ta.setSelectionRange(ini, fim))
  }

  function togglePreview() {
    if (!preview) setPreviewVal(innerRef.current?.value ?? String(props.value ?? props.defaultValue ?? ''))
    setPreview((p) => !p)
  }

  return (
    <div className={cn('overflow-hidden rounded-lg border bg-[var(--input-bg,transparent)] focus-within:ring-1 focus-within:ring-ring', className)}>
      <div className="flex flex-wrap items-center gap-0.5 border-b bg-muted/30 px-1.5 py-1">
        <BtnFmt onClick={() => aplicar('bold')} title="Negrito"><Bold className="h-3.5 w-3.5" /></BtnFmt>
        <BtnFmt onClick={() => aplicar('italic')} title="Itálico"><Italic className="h-3.5 w-3.5" /></BtnFmt>
        <BtnFmt onClick={() => aplicar('code')} title="Código"><Code className="h-3.5 w-3.5" /></BtnFmt>
        <span className="mx-1 h-4 w-px bg-border" />
        <BtnFmt onClick={() => aplicar('ul')} title="Lista com marcadores"><List className="h-3.5 w-3.5" /></BtnFmt>
        <BtnFmt onClick={() => aplicar('ol')} title="Lista numerada"><ListOrdered className="h-3.5 w-3.5" /></BtnFmt>
        <BtnFmt onClick={() => aplicar('link')} title="Link"><Link2 className="h-3.5 w-3.5" /></BtnFmt>
        <button type="button" onClick={togglePreview}
          className="ml-auto inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
          {preview ? <><Pencil className="h-3.5 w-3.5" /> Editar</> : <><Eye className="h-3.5 w-3.5" /> Prévia</>}
        </button>
      </div>
      {preview ? (
        <div className="min-h-[64px] px-3 py-2 text-sm">
          {previewVal.trim() ? <MarkdownContent inline={previewInline}>{previewVal}</MarkdownContent> : <span className="text-muted-foreground">Nada para pré-visualizar.</span>}
        </div>
      ) : (
        <textarea ref={setRefs} {...props} className="w-full resize-y bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground" />
      )}
    </div>
  )
})
