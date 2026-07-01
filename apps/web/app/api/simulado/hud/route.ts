import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { resolverHudConfig } from '@/lib/hud/resolve-hud'
import { HUD_CORES_PADRAO } from '@/lib/caderno-designer/types'

// GET /api/simulado/hud?token={embed_token}
// Retorna o HUD (cores + estilos por página) do caderno vinculado ao simulado,
// para temar as telas de carregamento antes da sessão carregar.
export async function GET(request: NextRequest) {
  const token = new URL(request.url).searchParams.get('token')
  if (!token) return NextResponse.json({ base: HUD_CORES_PADRAO, porPagina: {} }, { status: 200 })
  try {
    const svc = createAdminClient()
    const { data: sim } = await svc
      .from('simulado_simulados')
      .select('id, tenant_id')
      .eq('embed_token', token)
      .maybeSingle()
    if (!sim) return NextResponse.json({ base: HUD_CORES_PADRAO, porPagina: {} })
    const hud = await resolverHudConfig(sim.id as string, sim.tenant_id as string)
    // Branding (logo) — a tela de carregamento mostra o logo do tenant.
    let branding: { logoUrl: string | null; logoBg: string; logoEstilo: string } | null = null
    try {
      const { data: t } = await svc.from('simulado_tenants').select('tema').eq('id', sim.tenant_id).maybeSingle()
      const tema = (t?.tema ?? {}) as Record<string, string>
      branding = { logoUrl: tema.logo_url ?? null, logoBg: tema.logo_png_bg ?? '#ffffff', logoEstilo: tema.logo_estilo ?? 'arredondado' }
    } catch { /* sem branding */ }
    return NextResponse.json({ base: hud.base, porPagina: hud.porPagina, branding })
  } catch {
    return NextResponse.json({ base: HUD_CORES_PADRAO, porPagina: {} })
  }
}
