import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { SimuladosLista } from './simulados-lista'
import { Voltar } from '@/components/admin/relatorios/voltar'
import { resumosSimulados } from '../_resumos'
import { RelatorioSimuladoView } from './relatorio-simulado-view'
import { montarRelatorioSimulado } from './_dados'
import { CabecalhoArea } from '@/components/admin/cabecalho-area'

// Sempre renderiza com dados frescos (reflete matrículas/sessões recém-criadas).
export const dynamic = 'force-dynamic'

export default async function RelatorioSimuladoPage({ searchParams }: { searchParams: Promise<{ simulado?: string }> }) {
  const { simulado: simId } = await searchParams
  const svc = await createServiceClient()
  const tenantId = await getCurrentTenantId()

  const dados = simId ? await montarRelatorioSimulado(svc, simId, tenantId) : null
  const resumos = simId ? [] : await resumosSimulados(svc, tenantId)

  return (
    <div className="space-y-5">
      {simId && <Voltar href="/admin/relatorios/simulados" label="Todos os simulados" />}
      <CabecalhoArea titulo="Relatório por Simulado" descricao={simId ? 'Análise completa do simulado.' : 'Todos os simulados — clique num para ver a análise completa.'} />
      {!simId ? (
        <SimuladosLista itens={resumos} />
      ) : dados ? (
        <RelatorioSimuladoView d={dados} />
      ) : (
        <p className="text-sm text-muted-foreground">Simulado não encontrado.</p>
      )}
    </div>
  )
}
