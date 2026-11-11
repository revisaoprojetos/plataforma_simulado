/** SQL de cada visão rápida (alias q = simulado_questoes). 'duplicada' é tratada à parte (lista de ids vinda do cache de duplicadas). */
export const VIS_SQL: Record<string, string> = {
  sem_classificacao: '(q.disciplina_id is null or q.assunto_id is null or q.banca_id is null or q.ano is null)',
  sem_disciplina: 'q.disciplina_id is null',
  sem_assunto: 'q.assunto_id is null',
  sem_banca: 'q.banca_id is null',
  sem_orgao: 'q.orgao_id is null',
  sem_ano: 'q.ano is null',
  sem_dificuldade: 'q.nivel_dificuldade is null',
  sem_cargo: "(q.cargo is null or btrim(q.cargo) = '')",
  sem_etiqueta: 'not exists (select 1 from simulado_questao_etiquetas ve where ve.questao_id = q.id)',
  assunto_divergente: 'q.assunto_id is not null and q.disciplina_id is not null and not exists (select 1 from simulado_assuntos vs where vs.id = q.assunto_id and vs.disciplina_id = q.disciplina_id)',
  rascunho: "q.status = 'rascunho'",
  arquivada: "q.status = 'arquivada'",
  anulada: 'coalesce(q.anulada, false) = true',
  reportada: "exists (select 1 from simulado_feedbacks_questao vf where vf.questao_id = q.id and vf.status = 'pendente')",
}
