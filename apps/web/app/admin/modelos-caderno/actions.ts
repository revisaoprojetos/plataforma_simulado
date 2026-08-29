'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { getCurrentAccess, checkPermission } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { softDelete } from '@/lib/soft-delete'
import { hospedarBase64 } from '@/lib/storage/hospedar-base64'
import { novoItemVazio, type Modalidade } from '@/lib/caderno-teste/tipos'
import { remember, chaveRelatorio, esquecer, TTL_RELATORIO } from '@/lib/cache/relatorio-cache'

const TABELA = 'simulado_caderno_modelos'
const AREA = 'caderno_modelo'
const NADA = '00000000-0000-0000-0000-000000000000'

/** Chave de cache da área (a lista inteira do tenant) + invalidação em toda mutação. */
const chaveModelos = (tenantId: string) => chaveRelatorio(tenantId, 'modelos-caderno')
async function invalidarModelosCache(tenantId: string | null) { if (tenantId) await esquecer(chaveModelos(tenantId)) }

export type ModeloRow = {
  id: string; nome: string; modalidade: string | null; origem: string | null
  pasta_id: string | null; cor: string | null; capa_url: string | null; capa_card_url: string | null; atualizado_em: string | null
  config?: unknown // { v, item } — usado para a prévia da 1ª folha no card
}
export type PastaModeloRow = {
  id: string; nome: string; pai_id: string | null; cor: string | null; capa_url: string | null; capa_card_url: string | null
}

async function guard() {
  if (!(await checkPermission('questoes:view'))) return { ok: false as const, error: 'Sem permissão.' }
  const access = await getCurrentAccess()
  if (!access.tenantId) return { ok: false as const, error: 'Tenant não resolvido.' }
  return { ok: true as const, tenantId: access.tenantId, atorId: access.userId ?? null }
}

/** Carrega TODOS os modelos + pastas da área (para montar níveis/trilha na page). Somente leitura.
 *  Cacheado no Redis por tenant (TTL) — invalidado em toda mutação (`invalidarModelosCache`). O grid
 *  filtra por pasta no cliente, então esta consulta roda 1× por visita, não a cada clique de pasta. */
export async function carregarModelosArea(): Promise<{ ok: boolean; modelos: ModeloRow[]; pastas: PastaModeloRow[] }> {
  const g = await guard()
  if (!g.ok) return { ok: false, modelos: [], pastas: [] }
  try {
    // Só resultados OK entram no cache: se a tabela não estiver migrada, o fetchAll lança e o
    // remember NÃO cacheia (o catch abaixo devolve ok:false sem gravar 30min de falha).
    const dados = await remember(chaveModelos(g.tenantId), TTL_RELATORIO, async () => {
      const svc = createAdminClient()
      const modelos = await fetchAll<ModeloRow>(() => svc
        .from(TABELA)
        .select('id, nome, modalidade, origem, pasta_id, cor, capa_url, capa_card_url, atualizado_em, config')
        .eq('tenant_id', g.tenantId).eq('deletado', false).order('atualizado_em', { ascending: false }))
      const pastasAll = await fetchAll<PastaModeloRow & { is_folder?: boolean; folder_area?: string }>(() => svc
        .from('simulado_pastas')
        .select('id, nome, pai_id, cor, capa_url, capa_card_url, is_folder, folder_area')
        .eq('tenant_id', g.tenantId).eq('deletado', false).order('nome'))
      const pastas = pastasAll.filter((p) => p.is_folder && p.folder_area === AREA)
        .map((p) => ({ id: p.id, nome: p.nome, pai_id: p.pai_id, cor: p.cor, capa_url: p.capa_url, capa_card_url: p.capa_card_url }))
      return { modelos, pastas }
    })
    return { ok: true, modelos: dados.modelos, pastas: dados.pastas }
  } catch {
    // Tabela ainda não migrada → a page mostra a mensagem de migração pendente.
    return { ok: false, modelos: [], pastas: [] }
  }
}

