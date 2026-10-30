'use server'

import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { checkPermission } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { sanearAjudaFaq, type Tema } from '@/lib/ajuda/faq'

/**
 * Salva o FAQ da Ajuda do aluno em `simulado_tenants.tema.ajuda_faq` (merge raso no tema, sem migração).
 * Mesmo padrão das actions de mensagens (guard por permissão + tenant corrente) e do save de tema
 * (merge raso + auditoria).
 */
export async function salvarAjudaFaq(faq: Tema[]): Promise<void> {
  if (!(await checkPermission('configuracoes:manage'))) throw new Error('Sem permissão para alterar a Ajuda.')
  const tenantId = await getCurrentTenantId()
  if (!tenantId) throw new Error('Tenant não resolvido.')

  const limpo = sanearAjudaFaq(faq)
  const supabase = await createServiceClient()

  const { data: anterior } = await supabase
    .from('simulado_tenants')
    .select('tema')
    .eq('id', tenantId)
    .maybeSingle()

  const temaAtual = (anterior?.tema as Record<string, unknown> | null) ?? {}
  const merged = { ...temaAtual, ajuda_faq: limpo }

  const { error } = await supabase
    .from('simulado_tenants')
    .update({ tema: merged })
    .eq('id', tenantId)

  if (error) throw new Error(`Erro ao salvar a Ajuda: ${error.message}`)

  await registrarAudit({
    operacao: 'UPDATE',
    entidade: 'simulado_tenants',
    entidadeId: tenantId,
    tenantId,
    antes: { ajuda_faq: temaAtual.ajuda_faq ?? null },
    depois: { ajuda_faq: limpo },
  })

  revalidatePath('/admin/configuracoes/ajuda')
  revalidatePath('/', 'layout')
}
