'use server'

import { createHash } from 'crypto'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { checkPermission } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import type { SupabaseClient } from '@supabase/supabase-js'

interface AlternativaData {
  texto: string
  correta: boolean
  ordem: number
}

interface QuestaoData {
  tipo: string
  enunciado: string
  banca?: string
  orgao?: string
  ano?: number
  disciplina?: string
  assunto?: string
  nivel_dificuldade?: string
  gabarito_tipo?: string
  comentario_professor?: string
  status: string
  /** URL da imagem da questão (opcional) — exibida entre o enunciado e as alternativas. */
  imagem_url?: string | null
  alternativas?: AlternativaData[]
  competencias?: { nome: string; pontos: number; ordem: number }[]
  /** Bancos (pastas) de destino — a questão é vinculada a estes ao salvar. */
  bancoIds?: string[]
}

/**
 * Sincroniza os vínculos da questão com os bancos selecionados (N:N via
 * simulado_questao_pasta). Usa service role pois a tabela tem RLS sem policy
 * de INSERT/DELETE para authenticated. `sync=false` apenas adiciona (create).
 */
async function vincularBancos(tenantId: string, questaoId: string, bancoIds: string[] | undefined, sync: boolean) {
  if (!bancoIds) return // undefined = não mexe nos vínculos (ex.: edição sem o campo)
  const admin = createAdminClient()
  if (sync) await admin.from('simulado_questao_pasta').delete().eq('questao_id', questaoId).eq('tenant_id', tenantId)
  const ids = [...new Set(bancoIds.filter(Boolean))]
  if (ids.length) {
    await admin.from('simulado_questao_pasta').insert(
      ids.map((pasta_id) => ({ tenant_id: tenantId, questao_id: questaoId, pasta_id })),
    )
  }
}

/**
 * Resolve uma entrada de taxonomia por NOME, criando-a se ainda não existir.
 * A taxonomia nasce conforme o conteúdo é cadastrado — sem base pré-pronta.
 * Tolerante a corrida: se o insert colidir no unique, relê o registro existente.
 */
async function resolveByName(
  supabase: SupabaseClient,
  table: 'simulado_bancas' | 'simulado_orgaos' | 'simulado_disciplinas',
  tenantId: string,
  nome?: string,
): Promise<string | null> {
  const n = nome?.trim()
  if (!n) return null

  const { data: existing } = await supabase
    .from(table)
    .select('id')
    .eq('tenant_id', tenantId)
    .ilike('nome', n)
    .maybeSingle()
  if (existing) return existing.id

  const { data: created, error } = await supabase
    .from(table)
    .insert({ nome: n, tenant_id: tenantId })
    .select('id')
    .single()

  if (error) {
    // Provável corrida no índice unique: relê o existente.
    const { data: again } = await supabase
      .from(table)
      .select('id')
      .eq('tenant_id', tenantId)
      .ilike('nome', n)
      .maybeSingle()
    return again?.id ?? null
  }
  return created.id
}

/** Resolve assunto por nome dentro de uma disciplina (cria se necessário). */
async function resolveAssunto(
  supabase: SupabaseClient,
  tenantId: string,
  nome?: string,
  disciplinaId?: string | null,
): Promise<string | null> {
  const n = nome?.trim()
  if (!n) return null

  let q = supabase.from('simulado_assuntos').select('id').eq('tenant_id', tenantId).ilike('nome', n)
  q = disciplinaId ? q.eq('disciplina_id', disciplinaId) : q.is('disciplina_id', null)
  const { data: existing } = await q.maybeSingle()
  if (existing) return existing.id

  const { data: created, error } = await supabase
    .from('simulado_assuntos')
    .insert({ nome: n, disciplina_id: disciplinaId ?? null, tenant_id: tenantId })
    .select('id')
    .single()
  if (error) return null
  return created.id
}

async function buildQuestaoFields(supabase: SupabaseClient, tenantId: string, data: QuestaoData) {
  const banca_id = await resolveByName(supabase, 'simulado_bancas', tenantId, data.banca)
  const orgao_id = await resolveByName(supabase, 'simulado_orgaos', tenantId, data.orgao)
  const disciplina_id = await resolveByName(supabase, 'simulado_disciplinas', tenantId, data.disciplina)
  const assunto_id = await resolveAssunto(supabase, tenantId, data.assunto, disciplina_id)

  return {
    tenant_id: tenantId,
    tipo: data.tipo,
    enunciado: data.enunciado,
    banca_id,
    orgao_id,
    ano: data.ano || null,
    disciplina_id,
    assunto_id,
    nivel_dificuldade: data.nivel_dificuldade || null,
    gabarito_tipo: data.gabarito_tipo || 'oficial',
    comentario_professor: data.comentario_professor || null,
    status: data.status,
    imagem_url: data.imagem_url || null,
  }
}

/**
 * Sobe uma imagem (data URI base64) da questão para o storage e devolve a URL pública.
 * Dedupe por hash do conteúdo (não reenvia a mesma imagem). Reusa o bucket público `pdfs`.
 */
