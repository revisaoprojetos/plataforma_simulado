// Dados de "Meus Cadernos" (portal novo) que dependem das RESPOSTAS do aluno no banco de questões
// (simulado_respostas_avulsas — a prática do Banco de Questões / Recomendados / cadernos):
//   • caderno AUTOMÁTICO de erros  = questões cuja ÚLTIMA resposta do aluno foi errada (acertou depois → sai)
//   • % resolvido de cada caderno  = questões do caderno que o aluno já respondeu ao menos uma vez
// + um loader genérico ids → QuestaoAluno (pronto p/ o QuestaoCard), na ordem dos ids.
import 'server-only'
import { type QuestaoAluno } from '@/components/aluno/questao-resolvivel'
import { etiquetasPorQuestao } from '@/lib/aluno/etiquetas-questao'
import { fetchAll, fetchAllByIn } from '@/lib/supabase/fetch-all'

/** Última resposta de cada questão respondida pelo aluno: questao_id → { correta, em }. */
async function ultimasRespostas(svc: any, tenantId: string, estudanteId: string): Promise<Map<string, { correta: boolean; em: string }>> {
  const rows = await fetchAll<any>(() => svc.from('simulado_respostas_avulsas').select('questao_id, correta, respondido_em')
    .eq('tenant_id', tenantId).eq('estudante_id', estudanteId)
    .order('respondido_em', { ascending: false }).order('id', { ascending: true }) as any, 1000, 'respostas_avulsas_aluno')
  const ult = new Map<string, { correta: boolean; em: string }>()
  for (const r of rows) if (!ult.has(r.questao_id)) ult.set(r.questao_id, { correta: !!r.correta, em: r.respondido_em }) // 1ª = mais recente
  return ult
}

export interface ResumoErros { ids: string[]; atualizadoEm: string | null }

/** Caderno de revisão: ids das questões com a ÚLTIMA resposta errada, da mais recente para a mais antiga. */
export async function cadernoDeErros(svc: any, tenantId: string, estudanteId: string): Promise<ResumoErros> {
  const ult = await ultimasRespostas(svc, tenantId, estudanteId)
  const erradas = [...ult.entries()].filter(([, v]) => !v.correta).sort((a, b) => (a[1].em < b[1].em ? 1 : a[1].em > b[1].em ? -1 : 0))
  return { ids: erradas.map(([id]) => id), atualizadoEm: erradas[0]?.[1].em ?? null }
}

/** % resolvido por caderno (questões do caderno já respondidas pelo aluno ÷ total). */
export async function progressoCadernos(svc: any, tenantId: string, estudanteId: string, itens: { caderno_id: string; questao_id: string }[]): Promise<Record<string, { total: number; resolvidas: number }>> {
  const out: Record<string, { total: number; resolvidas: number }> = {}
  if (!itens.length) return out
  const qids = [...new Set(itens.map((i) => i.questao_id))]
  const resp = await fetchAllByIn<any>(qids, (chunk) => svc.from('simulado_respostas_avulsas').select('questao_id')
    .eq('tenant_id', tenantId).eq('estudante_id', estudanteId).in('questao_id', chunk).order('id', { ascending: true }) as any)
  const respondidas = new Set(resp.map((r: any) => r.questao_id))
  for (const it of itens) {
    const o = (out[it.caderno_id] ??= { total: 0, resolvidas: 0 })
    o.total++
    if (respondidas.has(it.questao_id)) o.resolvidas++
  }
  return out
}

/** Questão do Caderno (beta): `gabarito_oculto` = o aluno ainda não respondeu → `correta` vem false e o comentário vem null. */
export type QuestaoCaderno = QuestaoAluno & { gabarito_oculto?: boolean }

/**
 * Esconde gabarito (`correta`) e `comentario_professor` das questões que o aluno AINDA NÃO respondeu.
 * Regra: o gabarito só sai do servidor depois de uma resposta (simulado_respostas_avulsas) — o card revela via /api/aluno/questao-resposta.
 * Pura (testável).
 */
