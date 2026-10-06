import { PlatformSimulado } from '@/components/brand/simulado/platform-simulado'
import { simMock } from '@/components/brand/simulado/mock'
import type { Brand, SimTheme, Tela, EstadoEntrada } from '@/components/brand/simulado/types'

// Pré-visualização do FLUXO DO SIMULADO redesenhado (spec 06) — mock, sem backend, produção intacta.
// Query: ?brand=revisao|vnd|meq & theme=claro|escuro|azul & tela=entrada|prova|resultado
//        & es=aberto|agendado|semcad|retomar|encerrado & mo=cad|folha
export const dynamic = 'force-dynamic'

const BRANDS: Brand[] = ['revisao', 'vnd', 'meq']
const TELAS: Tela[] = ['entrada', 'prova', 'resultado']
const TEMAS: SimTheme[] = ['claro', 'escuro', 'azul']
const ESTADOS: EstadoEntrada[] = ['aberto', 'agendado', 'semcad', 'retomar', 'encerrado']

export default async function SimuladoPreviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const str = (k: string) => (Array.isArray(sp[k]) ? sp[k]?.[0] : sp[k]) as string | undefined

  const brand = (BRANDS.includes(str('brand') as Brand) ? str('brand') : 'revisao') as Brand
  const tela = (TELAS.includes(str('tela') as Tela) ? str('tela') : 'entrada') as Tela
  let theme = (TEMAS.includes(str('theme') as SimTheme) ? str('theme') : 'claro') as SimTheme
  if (theme === 'azul' && brand !== 'meq') theme = 'claro'
  const es = (ESTADOS.includes(str('es') as EstadoEntrada) ? str('es') : 'aberto') as EstadoEntrada
  const mo = (str('mo') === 'folha' ? 'folha' : 'cad') as 'cad' | 'folha'

  return (
    <PlatformSimulado brand={brand} tela={tela} theme={theme} data={simMock(brand)} preview es={es} mo={mo} />
  )
}
