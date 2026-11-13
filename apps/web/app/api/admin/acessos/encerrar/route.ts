import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, accessCan } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { esquecerRevogacao } from '@/lib/acessos/registro'
import { T_ACESSOS, tabelaIndisponivel, MSG_NAO_ATIVADO } from '@/lib/acessos/leitura'

export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/acessos/encerrar { estudante_id } — "Encerrar todas as sessões do aluno".
 * O login do aluno é um JWT sem estado; a revogação real é por carimbo: `simulado_estudantes.sessoes_revogadas_em`.
 * Todo token emitido ANTES do carimbo passa a ser recusado por getSessaoAluno (cache de 60 s no Redis por réplica).
 * O aluno pode entrar de novo (login leve) — ver limitação no relatório. Exige `acessos:manage`. Auditado.
 */
export async function POST(req: NextRequest) {
  const access = await getCurrentAccess()
  if (!access.userId || !access.tenantId || !accessCan(access, 'acessos:manage')) {
    return NextResponse.json({ message: 'Sem permissão.' }, { status: 403 })
  }
  let body: { estudante_id?: string }
  try { body = await req.json() } catch { return NextResponse.json({ message: 'Requisição inválida.' }, { status: 400 }) }
  const estudanteId = String(body.estudante_id ?? '')
  if (!/^[0-9a-f-]{36}$/i.test(estudanteId)) return NextResponse.json({ message: 'Aluno inválido.' }, { status: 400 })

  const svc = createAdminClient()
  const { data: est } = await svc.from('simulado_estudantes').select('id, nome, email').eq('id', estudanteId).eq('tenant_id', access.tenantId).maybeSingle()
  if (!est) return NextResponse.json({ message: 'Aluno não encontrado.' }, { status: 404 })

  const agora = new Date().toISOString()
  const up = await svc.from('simulado_estudantes').update({ sessoes_revogadas_em: agora }).eq('id', estudanteId).eq('tenant_id', access.tenantId)
  if (up.error) {
    const pendente = /sessoes_revogadas_em|column/i.test(up.error.message)
    return NextResponse.json({ message: pendente ? MSG_NAO_ATIVADO : up.error.message }, { status: pendente ? 409 : 500 })
  }
  const enc = await svc.from(T_ACESSOS).update({ encerrado_em: agora, motivo_encerramento: 'revogado_admin' })
    .eq('tenant_id', access.tenantId).eq('estudante_id', estudanteId).is('encerrado_em', null).is('impersonado_por', null).select('id')
  const n = tabelaIndisponivel(enc.error) ? 0 : (enc.data?.length ?? 0)
  await esquecerRevogacao(estudanteId)
  await registrarAudit({
    operacao: 'BLOQUEAR', entidade: 'aluno_sessoes', entidadeId: estudanteId, tenantId: access.tenantId, atorId: access.userId, atorTipo: 'admin',
    depois: { acao: 'encerrar_todas_as_sessoes', aluno: (est as { nome?: string }).nome ?? null, sessoes_encerradas: n },
  })
  return NextResponse.json({ ok: true, sessoes: n })
}
