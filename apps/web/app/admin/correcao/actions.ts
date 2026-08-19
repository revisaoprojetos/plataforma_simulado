'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, accessCan } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { rankearSimulado } from '@/lib/ranking'

const LOCK_MIN = 30

/** Assume a correção (lock). Falha se já há outro corretor com lock ativo. */
export async function assumirCorrecao(respostaId: string): Promise<{ ok: boolean; error?: string }> {
  const access = await getCurrentAccess()
  if (!(access.isAdmin || accessCan(access, 'correcao:corrigir') || accessCan(access, 'questoes:update'))) {
    return { ok: false, error: 'Sem permissão para corrigir.' }
  }
  if (!access.tenantId) return { ok: false, error: 'Tenant não resolvido.' }
  const svc = createAdminClient()

  const { data: r } = await svc
    .from('simulado_respostas_discursivas')
    .select('id, status, em_correcao_por, lock_expira_em, sessao_id')
    .eq('id', respostaId)
    .eq('tenant_id', access.tenantId)
    .maybeSingle()
  if (!r) return { ok: false, error: 'Resposta não encontrada.' }
  if (r.status === 'corrigida') return { ok: false, error: 'Já corrigida.' }

  const lockAtivo = r.em_correcao_por && r.lock_expira_em && new Date(r.lock_expira_em) > new Date()
  if (lockAtivo && r.em_correcao_por !== access.userId) {
    return { ok: false, error: 'Outro corretor está com esta resposta no momento.' }
  }

  const expira = new Date(Date.now() + LOCK_MIN * 60_000).toISOString()
  await svc
    .from('simulado_respostas_discursivas')
    .update({ status: 'em_correcao', em_correcao_por: access.userId, lock_expira_em: expira, atualizado_em: new Date().toISOString() })
    .eq('id', respostaId)

  return { ok: true }
}

/** Salva a correção: nota por competência + feedback. Calcula a nota total e finaliza. */
export async function salvarCorrecao(
  respostaId: string,
  competencias: { competencia_id: string; nota: number; comentario?: string }[],
  feedback: string,
): Promise<{ ok: boolean; error?: string }> {
  const access = await getCurrentAccess()
  if (!(access.isAdmin || accessCan(access, 'correcao:corrigir') || accessCan(access, 'questoes:update'))) {
    return { ok: false, error: 'Sem permissão para corrigir.' }
  }
  if (!access.tenantId) return { ok: false, error: 'Tenant não resolvido.' }
  const svc = createAdminClient()

  const { data: r } = await svc
    .from('simulado_respostas_discursivas')
    .select('id, status, em_correcao_por, lock_expira_em, sessao_id')
    .eq('id', respostaId)
    .eq('tenant_id', access.tenantId)
    .maybeSingle()
  if (!r) return { ok: false, error: 'Resposta não encontrada.' }

  const lockAtivo = r.em_correcao_por && r.lock_expira_em && new Date(r.lock_expira_em) > new Date()
  if (lockAtivo && r.em_correcao_por !== access.userId) {
    return { ok: false, error: 'O lock desta resposta é de outro corretor.' }
  }

  // Regrava as notas por competência.
  await svc.from('simulado_correcao_competencias').delete().eq('resposta_id', respostaId)
  if (competencias.length) {
    await svc.from('simulado_correcao_competencias').insert(
      competencias.map((c) => ({ resposta_id: respostaId, competencia_id: c.competencia_id, nota: c.nota ?? 0, comentario: c.comentario?.trim() || null })),
    )
  }
  const notaTotal = competencias.reduce((acc, c) => acc + (Number(c.nota) || 0), 0)

  const { error } = await svc
    .from('simulado_respostas_discursivas')
    .update({
      status: 'corrigida',
      nota: notaTotal,
      feedback: feedback.trim() || null,
      corrigido_por: access.userId,
      corrigido_em: new Date().toISOString(),
      em_correcao_por: null,
      lock_expira_em: null,
      atualizado_em: new Date().toISOString(),
    })
    .eq('id', respostaId)
  if (error) return { ok: false, error: error.message }

  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_respostas_discursivas', entidadeId: respostaId, depois: { status: 'corrigida', nota: notaTotal } })

  // Se a discursiva é de uma prova (tem sessão), recompõe a nota da sessão
  // (objetiva + frações das discursivas corrigidas) e o ranking.
  if (r.sessao_id) await recomputarNotaSessao(svc, r.sessao_id)

  revalidatePath('/admin/correcao')
  return { ok: true }
}

// ─── Anotações sobre a folha (mesa de correção — Fase 2/Fatia 1) ──────────────
// Marcas do professor na imagem do aluno (destaque/ponto/ícone/bolinha/texto),
// coords 0–1, ligadas opcionalmente a um quesito (competência) e a uma página.

export interface AnotacaoInput {
  arquivo_id?: string | null
  competencia_id?: string | null
  tipo: string
  x: number; y: number
  largura?: number | null; altura?: number | null
  cor?: string | null
  icone?: string | null
  numero?: number | null
  conteudo?: string | null
}
export interface AnotacaoRow extends AnotacaoInput { id: string; origem: string }

async function podeCorrigir() {
  const access = await getCurrentAccess()
  const ok = access.isAdmin || accessCan(access, 'correcao:corrigir') || accessCan(access, 'questoes:update')
  return { access, ok }
}

