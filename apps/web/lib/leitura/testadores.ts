// ─────────── Acessos exclusivos / MODO TESTE do desafio (leitura) ───────────
// "Testador exclusivo" = conta de teste (admin que usa e-mail de estudante) marcada na aba Acesso do
// módulo. Para ela: TODAS as aulas ficam liberadas todo dia (sem gating sequencial / "libera amanhã"),
// pode refazer o desafio à vontade e NADA contabiliza (sem XP/streak, fora do ranking) — só serve pra
// conferir a visualização do aluno. Guardado em `simulado_pastas.testadores_exclusivos` (uuid[] jsonb),
// mesmo padrão do `ranking_ocultos`. TUDO tolerante à coluna ausente (feature dormente até a migração).

type Svc = { from: (t: string) => any }

/** IDs de estudante marcados como testador exclusivo deste módulo (pasta). */
export async function testadoresDoModulo(svc: Svc, tenantId: string, pastaId: string): Promise<string[]> {
  try {
    const { data } = await svc.from('simulado_pastas').select('testadores_exclusivos').eq('id', pastaId).eq('tenant_id', tenantId).maybeSingle()
    const arr = (data as any)?.testadores_exclusivos
    return Array.isArray(arr) ? arr.filter((x: unknown): x is string => typeof x === 'string') : []
  } catch { return [] }
}

/** Esse aluno é testador exclusivo deste módulo? */
export async function ehTestadorModulo(svc: Svc, tenantId: string, estudanteId: string, pastaId: string): Promise<boolean> {
  return (await testadoresDoModulo(svc, tenantId, pastaId)).includes(estudanteId)
}

/** Conjunto de módulos (pasta ids) em que o aluno é testador — p/ liberar a trilha sem gating. */
export async function testadorModulosDoAluno(svc: Svc, tenantId: string, estudanteId: string): Promise<Set<string>> {
  const out = new Set<string>()
  try {
    const { data } = await svc.from('simulado_pastas').select('id, testadores_exclusivos').eq('tenant_id', tenantId)
    for (const p of (data ?? []) as any[]) {
      const arr = p?.testadores_exclusivos
      if (Array.isArray(arr) && arr.includes(estudanteId)) out.add(p.id as string)
    }
  } catch { /* coluna ausente → ninguém é testador */ }
  return out
}

/** Testador exclusivo do módulo que contém este documento? (resolve doc → pasta → checa). */
export async function ehTestadorLeituraDoc(svc: Svc, tenantId: string, estudanteId: string, documentoId: string): Promise<boolean> {
  try {
    const { data: doc } = await svc.from('simulado_documentos').select('pasta_id').eq('id', documentoId).eq('tenant_id', tenantId).maybeSingle()
    const pastaId = (doc as any)?.pasta_id
    if (!pastaId) return false
    return await ehTestadorModulo(svc, tenantId, estudanteId, pastaId)
  } catch { return false }
}
