'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, checkPermission } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { rankearSimulado } from '@/lib/ranking'
import { contextoNota, calcularNotaSessao } from '@/lib/simulado/nota'

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
  if (!access.tenantId) return { ok: false, error: 'Tenant não resolvido.' }
  const svc = createAdminClient()

  // Gate de tenant: só age em simulado do próprio tenant (as etapas seguintes derivam deste vínculo).
  const { data: vinculo } = await svc
    .from('simulado_prova_questoes')
    .select('id, anulada, tenant_id')
    .eq('simulado_id', simuladoId)
    .eq('questao_id', questaoId)
    .eq('tenant_id', access.tenantId)
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

  // 4) Recalcula a nota de cada sessão pela regra CANÔNICA (respeita política
  //    por questão anulada). Concorrência limitada — evita N+1 em provas grandes.
  const ctx = await contextoNota(svc, simuladoId)
  const recalcular = async (s: any) => {
    const nota = await calcularNotaSessao(svc, s.id, ctx)
    await svc.from('simulado_sessoes_prova').update({ nota }).eq('id', s.id)
  }
  for (let i = 0; i < lista.length; i += 15) await Promise.all(lista.slice(i, i + 15).map(recalcular))

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

/**
 * Troca a alternativa correta (gabarito) de uma questão de um simulado e re-corrige.
 * Regra: pontua quem JÁ tinha acertado (marcou a alternativa que era correta) OU quem
 * marcou a NOVA alternativa correta — ninguém perde ponto. Recalcula nota e ranking e
 * registra o impacto (antes/depois) por aluno.
 */
export async function trocarAlternativa(
  simuladoId: string,
  questaoId: string,
  novaAlternativaId: string,
  motivo: string,
): Promise<{ ok: boolean; error?: string; afetados?: number }> {
  if (!(await checkPermission('simulados:update')) && !(await checkPermission('questoes:update'))) {
    return { ok: false, error: 'Sem permissão.' }
  }
  const access = await getCurrentAccess()
  if (!access.tenantId) return { ok: false, error: 'Tenant não resolvido.' }
  const svc = createAdminClient()

  // Gate de tenant: a questão pertence a este simulado/tenant.
  const { data: vinculo } = await svc
    .from('simulado_prova_questoes')
    .select('id, anulada, tenant_id')
    .eq('simulado_id', simuladoId)
    .eq('questao_id', questaoId)
    .eq('tenant_id', access.tenantId)
    .maybeSingle()
  if (!vinculo) return { ok: false, error: 'Questão não pertence a este simulado.' }
  if (vinculo.anulada) return { ok: false, error: 'Questão anulada — não é possível trocar o gabarito.' }

  // Alternativas da questão; valida a nova e captura a correta atual (a "original").
  const { data: alts } = await svc
    .from('simulado_alternativas')
    .select('id, correta')
    .eq('questao_id', questaoId)
  const nova = (alts ?? []).find((a: any) => a.id === novaAlternativaId)
  if (!nova) return { ok: false, error: 'Alternativa nova inválida.' }
  const originalCorretaIds = (alts ?? []).filter((a: any) => a.correta).map((a: any) => a.id)
  if (originalCorretaIds.includes(novaAlternativaId)) return { ok: false, error: 'Essa alternativa já é a correta.' }

  // 1) Ajusta o gabarito: nova = correta; as antigas corretas = falsas (mantém 1 correta).
  await svc.from('simulado_alternativas').update({ correta: false }).eq('questao_id', questaoId).eq('correta', true)
  await svc.from('simulado_alternativas').update({ correta: true }).eq('id', novaAlternativaId)

  // 2) Atualiza as respostas desta questão: acerto p/ quem marcou a NOVA ou a original correta.
  const validos = [novaAlternativaId, ...originalCorretaIds]
  await svc.from('simulado_respostas_objetivas').update({ correta: true })
    .eq('questao_id', questaoId).in('alternativa_id', validos)
  await svc.from('simulado_respostas_objetivas').update({ correta: false })
    .eq('questao_id', questaoId).not('alternativa_id', 'in', `(${validos.join(',')})`)

  // 3) Registra o evento de re-correção.
  const { data: rec } = await svc
    .from('simulado_recorrecoes')
    .insert({
      tenant_id: vinculo.tenant_id,
      simulado_id: simuladoId,
      questao_id: questaoId,
      tipo: 'troca_alternativa',
      motivo: motivo.trim() || null,
      politica: 'pontua_todos',
      executado_por: null,
      executado_em: new Date().toISOString(),
    })
    .select('id')
    .single()
  const recorrecaoId = rec?.id

  // 4) Sessões finalizadas + estado ANTES.
  const { data: sessoes } = await svc
    .from('simulado_sessoes_prova')
    .select('id, estudante_id, nota, posicao_ranking')
    .eq('simulado_id', simuladoId)
    .eq('is_teste', false)
    .eq('status', 'finalizada')
    .eq('deletado', false)
  const lista = sessoes ?? []
  const antes = new Map(lista.map((s: any) => [s.id, { nota: Number(s.nota ?? 0), ranking: s.posicao_ranking }]))

  // 5) Recalcula a nota pela regra CANÔNICA (respeita política por questão).
  const ctx = await contextoNota(svc, simuladoId)
  const recalcular = async (s: any) => {
    const nota = await calcularNotaSessao(svc, s.id, ctx)
    await svc.from('simulado_sessoes_prova').update({ nota }).eq('id', s.id)
  }
  for (let i = 0; i < lista.length; i += 15) await Promise.all(lista.slice(i, i + 15).map(recalcular))

  // 6) Ranking + impacto (antes × depois).
  await rankearSimulado(svc, simuladoId)
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
    }).filter((i: any) => i.classificacao !== 'neutro')
    if (impactos.length) await svc.from('simulado_recorrecao_impactos').insert(impactos)
  }

  await registrarAudit({ operacao: 'RECORRIGIR', entidade: 'simulado_prova_questoes', entidadeId: vinculo.id, depois: { questao_id: questaoId, nova_alternativa_id: novaAlternativaId, motivo } })

  revalidatePath(`/admin/simulados/${simuladoId}`)
  return { ok: true, afetados: lista.length }
}

