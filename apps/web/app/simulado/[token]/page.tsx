import { resolveTemaDark } from '@/lib/hud/resolve-dark'
import { createAdminClient } from '@/lib/supabase/server'
import { resolverHudConfig } from '@/lib/hud/resolve-hud'
import { HUD_CORES_PADRAO, type HudCores, type HudPorPagina } from '@/lib/caderno-designer/types'
import { ProvaClient } from './prova-client'

// Resolve o HUD do caderno vinculado NO SERVIDOR (por token) e passa como estado inicial —
// assim a tela de carregamento já nasce temada (cor/estilo/logo), sem a piscada da versão padrão.
export default async function ProvaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  let base: HudCores = HUD_CORES_PADRAO
  let porPagina: HudPorPagina = {}
  let branding: { logoUrl: string | null; logoBg: string; logoEstilo: string } | null = null

  try {
    const svc = createAdminClient()
    const { data: sim } = await svc
      .from('simulado_simulados')
      .select('id, tenant_id')
      .eq('embed_token', token)
      .maybeSingle()
    if (sim) {
      const hud = await resolverHudConfig(sim.id as string, sim.tenant_id as string)
      base = hud.base
      porPagina = hud.porPagina
      try {
        const { data: t } = await svc.from('simulado_tenants').select('tema').eq('id', sim.tenant_id).maybeSingle()
        const tema = (t?.tema ?? {}) as Record<string, string>
        branding = { logoUrl: tema.logo_url ?? null, logoBg: tema.logo_png_bg ?? '#ffffff', logoEstilo: tema.logo_estilo ?? 'arredondado' }
      } catch { /* sem branding */ }
    }
  } catch { /* fallback padrão */ }

  const dark = await resolveTemaDark()

  return <ProvaClient token={token} hudInicial={{ base, porPagina, branding }} darkInicial={dark} />
}
