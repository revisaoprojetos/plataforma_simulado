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

// Aparência (capa) do simulado pessoal — vive em `regras.visual` (jsonb, sem migração). Defaults =
// os históricos do card (roxo da marca + varinha). Ver lib/personalizado-visual (validação no render).
function saneVisual(cor?: string | null, icone?: string | null): { cor: string; icone: string } {
  return {
    cor: typeof cor === 'string' && /^#[0-9a-fA-F]{6}$/.test(cor) ? cor : '#6d28d9',
    icone: typeof icone === 'string' && icone.trim() ? icone.trim().slice(0, 30) : 'varinha',
  }
}
const visualDe = (regras: any) => saneVisual(regras?.visual?.cor, regras?.visual?.icone)

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

export type MeuSimuladoResumo = {
  id: string; titulo: string; status: string; questoes: number; criadoEm: string | null
  /** Estatísticas das sessões DESTE aluno (para o card mostrar nota/tentativas, como nos oficiais). */
  tentativas: number            // sessões finalizadas
  melhorNota: number | null     // maior nota entre as finalizadas
  emAndamento: boolean          // tem sessão não finalizada
  ultimaSessaoId: string | null // sessão para "Ver resultado" (a de maior nota; desempate: mais recente)
  cor: string                   // cor da capa (regras.visual.cor)
  icone: string                 // ícone da capa (regras.visual.icone)
}