export function ocultarGabaritoNaoRespondidas(questoes: QuestaoAluno[], respondidas: Set<string>): QuestaoCaderno[] {
  return questoes.map((q) => (respondidas.has(q.id) ? q : {
    ...q,
    comentario_professor: null,
    alternativas: q.alternativas.map((a) => ({ ...a, correta: false })),
    gabarito_oculto: true,
  }))
}

/**
 * ids → questões resolvíveis (publicadas DO TENANT), NA ORDEM dos ids, com o ⭐ real do aluno.
 * `ocultarGabaritoNaoRespondidas` (Caderno beta): só devolve gabarito/comentário das questões que o aluno já respondeu.
 */
export async function questoesParaAluno(
  svc: any, tenantId: string, estudanteId: string, ids: string[], opts: { ocultarGabaritoNaoRespondidas?: boolean } = {},
): Promise<QuestaoCaderno[]> {
  if (!ids.length) return []
  const [questoes, alts, favs, etiquetasMap, respondidas] = await Promise.all([
    fetchAllByIn<any>(ids, (c) => svc.from('simulado_questoes').select('id, tipo, enunciado, disciplina_id, ano, comentario_professor').eq('tenant_id', tenantId).in('id', c).eq('status', 'publicada').order('id', { ascending: true }) as any),
    fetchAllByIn<any>(ids, (c) => svc.from('simulado_alternativas').select('id, questao_id, texto, ordem, correta').eq('tenant_id', tenantId).in('questao_id', c).order('id', { ascending: true }) as any),
    fetchAllByIn<any>(ids, (c) => svc.from('simulado_favoritos').select('questao_id').eq('estudante_id', estudanteId).in('questao_id', c).order('questao_id', { ascending: true }) as any),
    etiquetasPorQuestao(svc, tenantId, ids),
    opts.ocultarGabaritoNaoRespondidas
      ? fetchAllByIn<any>(ids, (c) => svc.from('simulado_respostas_avulsas').select('questao_id').eq('tenant_id', tenantId).eq('estudante_id', estudanteId).in('questao_id', c).order('id', { ascending: true }) as any)
      : Promise.resolve([] as any[]),
  ])
  const discIds = [...new Set(questoes.map((x: any) => x.disciplina_id).filter(Boolean))] as string[]
  const discNomes = discIds.length ? await fetchAllByIn<any>(discIds, (c) => svc.from('simulado_disciplinas').select('id, nome').in('id', c).order('id', { ascending: true }) as any) : []
  const discMap = new Map(discNomes.map((d: any) => [d.id, d.nome as string]))
  const favSet = new Set(favs.map((f: any) => f.questao_id))
  const altMap = new Map<string, any[]>()
  for (const a of alts) { const arr = altMap.get(a.questao_id) ?? []; arr.push(a); altMap.set(a.questao_id, arr) }
  const qById = new Map(questoes.map((x: any) => [x.id, x]))
  const lista: QuestaoAluno[] = ids.map((id) => qById.get(id)).filter(Boolean).map((x: any) => ({
    id: x.id,
    tipo: x.tipo,
    enunciado: x.enunciado ?? '',
    disciplina: discMap.get(x.disciplina_id) ?? null,
    ano: x.ano ?? null,
    comentario_professor: x.comentario_professor ?? null,
    favorito: favSet.has(x.id),
    etiquetas: etiquetasMap.get(x.id) ?? [],
    alternativas: (altMap.get(x.id) ?? []).map((a) => ({ id: a.id, texto: a.texto, ordem: a.ordem ?? 0, correta: !!a.correta })),
  }))
  return opts.ocultarGabaritoNaoRespondidas ? ocultarGabaritoNaoRespondidas(lista, new Set(respondidas.map((r: any) => r.questao_id as string))) : lista
}