/** Abre um modelo para o editor. */
export async function abrirModelo(id: string): Promise<{ ok: boolean; nome?: string; config?: unknown; modalidade?: string | null; error?: string }> {
  const g = await guard()
  if (!g.ok) return g
  const svc = createAdminClient()
  const { data, error } = await svc.from(TABELA).select('nome, config, modalidade').eq('id', id).eq('tenant_id', g.tenantId).eq('deletado', false).maybeSingle()
  if (error) return { ok: false, error: error.message }
  if (!data) return { ok: false, error: 'Modelo não encontrado.' }
  return { ok: true, nome: data.nome, config: data.config, modalidade: (data as { modalidade?: string | null }).modalidade ?? null }
}

/** Cria um modelo "em branco" (canvas do zero) e devolve o id. */
export async function criarModeloEmBranco(pastaId?: string | null): Promise<{ ok: boolean; id?: string; error?: string }> {
  const item = novoItemVazio()
  return inserirModelo({ nome: 'Novo modelo', config: { v: 1, item, origem: 'zero' }, modalidade: item.modalidade, origem: 'zero', pastaId: pastaId ?? null })
}

/** Cria um modelo a partir de um config já montado no cliente (a partir de um padrão OU do zero). */
export async function criarModeloComConfig(nome: string, config: unknown, modalidade: Modalidade | null, origem: string, pastaId?: string | null): Promise<{ ok: boolean; id?: string; error?: string }> {
  return inserirModelo({ nome, config, modalidade, origem, pastaId: pastaId ?? null })
}

async function inserirModelo({ nome, config, modalidade, origem, pastaId }: { nome: string; config: unknown; modalidade: Modalidade | string | null; origem: string; pastaId: string | null }): Promise<{ ok: boolean; id?: string; error?: string }> {
  const g = await guard()
  if (!g.ok) return g
  const titulo = (nome || 'Novo modelo').trim()
  const svc = createAdminClient()
  const { data, error } = await svc.from(TABELA).insert({
    tenant_id: g.tenantId, nome: titulo, config: config ?? {}, modalidade: modalidade ?? null, origem, pasta_id: pastaId, criado_por: g.atorId,
  }).select('id').single()
  if (error || !data) return { ok: false, error: error?.message ?? 'Erro ao criar modelo.' }
  await registrarAudit({ operacao: 'INSERT', entidade: TABELA, entidadeId: data.id, depois: { nome: titulo, origem, modalidade } })
  await invalidarModelosCache(g.tenantId)
  revalidatePath('/admin/modelos-caderno')
  return { ok: true, id: data.id }
}

/** Salva o modelo (config + nome opcional). */
export async function salvarModelo(id: string, patch: { nome?: string; config: unknown; modalidade?: Modalidade | null }): Promise<{ ok: boolean; error?: string }> {
  const g = await guard()
  if (!g.ok) return g
  const svc = createAdminClient()
  const up: Record<string, unknown> = { config: patch.config, atualizado_em: new Date().toISOString() }
  if (typeof patch.nome === 'string' && patch.nome.trim()) up.nome = patch.nome.trim()
  if (patch.modalidade) up.modalidade = patch.modalidade
  const { error } = await svc.from(TABELA).update(up).eq('id', id).eq('tenant_id', g.tenantId)
  if (error) return { ok: false, error: error.message }
  await registrarAudit({ operacao: 'UPDATE', entidade: TABELA, entidadeId: id, depois: { salvo: true } })
  await invalidarModelosCache(g.tenantId)
  revalidatePath('/admin/modelos-caderno')
  revalidatePath(`/admin/modelos-caderno/${id}`)
  return { ok: true }
}

