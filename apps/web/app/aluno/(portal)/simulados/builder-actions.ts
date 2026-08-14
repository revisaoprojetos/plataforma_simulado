'use server'

// Construtor de simulados PERSONALIZADOS do aluno. Os simulados criados aqui são linhas em
// simulado_simulados com owner_estudante_id = aluno logado (isolados dos oficiais). Reusam a
// engine (prova_questoes/sessão/correção). Como usamos o service role (bypassa RLS), TODA query
// é escopada por tenant_id + owner_estudante_id do aluno da sessão — nunca por id "solto".
import { getSessaoAluno } from '@/lib/aluno-session'
import { createAdminClient } from '@/lib/supabase/server'
import { fetchAll, fetchAllByIn } from '@/lib/supabase/fetch-all'
import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'

async function ctx() {
  const s = await getSessaoAluno()
  if (!s) throw new Error('Sessão do aluno não encontrada.')
  return { svc: createAdminClient() as SupabaseClient, estudanteId: s.estudanteId, tenantId: s.tenantId }
}

/** Garante que o simulado é do aluno logado (senão null). */
async function meuSimulado(svc: SupabaseClient, tenantId: string, estudanteId: string, simuladoId: string) {
  const { data } = await svc.from('simulado_simulados').select('id, titulo, status, regras')
    .eq('id', simuladoId).eq('tenant_id', tenantId).eq('owner_estudante_id', estudanteId).eq('deletado', false).maybeSingle()
  return data ?? null
}

/** IDs das questões que o aluno pode ESCOLHER = questões dos simulados a que ele tem acesso. */
async function questaoIdsAcessiveis(svc: SupabaseClient, estudanteId: string): Promise<string[]> {
  const [{ data: mats }, { data: acs }] = await Promise.all([
    svc.from('simulado_matriculas').select('simulado_id, liberado').eq('estudante_id', estudanteId),
    svc.from('simulado_acessos').select('simulado_id').eq('estudante_id', estudanteId),
  ])
  const simIds = [...new Set([
    ...(mats ?? []).filter((m: any) => m.liberado !== false).map((m: any) => m.simulado_id),
    ...(acs ?? []).map((a: any) => a.simulado_id),
  ].filter(Boolean))]
  if (!simIds.length) return []
  const pqs = await fetchAllByIn<any>(simIds, (chunk) => svc.from('simulado_prova_questoes').select('questao_id').in('simulado_id', chunk))
  return [...new Set(pqs.map((p) => p.questao_id).filter(Boolean))] as string[]
}

export async function criarMeuSimulado(nome: string): Promise<{ id?: string; error?: string }> {
  const { svc, estudanteId, tenantId } = await ctx()
  const titulo = (nome || '').trim() || 'Meu simulado'
  const { data, error } = await svc.from('simulado_simulados').insert({
    tenant_id: tenantId, owner_estudante_id: estudanteId, titulo,
    modo_aplicacao: 'aberto', status: 'rascunho', regras: {}, created_at: new Date().toISOString(),
  }).select('id').single()
  if (error) return { error: error.message }
  revalidatePath('/aluno/simulados')
  return { id: (data as any).id as string }
}

export type MeuSimuladoResumo = { id: string; titulo: string; status: string; questoes: number; criadoEm: string | null }

export async function listarMeusSimulados(): Promise<MeuSimuladoResumo[]> {
  const { svc, estudanteId, tenantId } = await ctx()
  const sims = await fetchAll<any>(() => svc.from('simulado_simulados')
    .select('id, titulo, status, created_at')
    .eq('tenant_id', tenantId).eq('owner_estudante_id', estudanteId).eq('deletado', false)
    .order('created_at', { ascending: false }))
  const ids = sims.map((s) => s.id)
  const cont = new Map<string, number>()
  if (ids.length) {
    const pqs = await fetchAllByIn<any>(ids, (chunk) => svc.from('simulado_prova_questoes').select('simulado_id').in('simulado_id', chunk))
    for (const p of pqs) cont.set(p.simulado_id, (cont.get(p.simulado_id) ?? 0) + 1)
  }
  return sims.map((s) => ({ id: s.id, titulo: s.titulo, status: s.status, questoes: cont.get(s.id) ?? 0, criadoEm: s.created_at ?? null }))
}

export async function renomearMeuSimulado(simuladoId: string, nome: string): Promise<{ ok?: boolean; error?: string }> {
  const { svc, estudanteId, tenantId } = await ctx()
  const t = (nome || '').trim()
  if (!t) return { error: 'Informe um nome.' }
  const { error } = await svc.from('simulado_simulados').update({ titulo: t })
    .eq('id', simuladoId).eq('tenant_id', tenantId).eq('owner_estudante_id', estudanteId)
  if (error) return { error: error.message }
  revalidatePath('/aluno/simulados'); revalidatePath(`/aluno/simulados/personalizados/${simuladoId}`)
  return { ok: true }
}

export async function excluirMeuSimulado(simuladoId: string): Promise<{ ok?: boolean; error?: string }> {
  const { svc, estudanteId, tenantId } = await ctx()
  const { error } = await svc.from('simulado_simulados').update({ deletado: true, deletado_em: new Date().toISOString() })
    .eq('id', simuladoId).eq('tenant_id', tenantId).eq('owner_estudante_id', estudanteId)
  if (error) return { error: error.message }
  revalidatePath('/aluno/simulados')
  return { ok: true }
}

