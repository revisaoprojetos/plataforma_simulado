import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { RelatorioGraficoView } from './relatorio-grafico-view'
import { montarRelatorioGrafico } from './_dados'
import { BarraSetorSlot } from '@/components/admin/barra-setor-slot'

export default async function RelatorioGraficoPage() {
  const svc = await createServiceClient()
  const tenantId = await getCurrentTenantId()
  const dados = await montarRelatorioGrafico(svc, tenantId)

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Relatório Gráfico</h1>
        <p className="text-muted-foreground">Visão geral da plataforma. Alterne a granularidade (dia/semana/mês/ano) nas séries temporais.</p>
      </div>
      <BarraSetorSlot />
      <RelatorioGraficoView d={dados} />
    </div>
  )
}
