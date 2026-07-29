import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Motor de CÓPIA cross-tenant (Fase 3). Duplica conteúdo de uma plataforma (origem) para
 * outra (destino), remapeando taxonomia por NOME e registrando PROCEDÊNCIA
 * (simulado_compartilhamentos) — idempotente: re-executar não duplica (dedup por origem_id).
 *
 * SEMPRE recebe origem/destino explícitos e filtra por tenant_id em toda query. Use com
 * createAdminClient (service role) a partir de uma ação de SUPER-ADMIN global.
 */

const nowIso = () => new Date().toISOString()

// ─── Procedência (dedup) ────────────────────────────────────────────────────
async function jaCopiado(svc: SupabaseClient, destino: string, tipo: string, origemId: string): Promise<string | null> {
  const { data } = await svc
    .from('simulado_compartilhamentos')
    .select('destino_id')
    .eq('destino_tenant_id', destino)
    .eq('tipo', tipo)
    .eq('origem_id', origemId)
    .maybeSingle()
  return (data as any)?.destino_id ?? null
}

async function registrar(svc: SupabaseClient, origem: string, destino: string, tipo: string, origemId: string, destinoId: string, por?: string | null) {
  await svc.from('simulado_compartilhamentos').upsert(
    { origem_tenant_id: origem, destino_tenant_id: destino, tipo, origem_id: origemId, destino_id: destinoId, executado_por: por ?? null, criado_em: nowIso() },
    { onConflict: 'destino_tenant_id,tipo,origem_id' },
  )
}

// ─── Taxonomia (resolve por nome no DESTINO, cria se faltar) ─────────────────
async function resolveByName(svc: SupabaseClient, table: 'simulado_bancas' | 'simulado_orgaos' | 'simulado_disciplinas', tenantId: string, nome?: string | null): Promise<string | null> {
  const n = nome?.trim()
  if (!n) return null
  const { data: ex } = await svc.from(table).select('id').eq('tenant_id', tenantId).ilike('nome', n).maybeSingle()
  if (ex) return (ex as any).id
  const { data: cr, error } = await svc.from(table).insert({ nome: n, tenant_id: tenantId }).select('id').single()
  if (error) { const { data: again } = await svc.from(table).select('id').eq('tenant_id', tenantId).ilike('nome', n).maybeSingle(); return (again as any)?.id ?? null }
  return (cr as any).id
}

async function resolveAssunto(svc: SupabaseClient, tenantId: string, nome?: string | null, disciplinaId?: string | null): Promise<string | null> {
  const n = nome?.trim()
  if (!n) return null
  let q = svc.from('simulado_assuntos').select('id').eq('tenant_id', tenantId).ilike('nome', n)
  q = disciplinaId ? q.eq('disciplina_id', disciplinaId) : q.is('disciplina_id', null)
  const { data: ex } = await q.maybeSingle()
  if (ex) return (ex as any).id
  const { data: cr, error } = await svc.from('simulado_assuntos').insert({ nome: n, disciplina_id: disciplinaId ?? null, tenant_id: tenantId }).select('id').single()
  if (error) return null
  return (cr as any).id
}

