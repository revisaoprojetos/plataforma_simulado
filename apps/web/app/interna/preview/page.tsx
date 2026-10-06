import { PlatformPerfil } from '@/components/brand/interna/perfil'
import { PlatformResultadoInterno } from '@/components/brand/interna/resultado'
import { PlatformCronograma } from '@/components/brand/interna/cronograma'
import { PlatformRealizados } from '@/components/brand/interna/realizados'
import { PlatformHome } from '@/components/brand/interna/home'
import { PlatformRecomendado } from '@/components/brand/interna/recomendado'
import { homeMock } from '@/components/brand/interna/home/mock'
import type { Brand, InternaTheme } from '@/components/brand/interna/types'

// Prévia das TELAS INTERNAS redesenhadas (spec 05) — mock, sem backend, produção intacta.
// Query: ?page=perfil|resultado|cronograma & brand=revisao|vnd|meq & theme=claro|escuro|azul & tab=
export const dynamic = 'force-dynamic'

const BRANDS: Brand[] = ['revisao', 'vnd', 'meq']
const TEMAS: InternaTheme[] = ['claro', 'escuro', 'azul']
const PAGES = ['home', 'perfil', 'resultado', 'cronograma', 'realizados', 'recomendado'] as const

export default async function InternaPreviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const str = (k: string) => (Array.isArray(sp[k]) ? sp[k]?.[0] : sp[k]) as string | undefined

  const page = (PAGES.includes(str('page') as (typeof PAGES)[number]) ? str('page') : 'home') as (typeof PAGES)[number]
  const brand = (BRANDS.includes(str('brand') as Brand) ? str('brand') : 'revisao') as Brand
  let theme = (TEMAS.includes(str('theme') as InternaTheme) ? str('theme') : 'claro') as InternaTheme
  if (theme === 'azul' && brand !== 'meq') theme = 'claro'
  const tab = str('tab')

  if (page === 'resultado') return <PlatformResultadoInterno brand={brand} theme={theme} tab={tab} preview />
  if (page === 'cronograma') return <PlatformCronograma brand={brand} theme={theme} tab={tab} preview />
  if (page === 'perfil') return <PlatformPerfil brand={brand} theme={theme} tab={tab} preview />
  if (page === 'realizados') return <PlatformRealizados brand={brand} theme={theme} tab={tab} preview />
  if (page === 'recomendado') return <PlatformRecomendado brand={brand} theme={theme} tab={tab} preview />
  return <PlatformHome brand={brand} theme={theme} data={homeMock(brand)} preview />
}
