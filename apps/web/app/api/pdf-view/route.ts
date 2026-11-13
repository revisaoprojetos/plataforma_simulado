import { NextRequest } from 'next/server'
import { urlPdfPermitida } from '@/lib/seguranca/pdf-view-url'

export const dynamic = 'force-dynamic'

/**
 * Proxy same-origin de PDFs do storage p/ PRÉVIA inline (embutir em <object>/<iframe>).
 * PDFs cross-origin do Supabase às vezes são baixados pelo navegador em vez de exibidos;
 * servindo pela própria origem com `Content-Disposition: inline` a prévia renderiza.
 *
 * Anti-SSRF / anti-traversal: o `u` é PARSEADO (não vale `startsWith` em string crua), precisa ter a MESMA origem do
 * storage do projeto, sem credenciais/porta alheia, caminho normalizado (rejeita `..`, `.`, `//`, `\`, `%2e/%2f/%5c`,
 * NUL) e bucket dentro de uma allowlist exata (PDF_VIEW_BUCKETS, padrão `pdfs` + bucket de conteúdo). O fetch usa a
 * URL RECONSTRUÍDA a partir das partes validadas e NÃO segue redirecionamentos.
 */
export async function GET(req: NextRequest) {
  const u = req.nextUrl.searchParams.get('u')
  if (!u) return new Response('missing url', { status: 400 })

  const base = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '')
  const seguro = base ? urlPdfPermitida(u, base) : null
  if (!seguro) return new Response('forbidden', { status: 403 })

  let up: Response
  try { up = await fetch(seguro, { cache: 'no-store', redirect: 'manual' }) } catch { return new Response('bad gateway', { status: 502 }) }
  if (!up.ok || !up.body) return new Response('not found', { status: up.status && up.status >= 300 && up.status < 400 ? 404 : (up.status || 404) })

  return new Response(up.body, {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': 'inline',
      'cache-control': 'private, max-age=300',
      'x-content-type-options': 'nosniff',
    },
  })
}
