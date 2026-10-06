// Gate do NOVO VISUAL INTERNO para as páginas do portal. Quando o console liga `internoAtivo`,
// cada área pode renderizar o componente redesenhado. Perfil/Resultado/Cronograma ainda usam dados
// de EXEMPLO (mock) — é um estado de ROLL-OUT/revisão; o wiring aos dados reais vem por área.

import { getCurrentTenant } from '@/lib/tenant'
import { lerAparenciaAuth } from '@/lib/brand/aparencia-auth'
import { resolveTemaDark } from '@/lib/hud/resolve-dark'
import type { InternaTheme, Brand } from '@/components/brand/interna/interna-tokens'

export async function resolverInterno(): Promise<{ ativo: boolean; brand: Brand; theme: InternaTheme }> {
  const tenant = await getCurrentTenant()
  const ap = lerAparenciaAuth(tenant?.tema, { slug: tenant?.slug, nome: tenant?.nome })
  const dark = await resolveTemaDark()
  return { ativo: ap.internoAtivo, brand: ap.brand, theme: dark ? 'escuro' : 'claro' }
}