/** Salvar como / Duplicar: clona a linha (config + capa/cor) num novo modelo. */
export async function salvarComoModelo(id: string, nome: string, pastaId?: string | null): Promise<{ ok: boolean; id?: string; error?: string }> {
  const g = await guard()
  if (!g.ok) return g
  const svc = createAdminClient()
  const { data: orig, error } = await svc.from(TABELA).select('config, modalidade, origem, cor, icone, capa_url, capa_card_url, pasta_id').eq('id', id).eq('tenant_id', g.tenantId).maybeSingle()
  if (error || !orig) return { ok: false, error: error?.message ?? 'Modelo não encontrado.' }
  const { data: novo, error: e2 } = await svc.from(TABELA).insert({
    tenant_id: g.tenantId, nome: (nome || 'Cópia').trim(), config: orig.config, modalidade: orig.modalidade, origem: 'copia',
    cor: orig.cor, icone: orig.icone, capa_url: orig.capa_url, capa_card_url: orig.capa_card_url,
    pasta_id: pastaId === undefined ? orig.pasta_id : pastaId, criado_por: g.atorId,
  }).select('id').single()
  if (e2 || !novo) return { ok: false, error: e2?.message ?? 'Erro ao salvar como.' }
  await registrarAudit({ operacao: 'INSERT', entidade: TABELA, entidadeId: novo.id, depois: { salvarComo: id } })
  await invalidarModelosCache(g.tenantId)
  revalidatePath('/admin/modelos-caderno')
  return { ok: true, id: novo.id }
}

export async function duplicarModelo(id: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  const g = await guard()
  if (!g.ok) return g
  const svc = createAdminClient()
  const { data } = await svc.from(TABELA).select('nome').eq('id', id).eq('tenant_id', g.tenantId).maybeSingle()
  return salvarComoModelo(id, `${data?.nome ?? 'Modelo'} (cópia)`)
}

export async function renomearModelo(id: string, nome: string): Promise<{ ok: boolean; error?: string }> {
  const g = await guard()
  if (!g.ok) return g
  const titulo = nome.trim()
  if (!titulo) return { ok: false, error: 'Informe um nome.' }
  const svc = createAdminClient()
  const { error } = await svc.from(TABELA).update({ nome: titulo, atualizado_em: new Date().toISOString() }).eq('id', id).eq('tenant_id', g.tenantId)
  if (error) return { ok: false, error: error.message }
  await invalidarModelosCache(g.tenantId)
  revalidatePath('/admin/modelos-caderno')
  return { ok: true }
}

export async function moverModelo(id: string, pastaId: string | null): Promise<{ ok: boolean; error?: string }> {
  const g = await guard()
  if (!g.ok) return g
  const svc = createAdminClient()
  const { error } = await svc.from(TABELA).update({ pasta_id: pastaId }).eq('id', id).eq('tenant_id', g.tenantId)
  if (error) return { ok: false, error: error.message }
  await registrarAudit({ operacao: 'UPDATE', entidade: TABELA, entidadeId: id, depois: { pasta_id: pastaId } })
  await invalidarModelosCache(g.tenantId)
  revalidatePath('/admin/modelos-caderno')
  return { ok: true }
}

export async function excluirModelo(id: string): Promise<{ ok: boolean; error?: string }> {
  const g = await guard()
  if (!g.ok) return g
  const svc = createAdminClient()
  // Soft-delete inline (a tabela não está no whitelist do helper softDelete).
  const { error } = await svc.from(TABELA).update({ deletado: true, deletado_em: new Date().toISOString(), deletado_por: g.atorId }).eq('id', id).eq('tenant_id', g.tenantId)
  if (error) return { ok: false, error: error.message }
  await registrarAudit({ operacao: 'DELETE', entidade: TABELA, entidadeId: id, depois: { deletado: true } })
  await invalidarModelosCache(g.tenantId)
  revalidatePath('/admin/modelos-caderno')
  return { ok: true }
}

// ── Pastas (folder_area = 'caderno_modelo') ──────────────────────────────────

export async function criarPastaModelo(nome: string, paiId?: string | null): Promise<{ ok: boolean; id?: string; error?: string }> {
  const g = await guard()
  if (!g.ok) return g
  const titulo = nome.trim()
  if (!titulo) return { ok: false, error: 'Informe um nome.' }
  const svc = createAdminClient()
  const base = { tenant_id: g.tenantId, nome: titulo, is_folder: true, pai_id: paiId ?? null }
  let { data, error } = await svc.from('simulado_pastas').insert({ ...base, folder_area: AREA }).select('id').single()
  if (error && /folder_area/i.test(error.message)) ({ data, error } = await svc.from('simulado_pastas').insert(base).select('id').single())
  if (error || !data) return { ok: false, error: error?.message ?? 'Erro ao criar pasta.' }
  await registrarAudit({ operacao: 'INSERT', entidade: 'simulado_pastas', entidadeId: data.id, depois: { nome: titulo, pasta: true, area: AREA } })
  await invalidarModelosCache(g.tenantId)
  revalidatePath('/admin/modelos-caderno')
  return { ok: true, id: data.id }
}

