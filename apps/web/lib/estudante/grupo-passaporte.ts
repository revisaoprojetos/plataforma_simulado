/**
 * Reconhecimento de mudança de categoria → grupo "Passaporte".
 * Mantém a participação do estudante no grupo conforme a classificação:
 *   - passaporte  → entra no grupo (cria o grupo se não existir);
 *   - qualquer outra → sai do grupo.
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

    // Grupo "Passaporte" comum (não-mestre). Cria só se for necessário (ao entrar).
    const { data: gp } = await svc
      .from('simulado_grupos')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('deletado', false)
      .eq('is_mestre', false)
      .ilike('nome', 'passaporte')
      .limit(1)
      .maybeSingle()
    let gid: string | undefined = gp?.id
    if (!gid) {
      if (!ehPassaporte) return // não cria o grupo só para tentar remover
      const { data: novo } = await svc.from('simulado_grupos').insert({ tenant_id: tenantId, nome: 'Passaporte' }).select('id').single()
      gid = novo?.id
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
    } else if (!ehPassaporte && ja) {
      await svc.from('simulado_grupo_membros').delete().eq('grupo_id', gid).eq('estudante_id', estudanteId)
    }
  } catch {
    /* organização de grupo não deve bloquear o salvamento do estudante */
  }
}
