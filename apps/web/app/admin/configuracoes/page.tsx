'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { getTenantTheme } from '@/lib/tenant-theme'
import { registrarAudit } from '@/lib/audit'
import { Palette } from 'lucide-react'
import { ConfiguracoesTabs } from './configuracoes-tabs'

// ─── Server action ─────────────────────────────────────────────────────────────

export async function salvarTema(tema: Record<string, unknown>) {
  'use server'

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

  // Mescla com o tema atual — cada aba (Sistema/Carregamento/Avançado) salva
  // só seus campos sem apagar os das outras.
  const merged = { ...((anterior?.tema as Record<string, unknown>) ?? {}), ...tema }

  const { error } = await svc.from('simulado_tenants').update({ tema: merged }).eq('id', tenantId)
  if (error) throw new Error(`Erro ao salvar tema: ${error.message}`)

  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_tenants', entidadeId: tenantId, antes: (anterior?.tema as Record<string, unknown>) ?? {}, depois: merged, tenantId })

  revalidatePath('/', 'layout')
  revalidatePath('/admin/configuracoes')
  return { ok: true }
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default async function ConfiguracoesPage() {
  const { tema } = await getTenantTheme()

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Palette className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Aparência da plataforma</h1>
          <p className="text-muted-foreground">
            Identidade visual, cores, tema claro/escuro e telas de carregamento — tudo em um só lugar.
          </p>
        </div>
      </div>

      <ConfiguracoesTabs tema={tema} salvarTema={salvarTema} />
    </div>
  )
}
