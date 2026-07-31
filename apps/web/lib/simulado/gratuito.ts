/**
 * Classificação "Acesso gratuito" — simulado liberado para TODOS os alunos do tenant,
 * sem depender de matrícula. É uma classificação PRÓPRIA (flag `regras.acesso_gratuito`,
 * jsonb, sem migração), distinta de `modo_aplicacao='aberto'` — este último só marca a
 * prática "sempre disponível", mas continua exigindo matrícula para o aluno enxergar/fazer.
 *
 * Efeito: o simulado aparece no portal para todos os alunos e o gate de acesso
 * (identify) libera o início sem checar matrícula.
 */

export function ehSimuladoGratuito(regras: unknown): boolean {
  const r = (regras ?? {}) as Record<string, unknown>
  return r.acesso_gratuito === true
}

/** IDs dos simulados do tenant marcados como acesso gratuito (publicados/ativos, não deletados). */
export async function idsSimuladosGratuitos(
  svc: { from: (t: string) => any },
  tenantId: string,
): Promise<string[]> {
  const { data } = await svc
    .from('simulado_simulados')
    .select('id, regras, status')
    .eq('tenant_id', tenantId)
    .eq('deletado', false)
  return ((data ?? []) as any[])
    .filter((s) => ehSimuladoGratuito(s.regras) && (s.status === 'publicado' || s.status === 'ativo'))
    .map((s) => s.id as string)
}
