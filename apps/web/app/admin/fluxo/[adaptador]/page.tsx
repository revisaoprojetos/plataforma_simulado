import { PaginaFluxo } from '../pagina-fluxo'

// Rota genérica: qualquer adaptador registrado em lib/admin/fluxo/registro.ts abre aqui (/admin/fluxo/<id>).
export const dynamic = 'force-dynamic'
export default async function FluxoGenericoPage({ params }: { params: Promise<{ adaptador: string }> }) {
  const { adaptador } = await params
  return <PaginaFluxo adaptadorId={adaptador} />
}
