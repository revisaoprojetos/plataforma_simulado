import { NextRequest, NextResponse } from 'next/server'
import { checkPermission, getCurrentAccess } from '@/lib/auth/permissions'
import { createAdminClient } from '@/lib/supabase/server'
import { registrarAudit } from '@/lib/audit'
import { rateLimit } from '@/lib/rate-limit'
import { contentDispositionAnexo } from '@/lib/conteudo/baixar-pura'
import { formatoValido, type FormatoDownload } from '@/lib/conteudo/download-admin-pura'
import { prepararDownloadAdmin } from '@/lib/conteudo/download-admin'

// POST /api/admin/biblioteca/download-lote
// body: { documentoIds[], pastaIds?[], incluirSubpastas?, formatos[] | formato, incluirCapa?, incluirAtualizacao?, manterEstrutura?, versaoId? }
// 1 documento + 1 formato = arquivo direto (nome = título + extensão). Caso contrário = ZIP (nomes = título sanitizado,
// duplicados " (2)", estrutura de pastas opcional, _relatorio.txt com falhas/avisos). Falha de item não derruba o lote.
// Gate: configuracoes:view (mesmo do "baixar original" do admin) + tenant explícito. Rota de API (não server action).
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const uuids = (a: unknown): string[] => [...new Set((Array.isArray(a) ? a : []).filter((x): x is string => typeof x === 'string' && UUID.test(x)))]
const json = (status: number, message: string) => NextResponse.json({ ok: false, message }, { status, headers: { 'Cache-Control': 'private, no-store' } })

export async function POST(req: NextRequest) {
  try {
    if (!(await checkPermission('configuracoes:view'))) return json(403, 'Sem permissão.')
    const access = await getCurrentAccess()
    if (!access.tenantId) return json(400, 'Tenant não resolvido.')
    const rl = await rateLimit(`adm-dl-lote:${access.userId ?? access.tenantId}`, 8, 60_000)
    if (!rl.ok) return NextResponse.json({ ok: false, message: 'Muitos downloads seguidos. Aguarde um instante e tente de novo.' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } })

    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const brutos = Array.isArray(b.formatos) ? b.formatos : b.formato ? [b.formato] : ['original']
    const formatos = [...new Set(brutos.filter(formatoValido))] as FormatoDownload[]
    if (formatos.length === 0) return json(400, 'Escolha ao menos um formato válido.')
    const documentoIds = uuids(b.documentoIds), pastaIds = uuids(b.pastaIds)
    const versaoId = typeof b.versaoId === 'string' && UUID.test(b.versaoId) ? b.versaoId : null
    const incluirCapa = b.incluirCapa === true, incluirAtualizacao = b.incluirAtualizacao === true, manterEstrutura = b.manterEstrutura === true

    const r = await prepararDownloadAdmin(createAdminClient(), access.tenantId, req.nextUrl.origin, {
      documentoIds, pastaIds, incluirSubpastas: b.incluirSubpastas !== false, formatos, incluirCapa, incluirAtualizacao, manterEstrutura,
      versaoId: documentoIds.length === 1 && pastaIds.length === 0 ? versaoId : null,
    })
    if (!r.ok) return json(r.status, r.erro)

    // Auditoria (best-effort). Não existe operação "EXPORT": usa UPDATE com depois.acao='download_admin' (não altera dados).
    void registrarAudit({
      operacao: 'UPDATE', entidade: 'simulado_conteudo_documentos', entidadeId: r.docIds.length === 1 ? r.docIds[0] : null,
      tenantId: access.tenantId, atorId: access.userId ?? null, metodo: 'POST',
      depois: { acao: 'download_admin', formatos, incluirCapa, incluirAtualizacao, manterEstrutura, pastaIds, total: r.resumo.total, geradas: r.resumo.geradas, falhas: r.resumo.falhas, zip: r.resumo.zip, docIds: r.docIds.slice(0, 200) },
    })

    const headers: Record<string, string> = {
      'Content-Type': r.mime,
      'Content-Disposition': contentDispositionAnexo(r.nome),
      'Content-Length': String(r.bytes.byteLength),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Download-Resumo': `total=${r.resumo.total};geradas=${r.resumo.geradas};falhas=${r.resumo.falhas};avisos=${r.resumo.avisos};zip=${r.resumo.zip ? 1 : 0}`,
    }
    if (r.resumo.aviso) headers['X-Download-Aviso'] = encodeURIComponent(r.resumo.aviso).slice(0, 600)
    return new Response(r.bytes as unknown as BodyInit, { status: 200, headers })
  } catch (e) {
    console.error('[download-lote] ERRO', (e as Error)?.message)
    return json(500, 'Não foi possível preparar o download agora. Tente novamente em instantes.')
  }
}
