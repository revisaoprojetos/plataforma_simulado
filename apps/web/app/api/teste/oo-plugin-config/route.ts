import { NextResponse } from 'next/server'

// SPIKE — config.json DINÂMICA do plugin do OnlyOffice. Serve pra injetar o id do documento na URL do
// index.html (o plugin lê de location.search), sem depender de localStorage (que o iframe aninhado
// pode particionar). O editor (origem :8082) baixa isso por XHR → precisa de CORS.
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const id = (url.searchParams.get('id') || '').replace(/[^a-z0-9-]/gi, '')
  const o = url.searchParams.get('o') || url.origin // origem do nosso app (alcançável pelo navegador)
  const idx = `${o}/oo-plugin/index.html${id ? `?id=${id}` : ''}`
  const res = `${o}/oo-plugin/resources`
  const config = {
    name: 'Blocos & Variáveis',
    nameLocale: { 'pt-BR': 'Blocos & Variáveis' },
    guid: 'asc.{C7A3F1E0-9B2D-4E6A-8F14-5D2B7C0A1E33}',
    version: '1.0.0',
    variations: [
      {
        description: 'Blocos prontos e variáveis — clique para inserir no documento.',
        descriptionLocale: { 'pt-BR': 'Blocos prontos e variáveis — clique para inserir no documento.' },
        url: idx,
        icons: [`${res}/icon.png`, `${res}/icon@2x.png`],
        icons2: [
          {
            '100%': { normal: `${res}/icon.png` },
            '125%': { normal: `${res}/icon@1.25x.png` },
            '150%': { normal: `${res}/icon@1.5x.png` },
            '175%': { normal: `${res}/icon@1.75x.png` },
            '200%': { normal: `${res}/icon@2x.png` },
          },
        ],
        isViewer: false,
        EditorsSupport: ['word'],
        isVisual: true,
        isModal: false,
        isInsideMode: false,
        initDataType: 'none',
        initData: '',
        buttons: [],
        size: [300, 800],
        type: 'panel',
      },
    ],
  }
  return NextResponse.json(config, { headers: { 'Access-Control-Allow-Origin': '*' } })
}
