'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { normalizarManutencao, type ManutencaoSistema } from '@/lib/sistema/manutencao'

/** Salva a manutenção da plataforma em tenants.tema.manutencao_sistema (merge, sem apagar o tema). */
export async function salvarManutencaoSistema(input: ManutencaoSistema) {
  const access = await getCurrentAccess()
  if (!(access.isAdmin || access.permissions.includes('configuracoes:view'))) {
    return { error: 'Sem permissão para alterar a manutenção do sistema.' }
  }

  const svc = createAdminClient()
  let tenantId = access.tenantId
  if (!tenantId) {
    const { data } = await svc.from('simulado_tenants').select('id').eq('ativo', true).limit(1).single()
    tenantId = data?.id ?? null
  }
  if (!tenantId) return { error: 'Tenant não encontrado.' }

  const { data: anterior } = await svc.from('simulado_tenants').select('tema').eq('id', tenantId).maybeSingle()
  const temaAnterior = (anterior?.tema as Record<string, unknown>) ?? {}
  const cfg = normalizarManutencao(input)
  const merged = { ...temaAnterior, manutencao_sistema: cfg }

  const { error } = await svc.from('simulado_tenants').update({ tema: merged }).eq('id', tenantId)
  if (error) return { error: `Erro ao salvar: ${error.message}` }

  await registrarAudit({
    operacao: cfg.ativo ? 'BLOQUEAR' : 'LIBERAR',
    entidade: 'simulado_tenants',
    entidadeId: tenantId,
    antes: { manutencao_sistema: (temaAnterior as Record<string, unknown>).manutencao_sistema ?? null },
    depois: { manutencao_sistema: cfg },
    tenantId,
  })

  revalidatePath('/', 'layout')
  revalidatePath('/admin/sistema')
  return { ok: true }
}
