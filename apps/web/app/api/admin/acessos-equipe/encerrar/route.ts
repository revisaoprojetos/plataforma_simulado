import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, accessCan, isSuperAdmin } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { T_SESSOES, tabelaAusente } from '@/lib/admin-rastreio/registro'
import { MSG_NAO_ATIVADO_ADMIN } from '@/lib/admin-rastreio/leitura'

export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/acessos-equipe/encerrar { user_id } — encerra as sessões abertas de um membro da equipe.
 * Marca `encerrado_em`; o navegador do membro, no próximo heartbeat (≤ 60 s), recebe `encerrada` e é deslogado.
 * Também revoga as sessões/refresh tokens do Supabase Auth do alvo (RPC; o access token vigente expira em ≤ 1h). Exige `acessos:manage`. Auditado.
 */
export async function POST(req: NextRequest) {
  const access = await getCurrentAccess()
  if (!access.userId || !(await isSuperAdmin()) || !access.tenantId || !accessCan(access, 'acessos:manage')) {
    return NextResponse.json({ message: 'Sem permissão.' }, { status: 403 })
  }
  let body: { user_id?: string }
  try { body = await req.json() } catch { return NextResponse.json({ message: 'Requisição inválida.' }, { status: 400 }) }
  const alvo = String(body.user_id ?? '')
  if (!/^[0-9a-f-]{36}$/i.test(alvo)) return NextResponse.json({ message: 'Usuário inválido.' }, { status: 400 })
  if (alvo === access.userId) return NextResponse.json({ message: 'Para encerrar a própria sessão use "Sair".' }, { status: 400 })

  const { data, error } = await createAdminClient().from(T_SESSOES)
    .update({ encerrado_em: new Date().toISOString(), motivo: 'encerrada_admin' })
    .eq('tenant_id', access.tenantId).eq('user_id', alvo).is('encerrado_em', null).select('id')
  if (error) {
    const pendente = tabelaAusente(error)
    return NextResponse.json({ message: pendente ? MSG_NAO_ATIVADO_ADMIN : error.message }, { status: pendente ? 409 : 500 })
  }
  // Revoga o login de fato (best-effort: sem a migration 20261121120000 só vale o encerramento do rastreio).
  let authRevogadas: number | null = null
  const rv = await createAdminClient().rpc('simulado_admin_revogar_auth', { p_user: alvo })
  if (!rv.error) authRevogadas = Number(rv.data ?? 0)
  await registrarAudit({
    operacao: 'BLOQUEAR', entidade: 'admin_sessoes', entidadeId: alvo, tenantId: access.tenantId, atorId: access.userId, atorTipo: 'admin', metodo: 'POST',
    depois: { acao: 'encerrar_sessoes_equipe', sessoes_encerradas: data?.length ?? 0, sessoes_auth_revogadas: authRevogadas },
  })
  return NextResponse.json({ ok: true, sessoes: data?.length ?? 0, auth_revogadas: authRevogadas })
}
