'use server'

import { createHash } from 'crypto'
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

/**
 * Conta estudantes ÚNICOS (distintos por estudante_id) somando os grupos informados.
 * Usado no preview de "vincular grupo": somar `membros` de cada grupo conta o mesmo
 * aluno várias vezes (quem está em N grupos entra N vezes) — aqui deduplicamos.
 */
export async function contarEstudantesUnicosGrupos(grupoIds: string[]): Promise<{ ok: boolean; distintos?: number; error?: string }> {
  const g = await guard()
  if (!g.ok) return g
  const ids = [...new Set((grupoIds ?? []).filter(Boolean))]
  if (!ids.length) return { ok: true, distintos: 0 }
  const svc = createAdminClient()
  const rows = await fetchAllByIn<{ estudante_id: string }>(ids, (chunk) =>
    svc.from('simulado_grupo_membros').select('estudante_id').eq('tenant_id', g.tenantId).in('grupo_id', chunk).order('estudante_id'))
  return { ok: true, distintos: new Set(rows.map((r) => r.estudante_id).filter(Boolean)).size }
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

/**
 * Estudantes que SAIRIAM do banco ao desvincular `grupoId`: estão SÓ nesse grupo (não em
 * outro grupo ainda vinculado ao banco) E NÃO iniciaram nenhum simulado que herda o banco.
 * Quem está em outro grupo vinculado ou já iniciou permanece.
 */
async function orfaosRemoviveis(svc: any, tenantId: string, bancoId: string, grupoId: string): Promise<string[]> {
  const membros = new Set<string>(
    (await fetchAll<any>(() => svc.from('simulado_grupo_membros').select('estudante_id').eq('tenant_id', tenantId).eq('grupo_id', grupoId).order('estudante_id')))
      .map((m: any) => m.estudante_id).filter(Boolean))
  if (!membros.size) return []

  // Outros grupos AINDA vinculados ao banco (exceto o que está saindo) → quem estiver neles permanece.
  const outros = (await fetchAll<any>(() => svc.from('simulado_pasta_grupos').select('grupo_id').eq('pasta_id', bancoId).eq('tenant_id', tenantId)))
    .map((l: any) => l.grupo_id).filter((id: string) => id && id !== grupoId)
  const mantidos = new Set<string>()
  if (outros.length) {
    const rows = await fetchAllByIn<any>(outros, (chunk) => svc.from('simulado_grupo_membros').select('estudante_id').in('grupo_id', chunk).order('estudante_id'))
    for (const r of rows) if (membros.has(r.estudante_id)) mantidos.add(r.estudante_id)
  }

  const pe = new Set<string>(
    (await fetchAll<any>(() => svc.from('simulado_pasta_estudantes').select('estudante_id').eq('pasta_id', bancoId).eq('tenant_id', tenantId).order('estudante_id')))
      .map((x: any) => x.estudante_id))
  const cand = [...membros].filter((e) => !mantidos.has(e) && pe.has(e))
  if (!cand.length) return []

  // Exclui quem JÁ INICIOU algum simulado que herda o banco (não remover quem está fazendo/fez).
  const sims = ((await svc.from('simulado_simulados').select('id').eq('tenant_id', tenantId).filter('regras->>banco_base_id', 'eq', bancoId)).data ?? []).map((s: any) => s.id)
  const started = new Set<string>()
  for (const sid of sims) {
    const ss = await fetchAllByIn<any>(cand, (chunk) => svc.from('simulado_sessoes_prova').select('estudante_id').eq('simulado_id', sid).eq('deletado', false).in('estudante_id', chunk))
    for (const x of ss) started.add(x.estudante_id)
  }
  return cand.filter((e) => !started.has(e))
}

/** Preview: quantos alunos seriam removidos ao desvincular o grupo (para a confirmação). */
export async function contarOrfaosDesvincular(bancoId: string, grupoId: string): Promise<{ ok: boolean; orfaos?: number; error?: string }> {
  const g = await guard()
  if (!g.ok) return g
  const svc = createAdminClient()
  const orf = await orfaosRemoviveis(svc, g.tenantId, bancoId, grupoId)
  return { ok: true, orfaos: orf.length }
}

/**
 * Remove o vínculo do grupo com o banco E, em cascata, tira do banco/matrículas os alunos
 * que ficaram SÓ nesse grupo e não iniciaram (quem está em outro grupo vinculado ou já
 * iniciou permanece).
 */
export async function desvincularGrupoDoBanco(bancoId: string, grupoId: string): Promise<{ ok: boolean; removidos?: number; error?: string }> {
  const g = await guard()
  if (!g.ok) return g
  const svc = createAdminClient()

  // Calcula os órfãos ANTES de remover o vínculo (a função já ignora o próprio grupo).
  const orfaos = await orfaosRemoviveis(svc, g.tenantId, bancoId, grupoId)

  const { error } = await svc.from('simulado_pasta_grupos').delete().eq('pasta_id', bancoId).eq('grupo_id', grupoId).eq('tenant_id', g.tenantId)
  if (error) return { ok: false, error: error.message }

  let removidos = 0
  if (orfaos.length) {
    const sims = ((await svc.from('simulado_simulados').select('id').eq('tenant_id', g.tenantId).filter('regras->>banco_base_id', 'eq', bancoId)).data ?? []).map((s: any) => s.id)
    for (let i = 0; i < orfaos.length; i += 80) {
      const c = orfaos.slice(i, i + 80)
      await svc.from('simulado_pasta_estudantes').delete().eq('pasta_id', bancoId).in('estudante_id', c)
      for (const sid of sims) await svc.from('simulado_matriculas').delete().eq('simulado_id', sid).in('estudante_id', c)
    }
    removidos = orfaos.length
  }

  await registrarAudit({ operacao: 'DELETE', entidade: 'simulado_pasta_grupos', entidadeId: grupoId, depois: { banco: bancoId, orfaos_removidos: removidos } })
  revalidatePath(`/admin/banco-questoes/${bancoId}`)
  return { ok: true, removidos }
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

// ── Material para download do aluno (Enunciados do sistema × PDF importado) ────────
// Guardado em `simulado_cadernos_designer.config.material`. Requer um caderno associado.

/** Lê o config atual do caderno (para mesclar `material` sem sobrescrever o resto). */
async function lerConfigCaderno(svc: ReturnType<typeof createAdminClient>, cadernoId: string, tenantId: string) {
  const { data } = await svc.from('simulado_cadernos_designer').select('config').eq('id', cadernoId).eq('tenant_id', tenantId).maybeSingle()
  return { config: (((data as any)?.config ?? {}) as Record<string, unknown>), existe: !!data }
}

/** Sobe o PDF pronto do "caderno completo" (empresa) e passa a mostrá-lo ao aluno. */
export async function subirMaterialPdf(cadernoId: string, bancoId: string, dataUrl: string, nomeArquivo: string): Promise<{ ok: boolean; url?: string; nome?: string; error?: string }> {
  const g = await guard()
  if (!g.ok) return g
  const base64 = dataUrl.includes(',') ? dataUrl.slice(dataUrl.indexOf(',') + 1) : dataUrl
  let buf: Buffer
  try { buf = Buffer.from(base64, 'base64') } catch { return { ok: false, error: 'Arquivo inválido.' } }
  if (!buf.length) return { ok: false, error: 'Arquivo vazio.' }
  // Limite abaixo do bodySizeLimit (12 MB) considerando o inchaço do base64 (~33%).
  if (buf.length > 8 * 1024 * 1024) return { ok: false, error: 'PDF muito grande (máx. ~8 MB).' }
  // Validação server-side por magic bytes (padrão S3): PDF começa com "%PDF".
  if (buf.subarray(0, 4).toString('latin1') !== '%PDF') return { ok: false, error: 'O arquivo não é um PDF válido.' }

  const svc = createAdminClient()
  const { config, existe } = await lerConfigCaderno(svc, cadernoId, g.tenantId)
  if (!existe) return { ok: false, error: 'Caderno não encontrado.' }

  // Nome do arquivo com hash do conteúdo → cada versão é uma URL nova (evita cache velho).
  const hash = createHash('sha1').update(buf).digest('hex').slice(0, 10)
  const path = `materiais/${g.tenantId}/${cadernoId}-${hash}.pdf`
  // Garante o bucket 'pdfs' (público) — em projetos novos ele pode não existir ("Bucket not found").
  try { await svc.storage.createBucket('pdfs', { public: true }) } catch { /* já existe */ }
  let { error: upErr } = await svc.storage.from('pdfs').upload(path, buf, { contentType: 'application/pdf', upsert: true })
  if (upErr && /bucket.*not.*found/i.test(upErr.message)) {
    await svc.storage.createBucket('pdfs', { public: true }).catch(() => {})
    ;({ error: upErr } = await svc.storage.from('pdfs').upload(path, buf, { contentType: 'application/pdf', upsert: true }))
  }
  if (upErr) return { ok: false, error: upErr.message }
  const url = svc.storage.from('pdfs').getPublicUrl(path).data.publicUrl as string

  const nome = (nomeArquivo || 'Material completo').replace(/\.pdf$/i, '').trim() || 'Material completo'
  const material = { fonte: 'pdf', pdfUrl: url, pdfNome: nome }
  const { error } = await svc.from('simulado_cadernos_designer').update({ config: { ...config, material } }).eq('id', cadernoId).eq('tenant_id', g.tenantId)
  if (error) return { ok: false, error: error.message }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_cadernos_designer', entidadeId: cadernoId, depois: { material_pdf: nome } })
  revalidatePath(`/admin/banco-questoes/${bancoId}`)
  return { ok: true, url, nome }
}

/** Remove o PDF importado e volta a mostrar o caderno gerado pelo sistema. */
export async function removerMaterialPdf(cadernoId: string, bancoId: string): Promise<{ ok: boolean; error?: string }> {
  const g = await guard()
  if (!g.ok) return g
  const svc = createAdminClient()
  const { config, existe } = await lerConfigCaderno(svc, cadernoId, g.tenantId)
  if (!existe) return { ok: false, error: 'Caderno não encontrado.' }
  const material = { fonte: 'sistema', pdfUrl: '', pdfNome: '' }
  const { error } = await svc.from('simulado_cadernos_designer').update({ config: { ...config, material } }).eq('id', cadernoId).eq('tenant_id', g.tenantId)
  if (error) return { ok: false, error: error.message }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_cadernos_designer', entidadeId: cadernoId, depois: { material_pdf: null } })
  revalidatePath(`/admin/banco-questoes/${bancoId}`)
  return { ok: true }
}
