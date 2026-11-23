import { SemPermissao } from '@/components/ui/alert-box'
import { AdaptativoTabs } from '@/components/admin/adaptativo-tabs'
import { montarFluxo } from '@/lib/cronograma/adaptativo/fluxo-regras'
import { carregarPaginaRegras } from '../regras-pagina'
import { FluxoClient } from './fluxo-client'

export const dynamic = 'force-dynamic'

// Admin: Cronograma Adaptativo — FLUXO (do cadastro ao plano gravado + árvores de decisão), gerado das regras vigentes do tenant.
// A page só LÊ: o grafo é montado por função pura no servidor; o caminho do simulador vem da action `simularFaixa`.
export default async function FluxoPage() {
  const p = await carregarPaginaRegras()
  if (p.semAcesso) return <SemPermissao>Você não tem permissão para ver o fluxo do cronograma adaptativo.</SemPermissao>
  return (
    <div className="w-full space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Cronograma adaptativo · Fluxo</h1>
        <p className="text-muted-foreground">Do cadastro ao plano gravado e as árvores de decisão, geradas das <b>regras vigentes</b> (versão {p.registro.versao || 'padrão'}). Clique em uma etapa para ler o que ela faz.</p>
      </div>
      <AdaptativoTabs />
      <FluxoClient diagramas={montarFluxo(p.registro.regras)} />
    </div>
  )
}
