import { matricularEmSimuladosDoBanco } from '@/lib/simulado/matricular-banco'

/**
 * Acha (ou cria) o grupo "Passaporte Vitalício" comum (não-mestre) do tenant. Retorna o id ou null.
 * ILIKE sem curinga = match EXATO (case-insensitive) → não pega as turmas "Passaporte Vitalício 2024".
 */
export async function garantirGrupoVitalicio(svc: any, tenantId: string): Promise<string | null> {
  try {
    const { data: gv } = await svc
      .from('simulado_grupos')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('deletado', false)
      .eq('is_mestre', false)
      .ilike('nome', 'Passaporte Vitalício')
      .limit(1)
      .maybeSingle()
    if (gv?.id) return gv.id as string
    const { data: novo } = await svc.from('simulado_grupos').insert({ tenant_id: tenantId, nome: 'Passaporte Vitalício' }).select('id').single()
    return (novo?.id as string) ?? null
  } catch {
    return null
  }
}

/** Propaga o acesso do vitalício aos bancos onde o grupo "Passaporte Vitalício" está vinculado. */
async function propagarVitalicioAosBancos(svc: any, tenantId: string, grupoId: string, estudanteId: string): Promise<void> {
  const { data: links } = await svc.from('simulado_pasta_grupos').select('pasta_id').eq('grupo_id', grupoId)
  const bancoIds = [...new Set((links ?? []).map((l: any) => l.pasta_id).filter(Boolean))] as string[]
  for (const bancoId of bancoIds) {
    const { data: ja } = await svc.from('simulado_pasta_estudantes').select('estudante_id').eq('pasta_id', bancoId).eq('estudante_id', estudanteId).limit(1).maybeSingle()
    if (!ja) await svc.from('simulado_pasta_estudantes').insert({ tenant_id: tenantId, pasta_id: bancoId, estudante_id: estudanteId })
    try { await matricularEmSimuladosDoBanco(svc, tenantId, bancoId, [estudanteId]) } catch { /* best-effort */ }
  }
}

/**
 * Mantém a participação do estudante no grupo "Passaporte Vitalício" conforme a classificação:
 *   - vitalicio → entra no grupo (cria se preciso) E herda os bancos vinculados ao grupo;
 *   - qualquer outra → sai APENAS do grupo Vitalício (NÃO mexe em nenhum outro grupo, ex.: 6em7/turmas).
 * Vitalício é passaporte premium: o acesso de passaporte é preservado à parte — ver sincronizarGrupoPassaporte,
 * cujo `ehPassaporte` também considera 'vitalicio' (o vitalício continua no grupo "Passaporte").
 * Idempotente e tolerante a erro (nunca derruba o fluxo principal de salvar o estudante).
 */
export async function sincronizarGrupoVitalicio(
  svc: any,
  tenantId: string,
  estudanteId: string,
  classificacao: string | null | undefined,
): Promise<void> {
  try {
    const ehVitalicio = (classificacao ?? null) === 'vitalicio'

    let gid: string | null = null
    if (ehVitalicio) {
      gid = await garantirGrupoVitalicio(svc, tenantId)
    } else {
      // Saindo de vitalício: só age se o grupo já existir (não cria só para remover).
      const { data: gv } = await svc
        .from('simulado_grupos')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('deletado', false)
        .eq('is_mestre', false)
        .ilike('nome', 'Passaporte Vitalício')
        .limit(1)
        .maybeSingle()
      gid = (gv?.id as string) ?? null
      if (!gid) return
    }
    if (!gid) return

    const { data: ja } = await svc
      .from('simulado_grupo_membros')
      .select('id')
      .eq('grupo_id', gid)
      .eq('estudante_id', estudanteId)
      .limit(1)
      .maybeSingle()

    if (ehVitalicio && !ja) {
      await svc.from('simulado_grupo_membros').insert({ tenant_id: tenantId, grupo_id: gid, estudante_id: estudanteId })
      await propagarVitalicioAosBancos(svc, tenantId, gid, estudanteId)
    } else if (ehVitalicio && ja) {
      await propagarVitalicioAosBancos(svc, tenantId, gid, estudanteId)
    } else if (!ehVitalicio && ja) {
      await svc.from('simulado_grupo_membros').delete().eq('grupo_id', gid).eq('estudante_id', estudanteId)
    }
  } catch {
    /* organização de grupo não deve bloquear o salvamento do estudante */
  }
}
