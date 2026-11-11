'use client'
// Edição INLINE dos renderers compartilhados (admin/aluno). Em modo aluno (sem provider ou ativo=false) o <Editavel/> é só
// texto (ou HTML sanitizado se `rich`), SEM contentEditable. No editor vira contentEditable: Enter/blur confirma, Esc cancela.
import { createContext, useContext, useRef, type ElementType, type KeyboardEvent, type ClipboardEvent } from 'react'
import { sanitizarHtml } from '@/lib/produtos/pagina/normalizar'

interface EdicaoCtx {
  ativo: boolean
  onTexto: (blocoId: string, campo: string, valor: string) => void
  selecionado?: string | null
}
const Ctx = createContext<EdicaoCtx | null>(null)

export function EdicaoProvider({ ativo, onTexto, selecionado, children }: {
  ativo: boolean; onTexto: (blocoId: string, campo: string, valor: string) => void; selecionado?: string | null; children: React.ReactNode
}) {
  return <Ctx.Provider value={{ ativo, onTexto, selecionado }}>{children}</Ctx.Provider>
}
export const useEdicao = (): EdicaoCtx | null => useContext(Ctx)

export interface EditavelProps {
  blocoId: string
  /** Caminho do campo no bloco: 'nome' | 'conteudo.titulo' … (devolvido em onTexto). */
  campo: string
  /** Valor GRAVADO (pode ser ''). */
  valor: string
  /** O que o aluno vê quando `valor` é vazio (ex.: nome do produto). Em edição, começa a edição já com este texto. */
  fallback?: string
  as?: ElementType
  rich?: boolean
  placeholder?: string
  className?: string
}

export function Editavel({ blocoId, campo, valor, fallback = '', as, rich = false, placeholder, className }: EditavelProps) {
  const ctx = useEdicao()
  const ref = useRef<HTMLElement | null>(null)
  const Tag: ElementType = as ?? (rich ? 'div' : 'span')
  const exibido = valor || fallback
  const html = rich ? sanitizarHtml(exibido) : ''

  if (!ctx?.ativo) {
    if (rich) return html ? <Tag className={className} dangerouslySetInnerHTML={{ __html: html }} /> : null
    return exibido ? <Tag className={className}>{exibido}</Tag> : null
  }

  const confirmar = () => {
    const el = ref.current; if (!el) return
    if (rich) {
      const novo = sanitizarHtml(el.innerHTML)
      if (novo !== html) ctx.onTexto(blocoId, campo, novo)
    } else {
      const novo = (el.textContent ?? '').replace(/\s+/g, ' ').trim()
      if (novo !== exibido) ctx.onTexto(blocoId, campo, novo)
      else el.textContent = exibido
    }
  }
  const cancelar = () => {
    const el = ref.current; if (!el) return
    if (rich) el.innerHTML = html; else el.textContent = exibido
    el.blur()
  }
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    e.stopPropagation() // atalhos do editor (Delete, setas, etc.) não devem agir enquanto digita
    if (e.key === 'Escape') { e.preventDefault(); cancelar() }
    else if (e.key === 'Enter' && (!rich || e.ctrlKey || e.metaKey)) { e.preventDefault(); e.currentTarget.blur() }
  }
  const onPaste = (e: ClipboardEvent<HTMLElement>) => {
    e.preventDefault()
    const t = e.clipboardData.getData('text/plain')
    document.execCommand('insertText', false, rich ? t : t.replace(/\s*\n\s*/g, ' '))
  }
  const comum = {
    ref: (n: HTMLElement | null) => { ref.current = n },
    contentEditable: true, suppressContentEditableWarning: true, spellCheck: false,
    'data-editavel': campo, 'data-placeholder': placeholder ?? 'Clique para editar',
    onBlur: confirmar, onKeyDown, onPaste,
    className: `${className ?? ''} cursor-text rounded-sm outline-none transition-shadow hover:ring-2 hover:ring-[color:var(--primary)]/40 focus:ring-2 focus:ring-[color:var(--primary)] empty:before:text-current empty:before:opacity-50 empty:before:content-[attr(data-placeholder)] ${rich ? 'min-h-[1.5em]' : Tag === 'span' ? 'inline-block min-w-[2ch] max-w-full align-baseline' : 'min-w-[2ch]'}`,
  }
  // Key por valor: se o valor externo mudar (painel/desfazer) o nó é recriado com o texto novo (sem briga de cursor).
  return rich
    ? <Tag key={html} {...comum} dangerouslySetInnerHTML={{ __html: html }} />
    : <Tag key={exibido} {...comum}>{exibido}</Tag>
}
