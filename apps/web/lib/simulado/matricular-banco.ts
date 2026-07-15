/**
 * Sincroniza `simulado_matriculas` com `simulado_pasta_estudantes`.
 *
 * A matrícula automática do wizard só roda na CRIAÇÃO do simulado (a partir de quem
 * estava no banco naquele instante). Sem esta sincronização, alunos adicionados ao
 * banco DEPOIS não são matriculados nos simulados já existentes daquele banco — e,
 * como a matrícula é o gate de acesso (listagem do aluno + verificarAcesso ao iniciar),
 * o simulado simplesmente não aparece para eles.
 *
 * Chame após vincular estudantes a um banco. Idempotente: ignora matrículas existentes.
 */
export async function matricularEmSimuladosDoBanco(
  svc: any,
  tenantId: string,
  bancoId: string,
  estudanteIds: string[],
): Promise<number> {
  const estIds = [...new Set(estudanteIds.filter(Boolean))]
  if (!estIds.length) return 0

  // Simulados (não deletados) que herdam deste banco (regras.banco_base_id = bancoId).
  const { data: sims } = await svc
    .from('simulado_simulados')
    .select('id')
    .eq('deletado', false)
    .filter('regras->>banco_base_id', 'eq', bancoId)
  const simIds = (sims ?? []).map((s: any) => s.id).filter(Boolean)
  if (!simIds.length) return 0

  // Matrículas já existentes (para não duplicar).
  const { data: ja } = await svc
    .from('simulado_matriculas')
    .select('simulado_id, estudante_id')
    .in('simulado_id', simIds)
    .in('estudante_id', estIds)
  const jaSet = new Set((ja ?? []).map((m: any) => `${m.simulado_id}:${m.estudante_id}`))

  const novos: { tenant_id: string; estudante_id: string; simulado_id: string; liberado: boolean }[] = []
  for (const simulado_id of simIds)
    for (const estudante_id of estIds)
      if (!jaSet.has(`${simulado_id}:${estudante_id}`))
        novos.push({ tenant_id: tenantId, estudante_id, simulado_id, liberado: true })
  if (!novos.length) return 0

  const { error } = await svc.from('simulado_matriculas').insert(novos)
  if (error) throw new Error(error.message)
  return novos.length
}
