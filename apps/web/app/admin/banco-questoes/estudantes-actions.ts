'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient, createServiceClient } from '@/lib/supabase/server'
import { fetchAll, fetchAllByIn } from '@/lib/supabase/fetch-all'
import { getCurrentAccess, checkPermission } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { matricularEmSimuladosDoBanco } from '@/lib/simulado/matricular-banco'

async function guard() {
  if (!(await checkPermission('questoes:view'))) return { ok: false as const, error: 'Sem permissão.' }
  const access = await getCurrentAccess()
  if (!access.tenantId) return { ok: false as const, error: 'Tenant não resolvido.' }
  return { ok: true as const, tenantId: access.tenantId }
}

/** Vincula estudantes já existentes ao banco (ignora os que já estão). */
export async function vincularEstudantes(bancoId: string, estudanteIds: string[]): Promise<{ ok: boolean; vinculados?: number; error?: string }> {
  const g = await guard()
  if (!g.ok) return g
  if (!estudanteIds.length) return { ok: false, error: 'Selecione ao menos um aluno.' }

  const svc = createAdminClient()
  const { data: ja } = await svc.from('simulado_pasta_estudantes').select('estudante_id').eq('pasta_id', bancoId).in('estudante_id', estudanteIds)
  const existentes = new Set((ja ?? []).map((r: any) => r.estudante_id))
  const novos = estudanteIds.filter((e) => !existentes.has(e))
  if (!novos.length) return { ok: true, vinculados: 0 }

  const { error } = await svc.from('simulado_pasta_estudantes').insert(
    novos.map((estudante_id) => ({ tenant_id: g.tenantId, pasta_id: bancoId, estudante_id })),
  )
  if (error) return { ok: false, error: error.message }

  // Matricula os novos alunos nos simulados que já herdam deste banco.
  try { await matricularEmSimuladosDoBanco(svc, g.tenantId, bancoId, novos) } catch {}

  await registrarAudit({ operacao: 'INSERT', entidade: 'simulado_pasta_estudantes', entidadeId: bancoId, depois: { vinculados: novos.length } })
  revalidatePath(`/admin/banco-questoes/${bancoId}`)
  return { ok: true, vinculados: novos.length }
}

/**
 * Vincula um grupo ao banco: registra o vínculo (para auto-sync futuro) e liga
 * todos os membros atuais do grupo ao banco (ignora os já vinculados).
 */
export async function vincularGrupoAoBanco(bancoId: string, grupoId: string): Promise<{ ok: boolean; vinculados?: number; error?: string }> {
  const g = await guard()
  if (!g.ok) return g
  const svc = createAdminClient()

  // Registra o vínculo banco↔grupo (idempotente). Tolerante se a tabela não existir.
  const { error: linkErr } = await svc
    .from('simulado_pasta_grupos')
    .upsert({ tenant_id: g.tenantId, pasta_id: bancoId, grupo_id: grupoId }, { onConflict: 'pasta_id,grupo_id' })
  if (linkErr) {
    if (/pasta_grupos|relation|does not exist/i.test(linkErr.message)) return { ok: false, error: 'Rode a migration simulado_pasta_grupos no banco.' }
    return { ok: false, error: linkErr.message }
  }

  // Liga os membros atuais do grupo ao banco. PAGINADO: grupo pode ter >1000 membros
  // (senão só os 1000 primeiros eram vinculados ao banco).
  const membros = await fetchAll<{ estudante_id: string }>(() =>
    svc.from('simulado_grupo_membros').select('estudante_id').eq('grupo_id', grupoId).order('estudante_id', { ascending: true }))
  const ids = [...new Set(membros.map((m) => m.estudante_id))]
  let vinculados = 0
  if (ids.length) {
    const ja = await fetchAllByIn<{ estudante_id: string }>(ids, (chunk) =>
      svc.from('simulado_pasta_estudantes').select('estudante_id').eq('pasta_id', bancoId).in('estudante_id', chunk).order('estudante_id', { ascending: true }))
    const jaSet = new Set(ja.map((r) => r.estudante_id))
    const novos = ids.filter((id) => !jaSet.has(id))
    if (novos.length) {
      // Insere em lotes (payload grande com milhares de linhas).
      for (let i = 0; i < novos.length; i += 500) {
        const lote = novos.slice(i, i + 500)
        const { error } = await svc.from('simulado_pasta_estudantes').insert(lote.map((estudante_id) => ({ tenant_id: g.tenantId, pasta_id: bancoId, estudante_id })))
        if (error) return { ok: false, error: error.message }
      }
      vinculados = novos.length
      try { await matricularEmSimuladosDoBanco(svc, g.tenantId, bancoId, novos) } catch {}
    }
  }

  await registrarAudit({ operacao: 'INSERT', entidade: 'simulado_pasta_estudantes', entidadeId: bancoId, depois: { grupo: grupoId, vinculados } })
  revalidatePath(`/admin/banco-questoes/${bancoId}`)
  return { ok: true, vinculados }
}

