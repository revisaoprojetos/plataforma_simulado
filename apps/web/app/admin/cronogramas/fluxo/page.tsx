import { PaginaFluxo } from '@/app/admin/fluxo/pagina-fluxo'

export const dynamic = 'force-dynamic'
// Admin: Gerador de Cronogramas — FLUXO. Mesmo editor genérico (adaptador 'cronograma-gerador').
export default function FluxoGeradorPage() { return <PaginaFluxo adaptadorId="cronograma-gerador" /> }