/**
 * Remove (desfaz) a correção de uma questão: reverte a anulação e/ou a troca de
 * gabarito, apaga o registro de re-correção + impactos e re-corrige as sessões.
 */
export async function removerCorrecao(
  simuladoId: string,
  questaoId: string,
): Promise<{ ok: boolean; error?: string; afetados?: number }> {
  if (!(await checkPermission('simulados:update')) && !(await checkPermission('questoes:update'))) {
    return { ok: false, error: 'Sem permissão.' }
  }
  const access = await getCurrentAccess()
  if (!access.tenantId) return { ok: false, error: 'Tenant não resolvido.' }
  const svc = createAdminClient()

  const { data: vinculo } = await svc
    .from('simulado_prova_questoes')
    .select('id, tenant_id')
    .eq('simulado_id', simuladoId)
    .eq('questao_id', questaoId)
    .eq('tenant_id', access.tenantId)
    .maybeSingle()
  if (!vinculo) return { ok: false, error: 'Questão não pertence a este simulado.' }

  const { data: recs } = await svc
    .from('simulado_recorrecoes')
    .select('id, tipo')
    .eq('simulado_id', simuladoId)
    .eq('questao_id', questaoId)
  if (!recs || recs.length === 0) return { ok: false, error: 'Não há correção nesta questão.' }

  // 1) Reverte a anulação.
  if (recs.some((r: any) => r.tipo === 'anulacao')) {
    await svc.from('simulado_prova_questoes').update({ anulada: false }).eq('id', vinculo.id)
  }

  // 2) Reverte a troca de gabarito (reconstrói a alternativa correta anterior).
  if (recs.some((r: any) => r.tipo === 'troca_alternativa')) {
    const { data: alts } = await svc.from('simulado_alternativas').select('id, correta').eq('questao_id', questaoId)
    const novaId = (alts ?? []).find((a: any) => a.correta)?.id
    const { data: rc } = await svc
      .from('simulado_respostas_objetivas')
      .select('alternativa_id')
      .eq('questao_id', questaoId)
      .eq('correta', true)
    const corretasResp = [...new Set((rc ?? []).map((r: any) => r.alternativa_id))].filter(Boolean)
    const antigaId = corretasResp.find((id) => id !== novaId)
    // Sem a antiga não dá pra reverter com segurança (ninguém marcou a original).
    // Aborta ANTES de apagar qualquer coisa, para não deixar o gabarito inconsistente.
    if (!novaId || !antigaId) {
      return { ok: false, error: 'Não foi possível reverter o gabarito (a alternativa correta anterior não pôde ser identificada). Ajuste-a manualmente e tente de novo.' }
    }
    await svc.from('simulado_alternativas').update({ correta: false }).eq('id', novaId)
    await svc.from('simulado_alternativas').update({ correta: true }).eq('id', antigaId)
    await svc.from('simulado_respostas_objetivas').update({ correta: true }).eq('questao_id', questaoId).eq('alternativa_id', antigaId)
    await svc.from('simulado_respostas_objetivas').update({ correta: false }).eq('questao_id', questaoId).neq('alternativa_id', antigaId)
  }

  // 3) Apaga impactos + registros de re-correção desta questão.
  const recIds = recs.map((r: any) => r.id)
  await svc.from('simulado_recorrecao_impactos').delete().in('recorrecao_id', recIds)
  await svc.from('simulado_recorrecoes').delete().in('id', recIds)

  // 4) Re-corrige as sessões finalizadas com o estado revertido.
  const { data: sessoes } = await svc
    .from('simulado_sessoes_prova')
    .select('id')
    .eq('simulado_id', simuladoId)
    .eq('is_teste', false)
    .eq('status', 'finalizada')
    .eq('deletado', false)
  const lista = sessoes ?? []

  const ctx = await contextoNota(svc, simuladoId)
  const recalcular = async (s: any) => {
    const nota = await calcularNotaSessao(svc, s.id, ctx)
    await svc.from('simulado_sessoes_prova').update({ nota }).eq('id', s.id)
  }
  for (let i = 0; i < lista.length; i += 15) await Promise.all(lista.slice(i, i + 15).map(recalcular))
  await rankearSimulado(svc, simuladoId)

  await registrarAudit({ operacao: 'RECORRIGIR', entidade: 'simulado_prova_questoes', entidadeId: vinculo.id, depois: { questao_id: questaoId, acao: 'remover_correcao' } })

  revalidatePath(`/admin/simulados/${simuladoId}`)
  return { ok: true, afetados: lista.length }
}
