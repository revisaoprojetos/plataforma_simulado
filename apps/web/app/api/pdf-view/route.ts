import { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * Proxy same-origin de PDFs do storage p/ PRÉVIA inline (embutir em <object>/<iframe>).
 * PDFs cross-origin do Supabase às vezes são baixados pelo navegador em vez de exibidos;
 * servindo pela própria origem com `Content-Disposition: inline` a prévia renderiza.
 * Restrito ao host do storage do projeto (evita SSRF).
 */
export async function GET(req: NextRequest) {
  const u = req.nextUrl.searchParams.get('u')
  if (!u) return new Response('missing url', { status: 400 })

  const base = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '')
  const permitido = base && u.startsWith(`${base}/storage/v1/object/public/`)
  if (!permitido) return new Response('forbidden', { status: 403 })

  let up: Response
  try { up = await fetch(u, { cache: 'no-store' }) } catch { return new Response('bad gateway', { status: 502 }) }
  if (!up.ok || !up.body) return new Response('not found', { status: up.status || 404 })

  return new Response(up.body, {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': 'inline',
      'cache-control': 'private, max-age=300',
      'x-content-type-options': 'nosniff',
    },
  })
}
