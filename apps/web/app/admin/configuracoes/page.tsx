'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { getTenantTheme } from '@/lib/tenant-theme'
import { registrarAudit } from '@/lib/audit'
import { ConfiguracoesForm } from './configuracoes-form'

// ─── Server action ─────────────────────────────────────────────────────────────

export async function salvarTema(formData: FormData) {
  'use server'

  const cor_primaria = (formData.get('cor_primaria') as string | null) ?? ''
  const cor_secundaria = (formData.get('cor_secundaria') as string | null) ?? ''
  const cor_accent = (formData.get('cor_accent') as string | null) ?? ''
  const logo_url = (formData.get('logo_url') as string | null) ?? ''
  const logo_dark_url = (formData.get('logo_dark_url') as string | null) ?? ''
  const favicon = (formData.get('favicon') as string | null) ?? ''
  const fonte = (formData.get('fonte') as string | null) ?? ''

  const tema = {
    ...(cor_primaria && { cor_primaria }),
    ...(cor_secundaria && { cor_secundaria }),
    ...(cor_accent && { cor_accent }),
    ...(logo_url && { logo_url }),
    ...(logo_dark_url && { logo_dark_url }),
    ...(favicon && { favicon }),
    ...(fonte && { fonte }),
  }

  // Escrita em tenants exige service-role real (createServiceClient é
  // bloqueado por RLS e o UPDATE não afeta nenhuma linha — o save "falha em silêncio").
  const access = await getCurrentAccess()
  if (!(access.isAdmin || access.permissions.includes('configuracoes:view'))) {
    throw new Error('Sem permissão para alterar a identidade visual.')
  }

  const svc = createAdminClient()

  // Mira o tenant atual (resolvido pela sessão/subdomínio); fallback p/ o 1º ativo.
  let tenantId = access.tenantId
  if (!tenantId) {
    const { data: tenant } = await svc.from('simulado_tenants').select('id').eq('ativo', true).limit(1).single()
    tenantId = tenant?.id ?? null
  }
  if (!tenantId) throw new Error('Tenant não encontrado')

  const { data: anterior } = await svc.from('simulado_tenants').select('tema').eq('id', tenantId).maybeSingle()

  const { error } = await svc.from('simulado_tenants').update({ tema }).eq('id', tenantId)
  if (error) throw new Error(`Erro ao salvar tema: ${error.message}`)

  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_tenants', entidadeId: tenantId, antes: (anterior?.tema as Record<string, unknown>) ?? {}, depois: tema, tenantId })

  revalidatePath('/', 'layout')
  revalidatePath('/admin/configuracoes')
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default async function ConfiguracoesPage() {
  const { tema } = await getTenantTheme()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Configurações</h1>
        <p className="text-muted-foreground">
          Gerencie a identidade visual e informações de contato da plataforma.
        </p>
      </div>

      <ConfiguracoesForm tema={tema} salvarTema={salvarTema} />
    </div>
  )
}
