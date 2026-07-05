import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { Voltar } from '@/components/admin/relatorios/voltar'
import { RankingView } from './ranking-view'
import { RankingLista } from './ranking-lista'
import { resumosSimulados } from '../_resumos'
import { montarRankingSimulado } from './_dados'

export default async function RankingPage({ searchParams }: { searchParams: Promise<{ simulado?: string }> }) {
  const { simulado: simId } = await searchParams
  const svc = await createServiceClient()
  const tenantId = await getCurrentTenantId()

  const dados = simId ? await montarRankingSimulado(svc, simId, new Date().toISOString()) : null
  const resumos = simId ? [] : await resumosSimulados(svc, tenantId)

  return (
    <div className="space-y-5">
      <div>
        {simId && <Voltar href="/admin/relatorios/ranking" label="Todos os simulados" />}
        <h1 className="text-2xl font-bold tracking-tight">Ranking</h1>
        <p className="text-muted-foreground">{simId ? 'Classificação e critérios de desempate.' : 'Todos os simulados — clique num para ver a classificação e configurar os critérios.'}</p>
      </div>

      {!simId ? (
        <RankingLista itens={resumos} />
      ) : dados ? (
        <RankingView simuladoId={simId} titulo={dados.titulo} grupos={dados.grupos} totalQuestoes={dados.totalQuestoes} entradas={dados.entradas} criteriosIniciais={dados.criterios} afetados={dados.afetados} />
      ) : (
        <p className="text-sm text-muted-foreground">Simulado não encontrado.</p>
      )}
    </div>
  )
}
