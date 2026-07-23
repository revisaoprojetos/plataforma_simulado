'use server'

import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { checkPermission } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { revalidatePath } from 'next/cache'

export async function criarMatricula(data: {
  estudante_id: string
  simulado_id: string
}): Promise<{ ok: boolean; error?: string }> {
  try {
    if (!(await checkPermission('matriculas:create'))) return { ok: false, error: 'Você não tem permissão para criar matrículas.' }
    const tenantId = await getCurrentTenantId()
    if (!tenantId) return { ok: false, error: 'Tenant não resolvido.' }

    const supabase = await createServiceClient()

    const { error } = await supabase.from('simulado_matriculas').insert({
      tenant_id: tenantId,
      estudante_id: data.estudante_id,
      simulado_id: data.simulado_id,
      liberado: true,
    })

    if (error) return { ok: false, error: error.message }
    await registrarAudit({ operacao: 'INSERT', entidade: 'simulado_matriculas', entidadeId: data.estudante_id, depois: { estudante_id: data.estudante_id, simulado_id: data.simulado_id } })
    revalidatePath('/admin/matriculas')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}

export async function toggleMatriculaAcesso(
  matriculaId: string,
  liberado: boolean,
): Promise<{ ok: boolean; error?: string }> {
  try {
    if (!(await checkPermission('matriculas:update'))) return { ok: false, error: 'Você não tem permissão para alterar matrículas.' }
    const tenantId = await getCurrentTenantId()
    if (!tenantId) return { ok: false, error: 'Tenant não resolvido.' }

    const supabase = await createServiceClient()
    const { error } = await supabase
      .from('simulado_matriculas')
      .update({ liberado })
      .eq('id', matriculaId)
      .eq('tenant_id', tenantId)

    if (error) return { ok: false, error: error.message }
    await registrarAudit({ operacao: liberado ? 'LIBERAR' : 'BLOQUEAR', entidade: 'simulado_matriculas', entidadeId: matriculaId, depois: { liberado } })
    revalidatePath('/admin/matriculas')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}

export async function excluirMatricula(
  matriculaId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    if (!(await checkPermission('matriculas:delete'))) return { ok: false, error: 'Você não tem permissão para excluir matrículas.' }
    const tenantId = await getCurrentTenantId()
    if (!tenantId) return { ok: false, error: 'Tenant não resolvido.' }

    const supabase = await createServiceClient()
    const { error } = await supabase
      .from('simulado_matriculas')
      .delete()
      .eq('id', matriculaId)
      .eq('tenant_id', tenantId)

    if (error) return { ok: false, error: error.message }
    await registrarAudit({ operacao: 'DELETE', entidade: 'simulado_matriculas', entidadeId: matriculaId })
    revalidatePath('/admin/matriculas')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}