/** Marcas da resposta (todas as páginas). Tolerante à tabela ausente (migração pendente). */
export async function listarAnotacoes(respostaId: string): Promise<AnotacaoRow[]> {
  const { access, ok } = await podeCorrigir()
  if (!ok || !access.tenantId) return []
  const svc = createAdminClient()
  try {
    const { data } = await svc
      .from('simulado_anotacoes_discursivas')
      .select('id, arquivo_id, competencia_id, tipo, x, y, largura, altura, cor, icone, numero, conteudo, origem')
      .eq('resposta_id', respostaId).eq('tenant_id', access.tenantId)
      .order('criado_em', { ascending: true })
    return (data ?? []) as unknown as AnotacaoRow[]
  } catch { return [] }
}

export async function salvarAnotacao(respostaId: string, a: AnotacaoInput): Promise<{ ok: boolean; id?: string; error?: string }> {
  const { access, ok } = await podeCorrigir()
  if (!ok) return { ok: false, error: 'Sem permissão para corrigir.' }
  if (!access.tenantId) return { ok: false, error: 'Tenant não resolvido.' }
  const svc = createAdminClient()
  const { data: r } = await svc.from('simulado_respostas_discursivas').select('id, questao_id').eq('id', respostaId).eq('tenant_id', access.tenantId).maybeSingle()
  if (!r) return { ok: false, error: 'Resposta não encontrada.' }
  const { data, error } = await svc.from('simulado_anotacoes_discursivas').insert({
    tenant_id: access.tenantId, resposta_id: respostaId, questao_id: (r as any).questao_id,
    arquivo_id: a.arquivo_id ?? null, competencia_id: a.competencia_id ?? null,
    tipo: a.tipo, x: a.x, y: a.y, largura: a.largura ?? null, altura: a.altura ?? null,
    cor: a.cor ?? null, icone: a.icone ?? null, numero: a.numero ?? null, conteudo: a.conteudo ?? null,
    origem: 'professor', criado_por: access.userId,
  }).select('id').single()
  if (error) return { ok: false, error: /anotacoes_discursivas|does not exist|relation/i.test(error.message) ? 'Rode a migração 20260819000001_anotacoes_discursivas.sql.' : error.message }
  return { ok: true, id: (data as { id: string }).id }
}

export async function atualizarAnotacao(id: string, patch: Partial<AnotacaoInput>): Promise<{ ok: boolean; error?: string }> {
  const { access, ok } = await podeCorrigir()
  if (!ok) return { ok: false, error: 'Sem permissão.' }
  if (!access.tenantId) return { ok: false, error: 'Tenant não resolvido.' }
  const svc = createAdminClient()
  const upd: Record<string, unknown> = { atualizado_em: new Date().toISOString() }
  for (const k of ['competencia_id', 'tipo', 'x', 'y', 'largura', 'altura', 'cor', 'icone', 'numero', 'conteudo'] as const) {
    if (k in patch) upd[k] = (patch as Record<string, unknown>)[k]
  }
  const { error } = await svc.from('simulado_anotacoes_discursivas').update(upd).eq('id', id).eq('tenant_id', access.tenantId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function removerAnotacao(id: string): Promise<{ ok: boolean; error?: string }> {
  const { access, ok } = await podeCorrigir()
  if (!ok) return { ok: false, error: 'Sem permissão.' }
  if (!access.tenantId) return { ok: false, error: 'Tenant não resolvido.' }
  const svc = createAdminClient()
  const { error } = await svc.from('simulado_anotacoes_discursivas').delete().eq('id', id).eq('tenant_id', access.tenantId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/**
 * Nota combinada da sessão: cada questão vale igual (0..1); objetiva = 1 se
 * correta; discursiva = nota/pontos_máximos (parcial). nota = média × 10.
 * Discursivas ainda não corrigidas contam 0. Recalcula o ranking ao final.
 */
async function recomputarNotaSessao(svc: ReturnType<typeof createAdminClient>, sessaoId: string) {
  const { data: sessao } = await svc.from('simulado_sessoes_prova').select('simulado_id').eq('id', sessaoId).maybeSingle()
  if (!sessao) return

  const { data: pq } = await svc
    .from('simulado_prova_questoes')
    .select('questao_id')
    .eq('simulado_id', sessao.simulado_id)
    .eq('anulada', false)
  const total = (pq ?? []).length
  if (total === 0) return

  const { data: ro } = await svc.from('simulado_respostas_objetivas').select('correta').eq('sessao_id', sessaoId)
  const acertosObj = (ro ?? []).filter((x: any) => x.correta).length

  const { data: rd } = await svc
    .from('simulado_respostas_discursivas')
    .select('questao_id, nota')
    .eq('sessao_id', sessaoId)
    .eq('status', 'corrigida')
  // Pontos máximos por questão (soma das competências) — EM LOTE (era N+1: 1 query por discursiva).
  const qids = [...new Set((rd ?? []).map((d: any) => d.questao_id).filter(Boolean))]
  const maxPorQ = new Map<string, number>()
  if (qids.length) {
    const { data: comps } = await svc.from('simulado_competencias').select('questao_id, pontos').in('questao_id', qids)
    for (const c of (comps ?? []) as any[]) maxPorQ.set(c.questao_id, (maxPorQ.get(c.questao_id) ?? 0) + Number(c.pontos ?? 0))
  }
  let fracDisc = 0
  for (const d of rd ?? []) {
    const maxP = maxPorQ.get(d.questao_id) ?? 0
    if (maxP > 0) fracDisc += Math.min(1, Number(d.nota ?? 0) / maxP)
  }

  const nota = Math.round(((acertosObj + fracDisc) / total) * 100 * 100) / 100 // escala 0–100
  await svc.from('simulado_sessoes_prova').update({ nota }).eq('id', sessaoId)

  // Recalcula ranking (dedup por aluno conforme a política de nota).
  await rankearSimulado(svc, sessao.simulado_id)
}