/** Atualiza nome/cor/capas de uma pasta da área (capa_url = banner largo, capa_card_url = card). */
export async function atualizarPastaModelo(id: string, nome: string, cor: string | null, capaLarga?: string | null, capaCard?: string | null): Promise<{ ok: boolean; error?: string }> {
  const g = await guard()
  if (!g.ok) return g
  const titulo = nome.trim()
  if (!titulo) return { ok: false, error: 'Informe um nome.' }
  const svc = createAdminClient()
  const capa = capaLarga ? await hospedarBase64(capaLarga, svc) : capaLarga === null ? null : undefined
  const capaCd = capaCard ? await hospedarBase64(capaCard, svc) : capaCard === null ? null : undefined
  const up: Record<string, unknown> = { nome: titulo, cor: cor || null }
  if (capa !== undefined) up.capa_url = capa
  if (capaCd !== undefined) up.capa_card_url = capaCd
  let { error } = await svc.from('simulado_pastas').update(up).eq('id', id).eq('tenant_id', g.tenantId)
  if (error && /capa_card_url|capa_url|cor|column/i.test(error.message)) {
    ;({ error } = await svc.from('simulado_pastas').update({ nome: titulo }).eq('id', id).eq('tenant_id', g.tenantId))
  }
  if (error) return { ok: false, error: error.message }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_pastas', entidadeId: id, depois: { nome: titulo, cor } })
  await invalidarModelosCache(g.tenantId)
  revalidatePath('/admin/modelos-caderno')
  return { ok: true }
}

export async function moverPastaModelo(id: string, paiId: string | null): Promise<{ ok: boolean; error?: string }> {
  const g = await guard()
  if (!g.ok) return g
  const svc = createAdminClient()
  const { error } = await svc.from('simulado_pastas').update({ pai_id: paiId }).eq('id', id).eq('tenant_id', g.tenantId)
  if (error) return { ok: false, error: error.message }
  await invalidarModelosCache(g.tenantId)
  revalidatePath('/admin/modelos-caderno')
  return { ok: true }
}

/** Exclui uma pasta: solta o que está dentro (subpastas + modelos voltam à raiz) e soft-deleta a pasta. */
export async function excluirPastaModelo(id: string): Promise<{ ok: boolean; error?: string }> {
  const g = await guard()
  if (!g.ok) return g
  const svc = createAdminClient()
  try { await svc.from('simulado_pastas').update({ pai_id: null }).eq('pai_id', id).eq('tenant_id', g.tenantId) } catch { /* ignore */ }
  try { await svc.from(TABELA).update({ pasta_id: null }).eq('pasta_id', id).eq('tenant_id', g.tenantId) } catch { /* ignore */ }
  const { error } = await softDelete('simulado_pastas', id)
  if (error) return { ok: false, error: error.message }
  await registrarAudit({ operacao: 'DELETE', entidade: 'simulado_pastas', entidadeId: id, depois: { deletado: true, pasta: true } })
  await invalidarModelosCache(g.tenantId)
  revalidatePath('/admin/modelos-caderno')
  return { ok: true }
}

/** Fase 2 (consumo): modelos publicáveis para o construtor de caderno do simulado. */
export async function listarModelosPublicaveis(): Promise<{ ok: boolean; modelos: { id: string; nome: string; modalidade: string | null; config: unknown }[] }> {
  const g = await guard()
  if (!g.ok) return { ok: false, modelos: [] }
  const svc = createAdminClient()
  const modelos = await fetchAll<{ id: string; nome: string; modalidade: string | null; config: unknown }>(() => svc
    .from(TABELA).select('id, nome, modalidade, config').eq('tenant_id', g.tenantId ?? NADA).eq('deletado', false).order('nome'))
  return { ok: true, modelos }
}
