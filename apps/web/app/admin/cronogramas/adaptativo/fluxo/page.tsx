import { PaginaFluxo } from '@/app/admin/fluxo/pagina-fluxo'

export const dynamic = 'force-dynamic'
// Admin: Cronograma Adaptativo — FLUXO. Usa o editor genérico (adaptador 'cronograma-adaptativo'); a page só LÊ.
export default function FluxoPage() { return <PaginaFluxo adaptadorId="cronograma-adaptativo" /> }
