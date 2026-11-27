import { NextRequest, NextResponse } from 'next/server'
import { checkPermission } from '@/lib/auth/permissions'
import { getCurrentTenantId } from '@/lib/tenant'
import { resolverAtorAudit } from '@/lib/audit'
import { partesDasMetasEmLote, TIPOS_PARTES_METAS, type FalhaPartesDasMetas } from '@/lib/conteudo/partes-das-metas-server'
import type { TipoMetaPartes } from '@/lib/conteudo/partes-das-metas'

// "Criar partes a partir das metas" (LegProc; PDFlash/PDFight não têm divisão por meta). API de rota (NÃO server action).
//   POST {documentoId? | pastaId? | tipo?|classificacao?: 'legproc'|'pdflash'|'pdfight', dryRun?: true (padrão), offset?, limite?, substituir?}
// dryRun=true (padrão) só SIMULA. Grava apenas com dryRun === false. Lote paginado por documento: repita com `proximoOffset`.
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const NO_STORE = { 'Cache-Control': 'no-store' }
const json = (status: number, body: unknown) => NextResponse.json(body, { status, headers: NO_STORE })
const STATUS: Record<FalhaPartesDasMetas['codigo'], number> = { tabela_ausente: 503, nao_encontrado: 404, invalido: 400, erro: 500 }
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)

export async function POST(req: NextRequest) {
  if (!(await checkPermission('configuracoes:update'))) return json(403, { ok: false, error: 'Sem permissão.' })
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return json(400, { ok: false, error: 'Tenant não resolvido.' })
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!b) return json(400, { ok: false, error: 'Corpo inválido.' })
  const tipoBruto = str(b.tipo) ?? str(b.classificacao)
  const tipo = tipoBruto ? (TIPOS_PARTES_METAS.find((t) => t === tipoBruto.toLowerCase()) as TipoMetaPartes | undefined) : undefined
  if (tipoBruto && !tipo) return json(400, { ok: false, error: 'Tipo inválido (legproc | pdflash | pdfight).' })
  const dryRun = b.dryRun !== false // só grava com false explícito
  const r = await partesDasMetasEmLote(tenantId, dryRun ? null : await resolverAtorAudit(), {
    tipo: tipo ?? null, documentoId: str(b.documentoId), pastaId: str(b.pastaId), dryRun,
    offset: typeof b.offset === 'number' ? b.offset : 0, limite: typeof b.limite === 'number' ? b.limite : 10,
    substituir: b.substituir === true,
  })
  return r.ok ? json(200, r) : json(STATUS[r.codigo], { ok: false, error: r.error, codigo: r.codigo })
}