/** Remove o vínculo do grupo com o banco (os estudantes já ligados permanecem). */
export async function desvincularGrupoDoBanco(bancoId: string, grupoId: string): Promise<{ ok: boolean; error?: string }> {
  const g = await guard()
  if (!g.ok) return g
  const svc = createAdminClient()
  const { error } = await svc.from('simulado_pasta_grupos').delete().eq('pasta_id', bancoId).eq('grupo_id', grupoId).eq('tenant_id', g.tenantId)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/admin/banco-questoes/${bancoId}`)
  return { ok: true }
}

/** Cria um novo estudante (conta + perfil) e já o vincula ao banco. */
export async function importarEstudante(
  bancoId: string,
  dados: { nome: string; email: string; telefone?: string; cpf?: string },
): Promise<{ ok: boolean; error?: string }> {
  const g = await guard()
  if (!g.ok) return g
  const nome = dados.nome?.trim()
  const email = dados.email?.trim().toLowerCase()
  if (!nome || !email) return { ok: false, error: 'Nome e e-mail são obrigatórios.' }

  const supabase = await createServiceClient()

  // Conta global (auth). Se já existe, segue sem recriar.
  const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { full_name: nome },
  })
  const userId = authUser?.user?.id ?? null
  if (authError && !/already.*registered|already.*exists/i.test(authError.message)) {
    return { ok: false, error: authError.message }
  }

  const svc = createAdminClient()

  // Reaproveita o perfil se já existir no tenant (mesmo e-mail); senão cria.
  let estudanteId: string | null = null
  const { data: existente } = await svc.from('simulado_estudantes').select('id').eq('tenant_id', g.tenantId).ilike('email', email).maybeSingle()
  if (existente) {
    estudanteId = existente.id
  } else {
    const { data: novo, error: pErr } = await svc
      .from('simulado_estudantes')
      .insert({ tenant_id: g.tenantId, user_id: userId, nome, email, cpf: dados.cpf?.trim() || null, telefone: dados.telefone?.trim() || null })
      .select('id')
      .single()
    if (pErr) return { ok: false, error: pErr.message }
    estudanteId = novo.id
  }

  // Vincula ao banco (ignora se já vinculado).
  const { data: vinc } = await svc.from('simulado_pasta_estudantes').select('id').eq('pasta_id', bancoId).eq('estudante_id', estudanteId).maybeSingle()
  if (!vinc) {
    const { error } = await svc.from('simulado_pasta_estudantes').insert({ tenant_id: g.tenantId, pasta_id: bancoId, estudante_id: estudanteId })
    if (error) return { ok: false, error: error.message }
  }
  // Matricula nos simulados que já herdam deste banco.
  try { await matricularEmSimuladosDoBanco(svc, g.tenantId, bancoId, [estudanteId!]) } catch {}

  await registrarAudit({ operacao: 'INSERT', entidade: 'simulado_estudantes', entidadeId: estudanteId, depois: { nome, email, banco: bancoId } })
  revalidatePath(`/admin/banco-questoes/${bancoId}`)
  return { ok: true }
}

/**
 * Importa estudantes em lote (de CSV/planilha) e vincula todos ao banco.
 * Cria o perfil (sem conta auth — basta o e-mail para o fluxo de prova) quando
 * o e-mail ainda não existe no tenant; reaproveita o perfil quando já existe.
 */
export async function importarEstudantesLote(
  bancoId: string,
  rows: { email: string; nome?: string; telefone?: string; cpf?: string; classificacao?: string }[],
): Promise<{ ok: boolean; criados?: number; vinculados?: number; error?: string }> {
  const g = await guard()
  if (!g.ok) return g
  const limpos = rows
    .map((r) => ({ ...r, email: r.email?.trim().toLowerCase() }))
    .filter((r) => r.email && /.+@.+\..+/.test(r.email))
  if (!limpos.length) return { ok: false, error: 'Nenhuma linha válida (e-mail obrigatório).' }
  if (limpos.length > 10000) return { ok: false, error: 'Máximo de 10.000 linhas por importação.' }

  const svc = createAdminClient()
  const emails = [...new Set(limpos.map((r) => r.email))]

  // Perfis já existentes no tenant (por e-mail).
  const { data: existentes } = await svc.from('simulado_estudantes').select('id, email').eq('tenant_id', g.tenantId).in('email', emails)
  const idPorEmail = new Map<string, string>((existentes ?? []).map((e: any) => [String(e.email).toLowerCase(), e.id]))

  // Cria os perfis que faltam.
  const novos = limpos.filter((r) => !idPorEmail.has(r.email))
  let criados = 0
  if (novos.length) {
    const { data: inseridos, error } = await svc
      .from('simulado_estudantes')
      .insert(novos.map((r) => ({
        tenant_id: g.tenantId, user_id: null, email: r.email,
        nome: r.nome?.trim() || r.email, telefone: r.telefone?.trim() || null,
        cpf: r.cpf?.trim() || null, classificacao: r.classificacao?.trim() || null,
      })))
      .select('id, email')
    if (error) return { ok: false, error: error.message }
    for (const e of inseridos ?? []) idPorEmail.set(String(e.email).toLowerCase(), e.id)
    criados = (inseridos ?? []).length
  }

  // Vincula todos ao banco (ignora os já vinculados).
  const estIds = [...new Set(emails.map((e) => idPorEmail.get(e)).filter(Boolean) as string[])]
  const { data: jaVinc } = await svc.from('simulado_pasta_estudantes').select('estudante_id').eq('pasta_id', bancoId).in('estudante_id', estIds)
  const vincSet = new Set((jaVinc ?? []).map((v: any) => v.estudante_id))
  const aVincular = estIds.filter((id) => !vincSet.has(id))
  if (aVincular.length) {
    const { error } = await svc.from('simulado_pasta_estudantes').insert(aVincular.map((estudante_id) => ({ tenant_id: g.tenantId, pasta_id: bancoId, estudante_id })))
    if (error) return { ok: false, error: error.message }
    // Matricula os recém-vinculados nos simulados que já herdam deste banco.
    try { await matricularEmSimuladosDoBanco(svc, g.tenantId, bancoId, aVincular) } catch {}
  }

  await registrarAudit({ operacao: 'INSERT', entidade: 'simulado_estudantes', entidadeId: bancoId, depois: { importados: limpos.length, criados, vinculados: aVincular.length } })
  revalidatePath(`/admin/banco-questoes/${bancoId}`)
  return { ok: true, criados, vinculados: aVincular.length }
}

/** Remove o vínculo do aluno com o banco (não apaga o aluno). */
export async function desvincularEstudante(bancoId: string, estudanteId: string): Promise<{ ok: boolean; error?: string }> {
  const g = await guard()
  if (!g.ok) return g
  const svc = createAdminClient()
  const { error } = await svc.from('simulado_pasta_estudantes').delete().eq('pasta_id', bancoId).eq('estudante_id', estudanteId).eq('tenant_id', g.tenantId)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/admin/banco-questoes/${bancoId}`)
  return { ok: true }
}

/** Associa (ou remove) um caderno-designer como moldura do banco. */
export async function associarCaderno(bancoId: string, cadernoId: string | null): Promise<{ ok: boolean; error?: string }> {
  const g = await guard()
  if (!g.ok) return g
  const svc = createAdminClient()
  const { error } = await svc.from('simulado_pastas').update({ caderno_id: cadernoId }).eq('id', bancoId).eq('tenant_id', g.tenantId)
  if (error) return { ok: false, error: error.message }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_pastas', entidadeId: bancoId, depois: { caderno_id: cadernoId } })
  revalidatePath(`/admin/banco-questoes/${bancoId}`)
  return { ok: true }
}
