import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, isSuperAdmin } from '@/lib/auth/permissions'
import { getSessaoAluno } from '@/lib/aluno-session'
import { getStorage } from '@/lib/storage'
import { BUCKET_PDFS, tokenPdfValido } from '@/lib/storage/pdf-acesso'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * GET /api/arquivo/pdf/<path>            → acesso por SESSÃO (cookie): admin do tenant ou aluno dono.
 * GET /api/arquivo/pdf/t.<exp>.<sig>/<path> → acesso por LINK-TOKEN HMAC (emitido pelo servidor depois de checar
 *                                            dono/tenant; funciona em nova aba/iframe sem cookie e expira sozinho).
 *
 * O bucket `pdfs` é PRIVADO. Aqui o servidor gera uma URL assinada de ~2 min e redireciona (ou, com
 * `?stream=1` / `?download=<nome>`, entrega os bytes pela própria origem — evita CORS no pdf.js e permite nome
 * amigável em qualquer provider). Funciona igual com o bucket ainda público (antes da migration) ou já privado.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TTL_ASSINADA_SEG = 120

function negar(status: number) {
  return new NextResponse(status === 401 ? 'Não autenticado.' : 'Não encontrado.', {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  })
}

/** Autoriza por sessão (admin do tenant dono do arquivo OU aluno dono do PDF gerado). */
async function autorizarPorSessao(path: string): Promise<{ ok: true } | { ok: false; status: number }> {
  const seg = path.split('/')
  // Dono (tenant) conforme o esquema de caminhos do bucket: materiais/{tenant}/…  |  {tenant}/{job}.pdf  |  relatorios/{sessao}_h.pdf
  let tenantDoArquivo: string | null = null
  let sessaoDoRelatorio: string | null = null
  if (seg[0] === 'materiais' && UUID.test(seg[1] ?? '')) tenantDoArquivo = seg[1]
  else if (UUID.test(seg[0] ?? '') && seg.length === 2) tenantDoArquivo = seg[0]
  else if (seg[0] === 'relatorios') {
    const m = /^([0-9a-f-]{36})_[0-9a-f]{8}\.pdf$/i.exec(seg[1] ?? '')
    if (m) sessaoDoRelatorio = m[1]
  }
  if (!tenantDoArquivo && !sessaoDoRelatorio) return { ok: false, status: 403 } // outros prefixos nunca saem por aqui

  const svc = createAdminClient()
  if (sessaoDoRelatorio) {
    const { data: s } = await svc.from('simulado_sessoes_prova').select('tenant_id, estudante_id').eq('id', sessaoDoRelatorio).maybeSingle()
    if (!s) return { ok: false, status: 404 }
    tenantDoArquivo = (s as any).tenant_id as string
  }

  // Admin (painel, cookie Supabase)
  const access = await getCurrentAccess()
  if (access.userId && access.tenantId && (access.isAdmin || access.permissions.length > 0)) {
    if (access.tenantId === tenantDoArquivo || (await isSuperAdmin())) return { ok: true }
  }

  // Aluno (cookie do portal)
  const aluno = await getSessaoAluno()
  if (aluno && aluno.tenantId === tenantDoArquivo) {
    if (seg[0] === 'materiais') return { ok: true } // material do simulado (enunciado/gabarito) — mesmo tenant
    if (sessaoDoRelatorio) {
      const { data: s } = await svc.from('simulado_sessoes_prova').select('estudante_id').eq('id', sessaoDoRelatorio).maybeSingle()
      return (s as any)?.estudante_id === aluno.estudanteId ? { ok: true } : { ok: false, status: 404 }
    }
    // {tenant}/{jobId}.pdf — só o criador do job, ou o dono da sessão a que o job se refere.
    const { data: job } = await svc.from('simulado_pdf_jobs').select('tenant_id, criado_por, referencia').eq('arquivo_path', path).maybeSingle()
    if (!job || (job as any).tenant_id !== aluno.tenantId) return { ok: false, status: 404 }
    if ((job as any).criado_por && (job as any).criado_por === aluno.estudanteId) return { ok: true }
    const ref = (job as any).referencia as string | null
    if (ref && UUID.test(ref)) {
      const { data: s } = await svc.from('simulado_sessoes_prova').select('estudante_id, tenant_id').eq('id', ref).maybeSingle()
      if (s && (s as any).estudante_id === aluno.estudanteId && (s as any).tenant_id === aluno.tenantId) return { ok: true }
    }
    return { ok: false, status: 404 }
  }

  return { ok: false, status: access.userId || aluno ? 404 : 401 }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path: partes } = await params
  if (!partes?.length) return negar(404)
  let segs = partes.map((p) => { try { return decodeURIComponent(p) } catch { return p } })

  let porToken = false
  if (/^t\.\d+\.[\w-]+$/.test(segs[0])) {
    const token = segs[0]
    segs = segs.slice(1)
    if (!segs.length || !tokenPdfValido(token, segs.join('/'))) return negar(403)
    porToken = true
  }
  const path = segs.join('/')
  if (!path || path.includes('..') || path.startsWith('/')) return negar(400)

  if (!porToken) {
    const auth = await autorizarPorSessao(path)
    if (!auth.ok) return negar(auth.status)
  }

  const storage = getStorage()
  const q = req.nextUrl.searchParams
  const download = q.get('download')
  const stream = q.get('stream') === '1'

  try {
    if (download || stream) {
      const bytes = await storage.download(BUCKET_PDFS, path)
      if (!bytes) return negar(404)
      const nome = (download || path.split('/').pop() || 'arquivo.pdf').replace(/[\r\n"\\/]+/g, '_')
      return new NextResponse(Buffer.from(bytes), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(nome)}`,
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      })
    }
    const assinada = await storage.getSignedUrl(BUCKET_PDFS, path, TTL_ASSINADA_SEG)
    return new NextResponse(null, { status: 302, headers: { Location: assinada, 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' } })
  } catch {
    return negar(404)
  }
}
