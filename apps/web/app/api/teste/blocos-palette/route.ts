import { NextResponse } from 'next/server'
import { getCurrentTenant } from '@/lib/tenant'
import { paletaBlocosDoTema } from '@/lib/conteudo/blocos-palette'

// Paleta dos blocos (cores da MARCA do tenant) resolvida NO SERVIDOR pelo host → o plugin OnlyOffice
// busca isto (fetch, mesmo canal do picker de simulados) e recolore os blocos. Mais confiável que
// localStorage. `debug` mostra de onde veio a cor (ajuda quando a marca está em chave inesperada).
export const dynamic = 'force-dynamic'

export async function GET() {
  const tenant = await getCurrentTenant()
  const tema: any = tenant?.tema ?? null
  const palette = paletaBlocosDoTema(tema)
  const cores = tema && typeof tema.cores === 'object' ? tema.cores : null
  const debug = { temCores: !!cores, btn: cores?.btn ?? null, sidebar: cores?.sidebar ?? null, accent: cores?.accent ?? null, cor_primaria: tema?.cor_primaria ?? null }
  return NextResponse.json({ ...palette, _debug: debug }, { headers: { 'cache-control': 'no-store' } })
}
