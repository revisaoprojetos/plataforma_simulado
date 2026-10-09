import { PlatformLogin } from '@/components/brand/platform-login'
import { PlatformLoader } from '@/components/brand/platform-loader'
import {
  catalogoDaMarca,
  loginSlugValido,
  loadingSlugValido,
  temaValido,
  type Brand,
  type Theme,
} from '@/lib/brand/appearance-catalogo'

// Pré-visualização de login/carregamento (spec 02 §4) — abre o estilo escolhido no console em
// nova aba, SEM salvar e SEM login real (preview=true desarma submit/navegação).
// Query: ?brand=&login=&loading=&theme=&view=login|loading
export const dynamic = 'force-dynamic'

export default async function LoginPreviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const str = (k: string) => (Array.isArray(sp[k]) ? sp[k]?.[0] : sp[k]) as string | undefined

  const brand = (['revisao', 'vnd', 'meq'].includes(str('brand') ?? '') ? str('brand') : 'revisao') as Brand
  const cat = catalogoDaMarca(brand)
  const theme = (temaValido(brand, str('theme') as Theme) ? str('theme') : cat.fallback.theme) as Theme
  const loginStyle = loginSlugValido(brand, str('login') ?? '') ? (str('login') as string) : cat.fallback.login
  const loadingStyle = loadingSlugValido(brand, str('loading') ?? '') ? (str('loading') as string) : cat.fallback.loading
  const view = str('view') === 'loading' ? 'loading' : 'login'

  // Ticker do título (MEQ) — palavras vêm por query (`words=a|b|c`) p/ o preview refletir as edições
  // do console sem precisar salvar. `animar=1` liga a animação.
  const palavras = (str('words') ?? '').split('|').map((s) => s.trim()).filter(Boolean)
  const ticker = palavras.length ? { animar: str('animar') === '1', palavras } : null

  if (view === 'loading') {
    return <PlatformLoader brand={brand} theme={theme} style={loadingStyle} message="Pré-visualização do carregamento" />
  }

  return (
    <PlatformLogin
      brand={brand}
      theme={theme}
      style={loginStyle}
      metodo="email"
      preview
      plataforma={cat.nome}
      modoInicial="aluno"
      ticker={ticker}
    />
  )
}
