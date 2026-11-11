import 'server-only'

/**
 * Guard de renumeração do catálogo: mover/renumerar semanas de um cronograma que JÁ tem emissões de alunos
 * altera o que eles veem ao reabrir (as datas são congeladas, mas as metas passam a cair em outras semanas).
 * Adicionar/remover no FIM do catálogo continua livre. Aqui só contamos o impacto e montamos a mensagem.
 */

export type ImpactoEmissoes = { requerConfirmacao: true; emissoesAfetadas: number; error: string }

/** Quantas emissões (de alunos reais, não arquivadas) existem para o cronograma — contagem agregada. */
export async function contarEmissoesDoCronograma(svc: any, tenantId: string, cronogramaId: string): Promise<number> {
  const { count } = await svc
    .from('simulado_cronograma_emissoes')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('cronograma_id', cronogramaId)
    .eq('arquivada', false)
  return count ?? 0
}

export function mensagemImpacto(n: number, o: string): string {
  return `${o} Este cronograma já tem ${n.toLocaleString('pt-BR')} ${n === 1 ? 'emissão de aluno' : 'emissões de alunos'}: as metas movidas passam a cair em outras semanas ao reabrir, e quem já marcou progresso pode ver o plano mudar. Deseja continuar mesmo assim?`
}

/** `semanas_revisao`/`dias_curso`: mudou algo que NÃO seja só acrescentar no fim? */
export function renumeraCalendario(
  antes: { total_semanas: number; dias_curso: number[]; semanas_revisao: number[] },
  depois: { total_semanas: number; dias_curso: number[]; semanas_revisao: number[] },
): boolean {
  const a = new Set(antes.semanas_revisao ?? [])
  const b = new Set(depois.semanas_revisao ?? [])
  const diff = [...a, ...b].filter((s) => a.has(s) !== b.has(s))
  // Marcar/desmarcar revisão na última semana (ou além) é "no fim" → livre.
  const revisaoMeio = diff.some((s) => s < antes.total_semanas)
  const da = antes.dias_curso ?? []
  const db = depois.dias_curso ?? []
  const diasMudaram = da.length > 0 && !(db.length >= da.length && da.every((d, i) => db[i] === d))
  return revisaoMeio || diasMudaram
}
