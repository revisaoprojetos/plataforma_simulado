'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, checkPermission } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { rankearSimulado } from '@/lib/ranking'

type Politica = 'pontua_todos' | 'desconsidera'

/**
 * Anula uma questão de um simulado e re-corrige todas as sessões finalizadas:
 * recalcula nota e ranking, e registra o impacto (antes/depois) por aluno.
 */
export async function anularQuestao(
  simuladoId: string,
  questaoId: string,
  motivo: string,
  politica: Politica,
): Promise<{ ok: boolean; error?: string; afetados?: number }> {
  if (!(await checkPermission('simulados:update')) && !(await checkPermission('questoes:update'))) {
    return { ok: false, error: 'Sem permissão.' }
  }
  const access = await getCurrentAccess()
  const svc = createAdminClient()

  const { data: vinculo } = await svc
    .from('simulado_prova_questoes')
    .select('id, anulada, tenant_id')
    .eq('simulado_id', simuladoId)
    .eq('questao_id', questaoId)
    .maybeSingle()
  if (!vinculo) return { ok: false, error: 'Questão não pertence a este simulado.' }
  if (vinculo.anulada) return { ok: false, error: 'Questão já anulada.' }

  // 1) Marca a questão como anulada.
  await svc.from('simulado_prova_questoes').update({ anulada: true }).eq('id', vinculo.id)

  // 2) Registra o evento de re-correção.
  const { data: rec } = await svc
    .from('simulado_recorrecoes')
    .insert({
      tenant_id: vinculo.tenant_id,
      simulado_id: simuladoId,
      questao_id: questaoId,
      tipo: 'anulacao',
      motivo: motivo.trim() || null,
      politica,
      // executado_por tem FK p/ o esqueleto simulado_users (vazio) — o ator real
      // fica no audit log (registrarAudit('ANULAR') abaixo).
      executado_por: null,
      executado_em: new Date().toISOString(),
    })
    .select('id')
    .single()
  const recorrecaoId = rec?.id

  // 3) Sessões finalizadas (exceto testes) + estado ANTES.
  const { data: sessoes } = await svc
    .from('simulado_sessoes_prova')
    .select('id, estudante_id, nota, posicao_ranking, finalizado_em')
    .eq('simulado_id', simuladoId)
    .eq('is_teste', false)
    .eq('status', 'finalizada')
    .eq('deletado', false)
  const lista = sessoes ?? []
  const antes = new Map(lista.map((s: any) => [s.id, { nota: Number(s.nota ?? 0), ranking: s.posicao_ranking }]))

  // Questões válidas/anuladas do simulado (após esta anulação).
  const { data: pq } = await svc
    .from('simulado_prova_questoes')
    .select('questao_id, anulada')
    .eq('simulado_id', simuladoId)
  const totalQ = (pq ?? []).length
  const anuladasSet = new Set((pq ?? []).filter((x: any) => x.anulada).map((x: any) => x.questao_id))
  const nAnuladas = anuladasSet.size

  // 4) Recalcula a nota de cada sessão.
  for (const s of lista) {
    const { data: resp } = await svc
      .from('simulado_respostas_objetivas')
      .select('questao_id, correta')
      .eq('sessao_id', s.id)
    const corretasReais = (resp ?? []).filter((r: any) => r.correta && !anuladasSet.has(r.questao_id)).length

    let nota = 0
    if (politica === 'pontua_todos') {
      nota = totalQ > 0 ? ((corretasReais + nAnuladas) / totalQ) * 10 : 0
    } else {
      const denom = totalQ - nAnuladas
      nota = denom > 0 ? (corretasReais / denom) * 10 : 0
    }
    await svc.from('simulado_sessoes_prova').update({ nota: Math.round(nota * 100) / 100 }).eq('id', s.id)
  }

  // 5) Recalcula ranking (dedup por aluno conforme a política de nota).
  await rankearSimulado(svc, simuladoId)

  // 6) Registra impacto por aluno (antes × depois), com o estado já recalculado.
  if (recorrecaoId) {
    const { data: depoisSessoes } = await svc
      .from('simulado_sessoes_prova')
      .select('id, estudante_id, nota, posicao_ranking')
      .eq('simulado_id', simuladoId)
      .eq('is_teste', false)
      .eq('status', 'finalizada')
    const impactos = (depoisSessoes ?? []).map((s: any) => {
      const a = antes.get(s.id) ?? { nota: 0, ranking: null }
      const notaDepois = Number(s.nota ?? 0)
      const delta = Math.round((notaDepois - a.nota) * 100) / 100
      const classificacao = delta > 0.0001 ? 'beneficiado' : delta < -0.0001 ? 'prejudicado' : 'neutro'
      return {
        tenant_id: vinculo.tenant_id,
        recorrecao_id: recorrecaoId,
        estudante_id: s.estudante_id,
        nota_antes: a.nota,
        nota_depois: notaDepois,
        delta,
        ranking_antes: a.ranking,
        ranking_depois: s.posicao_ranking ?? null,
        classificacao,
      }
    })
    if (impactos.length) await svc.from('simulado_recorrecao_impactos').insert(impactos)
  }

  await registrarAudit({ operacao: 'ANULAR', entidade: 'simulado_prova_questoes', entidadeId: vinculo.id, depois: { questao_id: questaoId, politica, motivo } })

  revalidatePath(`/admin/simulados/${simuladoId}`)
  return { ok: true, afetados: lista.length }
}
