import { Fragment, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Renderizador de markdown LEVE e SEGURO para o conteúdo das questões (enunciado, alternativas,
 * comentários). Constrói nós React (nunca dangerouslySetInnerHTML → sem XSS). Suporta o subconjunto
 * que aparece nas questões: **negrito**, *itálico*, `código`, [link](url), listas e quebras de linha.
 * Pura (sem hooks) → funciona no cliente E no servidor (impressão/PDF do caderno).
 */

// Só permite links http(s)/mailto (evita javascript: e afins).
function hrefSeguro(url: string): string | null {
  const u = url.trim()
  return /^(https?:\/\/|mailto:)/i.test(u) ? u : null
}

// Inline: **negrito** / __negrito__, *itálico*, `código`, [texto](url). Recursivo p/ aninhar.
const RE_INLINE = /(\*\*|__)([\s\S]+?)\1|\*([\s\S]+?)\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)/g
function renderInline(texto: string, keyBase = ''): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0, m: RegExpExecArray | null, i = 0
  RE_INLINE.lastIndex = 0
  while ((m = RE_INLINE.exec(texto))) {
    if (m.index > last) out.push(texto.slice(last, m.index))
    const k = `${keyBase}-${i++}`
    if (m[1]) out.push(<strong key={k} className="font-semibold">{renderInline(m[2], k)}</strong>)
    else if (m[3] !== undefined) out.push(<em key={k}>{renderInline(m[3], k)}</em>)
    else if (m[4] !== undefined) out.push(<code key={k} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]">{m[4]}</code>)
    else if (m[5] !== undefined) {
      const href = hrefSeguro(m[6] ?? '')
      out.push(href ? <a key={k} href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline">{m[5]}</a> : <Fragment key={k}>{m[5]}</Fragment>)
    }
    last = RE_INLINE.lastIndex
  }
  if (last < texto.length) out.push(texto.slice(last))
  return out
}

// Uma linha com quebras suaves (\n → <br>).
function linhasComBreak(texto: string, keyBase: string): ReactNode {
  const linhas = texto.split('\n')
  return linhas.map((l, k) => (
    <Fragment key={`${keyBase}-l${k}`}>{k > 0 && <br />}{renderInline(l, `${keyBase}-l${k}`)}</Fragment>
  ))
}

// Blocos: parágrafos, listas (ordenadas/não) e quebras. Para enunciado/comentário.
function renderBlocos(texto: string): ReactNode[] {
  const linhas = texto.replace(/\r\n?/g, '\n').split('\n')
  const blocos: ReactNode[] = []
  let i = 0, b = 0
  while (i < linhas.length) {
    const linha = linhas[i]
    if (/^\s*[-*+]\s+/.test(linha)) {
      const itens: string[] = []
      while (i < linhas.length && /^\s*[-*+]\s+/.test(linhas[i])) { itens.push(linhas[i].replace(/^\s*[-*+]\s+/, '')); i++ }
      blocos.push(<ul key={`b${b++}`} className="ml-5 list-disc space-y-1">{itens.map((it, k) => <li key={k}>{renderInline(it, `b${b}-${k}`)}</li>)}</ul>)
    } else if (/^\s*\d+[.)]\s+/.test(linha)) {
      const itens: string[] = []
      while (i < linhas.length && /^\s*\d+[.)]\s+/.test(linhas[i])) { itens.push(linhas[i].replace(/^\s*\d+[.)]\s+/, '')); i++ }
      blocos.push(<ol key={`b${b++}`} className="ml-5 list-decimal space-y-1">{itens.map((it, k) => <li key={k}>{renderInline(it, `b${b}-${k}`)}</li>)}</ol>)
    } else if (linha.trim() === '') {
      i++
    } else {
      const para: string[] = []
      while (i < linhas.length && linhas[i].trim() !== '' && !/^\s*([-*+]|\d+[.)])\s+/.test(linhas[i])) { para.push(linhas[i]); i++ }
      blocos.push(<p key={`b${b++}`}>{linhasComBreak(para.join('\n'), `b${b}`)}</p>)
    }
  }
  return blocos
}

/**
 * `inline`: só formatação inline + quebras (para alternativas, chips, títulos curtos) — sem <p>/listas.
 * Padrão (bloco): parágrafos, listas e quebras (para enunciado/comentário).
 */
export function MarkdownContent({ children, className, inline = false }: { children?: string | null; className?: string; inline?: boolean }) {
  const texto = (children ?? '').toString()
  if (!texto.trim()) return null
  if (inline) return <span className={className}>{linhasComBreak(texto, 'i')}</span>
  return <div className={cn('space-y-2 [&_p]:leading-relaxed', className)}>{renderBlocos(texto)}</div>
}
