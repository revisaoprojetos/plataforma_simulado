import { Suspense } from 'react'
import { HistoricoRegras } from '@/app/admin/cronogramas/adaptativo/versoes/historico'
import { createAdminClient } from '@/lib/supabase/server'
import { formatBrt } from '@/lib/brt'
import { comLimite } from '@/lib/admin/com-limite'
import { crAlteradas } from '@/lib/revisao/cronograma-schema'
import { listarVersoes, resumoExportacao } from '@/lib/revisao/cronograma'
import { RevisaoCard } from '@/components/admin/revisao/ui'
import { BarraBusca, Nota, ParamsInt, ThFixo, ThOrd } from '../../../_comp/lista'
import { TabelaCron } from '../../tabela-cron'
import { CarregarVersao, ConfigIO, SalvarVersaoBotao } from '../../acoes-client'
import { BASE, kpisAdaptativo, porPagina, qsAdaptativo, regrasDaRequisicao, type PropsAbaAdaptativo } from '../comum'

// Vista "Versões" do Adaptativo (?aba=adaptativo&sub=versoes&v=versoes) = versões salvas + exportação + histórico das regras (unificadas). Não monta a base de cobertura (usa os KPIs em cache).

export default async function AdaptativoVersoes({ sp, tenantId, podeEditar }: PropsAbaAdaptativo) {
  const qs = qsAdaptativo(sp, 'ver')
  const svc = createAdminClient()
  const [regras, k] = await Promise.all([regrasDaRequisicao(tenantId), kpisAdaptativo(tenantId)])
  const aulas = k?.aulas ?? 0
  const regrasAlteradas = k?.alteradas ?? crAlteradas(regras.valores).length
  const migrado = regras.migrado
  const por = porPagina(qs.pps)
  const pagina = ParamsInt(qs.pag, 1)
  // independentes: a exportação (catálogo/cobertura) e a lista de versões vão juntas, com limite de tempo (erro → boundary com "Tentar de novo")
  const [resumo, r] = await comLimite(Promise.all([
    resumoExportacao(svc, tenantId, regras.valores, aulas),
    listarVersoes(svc, tenantId, { q: qs.q, ordem: qs.ord, dir: qs.dir === 'desc' ? 'desc' : 'asc', pagina, por }),
  ]), 30_000, 'As versões do cronograma')
  return (
    <div className="space-y-6">
    <div className="grid gap-4 xl:grid-cols-2">
      <RevisaoCard>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div><h2 className="text-base font-semibold">Versões salvas</h2><p className="text-sm text-muted-foreground">Cada versão guarda as regras e as disciplinas (agora {regrasAlteradas} regras alteradas · {aulas} aulas)</p></div>
          <SalvarVersaoBotao podeEditar={podeEditar} />
        </div>
        {!migrado && <Nota tipo="aviso">Aplique a migração 20261112050000_revisao_cronograma_duvidas.sql para salvar versões.</Nota>}
        <BarraBusca base={BASE} qs={qs} preservar={['aba', 'sub', 'v']} placeholder="Buscar pelo número da versão" />
        <TabelaCron tipo="versoes" podeEditar={podeEditar} colunas={5} total={r.total} page={pagina} pp={por} vazio={qs.q ? 'Nenhuma versão com esse número.' : 'Nenhuma versão salva ainda.'}
          head={<><ThOrd rotulo="Versão" col="numero" base={BASE} qs={qs} /><ThOrd rotulo="Salva em" col="data" base={BASE} qs={qs} /><ThOrd rotulo="Regras alteradas" col="alteradas" base={BASE} qs={qs} /><ThOrd rotulo="Aulas" col="aulas" base={BASE} qs={qs} /><ThFixo>Ações</ThFixo></>}
          rows={r.itens.map((v) => ({ id: v.id, cells: [
            <span key="n" className="font-medium">Versão {v.numero}</span>, <span key="d" className="text-muted-foreground">{formatBrt(v.criadoEm)}</span>,
            <span key="a" className="tabular-nums">{v.nAlteradas}</span>, <span key="u" className="tabular-nums">{v.aulas}</span>,
            <CarregarVersao key="x" id={v.id} numero={v.numero} podeEditar={podeEditar} />] }))} />
      </RevisaoCard>
      <RevisaoCard>
        <h2 className="text-base font-semibold">Levar para o cronograma</h2>
        <p className="mb-3 mt-1 text-sm text-muted-foreground">Regras, disciplinas e materiais num só arquivo, para o time de tecnologia ligar ao Cronograma Adaptativo.</p>
        <ConfigIO resumo={resumo} podeEditar={podeEditar} />
        <p className="mt-3 text-xs text-muted-foreground">Ao carregar, entram as regras e as disciplinas; os materiais vêm sempre da Biblioteca e não são sobrescritos.</p>
      </RevisaoCard>
    </div>
    <Suspense fallback={<div className="skeleton-shimmer h-24 rounded-2xl bg-muted/70" />}><HistoricoRegras /></Suspense>
    </div>
  )
}
