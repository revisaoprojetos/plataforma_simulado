import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { registrarAudit } from '@/lib/audit'
import { rankearSimulado } from '@/lib/ranking'
import { contextoNota, calcularNotaSessao } from '@/lib/simulado/nota'
import { invalidarRelatorios } from '@/lib/cache/relatorio-cache'

/**
 * Núcleo da RE-CORREÇÃO (anular / trocar gabarito / remover), extraído das server
 * actions para ser reutilizado tanto no caminho SÍNCRONO (simulado pequeno, roda
 * inline na action) quanto no ASSÍNCRONO (simulado grande → fila BullMQ → o worker
 * chama /api/internal/recorrecao, que executa exatamente este mesmo código).
 *
 * Assim NÃO há duplicação da regra de nota (contextoNota/calcularNotaSessao) — o
 * bug do processor antigo (tabelas erradas + nota ingênua) fica impossível.
 *
 * A validação de permissão fica na action (borda). Aqui repetimos o GATE DE TENANT
 * (a questão pertence ao simulado/tenant) como defesa em profundidade — o internal
 * route roda sem sessão de usuário.
 */

type Politica = 'pontua_todos' | 'desconsidera'
// jaAplicado: o alvo já estava no estado pedido (idempotência). O worker trata isso como
// sucesso — evita marcar como "failed" um retry cuja 1ª tentativa concluiu mas perdeu a resposta.
export type Resultado = { ok: boolean; error?: string; afetados?: number; jaAplicado?: boolean }

export type RecorrecaoJob =
  | { tipo: 'anulacao'; tenantId: string; simuladoId: string; questaoId: string; motivo: string; politica: Politica; atorId?: string | null }
  | { tipo: 'troca_alternativa'; tenantId: string; simuladoId: string; questaoId: string; novaAlternativaId: string; motivo: string; atorId?: string | null }
  | { tipo: 'remocao'; tenantId: string; simuladoId: string; questaoId: string; atorId?: string | null }

/** Dispatcher: roda a operação de re-correção pelo tipo. Idempotência/validação como nas actions originais. */
export async function executarRecorrecao(svc: SupabaseClient, job: RecorrecaoJob): Promise<Resultado> {
  switch (job.tipo) {
    case 'anulacao': return anularCore(svc, job)
    case 'troca_alternativa': return trocarCore(svc, job)
    case 'remocao': return removerCore(svc, job)
    default: return { ok: false, error: 'Tipo de re-correção inválido.' }
  }
}

async function anularCore(svc: SupabaseClient, job: Extract<RecorrecaoJob, { tipo: 'anulacao' }>): Promise<Resultado> {
  const { tenantId, simuladoId, questaoId, motivo, politica, atorId = null } = job

  // Gate de tenant: só age em simulado do próprio tenant (as etapas seguintes derivam deste vínculo).
  const { data: vinculo } = await svc
    .from('simulado_prova_questoes')
    .select('id, anulada, tenant_id')
    .eq('simulado_id', simuladoId)
    .eq('questao_id', questaoId)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (!vinculo) return { ok: false, error: 'Questão não pertence a este simulado.' }
  if (vinculo.anulada) return { ok: false, error: 'Questão já anulada.', jaAplicado: true }

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

  // 4) Recalcula a nota de cada sessão pela regra CANÔNICA (respeita política por questão anulada).
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

  await registrarAudit({ operacao: 'ANULAR', entidade: 'simulado_prova_questoes', entidadeId: vinculo.id, depois: { questao_id: questaoId, politica, motivo }, atorId, tenantId })
  await invalidarRelatorios(tenantId)
  return { ok: true, afetados: lista.length }
}

async function trocarCore(svc: SupabaseClient, job: Extract<RecorrecaoJob, { tipo: 'troca_alternativa' }>): Promise<Resultado> {
  const { tenantId, simuladoId, questaoId, novaAlternativaId, motivo, atorId = null } = job

  // Gate de tenant: a questão pertence a este simulado/tenant.
  const { data: vinculo } = await svc
    .from('simulado_prova_questoes')
    .select('id, anulada, tenant_id')
    .eq('simulado_id', simuladoId)
    .eq('questao_id', questaoId)
    .eq('tenant_id', tenantId)
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
  if (originalCorretaIds.includes(novaAlternativaId)) return { ok: false, error: 'Essa alternativa já é a correta.', jaAplicado: true }

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

  await registrarAudit({ operacao: 'RECORRIGIR', entidade: 'simulado_prova_questoes', entidadeId: vinculo.id, depois: { questao_id: questaoId, nova_alternativa_id: novaAlternativaId, motivo }, atorId, tenantId })
  await invalidarRelatorios(tenantId)
  return { ok: true, afetados: lista.length }
}

async function removerCore(svc: SupabaseClient, job: Extract<RecorrecaoJob, { tipo: 'remocao' }>): Promise<Resultado> {
  const { tenantId, simuladoId, questaoId, atorId = null } = job

  const { data: vinculo } = await svc
    .from('simulado_prova_questoes')
    .select('id, tenant_id')
    .eq('simulado_id', simuladoId)
    .eq('questao_id', questaoId)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (!vinculo) return { ok: false, error: 'Questão não pertence a este simulado.' }

  const { data: recs } = await svc
    .from('simulado_recorrecoes')
    .select('id, tipo')
    .eq('simulado_id', simuladoId)
    .eq('questao_id', questaoId)
  if (!recs || recs.length === 0) return { ok: false, error: 'Não há correção nesta questão.', jaAplicado: true }

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

  await registrarAudit({ operacao: 'RECORRIGIR', entidade: 'simulado_prova_questoes', entidadeId: vinculo.id, depois: { questao_id: questaoId, acao: 'remover_correcao' }, atorId, tenantId })
  await invalidarRelatorios(tenantId)
  return { ok: true, afetados: lista.length }
}

/** Conta as sessões finalizadas (reais) de um simulado — decide sync (pequeno) × fila (grande). */
export async function contarSessoesRecorrecao(svc: SupabaseClient, simuladoId: string, tenantId: string): Promise<number> {
  const { count } = await svc
    .from('simulado_sessoes_prova')
    .select('*', { count: 'exact', head: true })
    .eq('simulado_id', simuladoId)
    .eq('tenant_id', tenantId)
    .eq('is_teste', false)
    .eq('status', 'finalizada')
    .eq('deletado', false)
  return count ?? 0
}
