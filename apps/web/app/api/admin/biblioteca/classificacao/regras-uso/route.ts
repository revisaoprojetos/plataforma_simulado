import { NextRequest, NextResponse } from 'next/server'
import { checkPermission } from '@/lib/auth/permissions'
import { getCurrentTenantId } from '@/lib/tenant'
import { resolverAtorAudit } from '@/lib/audit'
import { createAdminClient } from '@/lib/supabase/server'
import { SalvarRegrasSchema } from '@/lib/conteudo/classificacao/gestao'
import { carregarMatrizRegras, salvarRegrasLote } from '@/lib/conteudo/classificacao/gestao-server'

// REGRAS DE USO (área × classificação). API de rota (server actions são rejeitadas em domínio custom).
//   GET  → matriz completa (áreas, classificações ativas, células com regras gravadas, efetivas, origem e minutos do documento de exemplo)
//   PUT  { alteracoes:[{area,classificacaoId,patch?,limpar?}], dryRun?, medidas? }
//        patch.<tempo|meta>.<campo>: valor define; null volta a herdar. dryRun=true só devolve a PRÉVIA (nada é gravado).
// Permissão: configuracoes:view (GET) / configuracoes:update (PUT).
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }
const json = (status: number, body: unknown) => NextResponse.json(body, { status, headers: NO_STORE })

export async function GET() {
  if (!(await checkPermission('configuracoes:view'))) return json(403, { ok: false, error: 'Sem permissão.' })
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return json(400, { ok: false, error: 'Tenant não resolvido.' })
  try { return json(200, { ok: true, matriz: await carregarMatrizRegras(createAdminClient(), tenantId) }) }
  catch (e) { return json(500, { ok: false, error: (e as Error)?.message || 'Falha ao carregar.' }) }
}

export async function PUT(req: NextRequest) {
  if (!(await checkPermission('configuracoes:update'))) return json(403, { ok: false, error: 'Sem permissão.' })
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return json(400, { ok: false, error: 'Tenant não resolvido.' })
  const p = SalvarRegrasSchema.safeParse(await req.json().catch(() => null))
  if (!p.success) return json(400, { ok: false, error: `Dados inválidos: ${p.error.issues[0]?.path.join('.') || 'corpo'} — ${p.error.issues[0]?.message ?? 'verifique os campos'}.` })
  try {
    const medidas = p.data.medidas ? Object.fromEntries(Object.entries(p.data.medidas).filter(([, v]) => v != null)) : undefined
    const r = await salvarRegrasLote(createAdminClient(), tenantId, await resolverAtorAudit(), p.data.alteracoes, { dryRun: p.data.dryRun, medidas })
    return r.ok ? json(200, r) : json(r.status, { ok: false, error: r.error })
  } catch (e) { return json(500, { ok: false, error: (e as Error)?.message || 'Falha ao salvar.' }) }
}
