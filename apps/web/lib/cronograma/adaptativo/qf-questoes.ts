import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { questoesForaDeJogoTenant } from '@/lib/simulado/questoes-anuladas'
import { resolverComentarioGabarito } from '@/lib/simulado/comentario-gabarito'
import { etiquetasPorQuestao } from '@/lib/aluno/etiquetas-questao'
import { provasPorQuestao } from '@/lib/aluno/provas-questao'
import type { QuestaoAluno } from '@/components/aluno/questao-resolvivel'
import type { FiltroQuestoesMeta } from './qf'

// CONSULTA das questões da plataforma que casam com o filtro de uma META. Mesmas regras de elegibilidade do
// Banco de Questões do aluno (publicada, não deletada, não anulada, fora as discursivas, fora as "fora de
// jogo" por etiqueta). Paginação NO BANCO (.range + count). Nada de filtrar por jsonb: o jsonb só guarda os
// IDs e aqui eles viram .in() nas colunas indexáveis de simulado_questoes.

const COLS_QUESTAO = 'id, tipo, enunciado, disciplina_id, banca_id, ano, nivel_dificuldade, comentario_professor, codigo, numero, assunto_id, imagem_url'
const MAX_IN = 400 // .in() gigante pendura o proxy (landmine) — teto de ids por critério

/** Assuntos escolhidos + TODOS os descendentes (pai_id). Tolerante: sem a coluna/erro → só os escolhidos. */
async function expandirAssuntos(svc: SupabaseClient, tenantId: string, ids: string[]): Promise<string[]> {
  if (!ids.length) return []
  try {
    const todos = await fetchAll<{ id: string; pai_id: string | null }>(() =>
      svc.from('simulado_assuntos').select('id, pai_id').eq('tenant_id', tenantId).order('id', { ascending: true }))
    const filhos = new Map<string, string[]>()
    for (const a of todos) if (a.pai_id) (filhos.get(a.pai_id) ?? filhos.set(a.pai_id, []).get(a.pai_id)!).push(a.id)
    const out = new Set(ids)
    const fila = [...ids]
    while (fila.length && out.size < MAX_IN) { const cur = fila.pop()!; for (const f of filhos.get(cur) ?? []) if (!out.has(f)) { out.add(f); fila.push(f) } }
    return [...out].slice(0, MAX_IN)
  } catch { return ids.slice(0, MAX_IN) }
}

async function aplicador(svc: SupabaseClient, tenantId: string, f: FiltroQuestoesMeta) {
  const [foraDeJogo, assuntos] = await Promise.all([
    questoesForaDeJogoTenant(svc, tenantId),
    expandirAssuntos(svc, tenantId, f.ass ?? []),
  ])
  const foraIds = [...foraDeJogo]
  return (qb: any) => {
    qb = qb.eq('tenant_id', tenantId).eq('status', 'publicada').eq('deletado', false).eq('anulada', false).neq('tipo', 'discursiva')
    if (foraIds.length) qb = qb.not('id', 'in', `(${foraIds.join(',')})`)
    if (f.disc?.length) qb = qb.in('disciplina_id', f.disc.slice(0, MAX_IN))
    if (assuntos.length) qb = qb.in('assunto_id', assuntos)
    if (f.banca?.length) qb = qb.in('banca_id', f.banca.slice(0, MAX_IN))
    if (f.orgao?.length) qb = qb.in('orgao_id', f.orgao.slice(0, MAX_IN))
    if (f.anos?.length) qb = qb.in('ano', f.anos)
    if (f.dif?.length) qb = qb.in('nivel_dificuldade', f.dif)
    return qb
  }
}

