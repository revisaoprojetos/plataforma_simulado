import { SemPermissao } from '@/components/ui/alert-box'
import { AdaptativoTabs } from '@/components/admin/adaptativo-tabs'
import { carregarPaginaRegras } from '../regras-pagina'
import { FaixasClient } from './faixas-client'

export const dynamic = 'force-dynamic'

// Admin: Cronograma Adaptativo — FAIXAS E LIMITES (regras do motor como dados). A page só LÊ; salvar/validar roda nas server actions.
export default async function FaixasPage() {
  const p = await carregarPaginaRegras()
  if (p.semAcesso) return <SemPermissao>Você não tem permissão para ver as regras do cronograma adaptativo.</SemPermissao>
  return (
    <div className="w-full space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Cronograma adaptativo · Faixas e limites</h1>
        <p className="text-muted-foreground">Regras estruturais do motor desta plataforma. O que difere do padrão fica destacado. Salvar vale só para planos <b>gerados dali em diante</b>; planos já gravados não mudam.</p>
      </div>
      <AdaptativoTabs />
      <FaixasClient registro={p.registro} podeEditar={p.podeEditar} />
    </div>
  )
}
