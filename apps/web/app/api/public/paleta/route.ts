import { NextRequest } from 'next/server'
import { getCurrentTenant } from '@/lib/tenant'
import { lerPaletaNova, gerarCssPaleta, hashPaleta } from '@/lib/brand/paleta-nova'
import hexes from '@/lib/brand/paleta-nova-hexes.json'

// GET /api/public/paleta?v=<hash>
// CSS da paleta nova do tenant do host. PÚBLICO (só cores). Quem decide se o css entra na página é o layout
// (modo desligada/workspace/todos) — esta rota apenas serve. `v` = hash da paleta atual → cache imutável;
// hash desatualizado → resposta sem cache (nunca congela uma paleta velha sob uma URL nova).
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const tenant = await getCurrentTenant()
  if (!tenant) return new Response('/* sem tenant */', { status: 404, headers: { 'content-type': 'text/css; charset=utf-8' } })
  const p = lerPaletaNova(tenant.tema)
  const hash = hashPaleta(p)
  const v = req.nextUrl.searchParams.get('v')
  const iframe = req.nextUrl.searchParams.get('x') === 'ifr' // iframes: só `--pn-*` (sem tokens padrão)
  const css = gerarCssPaleta(p, hexes as string[], { iframe })
  return new Response(css, {
    headers: {
      'content-type': 'text/css; charset=utf-8',
      'cache-control': v === hash ? 'public, max-age=31536000, immutable' : 'no-store',
      vary: 'x-forwarded-host, host',
    },
  })
}