// ─── Questão (com taxonomia + alternativas) ─────────────────────────────────
export async function copiarQuestao(svc: SupabaseClient, origem: string, destino: string, questaoId: string, por?: string | null): Promise<string | null> {
  if (origem === destino) return null
  // Chave ESTÁVEL de dedup NO DESTINO (external_id). Mais robusta que só a procedência:
  // sobrevive a falha parcial (questão criada mas alternativas/procedência não gravaram) e à
  // concorrência (unique(tenant_id,external_id)) — re-executar recupera a cópia em vez de duplicar.
  const externalId = `cp:${origem}:${questaoId}`
  const acharCopia = async (): Promise<string | null> => {
    const { data } = await svc.from('simulado_questoes').select('id').eq('tenant_id', destino).eq('external_id', externalId).maybeSingle()
    return (data as any)?.id ?? (await jaCopiado(svc, destino, 'questao', questaoId))
  }
  let novaId = await acharCopia()

  const { data: q } = await svc
    .from('simulado_questoes')
    .select('*, bancas:simulado_bancas(nome), orgaos:simulado_orgaos(nome), disciplinas:simulado_disciplinas(nome), assuntos:simulado_assuntos(nome)')
    .eq('id', questaoId).eq('tenant_id', origem).eq('deletado', false).maybeSingle()
  if (!q) return novaId // origem sumiu/está na lixeira — devolve a cópia que já houver

  if (!novaId) {
    const banca_id = await resolveByName(svc, 'simulado_bancas', destino, (q as any).bancas?.nome)
    const orgao_id = await resolveByName(svc, 'simulado_orgaos', destino, (q as any).orgaos?.nome)
    const disciplina_id = await resolveByName(svc, 'simulado_disciplinas', destino, (q as any).disciplinas?.nome)
    const assunto_id = await resolveAssunto(svc, destino, (q as any).assuntos?.nome, disciplina_id)
    const { data: nova, error } = await svc.from('simulado_questoes').insert({
      tenant_id: destino,
      tipo: (q as any).tipo, enunciado: (q as any).enunciado,
      banca_id, orgao_id, disciplina_id, assunto_id,
      ano: (q as any).ano ?? null, nivel_dificuldade: (q as any).nivel_dificuldade ?? null,
      gabarito_tipo: (q as any).gabarito_tipo ?? 'oficial', comentario_professor: (q as any).comentario_professor ?? null,
      status: (q as any).status ?? 'publicada', imagem_url: (q as any).imagem_url ?? null,
      external_id: externalId, created_at: nowIso(),
    }).select('id').single()
    if (error || !nova) { novaId = await acharCopia(); if (!novaId) return null } // corrida no unique → relê
    else novaId = (nova as any).id
  }
  if (!novaId) return null

  // Alternativas: só insere se FALTAREM (self-heal p/ falha parcial anterior). Erro → não registra
  // procedência: a próxima execução acha a questão (external_id), vê count=0 e completa.
  const { count } = await svc.from('simulado_alternativas').select('*', { count: 'exact', head: true }).eq('questao_id', novaId).eq('tenant_id', destino)
  if (!count) {
    const { data: alts } = await svc.from('simulado_alternativas').select('texto, ordem, correta, comentario, lei').eq('questao_id', questaoId).eq('tenant_id', origem).order('ordem')
    if (alts && alts.length) {
      const { error: eAlt } = await svc.from('simulado_alternativas').insert((alts as any[]).map((a) => ({
        tenant_id: destino, questao_id: novaId,
        texto: a.texto, ordem: a.ordem, correta: a.correta, comentario: a.comentario ?? null, lei: a.lei ?? null,
      })))
      if (eAlt) return novaId
    }
  }

  await registrar(svc, origem, destino, 'questao', questaoId, novaId, por)
  return novaId
}

// ─── Banco (pasta) com as questões dele ─────────────────────────────────────
export async function copiarBanco(svc: SupabaseClient, origem: string, destino: string, pastaId: string, por?: string | null): Promise<{ destinoId: string | null; questoes: number }> {
  if (origem === destino) return { destinoId: null, questoes: 0 }
  const existente = await jaCopiado(svc, destino, 'banco', pastaId)
  const { data: p } = await svc.from('simulado_pastas').select('*').eq('id', pastaId).eq('tenant_id', origem).maybeSingle()
  if (!p) return { destinoId: existente, questoes: 0 }

  let pastaDestino = existente
  if (!pastaDestino) {
    // Campos tolerantes (cor/icone/capa podem não existir na migração destino).
    const base: Record<string, unknown> = { tenant_id: destino, nome: (p as any).nome, tipo: (p as any).tipo ?? null, is_folder: (p as any).is_folder ?? false, folder_area: (p as any).folder_area ?? null, created_at: nowIso() }
    for (const c of ['cor', 'icone', 'capa_url', 'capa_card_url']) if ((p as any)[c] != null) base[c] = (p as any)[c]
    let ins = await svc.from('simulado_pastas').insert(base).select('id').single()
    if (ins.error) { // repete sem os campos opcionais
      ins = await svc.from('simulado_pastas').insert({ tenant_id: destino, nome: (p as any).nome, created_at: nowIso() }).select('id').single()
    }
    if (ins.error || !ins.data) return { destinoId: null, questoes: 0 }
    pastaDestino = (ins.data as any).id
    await registrar(svc, origem, destino, 'banco', pastaId, pastaDestino!, por)
  }

  // Questões vinculadas → copia cada uma e recria o vínculo no destino.
  const { data: vinc } = await svc.from('simulado_questao_pasta').select('questao_id').eq('pasta_id', pastaId).eq('tenant_id', origem)
  let n = 0
  for (const v of (vinc ?? []) as any[]) {
    const qDest = await copiarQuestao(svc, origem, destino, v.questao_id, por)
    if (!qDest) continue
    const { data: jaVinc } = await svc.from('simulado_questao_pasta').select('id').eq('pasta_id', pastaDestino!).eq('questao_id', qDest).eq('tenant_id', destino).maybeSingle()
    if (!jaVinc) await svc.from('simulado_questao_pasta').insert({ tenant_id: destino, pasta_id: pastaDestino, questao_id: qDest })
    n++
  }
  return { destinoId: pastaDestino, questoes: n }
}

