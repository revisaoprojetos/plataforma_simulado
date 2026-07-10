'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, checkPermission } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'

type Unidade = 'horas' | 'dias' | 'meses'

function calcExpira(base: Date, valor: number, unidade: Unidade): Date {
  const d = new Date(base)
  if (unidade === 'horas') d.setHours(d.getHours() + valor)
  else if (unidade === 'dias') d.setDate(d.getDate() + valor)
  else d.setMonth(d.getMonth() + valor)
  return d
}

/** Concede acesso avulso (modo prazo relativo) a um aluno num simulado. */
export async function concederAcesso(
  simuladoId: string,
  estudanteId: string,
  prazoValor: number,
  prazoUnidade: Unidade,
  tentativas: number,
): Promise<{ ok: boolean; error?: string }> {
  if (!(await checkPermission('simulados:update'))) return { ok: false, error: 'Sem permissão.' }
  const access = await getCurrentAccess()
  if (!estudanteId || prazoValor <= 0) return { ok: false, error: 'Informe aluno e prazo.' }

  const svc = createAdminClient()
  const liberado = new Date()
  const expira = calcExpira(liberado, prazoValor, prazoUnidade)

  const { error } = await svc.from('simulado_acessos').insert({
    tenant_id: access.tenantId,
    simulado_id: simuladoId,
    estudante_id: estudanteId,
    liberado_em: liberado.toISOString(),
    prazo_valor: prazoValor,
    prazo_unidade: prazoUnidade,
    expira_em: expira.toISOString(),
    tentativas_permitidas: Math.max(1, tentativas),
    tentativas_usadas: 0,
  })
  if (error) return { ok: false, error: error.message }

  await registrarAudit({ operacao: 'LIBERAR', entidade: 'simulado_acessos', entidadeId: simuladoId, depois: { estudante_id: estudanteId, expira_em: expira.toISOString(), tentativas } })
  revalidatePath(`/admin/simulados/${simuladoId}`)
  return { ok: true }
}

export async function revogarAcesso(acessoId: string, simuladoId: string): Promise<{ ok: boolean; error?: string }> {
  if (!(await checkPermission('simulados:update'))) return { ok: false, error: 'Sem permissão.' }
  const access = await getCurrentAccess()
  if (!access.tenantId) return { ok: false, error: 'Tenant não resolvido.' }
  const svc = createAdminClient()
  const { error } = await svc.from('simulado_acessos').delete().eq('id', acessoId).eq('tenant_id', access.tenantId)
  if (error) return { ok: false, error: error.message }
  await registrarAudit({ operacao: 'BLOQUEAR', entidade: 'simulado_acessos', entidadeId: acessoId })
  revalidatePath(`/admin/simulados/${simuladoId}`)
  return { ok: true }
}
