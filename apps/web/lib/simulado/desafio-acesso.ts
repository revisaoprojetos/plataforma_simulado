import 'server-only'

/**
 * GATE EM RUNTIME do desafio: o aluno tem acesso a um simulado por estar no DESAFIO ao qual ele
 * pertence (pasta folder_area='maratona'). A base de acesso é `simulado_pasta_estudantes` da pasta do
 * desafio — a mesma que o `ModuloAcesso` gerencia. Assim, mexer no acesso do desafio vale para TODOS os
 * seus simulados na hora, sem copiar/sincronizar um a um. Tolerante a colunas ausentes (nunca derruba).
 */
export async function temAcessoPorDesafio(svc: any, estudanteId: string, simuladoId: string): Promise<boolean> {
  try {
    const { data: sim } = await svc.from('simulado_simulados').select('pasta_id').eq('id', simuladoId).maybeSingle()
    const pastaId = (sim as any)?.pasta_id
    if (!pastaId) return false
    const { data: pasta } = await svc.from('simulado_pastas').select('folder_area').eq('id', pastaId).maybeSingle()
    if ((pasta as any)?.folder_area !== 'maratona') return false
    // Acesso = individual (simulado_pasta_estudantes) OU grupo (simulado_pasta_grupos + simulado_grupo_membros);
    // sem atribuição = liberado para todos. Mesmo modelo da aba Acessos (ModuloAcesso) e do juris — antes só
    // checava o individual, então membros de GRUPO adicionados ficavam de fora.
    const [{ data: pe }, { data: pg }] = await Promise.all([
      svc.from('simulado_pasta_estudantes').select('estudante_id').eq('pasta_id', pastaId),
      svc.from('simulado_pasta_grupos').select('grupo_id').eq('pasta_id', pastaId),
    ])
    const estuds = new Set((pe ?? []).map((r: any) => r.estudante_id as string))
    const grupos = (pg ?? []).map((r: any) => r.grupo_id as string)
    if (!estuds.size && !grupos.length) return true
    if (estuds.has(estudanteId)) return true
    if (grupos.length) {
      const { data: gm } = await svc.from('simulado_grupo_membros').select('grupo_id').eq('estudante_id', estudanteId).in('grupo_id', grupos)
      if ((gm ?? []).length) return true
    }
    return false
  } catch {
    return false
  }
}
