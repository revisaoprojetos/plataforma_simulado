'use client'

// Texto rico mínimo: negrito, itálico, lista, lista numerada e link. Saída sanitizada pela MESMA whitelist do normalizar.ts.
import { useEffect, useRef } from 'react'
import { Bold, Italic, Link2, List, ListOrdered } from 'lucide-react'
import { pedirTexto } from '@/components/ui/confirm-dialog'
import { linkSeguro, sanitizarHtml } from '@/lib/produtos/pagina/normalizar'
import { cx } from './util'

export function CampoRich({ value, onChange, max = 8000 }: { value: string; onChange: (html: string) => void; max?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const ultimo = useRef<string | null>(null)
  const sel = useRef<Range | null>(null)

  // Sincroniza de fora (undo/redo, edição inline no canvas) sem atropelar o cursor enquanto digita aqui.
  useEffect(() => {
    const el = ref.current; if (!el) return
    if (value !== ultimo.current && document.activeElement !== el) { el.innerHTML = value; ultimo.current = value }
  }, [value])

  function emitir() {
    const el = ref.current; if (!el) return
    const limpo = sanitizarHtml(el.innerHTML).slice(0, max)
    ultimo.current = limpo
    onChange(limpo)
  }
  const cmd = (c: string, arg?: string) => { ref.current?.focus(); document.execCommand(c, false, arg); emitir() }
  const guardarSel = () => { const s = window.getSelection(); if (s && s.rangeCount && ref.current?.contains(s.anchorNode)) sel.current = s.getRangeAt(0).cloneRange() }
  async function link() {
    guardarSel()
    const url = await pedirTexto({ titulo: 'Link', label: 'Endereço (https://…, mailto:, /caminho ou #âncora)', placeholder: 'https://…', confirmar: 'Aplicar' })
    if (url === null) return
    const seguro = linkSeguro(url)
    if (!seguro) { window.alert('Link inválido. Use https://, mailto:, /caminho ou #âncora.'); return }
    ref.current?.focus()
    const s = window.getSelection(); if (sel.current && s) { s.removeAllRanges(); s.addRange(sel.current) }
    document.execCommand('createLink', false, seguro); emitir()
  }
  const Btn = ({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) => (
    <button type="button" aria-label={label} title={label} onMouseDown={(e) => e.preventDefault()} onClick={onClick}
      className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">{children}</button>
  )
  const len = (value ?? '').length
  return (
    <div className="rounded-lg border bg-background focus-within:ring-2 focus-within:ring-primary/30">
      <div className="flex items-center gap-0.5 border-b p-1">
        <Btn label="Negrito" onClick={() => cmd('bold')}><Bold className="h-3.5 w-3.5" /></Btn>
        <Btn label="Itálico" onClick={() => cmd('italic')}><Italic className="h-3.5 w-3.5" /></Btn>
        <Btn label="Lista" onClick={() => cmd('insertUnorderedList')}><List className="h-3.5 w-3.5" /></Btn>
        <Btn label="Lista numerada" onClick={() => cmd('insertOrderedList')}><ListOrdered className="h-3.5 w-3.5" /></Btn>
        <Btn label="Link" onClick={link}><Link2 className="h-3.5 w-3.5" /></Btn>
        <span className={cx('ml-auto pr-1.5 text-[10px] tabular-nums', len > max * 0.9 ? 'text-destructive' : 'text-muted-foreground')}>{len}/{max}</span>
      </div>
      <div ref={ref} contentEditable suppressContentEditableWarning role="textbox" aria-multiline
        onFocus={() => { try { document.execCommand('defaultParagraphSeparator', false, 'p') } catch { /* ok */ } }}
        onInput={emitir} onBlur={() => { guardarSel(); emitir() }} onKeyUp={guardarSel} onMouseUp={guardarSel}
        className="min-h-[96px] max-h-64 overflow-y-auto px-3 py-2 text-sm outline-none [&_a]:text-primary [&_a]:underline [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1 [&_ul]:list-disc [&_ul]:pl-5" />
    </div>
  )
}
