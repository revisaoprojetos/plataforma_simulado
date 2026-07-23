'use server'

import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { checkPermission } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { invalidarRelatorios } from '@/lib/cache/relatorio-cache'
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

    // Confirma que estudante e simulado são DO tenant (não cruzar ids de outra plataforma).
    const [{ data: est }, { data: sim }] = await Promise.all([
      supabase.from('simulado_estudantes').select('id').eq('id', data.estudante_id).eq('tenant_id', tenantId).maybeSingle(),
      supabase.from('simulado_simulados').select('id').eq('id', data.simulado_id).eq('tenant_id', tenantId).maybeSingle(),
    ])
    if (!est) return { ok: false, error: 'Estudante não pertence a esta plataforma.' }
    if (!sim) return { ok: false, error: 'Simulado não pertence a esta plataforma.' }

    const { error } = await supabase.from('simulado_matriculas').insert({
      tenant_id: tenantId,
      estudante_id: data.estudante_id,
      simulado_id: data.simulado_id,
      liberado: true,
    })

    if (error) return { ok: false, error: error.message }
    await registrarAudit({ operacao: 'INSERT', entidade: 'simulado_matriculas', entidadeId: data.estudante_id, depois: { estudante_id: data.estudante_id, simulado_id: data.simulado_id } })
    await invalidarRelatorios(tenantId) // participantes mudaram → relatórios não podem servir valor velho
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
    await invalidarRelatorios(tenantId)
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
    await invalidarRelatorios(tenantId)
    revalidatePath('/admin/matriculas')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}
