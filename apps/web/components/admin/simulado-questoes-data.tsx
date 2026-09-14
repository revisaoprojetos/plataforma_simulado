import { createClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { fetchAll, fetchAllByIn } from '@/lib/supabase/fetch-all'
import { alternativasSaoCertoErrado } from '@/lib/simulado/formato'
import { listarDisciplinasFiltro } from '@/app/admin/banco-questoes/actions'
import { SimuladoQuestoesTable } from '@/components/admin/simulado-questoes-table'
import { type QuestaoLinha } from '@/components/admin/questoes-tabela-base'

/**
 * Wrapper SERVER da aba Questões: carrega a prova RICA (joins + C/E via alternativas) e as disciplinas
 * do filtro no servidor. Renderizar dentro de <Suspense> → o shell aparece na hora e a tabela streama
 * com o loader (mesma animação da rota), em vez de bloquear a página no await.
 */
export async function SimuladoQuestoesData({ simuladoId, bancoId, cor }: { simuladoId: string; bancoId: string | null; cor?: string }) {
  const supabase = await createClient()
  const tid = (await getCurrentTenantId()) ?? '00000000-0000-0000-0000-000000000000'

  const provaRica = await fetchAll<any>(() =>
    supabase.from('simulado_prova_questoes').select(`
      id, ordem, peso, anulada,
      questoes:simulado_questoes(id, tipo, enunciado, nivel_dificuldade, status, ano, assunto_detalhe, disciplinas:simulado_disciplinas(nome), assuntos:simulado_assuntos(nome), bancas:simulado_bancas(nome), orgaos:simulado_orgaos(nome))
    `).eq('simulado_id', simuladoId).eq('tenant_id', tid).order('ordem'))

  const ceSet = new Set<string>()
  const qids = provaRica.map((sq: any) => sq.questoes?.id).filter(Boolean) as string[]
  const [alts, disciplinasFiltro] = await Promise.all([
    qids.length ? fetchAllByIn<any>(qids, (chunk) => supabase.from('simulado_alternativas').select('questao_id, texto').in('questao_id', chunk)) : Promise.resolve([]),
    listarDisciplinasFiltro(),
  ])
  const textos = new Map<string, string[]>()
  for (const a of alts) { const arr = textos.get(a.questao_id) ?? []; arr.push(a.texto ?? ''); textos.set(a.questao_id, arr) }
  for (const [qid, ts] of textos) if (alternativasSaoCertoErrado(ts)) ceSet.add(qid)

  const questoesLinha: QuestaoLinha[] = provaRica.map((sq: any) => {
    const q = sq.questoes ?? {}
    return {
      id: q.id, enunciado: q.enunciado ?? '', tipo: q.tipo ?? null,
      formato: q.tipo === 'discursiva' ? null : (ceSet.has(q.id) ? 'certo_errado' : 'multipla'),
      nivel_dificuldade: q.nivel_dificuldade ?? null, status: q.status ?? null,
      disciplina: q.disciplinas?.nome ?? null, assunto: q.assuntos?.nome ?? null,
      assuntoDetalhe: q.assunto_detalhe ?? null, banca: q.bancas?.nome ?? null, orgao: q.orgaos?.nome ?? null, ano: q.ano ?? null,
    }
  }).filter((q: QuestaoLinha) => q.id)

  return <SimuladoQuestoesTable simuladoId={simuladoId} bancoId={bancoId} questoes={questoesLinha} disciplinas={disciplinasFiltro} cor={cor} />
}
