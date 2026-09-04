'use server'

/**
 * Resolver das questões de uma meta do cronograma (linha "Resolução de Questões").
 *
 * SIMPLES de propósito: carrega as questões que o admin anexou à aula (`meta_questoes`) e as
 * alternativas, para o aluno resolver numa página só (uma questão abaixo da outra). Não cria
 * sessão de simulado nem grava nota — é prática rápida, com correção no fim, e volta ao cronograma.
 */

import { createAdminClient } from '@/lib/supabase/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { verificarAcessoCronograma } from '@/lib/cronograma/acesso'
import { fetchAllByIn } from '@/lib/supabase/fetch-all'

export type AltResolver = { id: string; texto: string; correta: boolean }
export type QuestaoResolver = { id: string; enunciado: string; comentario: string | null; alternativas: AltResolver[] }

export async function carregarQuestoesDaMeta(
  metaId: string,
): Promise<{ ok: boolean; titulo?: string; questoes?: QuestaoResolver[]; error?: string }> {
  const sessao = await getSessaoAluno()
  if (!sessao) return { ok: false, error: 'Sua sessão expirou. Entre novamente.' }
  const svc = createAdminClient()

  const { data: meta } = await svc
    .from('simulado_cronograma_metas')
    .select('cronograma_id, disciplina, aula')
    .eq('id', metaId)
    .eq('tenant_id', sessao.tenantId)
    .maybeSingle()
  if (!meta) return { ok: false, error: 'Conteúdo não encontrado.' }

  const acesso = await verificarAcessoCronograma(svc, sessao.tenantId, sessao.estudanteId, (meta as any).cronograma_id)
  if (!acesso.permitido) return { ok: false, error: 'Você não tem acesso a este cronograma.' }

  const { data: mq } = await svc
    .from('simulado_cronograma_meta_questoes')
    .select('questao_id, ordem')
    .eq('tenant_id', sessao.tenantId)
    .eq('meta_id', metaId)
    .order('ordem')
  const ordemDe = new Map<string, number>()
  ;(mq ?? []).forEach((x: any, i: number) => { if (!ordemDe.has(x.questao_id)) ordemDe.set(x.questao_id, x.ordem ?? i) })
  const qids = [...ordemDe.keys()]
  if (!qids.length) return { ok: false, error: 'Esta aula ainda não tem questões selecionadas para resolver.' }

  const [qs, alts] = await Promise.all([
    fetchAllByIn<any>(qids, (c) => svc.from('simulado_questoes').select('id, enunciado, comentario_professor').eq('tenant_id', sessao.tenantId).eq('deletado', false).in('id', c) as any),
    fetchAllByIn<any>(qids, (c) => svc.from('simulado_alternativas').select('id, questao_id, texto, correta, ordem').in('questao_id', c).order('ordem') as any),
  ])
  const altPorQ = new Map<string, AltResolver[]>()
  for (const a of alts) {
    const l = altPorQ.get(a.questao_id) ?? []
    l.push({ id: a.id, texto: a.texto ?? '', correta: !!a.correta })
    altPorQ.set(a.questao_id, l)
  }

  const questoes: QuestaoResolver[] = (qs ?? [])
    .map((q: any) => ({ id: q.id, enunciado: q.enunciado ?? '', comentario: q.comentario_professor ?? null, alternativas: altPorQ.get(q.id) ?? [] }))
    .filter((q) => q.alternativas.length)
    .sort((a, b) => (ordemDe.get(a.id) ?? 0) - (ordemDe.get(b.id) ?? 0))
  if (!questoes.length) return { ok: false, error: 'As questões desta aula não têm alternativas para resolver.' }

  const titulo = `${(meta as any).disciplina ?? ''}${(meta as any).aula ? ` · Aula ${(meta as any).aula}` : ''}`.trim() || 'Resolução'
  return { ok: true, titulo, questoes }
}
