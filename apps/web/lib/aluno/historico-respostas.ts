// Histórico unificado de respostas do aluno para o "Recomendado": respostas de SIMULADOS
// (simulado_respostas_objetivas) + prática do BANCO DE QUESTÕES (simulado_respostas_avulsas).
// Antes o Recomendado só lia simulados — o que o aluno resolvia no banco/reforço nunca mudava a lista
// ("questões recomendadas não atualizam"). Tudo no servidor, paginado.
import 'server-only'
import { fetchAll, fetchAllByIn } from '@/lib/supabase/fetch-all'

export type RespHist = { questao_id: string; correta: boolean | null }

export async function carregarHistoricoRespostas(
  svc: any, tenantId: string, estudanteId: string, opts: { soReais?: boolean } = {},
): Promise<RespHist[]> {
  let qs = svc.from('simulado_sessoes_prova').select('id').eq('estudante_id', estudanteId)
  if (opts.soReais) qs = qs.eq('is_teste', false).eq('deletado', false)
  const [{ data: sessoes }, avulsas] = await Promise.all([
    qs,
    fetchAll<RespHist>(() => svc.from('simulado_respostas_avulsas').select('questao_id, correta')
      .eq('tenant_id', tenantId).eq('estudante_id', estudanteId).order('id', { ascending: true }) as any, 1000, 'recomendado_avulsas'),
  ])
  const sessaoIds = (sessoes ?? []).map((s: any) => s.id as string)
  const deSimulados = sessaoIds.length
    ? await fetchAllByIn<RespHist>(sessaoIds, (chunk) =>
        svc.from('simulado_respostas_objetivas').select('questao_id, correta').in('sessao_id', chunk).order('id', { ascending: true }) as any)
    : []
  return [...deSimulados, ...avulsas]
}