/** Uma PÁGINA de questões do filtro (ordem estável: mais recentes primeiro, id desempata) + total. */
export async function consultarQuestoesFiltro(
  svc: SupabaseClient, tenantId: string, f: FiltroQuestoesMeta, offset: number, limit: number,
): Promise<{ rows: any[]; count: number }> {
  const aplicar = await aplicador(svc, tenantId, f)
  const r = await aplicar(svc.from('simulado_questoes').select(COLS_QUESTAO, { count: 'exact' }))
    .order('created_at', { ascending: false }).order('id', { ascending: true }).range(offset, offset + limit - 1)
  if (r.error) return { rows: [], count: 0 }
  return { rows: r.data ?? [], count: r.count ?? 0 }
}

/** Só a contagem (pré-visualização no admin: "N questões casam"). */
export async function contarQuestoesFiltro(svc: SupabaseClient, tenantId: string, f: FiltroQuestoesMeta): Promise<number> {
  const aplicar = await aplicador(svc, tenantId, f)
  const r = await aplicar(svc.from('simulado_questoes').select('id', { count: 'exact', head: true }))
  return r.count ?? 0
}

/** Linhas de simulado_questoes → o formato que o card do aluno (QuestaoCard) espera. Mesma montagem do Banco. */
export async function montarQuestoesAluno(svc: SupabaseClient, tenantId: string, estudanteId: string, questoes: any[]): Promise<QuestaoAluno[]> {
  const ids = questoes.map((x) => x.id)
  const uniq = (k: string) => [...new Set(questoes.map((x) => x[k]).filter(Boolean))] as string[]
  const discIds = uniq('disciplina_id'), bancaIds = uniq('banca_id'), assuntoIds = uniq('assunto_id')
  const vazio = Promise.resolve({ data: [] as any[] })
  const [{ data: alts }, { data: discNomes }, { data: bancaNomes }, { data: assuntoNomes }, { data: favs }, etiquetasMap, provasMap] = await Promise.all([
    ids.length ? svc.from('simulado_alternativas').select('id, questao_id, texto, ordem, correta, comentario').in('questao_id', ids) : vazio,
    discIds.length ? svc.from('simulado_disciplinas').select('id, nome').in('id', discIds) : vazio,
    bancaIds.length ? svc.from('simulado_bancas').select('id, nome').in('id', bancaIds) : vazio,
    assuntoIds.length ? svc.from('simulado_assuntos').select('id, nome').in('id', assuntoIds) : vazio,
    ids.length ? svc.from('simulado_favoritos').select('questao_id').eq('estudante_id', estudanteId).in('questao_id', ids) : vazio,
    etiquetasPorQuestao(svc, tenantId, ids),
    provasPorQuestao(svc, tenantId, ids),
  ])
  const altMap = new Map<string, any[]>()
  for (const a of alts ?? []) { const arr = altMap.get(a.questao_id) ?? []; arr.push(a); altMap.set(a.questao_id, arr) }
  const nome = (rows: any[] | null) => new Map((rows ?? []).map((r: any) => [r.id, r.nome]))
  const discMap = nome(discNomes), bancaMap = nome(bancaNomes), assuntoMap = nome(assuntoNomes)
  const favSet = new Set((favs ?? []).map((f: any) => f.questao_id))
  return questoes.map((x) => ({
    id: x.id,
    tipo: x.tipo,
    enunciado: x.enunciado ?? '',
    imagem_url: x.imagem_url ?? null,
    codigo: x.codigo ?? (x.numero != null ? `Q${x.numero}` : null),
    disciplina: discMap.get(x.disciplina_id) ?? null,
    assunto: assuntoMap.get(x.assunto_id) ?? null,
    banca: bancaMap.get(x.banca_id) ?? null,
    ano: x.ano ?? null,
    comentario_professor: resolverComentarioGabarito(x.comentario_professor, altMap.get(x.id) ?? []),
    favorito: favSet.has(x.id),
    etiquetas: etiquetasMap.get(x.id) ?? [],
    provas: provasMap.get(x.id) ?? [],
    alternativas: (altMap.get(x.id) ?? []).map((a) => ({ id: a.id, texto: a.texto, ordem: a.ordem ?? 0, correta: !!a.correta })),
  }))
}