// ─── Estudante (dedup por e-mail no destino) ────────────────────────────────
export async function copiarEstudante(svc: SupabaseClient, origem: string, destino: string, estudanteId: string, por?: string | null): Promise<string | null> {
  if (origem === destino) return null
  const existente = await jaCopiado(svc, destino, 'estudante', estudanteId)
  if (existente) return existente

  const { data: e } = await svc.from('simulado_estudantes').select('nome, email, cpf, telefone, data_nascimento, classificacao').eq('id', estudanteId).eq('tenant_id', origem).maybeSingle()
  if (!e) return null

  // Dedup por e-mail (UNIQUE(tenant_id,email)): se já existe no destino, reusa.
  let destinoId: string | null = null
  const email = (e as any).email as string | null
  if (email) {
    const { data: ja } = await svc.from('simulado_estudantes').select('id').eq('tenant_id', destino).ilike('email', email).maybeSingle()
    destinoId = (ja as any)?.id ?? null
  }
  if (!destinoId) {
    const { data: novo, error } = await svc.from('simulado_estudantes').insert({
      tenant_id: destino, nome: (e as any).nome ?? 'Estudante', email, cpf: (e as any).cpf ?? null,
      telefone: (e as any).telefone ?? null, data_nascimento: (e as any).data_nascimento ?? null,
      classificacao: (e as any).classificacao ?? 'normal', created_at: nowIso(),
    }).select('id').single()
    if (error || !novo) return null
    destinoId = (novo as any).id
  }

  await registrar(svc, origem, destino, 'estudante', estudanteId, destinoId!, por)
  return destinoId
}

// ─── Caderno (bank-based: remapeia config.bancoId p/ a cópia do banco no destino) ────
export async function copiarCaderno(svc: SupabaseClient, origem: string, destino: string, cadernoId: string, por?: string | null): Promise<string | null> {
  if (origem === destino) return null
  const existente = await jaCopiado(svc, destino, 'caderno', cadernoId)
  if (existente) return existente

  const { data: c } = await svc.from('simulado_cadernos_designer').select('*').eq('id', cadernoId).eq('tenant_id', origem).maybeSingle()
  if (!c) return null

  const config: Record<string, unknown> = { ...(((c as any).config as Record<string, unknown>) ?? {}) }
  // O caderno RENDERIZA as questões do banco em config.bancoId — precisa copiar esse banco
  // (idempotente) e apontar a cópia. docsV2/blocos são genéricos (não embutem id de questão).
  const bancoOrigem = (config.bancoId as string) ?? null
  if (bancoOrigem) {
    const r = await copiarBanco(svc, origem, destino, bancoOrigem, por)
    if (r.destinoId) {
      config.bancoId = r.destinoId
      if (config.pastaId === bancoOrigem) config.pastaId = r.destinoId
    }
  }

  // pasta_id (pasta ORGANIZACIONAL do caderno) não existe no destino → raiz (null).
  const base: Record<string, unknown> = { tenant_id: destino, nome: (c as any).nome, config, pasta_id: null, created_at: nowIso() }
  for (const k of ['cor', 'icone', 'capa_url']) if ((c as any)[k] != null) base[k] = (c as any)[k]

  let ins = await svc.from('simulado_cadernos_designer').insert(base).select('id').single()
  if (ins.error) { // repete sem os campos tolerantes (migração destino pode não ter cor/icone/capa)
    ins = await svc.from('simulado_cadernos_designer').insert({ tenant_id: destino, nome: (c as any).nome, config, created_at: nowIso() }).select('id').single()
  }
  if (ins.error || !ins.data) return null
  const novoId = (ins.data as any).id
  await registrar(svc, origem, destino, 'caderno', cadernoId, novoId, por)
  return novoId
}