export type QuestaoEscolhida = { questaoId: string; ordem: number; enunciado: string }

export async function questoesDoMeuSimulado(simuladoId: string): Promise<{ titulo?: string; itens?: QuestaoEscolhida[]; error?: string }> {
  const { svc, estudanteId, tenantId } = await ctx()
  const sim = await meuSimulado(svc, tenantId, estudanteId, simuladoId)
  if (!sim) return { error: 'Simulado não encontrado.' }
  const pqs = await fetchAll<any>(() => svc.from('simulado_prova_questoes').select('questao_id, ordem')
    .eq('simulado_id', simuladoId).eq('tenant_id', tenantId).order('ordem', { ascending: true }))
  const qids = pqs.map((p) => p.questao_id)
  const qmap = new Map<string, any>()
  if (qids.length) {
    const qs = await fetchAllByIn<any>(qids, (c) => svc.from('simulado_questoes').select('id, enunciado').in('id', c))
    for (const q of qs) qmap.set(q.id, q)
  }
  const limpar = (s: string) => (s ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180)
  return { titulo: (sim as any).titulo, itens: pqs.map((p) => ({ questaoId: p.questao_id, ordem: p.ordem, enunciado: limpar(qmap.get(p.questao_id)?.enunciado) })) }
}

export type QuestaoDisponivel = { id: string; enunciado: string; disciplinaId: string | null; disciplina: string | null; ano: number | null; tipo: string | null }

const CAP_ACESSIVEIS = 2500 // teto de questões carregadas no seletor (busca/filtro é client-side)

/**
 * TODAS as questões que o aluno pode escolher (dos simulados a que tem acesso), UMA vez.
 * O modal filtra/pagina no cliente — evita re-buscar o banco a cada tecla. Limitado a CAP_ACESSIVEIS.
 */
export async function questoesAcessiveis(): Promise<{ questoes: QuestaoDisponivel[]; disciplinas: { id: string; nome: string }[]; truncado: boolean }> {
  const { svc, estudanteId, tenantId } = await ctx()
  const qidsAll = await questaoIdsAcessiveis(svc, estudanteId)
  if (!qidsAll.length) return { questoes: [], disciplinas: [], truncado: false }
  const truncado = qidsAll.length > CAP_ACESSIVEIS
  const qids = truncado ? qidsAll.slice(0, CAP_ACESSIVEIS) : qidsAll
  const rows = await fetchAllByIn<any>(qids, (chunk) => svc.from('simulado_questoes').select('id, enunciado, disciplina_id, ano, tipo').eq('tenant_id', tenantId).in('id', chunk))
  const disc = [...new Set(rows.map((m) => m.disciplina_id).filter(Boolean))]
  const discNomes = new Map<string, string>()
  if (disc.length) {
    const ds = await fetchAllByIn<any>(disc, (c) => svc.from('simulado_disciplinas').select('id, nome').in('id', c))
    for (const d of ds) discNomes.set(d.id, d.nome)
  }
  const limpar = (s: string) => (s ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200)
  const questoes = rows
    .map((m) => ({ id: m.id, enunciado: limpar(m.enunciado), disciplinaId: m.disciplina_id ?? null, disciplina: m.disciplina_id ? (discNomes.get(m.disciplina_id) ?? null) : null, ano: m.ano ?? null, tipo: m.tipo ?? null }))
    .sort((a, b) => a.enunciado.localeCompare(b.enunciado, 'pt-BR'))
  return { questoes, disciplinas: [...discNomes.entries()].map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')), truncado }
}

export async function adicionarQuestao(simuladoId: string, questaoId: string): Promise<{ ok?: boolean; error?: string }> {
  const { svc, estudanteId, tenantId } = await ctx()
  const sim = await meuSimulado(svc, tenantId, estudanteId, simuladoId)
  if (!sim) return { error: 'Simulado não encontrado.' }
  const acess = new Set(await questaoIdsAcessiveis(svc, estudanteId))
  if (!acess.has(questaoId)) return { error: 'Você não tem acesso a essa questão.' }
  const { data: ja } = await svc.from('simulado_prova_questoes').select('id').eq('simulado_id', simuladoId).eq('questao_id', questaoId).maybeSingle()
  if (ja) return { ok: true }
  const { data: max } = await svc.from('simulado_prova_questoes').select('ordem').eq('simulado_id', simuladoId).order('ordem', { ascending: false }).limit(1).maybeSingle()
  const ordem = (((max as any)?.ordem as number) ?? -1) + 1
  const { error } = await svc.from('simulado_prova_questoes').insert({ tenant_id: tenantId, simulado_id: simuladoId, questao_id: questaoId, ordem })
  if (error) return { error: error.message }
  revalidatePath(`/aluno/simulados/personalizados/${simuladoId}`)
  return { ok: true }
}

export async function removerQuestao(simuladoId: string, questaoId: string): Promise<{ ok?: boolean; error?: string }> {
  const { svc, estudanteId, tenantId } = await ctx()
  const sim = await meuSimulado(svc, tenantId, estudanteId, simuladoId)
  if (!sim) return { error: 'Simulado não encontrado.' }
  const { error } = await svc.from('simulado_prova_questoes').delete().eq('simulado_id', simuladoId).eq('questao_id', questaoId).eq('tenant_id', tenantId)
  if (error) return { error: error.message }
  revalidatePath(`/aluno/simulados/personalizados/${simuladoId}`)
  return { ok: true }
}
