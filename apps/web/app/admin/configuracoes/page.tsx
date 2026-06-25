'use server'

import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/server'
import { getTenantTheme } from '@/lib/tenant-theme'
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

  const supabase = await createServiceClient()

  // Fetch the first active tenant
  const { data: tenant, error: fetchError } = await supabase
    .from('tenants')
    .select('id')
    .eq('ativo', true)
    .limit(1)
    .single()

  if (fetchError || !tenant) {
    throw new Error('Tenant não encontrado')
  }

  const { error } = await supabase
    .from('tenants')
    .update({ tema })
    .eq('id', tenant.id)

  if (error) {
    throw new Error(`Erro ao salvar tema: ${error.message}`)
  }

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
