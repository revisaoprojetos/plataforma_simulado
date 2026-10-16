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
    const { data } = await svc.from('simulado_pasta_estudantes').select('estudante_id').eq('pasta_id', pastaId).eq('estudante_id', estudanteId).limit(1)
    return !!(data && data.length)
  } catch {
    return false
  }
}
