import { Nota } from '../../_comp/lista'
import { ResumoKpis } from '@/components/admin/cronograma/resumo-kpis'
import { lerAdaptativo } from '@/lib/revisao/resumo-cronogramas'
import { kpisAdaptativo } from './comum'

/**
 * Painel de KPIs do Adaptativo (UM card, mesmo <ResumoKpis/> do Gerador + cobertura/pendentes/regras ≠ 2.0, cache 60 s).
 * Renderizado SÓ na Visão geral (/admin/cronogramas/adaptativo/analise) — não nas demais sub-abas.
 * Falha de leitura = aviso visível + "—" (nunca some em silêncio).
 */
export default async function KpisAdaptativo({ tenantId }: { tenantId: string }) {
  const [k, { dados: resumo, erro }] = await Promise.all([kpisAdaptativo(tenantId), lerAdaptativo(tenantId)])
  return (
    <>
      {(erro || !k) && <Nota tipo="aviso">Não foi possível carregar {erro && !k ? 'o resumo e os KPIs' : erro ? 'o resumo' : 'os KPIs de cobertura'} agora{erro ? ` (${erro})` : ''}. Atualize a página em instantes.</Nota>}
      <ResumoKpis resumo={resumo} lado="adaptativo" extras={k ? { paginasPdfull: k.paginas, pendentes: k.pendentes, alteradas: k.alteradas } : undefined} />
    </>
  )
}
