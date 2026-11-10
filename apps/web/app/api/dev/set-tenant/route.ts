import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/server'

// Apenas em desenvolvimento — seta um cookie de override de tenant para acesso por IP puro.
// Uso: GET /api/dev/set-tenant?slug=simulado
// Permite acessar qualquer plataforma via http://192.168.0.x:3000 sem precisar de DNS.
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 404 })
  }

  const slug = request.nextUrl.searchParams.get('slug')
  if (!slug) {
    return NextResponse.json({ error: 'Informe ?slug=<tenant>' }, { status: 400 })
  }

  // Valida que o slug existe
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('simulado_tenants')
    .select('slug, nome')
    .eq('slug', slug)
    .maybeSingle()

  if (!data) {
    return NextResponse.json({ error: `Tenant "${slug}" não encontrado.` }, { status: 404 })
  }

  const jar = await cookies()
  jar.set('tenant_dev_slug', slug, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24, // 1 dia
  })

  // request.url usa o endereço interno (localhost) mesmo quando acessado via IP da rede local.
  // Usar o host do header garante o redirect para o IP correto no tablet.
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || request.nextUrl.host
  const proto = request.headers.get('x-forwarded-proto') || 'http'
  return NextResponse.redirect(new URL('/login', `${proto}://${host}`))
}
