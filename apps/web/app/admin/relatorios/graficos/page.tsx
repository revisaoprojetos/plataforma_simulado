import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { RelatorioGraficoView } from './relatorio-grafico-view'
import { montarRelatorioGrafico } from './_dados'
import { CabecalhoArea } from '@/components/admin/cabecalho-area'

export default async function RelatorioGraficoPage() {
  const svc = await createServiceClient()
  const tenantId = await getCurrentTenantId()
  const dados = await montarRelatorioGrafico(svc, tenantId)

  return (
    <div className="space-y-5">
      <CabecalhoArea titulo="Relatório Gráfico" descricao="Visão geral da plataforma. Alterne a granularidade (dia/semana/mês/ano) nas séries temporais." />
      <RelatorioGraficoView d={dados} />
    </div>
  )
}