export async function listarMeusSimulados(): Promise<MeuSimuladoResumo[]> {
  const { svc, estudanteId, tenantId } = await ctx()
  const sims = await fetchAll<any>(() => svc.from('simulado_simulados')
    .select('id, titulo, status, created_at, regras')
    .eq('tenant_id', tenantId).eq('owner_estudante_id', estudanteId).eq('deletado', false)
    .order('created_at', { ascending: false }))
  const ids = sims.map((s) => s.id)
  const cont = new Map<string, number>()
  const sessByS = new Map<string, any[]>()
  if (ids.length) {
    // Contagem de questões + sessões do aluno (para nota/tentativas), em paralelo.
    const [pqs, sess] = await Promise.all([
      fetchAllByIn<any>(ids, (chunk) => svc.from('simulado_prova_questoes').select('simulado_id').in('simulado_id', chunk)),
      fetchAllByIn<any>(ids, (chunk) => svc.from('simulado_sessoes_prova')
        .select('id, simulado_id, status, nota, finalizado_em')
        .in('simulado_id', chunk).eq('estudante_id', estudanteId).eq('is_teste', false).eq('deletado', false)),
    ])
    for (const p of pqs) cont.set(p.simulado_id, (cont.get(p.simulado_id) ?? 0) + 1)
    for (const s of sess) { const arr = sessByS.get(s.simulado_id) ?? []; arr.push(s); sessByS.set(s.simulado_id, arr) }
  }
  return sims.map((s) => {
    const ss = sessByS.get(s.id) ?? []
    const fin = ss.filter((x) => x.status === 'finalizada')
    const emAndamento = ss.some((x) => x.status !== 'finalizada')
    const notas = fin.map((x) => (x.nota != null ? Number(x.nota) : null)).filter((n): n is number => n != null)
    const melhorNota = notas.length ? Math.max(...notas) : null
    // Melhor tentativa (nota; desempate: mais recente) → sessão que a tela de resultado abre.
    const melhorSess = fin.slice().sort((a, b) => (Number(b.nota ?? -1) - Number(a.nota ?? -1)) || (new Date(b.finalizado_em ?? 0).getTime() - new Date(a.finalizado_em ?? 0).getTime()))[0]
    const vis = visualDe(s.regras)
    return {
      id: s.id, titulo: s.titulo, status: s.status, questoes: cont.get(s.id) ?? 0, criadoEm: s.created_at ?? null,
      tentativas: fin.length, melhorNota, emAndamento, ultimaSessaoId: melhorSess?.id ?? null,
      cor: vis.cor, icone: vis.icone,
    }
  })
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
/** Seção (fileira) do simulado do aluno: agrupa questões. Persistida em `regras.secoes` (jsonb). */
export type Secao = { id: string; nome: string; questaoIds: string[] }

/** Sanea/normaliza as seções vindas do jsonb contra as questões que realmente estão no simulado. */
function sanearSecoes(raw: unknown, doSim: Set<string>): Secao[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  return raw
    .map((s: any) => ({ id: String(s?.id ?? ''), nome: String(s?.nome ?? '').slice(0, 80), questaoIds: Array.isArray(s?.questaoIds) ? s.questaoIds : [] }))
    .filter((s) => s.id)
    .map((s) => ({ ...s, questaoIds: s.questaoIds.filter((id: string) => doSim.has(id) && !seen.has(id) && seen.add(id)) }))
}

export async function questoesDoMeuSimulado(simuladoId: string): Promise<{ titulo?: string; itens?: QuestaoEscolhida[]; secoes?: Secao[]; visual?: { cor: string; icone: string }; error?: string }> {
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
  const secoes = sanearSecoes((sim as any).regras?.secoes, new Set(qids))
  return { titulo: (sim as any).titulo, itens: pqs.map((p) => ({ questaoId: p.questao_id, ordem: p.ordem, enunciado: limpar(qmap.get(p.questao_id)?.enunciado) })), secoes, visual: visualDe((sim as any).regras) }
}

/** Salva a APARÊNCIA (cor + ícone) da capa do simulado pessoal em `regras.visual`. */
export async function salvarVisualMeuSimulado(simuladoId: string, cor: string, icone: string): Promise<{ ok?: boolean; error?: string }> {
  const { svc, estudanteId, tenantId } = await ctx()
  const sim = await meuSimulado(svc, tenantId, estudanteId, simuladoId)
  if (!sim) return { error: 'Simulado não encontrado.' }
  const regras = { ...((sim as any).regras ?? {}), visual: saneVisual(cor, icone) }
  const { error } = await svc.from('simulado_simulados').update({ regras })
    .eq('id', simuladoId).eq('tenant_id', tenantId).eq('owner_estudante_id', estudanteId)
  if (error) return { error: error.message }
  revalidatePath('/aluno/simulados'); revalidatePath(`/aluno/simulados/personalizados/${simuladoId}`)
  return { ok: true }
}

/**
 * Salva o LAYOUT do simulado: a ordem global das questões (`ordemIds`) + as seções (`regras.secoes`).
 * Fonte única: o cliente manda o layout completo; o servidor persiste as seções e sincroniza a
 * `ordem` de prova_questoes com a lista achatada (o runner continua lendo `ordem`).
 */
export async function salvarLayout(simuladoId: string, ordemIds: string[], secoes: Secao[]): Promise<{ ok?: boolean; error?: string }> {
  const { svc, estudanteId, tenantId } = await ctx()
  const sim = await meuSimulado(svc, tenantId, estudanteId, simuladoId)
  if (!sim) return { error: 'Simulado não encontrado.' }
  const { data: atuais } = await svc.from('simulado_prova_questoes').select('questao_id').eq('simulado_id', simuladoId).eq('tenant_id', tenantId)
  const doSim = new Set((atuais ?? []).map((r: any) => r.questao_id))

  const cleanSec = sanearSecoes(secoes, doSim)
  const regras = { ...((sim as any).regras ?? {}), secoes: cleanSec }
  const { error: e1 } = await svc.from('simulado_simulados').update({ regras }).eq('id', simuladoId).eq('tenant_id', tenantId).eq('owner_estudante_id', estudanteId)
  if (e1) return { error: e1.message }

  // Ordem global = ordemIds (saneado) + qualquer questão faltante ao fim (segurança).
  const ord = [...new Set(ordemIds)].filter((id) => doSim.has(id))
  for (const id of doSim) if (!ord.includes(id)) ord.push(id)
  for (let i = 0; i < ord.length; i += 20) {
    const lote = ord.slice(i, i + 20)
    const res = await Promise.all(lote.map((qid, j) =>
      svc.from('simulado_prova_questoes').update({ ordem: i + j }).eq('simulado_id', simuladoId).eq('tenant_id', tenantId).eq('questao_id', qid)))
    const err = res.find((r) => r.error)?.error
    if (err) return { error: err.message }
  }
  revalidatePath(`/aluno/simulados/personalizados/${simuladoId}`)
  return { ok: true }
}

export type QuestaoDisponivel = {
  id: string; enunciado: string
  disciplinaId: string | null; disciplina: string | null
  assuntoId: string | null; assunto: string | null
  bancaId: string | null; banca: string | null
  ano: number | null; tipo: string | null; dificuldade: string | null
  simuladoId: string | null; simulado: string | null
}
export type OpcoesFiltro = {
  disciplinas: { id: string; nome: string }[]
  assuntos: { id: string; nome: string; disciplinaId: string | null }[]
  bancas: { id: string; nome: string }[]
  simulados: { id: string; nome: string }[]
  anos: number[]
  tipos: string[]
  dificuldades: string[]
}

const CAP_ACESSIVEIS = 2500 // teto de questões carregadas no seletor (busca/filtro é client-side)

/**
 * TODAS as questões que o aluno pode escolher (dos simulados a que tem acesso), UMA vez, com os
 * metadados p/ filtrar (disciplina/assunto/banca/ano/tipo/dificuldade/simulado) + as opções de cada
 * filtro. Cada questão traz também o SIMULADO de origem (o 1º em que aparece). O seletor filtra/pagina
 * no cliente — evita re-buscar o banco a cada tecla. Limitado a CAP_ACESSIVEIS.
 */
export async function questoesAcessiveis(): Promise<{ questoes: QuestaoDisponivel[]; filtros: OpcoesFiltro; truncado: boolean }> {
  const { svc, estudanteId, tenantId } = await ctx()
  const vazio: OpcoesFiltro = { disciplinas: [], assuntos: [], bancas: [], simulados: [], anos: [], tipos: [], dificuldades: [] }
  // Simulados acessíveis + mapa questão→simulado (o 1º em que aparece, p/ a tag e o filtro).
  const [{ data: mats }, { data: acs }] = await Promise.all([
    svc.from('simulado_matriculas').select('simulado_id, liberado').eq('estudante_id', estudanteId),
    svc.from('simulado_acessos').select('simulado_id').eq('estudante_id', estudanteId),
  ])
  const simIds = [...new Set([
    ...(mats ?? []).filter((m: any) => m.liberado !== false).map((m: any) => m.simulado_id),
    ...(acs ?? []).map((a: any) => a.simulado_id),
  ].filter(Boolean))] as string[]
  if (!simIds.length) return { questoes: [], filtros: vazio, truncado: false }
  const pqs = await fetchAllByIn<any>(simIds, (chunk) => svc.from('simulado_prova_questoes').select('questao_id, simulado_id').in('simulado_id', chunk))
  const qToSim = new Map<string, string>()
  for (const p of pqs) if (p.questao_id && !qToSim.has(p.questao_id)) qToSim.set(p.questao_id, p.simulado_id)
  const qidsAll = [...qToSim.keys()]
  if (!qidsAll.length) return { questoes: [], filtros: vazio, truncado: false }
  const truncado = qidsAll.length > CAP_ACESSIVEIS
  const qids = truncado ? qidsAll.slice(0, CAP_ACESSIVEIS) : qidsAll

  const rows = await fetchAllByIn<any>(qids, (chunk) => svc.from('simulado_questoes').select('id, enunciado, disciplina_id, assunto_id, banca_id, ano, tipo, nivel_dificuldade').eq('tenant_id', tenantId).in('id', chunk))

  // Resolve nomes (disciplina/assunto/banca) + títulos dos simulados usados, em lote.
  const idsDe = (campo: string) => [...new Set(rows.map((r) => r[campo]).filter(Boolean))] as string[]
  const mapear = async (tabela: string, col: string, ids: string[]) => {
    const m = new Map<string, string>()
    if (ids.length) { const ds = await fetchAllByIn<any>(ids, (c) => svc.from(tabela).select(`id, ${col}`).in('id', c)); for (const d of ds) m.set(d.id, d[col]) }
    return m
  }
  const simsUsados = [...new Set(qids.map((id) => qToSim.get(id)).filter(Boolean))] as string[]
  const [discM, assuntoM, bancaM, simM] = await Promise.all([
    mapear('simulado_disciplinas', 'nome', idsDe('disciplina_id')),
    mapear('simulado_assuntos', 'nome', idsDe('assunto_id')),
    mapear('simulado_bancas', 'nome', idsDe('banca_id')),
    mapear('simulado_simulados', 'titulo', simsUsados),
  ])
  const limpar = (s: string) => (s ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 220)

  const questoes: QuestaoDisponivel[] = rows.map((m) => {
    const simId = qToSim.get(m.id) ?? null
    return {
      id: m.id, enunciado: limpar(m.enunciado),
      disciplinaId: m.disciplina_id ?? null, disciplina: m.disciplina_id ? (discM.get(m.disciplina_id) ?? null) : null,
      assuntoId: m.assunto_id ?? null, assunto: m.assunto_id ? (assuntoM.get(m.assunto_id) ?? null) : null,
      bancaId: m.banca_id ?? null, banca: m.banca_id ? (bancaM.get(m.banca_id) ?? null) : null,
      ano: m.ano ?? null, tipo: m.tipo ?? null, dificuldade: m.nivel_dificuldade ?? null,
      simuladoId: simId, simulado: simId ? (simM.get(simId) ?? null) : null,
    }
  }).sort((a, b) => a.enunciado.localeCompare(b.enunciado, 'pt-BR'))

  // Opções distintas p/ os filtros (só o que aparece nas questões acessíveis).
  const distintos = <T,>(arr: T[], key: (x: T) => string | number | null) => [...new Map(arr.filter((x) => key(x) != null).map((x) => [key(x), x])).values()]
  const filtros: OpcoesFiltro = {
    disciplinas: distintos(questoes, (q) => q.disciplinaId).map((q) => ({ id: q.disciplinaId!, nome: q.disciplina ?? '—' })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    assuntos: distintos(questoes, (q) => q.assuntoId).map((q) => ({ id: q.assuntoId!, nome: q.assunto ?? '—', disciplinaId: q.disciplinaId })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    bancas: distintos(questoes, (q) => q.bancaId).map((q) => ({ id: q.bancaId!, nome: q.banca ?? '—' })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    simulados: distintos(questoes, (q) => q.simuladoId).map((q) => ({ id: q.simuladoId!, nome: q.simulado ?? '—' })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    anos: [...new Set(questoes.map((q) => q.ano).filter((a): a is number => a != null))].sort((a, b) => b - a),
    tipos: [...new Set(questoes.map((q) => q.tipo).filter((t): t is string => !!t))].sort(),
    dificuldades: [...new Set(questoes.map((q) => q.dificuldade).filter((d): d is string => !!d))],
  }
  return { questoes, filtros, truncado }
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

const MODOS_PESSOAIS = ['estudo', 'prova', 'revisao'] as const

/** Cria o simulado JÁ com a configuração (nome/tipo/tempo/aparência) e as questões escolhidas, em lote. */
export async function criarMeuSimuladoCompleto(input: { nome: string; modo?: string; tempo?: number | null; cor?: string; icone?: string; questaoIds: string[] }): Promise<{ id?: string; adicionadas?: number; error?: string }> {
  const { svc, estudanteId, tenantId } = await ctx()
  const titulo = (input.nome || '').trim() || 'Meu simulado'
  const modo = (MODOS_PESSOAIS as readonly string[]).includes(input.modo || '') ? input.modo : 'estudo'
  const tempo = input.tempo && input.tempo > 0 ? Math.min(Math.round(input.tempo), 600) : null
  const visual = saneVisual(input.cor, input.icone)
  const { data, error } = await svc.from('simulado_simulados').insert({
    tenant_id: tenantId, owner_estudante_id: estudanteId, titulo,
    modo_aplicacao: 'aberto', status: 'rascunho', tempo_limite_min: tempo,
    regras: { modo_pessoal: modo, visual }, created_at: new Date().toISOString(),
  }).select('id').single()
  if (error || !data) return { error: error?.message ?? 'Não foi possível criar.' }
  const simuladoId = (data as any).id as string
  const acess = new Set(await questaoIdsAcessiveis(svc, estudanteId))
  const validos = [...new Set(input.questaoIds ?? [])].filter((id) => acess.has(id))
  let adicionadas = 0
  if (validos.length) {
    const rows = validos.map((qid, i) => ({ tenant_id: tenantId, simulado_id: simuladoId, questao_id: qid, ordem: i }))
    const { error: e2 } = await svc.from('simulado_prova_questoes').insert(rows)
    if (!e2) adicionadas = rows.length
  }
  revalidatePath('/aluno/simulados')
  return { id: simuladoId, adicionadas }
}

/** Adiciona VÁRIAS questões de uma vez (import em lote) a um simulado existente do aluno. */
export async function adicionarQuestoes(simuladoId: string, questaoIds: string[]): Promise<{ adicionadas?: number; error?: string }> {
  const { svc, estudanteId, tenantId } = await ctx()
  const sim = await meuSimulado(svc, tenantId, estudanteId, simuladoId)
  if (!sim) return { error: 'Simulado não encontrado.' }
  const acess = new Set(await questaoIdsAcessiveis(svc, estudanteId))
  const { data: jaData } = await svc.from('simulado_prova_questoes').select('questao_id, ordem').eq('simulado_id', simuladoId)
  const ja = new Set((jaData ?? []).map((r: any) => r.questao_id))
  let ordem = Math.max(-1, ...((jaData ?? []).map((r: any) => Number(r.ordem) || 0)))
  const novos = [...new Set(questaoIds ?? [])].filter((id) => acess.has(id) && !ja.has(id))
  if (!novos.length) return { adicionadas: 0 }
  const rows = novos.map((qid) => ({ tenant_id: tenantId, simulado_id: simuladoId, questao_id: qid, ordem: ++ordem }))
  const { error } = await svc.from('simulado_prova_questoes').insert(rows)
  if (error) return { error: error.message }
  revalidatePath(`/aluno/simulados/personalizados/${simuladoId}`)
  return { adicionadas: rows.length }
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
