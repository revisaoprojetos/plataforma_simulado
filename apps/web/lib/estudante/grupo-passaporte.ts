import { matricularEmSimuladosDoBanco } from '@/lib/simulado/matricular-banco'

/** Acha (ou cria) o grupo "Passaporte" comum (não-mestre) do tenant. Retorna o id ou null. */
export async function garantirGrupoPassaporte(svc: any, tenantId: string): Promise<string | null> {
  try {
    const { data: gp } = await svc
      .from('simulado_grupos')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('deletado', false)
      .eq('is_mestre', false)
      .ilike('nome', 'passaporte')
      .limit(1)
      .maybeSingle()
    if (gp?.id) return gp.id as string
    const { data: novo } = await svc.from('simulado_grupos').insert({ tenant_id: tenantId, nome: 'Passaporte' }).select('id').single()
    return (novo?.id as string) ?? null
  } catch {
    return null
  }
}

/**
 * Propaga o acesso do passaporte para os bancos onde o grupo "Passaporte" está vinculado:
 * entra na pasta e é matriculado nos simulados que herdam do banco. É assim que um passaporte
 * ADICIONADO DEPOIS da criação/vínculo do banco também recebe o acesso (via grupo, sem bypass).
 */
async function propagarPassaporteAosBancos(svc: any, tenantId: string, grupoId: string, estudanteId: string): Promise<void> {
  const { data: links } = await svc.from('simulado_pasta_grupos').select('pasta_id').eq('grupo_id', grupoId)
  const bancoIds = [...new Set((links ?? []).map((l: any) => l.pasta_id).filter(Boolean))] as string[]
  for (const bancoId of bancoIds) {
    const { data: ja } = await svc.from('simulado_pasta_estudantes').select('estudante_id').eq('pasta_id', bancoId).eq('estudante_id', estudanteId).limit(1).maybeSingle()
    if (!ja) await svc.from('simulado_pasta_estudantes').insert({ tenant_id: tenantId, pasta_id: bancoId, estudante_id: estudanteId })
    try { await matricularEmSimuladosDoBanco(svc, tenantId, bancoId, [estudanteId]) } catch { /* best-effort */ }
  }
}

/**
 * Reconhecimento de mudança de categoria → grupo "Passaporte".
 * Mantém a participação do estudante no grupo conforme a classificação:
 *   - passaporte  → entra no grupo (cria se preciso) E ganha acesso aos bancos vinculados ao grupo;
 *   - qualquer outra → sai do grupo.
 * O acesso do passaporte a simulados passa a ser SEMPRE via grupo+banco (sem bypass global).
 * Idempotente e tolerante a erro (nunca derruba o fluxo principal de salvar o estudante).
 */
export async function sincronizarGrupoPassaporte(
  svc: any,
  tenantId: string,
  estudanteId: string,
  classificacao: string | null | undefined,
): Promise<void> {
  try {
    const ehPassaporte = (classificacao ?? null) === 'passaporte'

    let gid: string | null = null
    if (ehPassaporte) {
      gid = await garantirGrupoPassaporte(svc, tenantId)
    } else {
      // Saindo de passaporte: só age se o grupo já existir (não cria só para remover).
      const { data: gp } = await svc
        .from('simulado_grupos')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('deletado', false)
        .eq('is_mestre', false)
        .ilike('nome', 'passaporte')
        .limit(1)
        .maybeSingle()
      gid = (gp?.id as string) ?? null
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

    if (ehPassaporte && !ja) {
      await svc.from('simulado_grupo_membros').insert({ tenant_id: tenantId, grupo_id: gid, estudante_id: estudanteId })
      await propagarPassaporteAosBancos(svc, tenantId, gid, estudanteId)
    } else if (ehPassaporte && ja) {
      // Já é membro, mas garante o acesso aos bancos (ex.: banco vinculado depois).
      await propagarPassaporteAosBancos(svc, tenantId, gid, estudanteId)
    } else if (!ehPassaporte && ja) {
      await svc.from('simulado_grupo_membros').delete().eq('grupo_id', gid).eq('estudante_id', estudanteId)
    }
  } catch {
    /* organização de grupo não deve bloquear o salvamento do estudante */
  }
}
