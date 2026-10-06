import { NextResponse } from 'next/server'
import { getCurrentTenant } from '@/lib/tenant'
import { lerAparenciaAuth, aparenciaAuthPublica } from '@/lib/brand/aparencia-auth'
import { catalogoDaMarca } from '@/lib/brand/appearance-catalogo'

// GET /api/public/appearance
// Leitura PÚBLICA e sem auth da aparência de login/carregamento da plataforma (spec 02 §4).
// A tela de login precisa disto ANTES de haver sessão, por isso é pública.
// `getCurrentTenant` resolve o tenant pelo host (x-forwarded-host atrás do Traefik) usando
// createAdminClient (service role) — padrão de rotas pré-auth p/ não bater no RLS.
export const dynamic = 'force-dynamic'

export async function GET() {
  const tenant = await getCurrentTenant()

  // Tenant não resolvido: devolve o fallback da marca Revisão (nunca 500 numa rota pré-login).
  if (!tenant) {
    const cat = catalogoDaMarca('revisao')
    return NextResponse.json({
      brand: 'revisao',
      loginAtivo: false,
      loadingAtivo: true,
      internoAtivo: false,
      loginStyle: cat.fallback.login,
      loadingStyle: cat.fallback.loading,
      defaultTheme: cat.fallback.theme,
      followSystemTheme: false,
      loadingMinMs: null,
    })
  }

  const aparencia = lerAparenciaAuth(tenant.tema, { slug: tenant.slug, nome: tenant.nome })
  return NextResponse.json(aparenciaAuthPublica(aparencia))
}
