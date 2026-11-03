// Questões SALVAS (favoritas) do aluno, prontas para o QuestaoCard. Usado pela tela antiga de Favoritos e
// pela aba "Salvos" de Meus Cadernos (nova) — um loader só, para as duas mostrarem a mesma coisa.
// simulado_favoritos NÃO tem tenant_id: o escopo é o estudante (como em todo o resto do portal).
import { type QuestaoAluno } from '@/components/aluno/questao-resolvivel'
import { etiquetasPorQuestao } from '@/lib/aluno/etiquetas-questao'

export async function carregarFavoritosAluno(svc: any, tenantId: string, estudanteId: string): Promise<QuestaoAluno[]> {
  const { data: favs } = await svc
    .from('simulado_favoritos')
    .select('questao_id, criado_em')
    .eq('estudante_id', estudanteId)
    .order('criado_em', { ascending: false })

  const ids: string[] = (favs ?? []).map((f: any) => f.questao_id)
  if (!ids.length) return []

  // questões + alternativas + etiquetas dependem só de `ids` (favoritos) → em PARALELO.
  const [{ data: questoes }, { data: alts }, etiquetasMap] = await Promise.all([
    svc.from('simulado_questoes').select('id, tipo, enunciado, disciplina_id, ano, comentario_professor').in('id', ids).eq('status', 'publicada'),
    svc.from('simulado_alternativas').select('id, questao_id, texto, ordem, correta').in('questao_id', ids),
    etiquetasPorQuestao(svc, tenantId, ids),
  ])

  // Nomes das disciplinas dependem dos disciplina_id das questões → só depois.
  const discIds = (questoes ?? []).map((x: any) => x.disciplina_id).filter(Boolean)
  const { data: discNomes } = discIds.length
    ? await svc.from('simulado_disciplinas').select('id, nome').in('id', discIds)
    : { data: [] as any[] }
  const discMap = new Map((discNomes ?? []).map((d: any) => [d.id, d.nome]))

  const altMap = new Map<string, any[]>()
  for (const a of alts ?? []) {
    const arr = altMap.get(a.questao_id) ?? []
    arr.push(a)
    altMap.set(a.questao_id, arr)
  }

  // Preserva a ordem dos favoritos (mais recentes primeiro).
  const qById = new Map((questoes ?? []).map((x: any) => [x.id, x]))
  return ids
    .map((id) => qById.get(id))
    .filter(Boolean)
    .map((x: any) => ({
      id: x.id,
      tipo: x.tipo,
      enunciado: x.enunciado ?? '',
      disciplina: (discMap.get(x.disciplina_id) as string | undefined) ?? null,
      ano: x.ano ?? null,
      comentario_professor: x.comentario_professor ?? null,
      favorito: true,
      etiquetas: etiquetasMap.get(x.id) ?? [],
      alternativas: (altMap.get(x.id) ?? []).map((a) => ({ id: a.id, texto: a.texto, ordem: a.ordem ?? 0, correta: !!a.correta })),
    }))
}