export async function hospedarImagemQuestaoAction(dataUri: string): Promise<{ ok: boolean; url?: string; error?: string }> {
  if (!(await checkPermission('questoes:create')) && !(await checkPermission('questoes:update'))) {
    return { ok: false, error: 'Sem permissão.' }
  }
  const m = /^data:image\/([a-z0-9.+-]+);base64,(.+)$/i.exec(dataUri || '')
  if (!m) return { ok: false, error: 'Imagem inválida.' }
  const tipo = m[1].toLowerCase()
  const ext = tipo === 'jpeg' ? 'jpg' : tipo
  let buf: Buffer
  try { buf = Buffer.from(m[2], 'base64') } catch { return { ok: false, error: 'Imagem inválida.' } }
  if (!buf.length) return { ok: false, error: 'Imagem vazia.' }
  const svc = createAdminClient()
  const hash = createHash('sha1').update(buf).digest('hex').slice(0, 24)
  const path = `assets/${hash}.${ext}`
  try { await svc.storage.createBucket('pdfs', { public: true }) } catch { /* já existe */ }
  const { error } = await svc.storage.from('pdfs').upload(path, buf, { contentType: `image/${tipo}`, upsert: true })
  if (error && !/exists/i.test(error.message)) return { ok: false, error: error.message }
  const url = svc.storage.from('pdfs').getPublicUrl(path).data.publicUrl as string
  return { ok: true, url }
}

export async function createQuestaoAction(data: QuestaoData) {
  if (!(await checkPermission('questoes:create'))) return { error: 'Você não tem permissão para criar questões.' }
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return { error: 'Tenant não resolvido. Verifique o acesso.' }

  const supabase = await createClient()
  const fields = await buildQuestaoFields(supabase, tenantId, data)

  let { data: questao, error } = await supabase
    .from('simulado_questoes')
    .insert(fields)
    .select()
    .single()

  // Tolerante: se a coluna imagem_url ainda não foi migrada no banco, reinsere sem ela.
  if (error && /imagem_url|column/i.test(error.message) && 'imagem_url' in fields) {
    const { imagem_url: _img, ...semImg } = fields
    ;({ data: questao, error } = await supabase.from('simulado_questoes').insert(semImg).select().single())
  }

  if (error) {
    return { error: error.message }
  }

  if (data.tipo === 'objetiva' && data.alternativas?.length) {
    const { error: altError } = await supabase.from('simulado_alternativas').insert(
      data.alternativas.map((alt) => ({
        tenant_id: tenantId,
        questao_id: questao.id,
        texto: alt.texto,
        correta: alt.correta,
        ordem: alt.ordem,
      }))
    )
    if (altError) {
      return { error: altError.message }
    }
  }

  if (data.tipo === 'discursiva' && data.competencias?.length) {
    const comps = data.competencias.filter((c) => c.nome?.trim())
    if (comps.length) {
      // simulado_competencias tem RLS sem policy de INSERT p/ authenticated → service role.
      await createAdminClient().from('simulado_competencias').insert(
        comps.map((c, i) => ({ tenant_id: tenantId, questao_id: questao.id, nome: c.nome.trim(), pontos: c.pontos ?? 1, ordem: c.ordem ?? i })),
      )
    }
  }

  // Armazena a questão diretamente nos bancos de destino escolhidos.
  await vincularBancos(tenantId, questao.id, data.bancoIds, false)

  await registrarAudit({ operacao: 'INSERT', entidade: 'simulado_questoes', entidadeId: questao.id, depois: questao })

  revalidatePath('/admin/questoes')
  revalidatePath('/admin/banco-questoes')
  redirect('/admin/questoes')
}

export async function updateQuestaoAction(id: string, data: QuestaoData) {
  if (!(await checkPermission('questoes:update'))) return { error: 'Você não tem permissão para editar questões.' }
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return { error: 'Tenant não resolvido. Verifique o acesso.' }

  const supabase = await createClient()
  const fields = await buildQuestaoFields(supabase, tenantId, data)

  // Posse: com createClient (RLS), a questão só é visível se for do tenant. Se não achar, bloqueia
  // (impede que um id estrangeiro caia nas exclusões de alternativas/competências abaixo).
  const { data: antes } = await supabase.from('simulado_questoes').select('*').eq('id', id).maybeSingle()
  if (!antes) return { error: 'Questão não encontrada.' }

  let { error } = await supabase
    .from('simulado_questoes')
    .update(fields)
    .eq('id', id)

  // Tolerante: coluna imagem_url ainda não migrada → atualiza sem ela.
  if (error && /imagem_url|column/i.test(error.message) && 'imagem_url' in fields) {
    const { imagem_url: _img, ...semImg } = fields
    ;({ error } = await supabase.from('simulado_questoes').update(semImg).eq('id', id))
  }

  if (error) {
    return { error: error.message }
  }

  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_questoes', entidadeId: id, antes, depois: { ...antes, ...fields } })

  if (data.tipo === 'objetiva' && data.alternativas) {
    await supabase.from('simulado_alternativas').delete().eq('questao_id', id)
    await supabase.from('simulado_alternativas').insert(
      data.alternativas.map((alt) => ({
        tenant_id: tenantId,
        questao_id: id,
        texto: alt.texto,
        correta: alt.correta,
        ordem: alt.ordem,
      }))
    )
  }

  if (data.tipo === 'discursiva' && data.competencias) {
    const admin = createAdminClient()
    await admin.from('simulado_competencias').delete().eq('questao_id', id).eq('tenant_id', tenantId)
    const comps = data.competencias.filter((c) => c.nome?.trim())
    if (comps.length) {
      await admin.from('simulado_competencias').insert(
        comps.map((c, i) => ({ tenant_id: tenantId, questao_id: id, nome: c.nome.trim(), pontos: c.pontos ?? 1, ordem: c.ordem ?? i })),
      )
    }
  }

  // Sincroniza os bancos de destino (substitui os vínculos pelos selecionados).
  await vincularBancos(tenantId, id, data.bancoIds, true)

  revalidatePath('/admin/questoes')
  revalidatePath(`/admin/questoes/${id}/editar`)
  revalidatePath('/admin/banco-questoes')
  redirect('/admin/questoes')
}
