import 'server-only'

/**
 * LegProc: a tabela de LEGENDA do início do documento deve ficar OCULTA para o aluno?
 * Resolve por herança: valor do DOCUMENTO → da PASTA → ancestrais → padrão (true = oculta).
 * `true` oculta · `false` mostra · `null` herda. Tolerante: coluna ausente/erro → padrão (oculta).
 */
export async function ocultarLegendaTabela(svc: any, tenantId: string, documentoId: string, pastaId: string | null): Promise<boolean> {
  try {
    const d = await svc.from('simulado_conteudo_documentos').select('legproc_ocultar_legenda').eq('tenant_id', tenantId).eq('id', documentoId).maybeSingle()
    if (!d.error && typeof d.data?.legproc_ocultar_legenda === 'boolean') return d.data.legproc_ocultar_legenda
  } catch { /* coluna ausente → herda */ }
  try {
    let pid: string | null = pastaId
    for (let i = 0; i < 8 && pid; i++) {
      const r = await svc.from('simulado_pastas').select('legproc_ocultar_legenda, pai_id').eq('tenant_id', tenantId).eq('id', pid).maybeSingle()
      if (r.error || !r.data) break
      if (typeof r.data.legproc_ocultar_legenda === 'boolean') return r.data.legproc_ocultar_legenda
      pid = r.data.pai_id ?? null
    }
  } catch { /* coluna ausente → padrão */ }
  return true
}
