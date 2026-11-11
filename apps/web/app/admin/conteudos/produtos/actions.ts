'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { softDelete } from '@/lib/soft-delete'
import { listarPastasProduto, FOLDER_AREA_PRODUTO } from '@/lib/produtos/estudio'
import type { Disponibilidade, TipoRef } from '@/lib/produtos/curriculo'
import { listarAdministradores } from '@/app/admin/administradores/actions'

// Mutações do bloco PRODUTOS do Estúdio de Conteúdo (por fora de /admin/produtos).
// Reusa as actions de produção para o produto em si (identidade/vitrine/grupos); aqui
// mora o que é NOVO: pastas, instrutores e o currículo leve por referência.
//
// Toda escrita: checkPermission (guard) + isolamento por tenant_id + registrarAudit.
// Tolerante a coluna/tabela ausente (migração 20261031030000 pode não estar aplicada).

async function guard(manage = false) {
  const access = await getCurrentAccess()
  const ok = access.isAdmin
    || access.permissions.includes(manage ? 'produtos:manage' : 'produtos:view')
    || access.permissions.includes('produtos:manage')
  if (!ok) return { error: 'Sem permissão.' as const }
  if (!access.tenantId) return { error: 'Tenant não resolvido — recarregue a página.' as const }
  return { tenantId: access.tenantId, userId: access.userId }
}

const BASE = '/admin/conteudos/produtos'
function revalidar(id?: string) { revalidatePath(BASE); if (id) revalidatePath(`${BASE}/${id}`) }

// ═════════════════════════════ PASTAS (folder_area='produto') ═════════════════════════════

export async function criarPastaProdutoAction(nome: string, paiId: string | null = null) {
  const g = await guard(true); if ('error' in g) return { error: g.error }
  const titulo = (nome ?? '').trim(); if (!titulo) return { error: 'Informe o nome da pasta.' }
  const svc = createAdminClient()
  const { data, error } = await svc.from('simulado_pastas')
    .insert({ tenant_id: g.tenantId, nome: titulo, is_folder: true, pai_id: paiId ?? null, folder_area: FOLDER_AREA_PRODUTO })
    .select('id').single()
  if (error || !data) return { error: error?.message || 'Falha ao criar pasta.' }
  await registrarAudit({ operacao: 'INSERT', entidade: 'simulado_pastas', entidadeId: data.id, depois: { nome: titulo, folder_area: FOLDER_AREA_PRODUTO }, tenantId: g.tenantId })
  revalidar(); return { ok: true as const, id: data.id }
}

export async function renomearPastaProdutoAction(id: string, nome: string) {
  const g = await guard(true); if ('error' in g) return { error: g.error }
  const titulo = (nome ?? '').trim(); if (!titulo) return { error: 'Informe o nome.' }
  const svc = createAdminClient()
  const { error } = await svc.from('simulado_pastas').update({ nome: titulo }).eq('id', id).eq('tenant_id', g.tenantId).eq('folder_area', FOLDER_AREA_PRODUTO)
  if (error) return { error: error.message }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_pastas', entidadeId: id, depois: { nome: titulo }, tenantId: g.tenantId })
  revalidar(); return { ok: true as const }
}

export async function moverPastaProdutoAction(id: string, paiId: string | null) {
  const g = await guard(true); if ('error' in g) return { error: g.error }
  if (id === paiId) return { error: 'Uma pasta não pode entrar em si mesma.' }
  const svc = createAdminClient()
  // Anti-ciclo: destino não pode ser descendente da pasta movida.
  if (paiId) {
    const arvore = await listarPastasProduto(g.tenantId)
    const paiDe = new Map(arvore.map((p) => [p.id, p.pai_id]))
    let cur: string | null | undefined = paiId
    const visto = new Set<string>()
    while (cur) {
      if (cur === id) return { error: 'Não dá para mover uma pasta para dentro dela mesma.' }
      if (visto.has(cur)) break
      visto.add(cur); cur = paiDe.get(cur) ?? null
    }
  }
  const { error } = await svc.from('simulado_pastas').update({ pai_id: paiId }).eq('id', id).eq('tenant_id', g.tenantId).eq('folder_area', FOLDER_AREA_PRODUTO)
  if (error) return { error: error.message }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_pastas', entidadeId: id, depois: { pai_id: paiId }, tenantId: g.tenantId })
  revalidar(); return { ok: true as const }
}

export async function excluirPastaProdutoAction(id: string) {
  const g = await guard(true); if ('error' in g) return { error: g.error }
  const svc = createAdminClient()
  // Solta subpastas e produtos para a raiz (não some com o conteúdo); depois manda a pasta p/ Lixeira.
  await svc.from('simulado_pastas').update({ pai_id: null }).eq('pai_id', id).eq('tenant_id', g.tenantId).eq('folder_area', FOLDER_AREA_PRODUTO)
  try { await svc.from('simulado_produtos').update({ pasta_id: null }).eq('pasta_id', id).eq('tenant_id', g.tenantId) } catch { /* coluna ausente */ }
  const { error } = await softDelete('simulado_pastas', id)
  if (error) return { error: error.message }
  await registrarAudit({ operacao: 'DELETE', entidade: 'simulado_pastas', entidadeId: id, tenantId: g.tenantId })
  revalidar(); return { ok: true as const }
}

// ═════════════════════════════ PRODUTO — organização ═════════════════════════════

/** Move um produto para uma pasta (ou raiz). Tolerante se a coluna pasta_id não existe. */
export async function moverProdutoAction(produtoId: string, pastaId: string | null) {
  const g = await guard(true); if ('error' in g) return { error: g.error }
  const svc = createAdminClient()
  const { error } = await svc.from('simulado_produtos').update({ pasta_id: pastaId }).eq('id', produtoId).eq('tenant_id', g.tenantId)
  if (error) return { error: /pasta_id|column/i.test(error.message) ? 'Organização por pasta indisponível no banco. Aplique a migração 20261031030000.' : error.message }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_produtos', entidadeId: produtoId, depois: { pasta_id: pastaId }, tenantId: g.tenantId })
  revalidar(produtoId); return { ok: true as const }
}

/** Duplica um produto (linha + fontes + seções + itens de liberação + instrutores + currículo). */
export async function duplicarProdutoAction(produtoId: string, novoNome?: string) {
  const g = await guard(true); if ('error' in g) return { error: g.error }
  const svc = createAdminClient()
  const { data: p } = await svc.from('simulado_produtos').select('*').eq('id', produtoId).eq('tenant_id', g.tenantId).maybeSingle()
  if (!p) return { error: 'Produto não encontrado.' }
  const nome = (novoNome?.trim() || `${(p as any).nome} (cópia)`)
  const slug = (nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'produto') + '-' + Math.random().toString(16).slice(2, 8)
  const { id: _id, criado_em: _c, atualizado_em: _a, ...resto } = p as any
  const { data: novo, error } = await svc.from('simulado_produtos').insert({ ...resto, nome, slug, ativo: false }).select('id').single()
  if (error || !novo) return { error: error?.message || 'Falha ao duplicar.' }
  const novoId = novo.id

  const copiar = async (tabela: string, cols: string, set?: (r: any) => any) => {
    try {
      const { data } = await svc.from(tabela).select(cols).eq('tenant_id', g.tenantId).eq('produto_id', produtoId)
      const rows = (data ?? []).map((r: any) => { const { id, criado_em, atualizado_em, ...rest } = r; return set ? set({ ...rest, produto_id: novoId }) : { ...rest, produto_id: novoId } })
      if (rows.length) await svc.from(tabela).insert(rows)
    } catch { /* tabela ausente */ }
  }
  await copiar('simulado_produto_fontes', 'id, tenant_id, produto_id, provider, fonte_ref, fonte_nome, ativo')
  await copiar('simulado_produto_secoes', 'id, tenant_id, produto_id, ordem, tipo, nome, tamanho, ordenacao, config, ativo')
  await copiar('simulado_produto_itens', 'id, tenant_id, produto_id, tipo_item, item_id, permissoes, ativo')
  await copiar('simulado_produto_instrutores', 'id, tenant_id, produto_id, user_id, nome, email, ordem')
  // Currículo: módulos (remapeia ids) + itens.
  try {
    const { data: mods } = await svc.from('simulado_produto_modulos').select('*').eq('tenant_id', g.tenantId).eq('produto_id', produtoId).eq('deletado', false)
    const mapId = new Map<string, string>()
    for (const m of (mods ?? []) as any[]) {
      const { id, criado_em, atualizado_em, pai_id, ...rest } = m
      const { data: nm } = await svc.from('simulado_produto_modulos').insert({ ...rest, produto_id: novoId, pai_id: pai_id ? mapId.get(pai_id) ?? null : null }).select('id').single()
      if (nm) mapId.set(id, nm.id)
    }
    const { data: its } = await svc.from('simulado_produto_modulo_itens').select('*').eq('tenant_id', g.tenantId).eq('produto_id', produtoId).eq('deletado', false)
    const rows = (its ?? []).map((i: any) => { const { id, criado_em, atualizado_em, modulo_id, ...rest } = i; return { ...rest, produto_id: novoId, modulo_id: mapId.get(modulo_id) } }).filter((r: any) => r.modulo_id)
    if (rows.length) await svc.from('simulado_produto_modulo_itens').insert(rows)
  } catch { /* currículo ausente */ }

  await registrarAudit({ operacao: 'INSERT', entidade: 'simulado_produtos', entidadeId: novoId, depois: { duplicado_de: produtoId, nome }, tenantId: g.tenantId })
  revalidar(); return { ok: true as const, id: novoId }
}

// ═════════════════════════════ INSTRUTORES ═════════════════════════════

/** Candidatos a instrutor = administradores do tenant (reusa a listagem de /admin/administradores). */
export async function listarInstrutorCandidatosAction() {
  const g = await guard(); if ('error' in g) return { error: g.error }
  try {
    const r = await listarAdministradores()
    if (!r.ok || !r.membros) return { ok: true as const, candidatos: [] }
    return { ok: true as const, candidatos: r.membros.map((m) => ({ user_id: m.userId, nome: m.nome ?? m.email ?? '—', email: m.email ?? '' })) }
  } catch { return { ok: true as const, candidatos: [] } }
}

export async function adicionarInstrutorAction(produtoId: string, instrutor: { user_id?: string | null; nome: string; email?: string | null }) {
  const g = await guard(true); if ('error' in g) return { error: g.error }
  const nome = (instrutor.nome ?? '').trim(); if (!nome) return { error: 'Informe o instrutor.' }
  const svc = createAdminClient()
  const { error } = await svc.from('simulado_produto_instrutores').insert({
    tenant_id: g.tenantId, produto_id: produtoId, user_id: instrutor.user_id ?? null, nome, email: instrutor.email?.trim() || null,
  })
  if (error && /duplicate|unique/i.test(error.message)) return { error: 'Este instrutor já está no produto.' }
  if (error) return { error: /instrutores|relation|does not exist/i.test(error.message) ? 'Instrutores indisponíveis no banco. Aplique a migração 20261031030000.' : error.message }
  await registrarAudit({ operacao: 'INSERT', entidade: 'simulado_produto_instrutores', entidadeId: produtoId, depois: { nome }, tenantId: g.tenantId })
  revalidar(produtoId); return { ok: true as const }
}

export async function removerInstrutorAction(id: string, produtoId: string) {
  const g = await guard(true); if ('error' in g) return { error: g.error }
  const svc = createAdminClient()
  const { error } = await svc.from('simulado_produto_instrutores').delete().eq('id', id).eq('tenant_id', g.tenantId)
  if (error) return { error: error.message }
  revalidar(produtoId); return { ok: true as const }
}

// ═════════════════════════════ CURRÍCULO — módulos ═════════════════════════════

type ModuloInput = { id?: string; pai_id?: string | null; titulo: string; imagem_url?: string | null; ocultar_titulo?: boolean; descricao?: string | null; exibicao?: 'aberto' | 'recolhido'; disponibilidade?: Disponibilidade }

export async function salvarModuloAction(produtoId: string, input: ModuloInput) {
  const g = await guard(true); if ('error' in g) return { error: g.error }
  const titulo = (input.titulo ?? '').trim(); if (!titulo) return { error: 'Informe o título do módulo.' }
  const svc = createAdminClient()
  const campos: any = {
    titulo, pai_id: input.pai_id ?? null, imagem_url: input.imagem_url ?? null, descricao: input.descricao ?? null,
    exibicao: input.exibicao ?? 'aberto', disponibilidade: input.disponibilidade ?? { tipo: 'na_matricula' }, atualizado_em: new Date().toISOString(),
    ocultar_titulo: !!input.ocultar_titulo && !!input.imagem_url,
  }
  const semColuna = (m?: string) => /ocultar_titulo/.test(m || '') // migração 20261105100000 ainda não aplicada → salva sem o campo
  if (input.id) {
    let { error } = await svc.from('simulado_produto_modulos').update(campos).eq('id', input.id).eq('tenant_id', g.tenantId)
    if (error && semColuna(error.message)) { const { ocultar_titulo: _o, ...resto } = campos; ({ error } = await svc.from('simulado_produto_modulos').update(resto).eq('id', input.id).eq('tenant_id', g.tenantId)) }
    if (error) return { error: erroModulo(error.message) }
    await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_produto_modulos', entidadeId: input.id, depois: { titulo }, tenantId: g.tenantId })
    revalidar(produtoId); return { ok: true as const, id: input.id }
  }
  const ordem = await proximaOrdem(svc, 'simulado_produto_modulos', { tenant_id: g.tenantId, produto_id: produtoId, pai_id: input.pai_id ?? null })
  let { data, error } = await svc.from('simulado_produto_modulos').insert({ ...campos, tenant_id: g.tenantId, produto_id: produtoId, ordem }).select('id').single()
  if (error && semColuna(error.message)) { const { ocultar_titulo: _o, ...resto } = campos; ({ data, error } = await svc.from('simulado_produto_modulos').insert({ ...resto, tenant_id: g.tenantId, produto_id: produtoId, ordem }).select('id').single()) }
  if (error || !data) return { error: erroModulo(error?.message || 'Falha ao criar módulo.') }
  await registrarAudit({ operacao: 'INSERT', entidade: 'simulado_produto_modulos', entidadeId: data.id, depois: { titulo }, tenantId: g.tenantId })
  revalidar(produtoId); return { ok: true as const, id: data.id }
}

export async function excluirModuloAction(id: string, produtoId: string) {
  const g = await guard(true); if ('error' in g) return { error: g.error }
  const svc = createAdminClient()
  const now = new Date().toISOString()
  // Soft-delete o módulo, seus submódulos e os itens pendurados.
  const { data: subs } = await svc.from('simulado_produto_modulos').select('id').eq('tenant_id', g.tenantId).eq('pai_id', id).eq('deletado', false)
  const modIds = [id, ...((subs ?? []).map((s: any) => s.id))]
  await svc.from('simulado_produto_modulos').update({ deletado: true, deletado_em: now, deletado_por: g.userId }).in('id', modIds).eq('tenant_id', g.tenantId)
  await svc.from('simulado_produto_modulo_itens').update({ deletado: true, deletado_em: now, deletado_por: g.userId }).in('modulo_id', modIds).eq('tenant_id', g.tenantId)
  await registrarAudit({ operacao: 'DELETE', entidade: 'simulado_produto_modulos', entidadeId: id, tenantId: g.tenantId })
  revalidar(produtoId); return { ok: true as const }
}

export async function reordenarModulosAction(produtoId: string, idsOrdenados: string[]) {
  const g = await guard(true); if ('error' in g) return { error: g.error }
  const svc = createAdminClient()
  await Promise.all(idsOrdenados.map((id, i) => svc.from('simulado_produto_modulos').update({ ordem: i }).eq('id', id).eq('tenant_id', g.tenantId)))
  revalidar(produtoId); return { ok: true as const }
}

export async function reordenarItensAction(produtoId: string, moduloId: string, idsOrdenados: string[]) {
  const g = await guard(true); if ('error' in g) return { error: g.error }
  const svc = createAdminClient()
  await Promise.all(idsOrdenados.map((id, i) => svc.from('simulado_produto_modulo_itens').update({ ordem: i })
    .eq('id', id).eq('modulo_id', moduloId).eq('produto_id', produtoId).eq('tenant_id', g.tenantId)))
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_produto_modulo_itens', entidadeId: moduloId, depois: { reordenar: idsOrdenados }, tenantId: g.tenantId })
  revalidar(produtoId); return { ok: true as const }
}

// ═════════════════════════════ CURRÍCULO — itens (aulas) ═════════════════════════════

type ItemInput = {
  modulo_id: string; tipo_ref: TipoRef; subtipo?: string | null; ref_id?: string | null; ref_url?: string | null
  titulo: string; visibilidade?: 'privado' | 'publico'; situacao?: 'ativo' | 'rascunho'; meta?: Record<string, unknown>; disponibilidade?: Disponibilidade
}

export async function criarItemAction(produtoId: string, input: ItemInput) {
  const g = await guard(true); if ('error' in g) return { error: g.error }
  const titulo = (input.titulo ?? '').trim(); if (!titulo) return { error: 'Informe o título da aula.' }
  if (!input.modulo_id) return { error: 'Escolha o módulo/submódulo.' }
  const svc = createAdminClient()
  const ordem = await proximaOrdem(svc, 'simulado_produto_modulo_itens', { tenant_id: g.tenantId, modulo_id: input.modulo_id })
  const { data, error } = await svc.from('simulado_produto_modulo_itens').insert({
    tenant_id: g.tenantId, produto_id: produtoId, modulo_id: input.modulo_id, ordem,
    tipo_ref: input.tipo_ref, subtipo: input.subtipo ?? null, ref_id: input.ref_id ?? null, ref_url: input.ref_url ?? null,
    titulo, visibilidade: input.visibilidade ?? 'privado', situacao: input.situacao ?? 'ativo',
    meta: input.meta ?? {}, disponibilidade: input.disponibilidade ?? { tipo: 'na_matricula' },
  }).select('id').single()
  if (error || !data) return { error: erroItem(error?.message || 'Falha ao criar aula.') }
  await registrarAudit({ operacao: 'INSERT', entidade: 'simulado_produto_modulo_itens', entidadeId: data.id, depois: { titulo, tipo_ref: input.tipo_ref }, tenantId: g.tenantId })
  revalidar(produtoId); return { ok: true as const, id: data.id }
}

export async function salvarItemAction(id: string, produtoId: string, patch: Partial<ItemInput>) {
  const g = await guard(true); if ('error' in g) return { error: g.error }
  const svc = createAdminClient()
  const campos: any = { atualizado_em: new Date().toISOString() }
  for (const k of ['tipo_ref', 'subtipo', 'ref_id', 'ref_url', 'titulo', 'visibilidade', 'situacao', 'meta', 'disponibilidade'] as const) {
    if (patch[k] !== undefined) campos[k] = patch[k]
  }
  if (campos.titulo !== undefined && !String(campos.titulo).trim()) return { error: 'Informe o título da aula.' }
  const { error } = await svc.from('simulado_produto_modulo_itens').update(campos).eq('id', id).eq('tenant_id', g.tenantId)
  if (error) return { error: erroItem(error.message) }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_produto_modulo_itens', entidadeId: id, depois: campos, tenantId: g.tenantId })
  revalidar(produtoId); return { ok: true as const }
}

export async function excluirItemAction(id: string, produtoId: string) {
  const g = await guard(true); if ('error' in g) return { error: g.error }
  const svc = createAdminClient()
  const { error } = await svc.from('simulado_produto_modulo_itens').update({ deletado: true, deletado_em: new Date().toISOString(), deletado_por: g.userId }).eq('id', id).eq('tenant_id', g.tenantId)
  if (error) return { error: error.message }
  await registrarAudit({ operacao: 'DELETE', entidade: 'simulado_produto_modulo_itens', entidadeId: id, tenantId: g.tenantId })
  revalidar(produtoId); return { ok: true as const }
}

export async function moverItemAction(id: string, produtoId: string, moduloId: string) {
  const g = await guard(true); if ('error' in g) return { error: g.error }
  if (!moduloId) return { error: 'Escolha o módulo de destino.' }
  const svc = createAdminClient()
  const ordem = await proximaOrdem(svc, 'simulado_produto_modulo_itens', { tenant_id: g.tenantId, modulo_id: moduloId })
  const { error } = await svc.from('simulado_produto_modulo_itens').update({ modulo_id: moduloId, ordem }).eq('id', id).eq('tenant_id', g.tenantId)
  if (error) return { error: error.message }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_produto_modulo_itens', entidadeId: id, depois: { modulo_id: moduloId }, tenantId: g.tenantId })
  revalidar(produtoId); return { ok: true as const }
}

export async function duplicarItemAction(id: string, produtoId: string, opts: { titulo?: string; moduloId?: string; situacao?: 'ativo' | 'rascunho' }) {
  const g = await guard(true); if ('error' in g) return { error: g.error }
  const svc = createAdminClient()
  const { data: it } = await svc.from('simulado_produto_modulo_itens').select('*').eq('id', id).eq('tenant_id', g.tenantId).maybeSingle()
  if (!it) return { error: 'Aula não encontrada.' }
  const row: any = it
  const moduloId = opts.moduloId || row.modulo_id
  const ordem = await proximaOrdem(svc, 'simulado_produto_modulo_itens', { tenant_id: g.tenantId, modulo_id: moduloId })
  const { id: _i, criado_em: _c, atualizado_em: _a, ...rest } = row
  const { data, error } = await svc.from('simulado_produto_modulo_itens').insert({
    ...rest, modulo_id: moduloId, ordem, titulo: opts.titulo?.trim() || `${row.titulo} (cópia)`, situacao: opts.situacao ?? 'rascunho',
  }).select('id').single()
  if (error || !data) return { error: error?.message || 'Falha ao duplicar.' }
  await registrarAudit({ operacao: 'INSERT', entidade: 'simulado_produto_modulo_itens', entidadeId: data.id, depois: { duplicado_de: id }, tenantId: g.tenantId })
  revalidar(produtoId); return { ok: true as const, id: data.id }
}

/** Troca o tipo/subtipo da aula; mantém título, disponibilidade e visibilidade. Limpa a referência
 *  quando a base (tipo_ref) muda (o material antigo continua na Biblioteca p/ religar depois). */
export async function alterarTipoItemAction(id: string, produtoId: string, subtipo: string, tipoRef: TipoRef) {
  const g = await guard(true); if ('error' in g) return { error: g.error }
  const svc = createAdminClient()
  const { data: it } = await svc.from('simulado_produto_modulo_itens').select('tipo_ref').eq('id', id).eq('tenant_id', g.tenantId).maybeSingle()
  const mudouBase = (it as any)?.tipo_ref !== tipoRef
  const campos: any = { subtipo, tipo_ref: tipoRef, atualizado_em: new Date().toISOString() }
  if (mudouBase) { campos.ref_id = null; campos.ref_url = null }
  const { error } = await svc.from('simulado_produto_modulo_itens').update(campos).eq('id', id).eq('tenant_id', g.tenantId)
  if (error) return { error: error.message }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_produto_modulo_itens', entidadeId: id, depois: { subtipo, tipo_ref: tipoRef }, tenantId: g.tenantId })
  revalidar(produtoId); return { ok: true as const }
}

// ── Ações EM LOTE sobre aulas (uma ida ao servidor; update em chunks de 80 + 1 auditoria com a lista de ids) ──

const DISP_TIPOS = ['na_matricula', 'data', 'intervalo', 'data_e_intervalo', 'dia_semana_e_intervalo']
function chunks<T>(arr: T[], n = 80): T[][] { const out: T[][] = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out }

/** Normaliza a disponibilidade vinda do cliente (mesmo formato que o "Editar" individual grava). */
function normalizarDisp(d: Disponibilidade): Disponibilidade | null {
  if (!d || !DISP_TIPOS.includes(d.tipo)) return null
  const data = d.data && !Number.isNaN(Date.parse(d.data)) ? new Date(d.data).toISOString() : null
  if ((d.tipo === 'data' || d.tipo === 'data_e_intervalo') && !data) return null
  return {
    tipo: d.tipo, antes: d.antes === 'oculto' ? 'oculto' : 'bloqueado_cadeado',
    data: d.tipo === 'data' || d.tipo === 'data_e_intervalo' ? data : null,
    dias: ['intervalo', 'data_e_intervalo', 'dia_semana_e_intervalo'].includes(d.tipo) ? Math.max(0, Math.floor(Number(d.dias) || 0)) : null,
    diaSemana: d.tipo === 'dia_semana_e_intervalo' ? Math.min(6, Math.max(0, Math.floor(Number(d.diaSemana) || 0))) : null,
  }
}

type LotePatch = { disponibilidade?: Disponibilidade; situacao?: 'ativo' | 'rascunho'; visibilidade?: 'privado' | 'publico'; modulo_id?: string }

/** Ids que realmente pertencem ao produto+tenant (e não estão na lixeira). */
async function idsDoProduto(svc: any, tenantId: string, produtoId: string, ids: string[]): Promise<string[]> {
  const ok: string[] = []
  for (const c of chunks([...new Set(ids)])) {
    const { data } = await svc.from('simulado_produto_modulo_itens').select('id').eq('tenant_id', tenantId).eq('produto_id', produtoId).eq('deletado', false).in('id', c)
    for (const r of (data ?? []) as any[]) ok.push(r.id)
  }
  return ok
}

/** Atualiza várias aulas de uma vez gravando o MESMO que o "Editar" individual (disponibilidade / situação / visibilidade) ou move para outro módulo. */
export async function atualizarItensEmLoteAction(produtoId: string, ids: string[], patch: LotePatch) {
  const g = await guard(true); if ('error' in g) return { error: g.error }
  if (!Array.isArray(ids) || !ids.length) return { error: 'Selecione ao menos uma aula.' }
  const svc = createAdminClient()
  const campos: any = {}
  if (patch.disponibilidade !== undefined) {
    const d = normalizarDisp(patch.disponibilidade); if (!d) return { error: 'Disponibilidade inválida (informe a data).' }
    campos.disponibilidade = d
  }
  if (patch.situacao !== undefined) { if (!['ativo', 'rascunho'].includes(patch.situacao)) return { error: 'Situação inválida.' }; campos.situacao = patch.situacao }
  if (patch.visibilidade !== undefined) { if (!['privado', 'publico'].includes(patch.visibilidade)) return { error: 'Visibilidade inválida.' }; campos.visibilidade = patch.visibilidade }
  if (patch.modulo_id !== undefined) {
    const { data: mod } = await svc.from('simulado_produto_modulos').select('id').eq('id', patch.modulo_id).eq('tenant_id', g.tenantId).eq('produto_id', produtoId).eq('deletado', false).maybeSingle()
    if (!mod) return { error: 'Módulo de destino inválido.' }
  }
  if (!Object.keys(campos).length && patch.modulo_id === undefined) return { error: 'Nada para atualizar.' }

  const alvo = await idsDoProduto(svc, g.tenantId, produtoId, ids)
  if (!alvo.length) return { error: 'Nenhuma das aulas selecionadas foi encontrada neste produto.' }
  const agora = new Date().toISOString()

  if (Object.keys(campos).length) {
    for (const c of chunks(alvo)) {
      const { error } = await svc.from('simulado_produto_modulo_itens').update({ ...campos, atualizado_em: agora }).eq('tenant_id', g.tenantId).eq('produto_id', produtoId).in('id', c)
      if (error) return { error: erroItem(error.message) }
    }
  }
  if (patch.modulo_id !== undefined) {
    // Mantém a ordem relativa atual e acrescenta ao fim do módulo de destino.
    const base = await proximaOrdem(svc, 'simulado_produto_modulo_itens', { tenant_id: g.tenantId, modulo_id: patch.modulo_id })
    const atuais: { id: string; modulo_id: string; ordem: number }[] = []
    for (const c of chunks(alvo)) {
      const { data } = await svc.from('simulado_produto_modulo_itens').select('id, modulo_id, ordem').eq('tenant_id', g.tenantId).in('id', c)
      atuais.push(...((data ?? []) as any[]))
    }
    atuais.sort((a, b) => a.modulo_id.localeCompare(b.modulo_id) || a.ordem - b.ordem)
    const novaOrdem = atuais.map((it, i) => ({ id: it.id, ordem: base + i }))
    for (const c of chunks(novaOrdem)) {
      const rs = await Promise.all(c.map((it) => svc.from('simulado_produto_modulo_itens')
        .update({ modulo_id: patch.modulo_id, ordem: it.ordem, atualizado_em: agora }).eq('id', it.id).eq('tenant_id', g.tenantId).eq('produto_id', produtoId)))
      const err = rs.find((r: any) => r.error); if (err) return { error: erroItem((err as any).error.message) }
    }
  }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_produto_modulo_itens', entidadeId: produtoId, depois: { lote: true, quantidade: alvo.length, ids: alvo, ...campos, ...(patch.modulo_id ? { modulo_id: patch.modulo_id } : {}) }, tenantId: g.tenantId })
  revalidar(produtoId); return { ok: true as const, atualizadas: alvo.length }
}

/** Exclui (Lixeira) várias aulas de uma vez. */
export async function excluirItensEmLoteAction(produtoId: string, ids: string[]) {
  const g = await guard(true); if ('error' in g) return { error: g.error }
  if (!Array.isArray(ids) || !ids.length) return { error: 'Selecione ao menos uma aula.' }
  const svc = createAdminClient()
  const alvo = await idsDoProduto(svc, g.tenantId, produtoId, ids)
  if (!alvo.length) return { error: 'Nenhuma das aulas selecionadas foi encontrada neste produto.' }
  const agora = new Date().toISOString()
  for (const c of chunks(alvo)) {
    const { error } = await svc.from('simulado_produto_modulo_itens').update({ deletado: true, deletado_em: agora, deletado_por: g.userId }).eq('tenant_id', g.tenantId).eq('produto_id', produtoId).in('id', c)
    if (error) return { error: error.message }
  }
  await registrarAudit({ operacao: 'DELETE', entidade: 'simulado_produto_modulo_itens', entidadeId: produtoId, depois: { lote: true, quantidade: alvo.length, ids: alvo }, tenantId: g.tenantId })
  revalidar(produtoId); return { ok: true as const, atualizadas: alvo.length }
}

// ── Ações EM LOTE no nível de MÓDULO (valem para as aulas do módulo e de seus submódulos) ──

/** Ids dos módulos escolhidos + todos os descendentes (do mesmo produto/tenant, fora da lixeira). */
async function modulosComDescendentes(svc: any, tenantId: string, produtoId: string, ids: string[]): Promise<{ raiz: string[]; todos: string[] }> {
  const { data } = await svc.from('simulado_produto_modulos').select('id, pai_id').eq('tenant_id', tenantId).eq('produto_id', produtoId).eq('deletado', false).limit(2000)
  const rows = (data ?? []) as { id: string; pai_id: string | null }[]
  const existentes = new Set(rows.map((r) => r.id))
  const raiz = [...new Set(ids)].filter((i) => existentes.has(i))
  const todos = new Set(raiz)
  let mudou = true
  while (mudou) { mudou = false; for (const r of rows) if (r.pai_id && todos.has(r.pai_id) && !todos.has(r.id)) { todos.add(r.id); mudou = true } }
  return { raiz, todos: [...todos] }
}

/** Ativar/rascunho e/ou disponibilidade em TODAS as aulas dos módulos escolhidos (e submódulos). */
export async function atualizarModulosEmLoteAction(produtoId: string, moduloIds: string[], patch: { situacao?: 'ativo' | 'rascunho'; disponibilidade?: Disponibilidade }) {
  const g = await guard(true); if ('error' in g) return { error: g.error }
  if (!Array.isArray(moduloIds) || !moduloIds.length) return { error: 'Selecione ao menos um módulo.' }
  const campos: any = {}
  if (patch.disponibilidade !== undefined) { const d = normalizarDisp(patch.disponibilidade); if (!d) return { error: 'Disponibilidade inválida (informe a data).' }; campos.disponibilidade = d }
  if (patch.situacao !== undefined) { if (!['ativo', 'rascunho'].includes(patch.situacao)) return { error: 'Situação inválida.' }; campos.situacao = patch.situacao }
  if (!Object.keys(campos).length) return { error: 'Nada para atualizar.' }
  const svc = createAdminClient()
  const { raiz, todos } = await modulosComDescendentes(svc, g.tenantId, produtoId, moduloIds)
  if (!raiz.length) return { error: 'Nenhum dos módulos selecionados foi encontrado neste produto.' }
  const agora = new Date().toISOString()
  let total = 0
  for (const c of chunks(todos)) {
    const { data, error } = await svc.from('simulado_produto_modulo_itens').update({ ...campos, atualizado_em: agora })
      .eq('tenant_id', g.tenantId).eq('produto_id', produtoId).eq('deletado', false).in('modulo_id', c).select('id')
    if (error) return { error: erroItem(error.message) }
    total += (data ?? []).length
  }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_produto_modulo_itens', entidadeId: produtoId, depois: { lote_modulos: true, modulos: raiz, aulas: total, ...campos }, tenantId: g.tenantId })
  revalidar(produtoId); return { ok: true as const, modulos: raiz.length, aulas: total }
}

/** CAPA em lote: aplica a mesma imagem (e a opção de ocultar o título) aos módulos escolhidos e, se `incluirSubmodulos`, a TODOS os submódulos
 *  dentro deles (qualquer nível). Aulas/conteúdos não têm capa própria — o que aparece no aluno é a capa do módulo/submódulo. */
export async function aplicarCapaEmLoteAction(produtoId: string, moduloIds: string[], capa: { imagem_url: string; ocultar_titulo?: boolean; incluirSubmodulos?: boolean }) {
  const g = await guard(true); if ('error' in g) return { error: g.error }
  if (!Array.isArray(moduloIds) || !moduloIds.length) return { error: 'Selecione ao menos um módulo.' }
  const url = String(capa?.imagem_url ?? '').trim()
  if (!url || url.length > 2000) return { error: 'Envie a imagem da capa.' }
  const svc = createAdminClient()
  const { raiz, todos } = await modulosComDescendentes(svc, g.tenantId, produtoId, moduloIds)
  if (!raiz.length) return { error: 'Nenhum dos módulos selecionados foi encontrado neste produto.' }
  const alvos = capa.incluirSubmodulos ? todos : raiz
  const campos: Record<string, unknown> = { imagem_url: url, atualizado_em: new Date().toISOString() }
  if (capa.ocultar_titulo !== undefined) campos.ocultar_titulo = !!capa.ocultar_titulo
  let total = 0
  for (const c of chunks(alvos)) {
    const { data, error } = await svc.from('simulado_produto_modulos').update(campos).eq('tenant_id', g.tenantId).eq('produto_id', produtoId).eq('deletado', false).in('id', c).select('id')
    if (error) return { error: error.message }
    total += (data ?? []).length
  }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_produto_modulos', entidadeId: produtoId, depois: { capa_em_lote: true, modulos: raiz, incluir_submodulos: !!capa.incluirSubmodulos, total, ocultar_titulo: campos.ocultar_titulo ?? null }, tenantId: g.tenantId })
  revalidar(produtoId); return { ok: true as const, modulos: raiz.length, total }
}

/** Exclui (Lixeira) vários módulos com seus submódulos e aulas. */
export async function excluirModulosEmLoteAction(produtoId: string, moduloIds: string[]) {
  const g = await guard(true); if ('error' in g) return { error: g.error }
  if (!Array.isArray(moduloIds) || !moduloIds.length) return { error: 'Selecione ao menos um módulo.' }
  const svc = createAdminClient()
  const { raiz, todos } = await modulosComDescendentes(svc, g.tenantId, produtoId, moduloIds)
  if (!raiz.length) return { error: 'Nenhum dos módulos selecionados foi encontrado neste produto.' }
  const now = new Date().toISOString()
  const marca = { deletado: true, deletado_em: now, deletado_por: g.userId }
  for (const c of chunks(todos)) {
    const a = await svc.from('simulado_produto_modulos').update(marca).eq('tenant_id', g.tenantId).eq('produto_id', produtoId).in('id', c)
    if (a.error) return { error: a.error.message }
    const b = await svc.from('simulado_produto_modulo_itens').update(marca).eq('tenant_id', g.tenantId).eq('produto_id', produtoId).in('modulo_id', c)
    if (b.error) return { error: b.error.message }
  }
  await registrarAudit({ operacao: 'DELETE', entidade: 'simulado_produto_modulos', entidadeId: produtoId, depois: { lote: true, modulos: raiz, total_modulos: todos.length }, tenantId: g.tenantId })
  revalidar(produtoId); return { ok: true as const, modulos: raiz.length }
}

// ── helpers ──
async function proximaOrdem(svc: any, tabela: string, match: Record<string, unknown>): Promise<number> {
  try {
    let q = svc.from(tabela).select('ordem')
    for (const [k, v] of Object.entries(match)) q = v === null ? q.is(k, null) : q.eq(k, v)
    const { data } = await q.order('ordem', { ascending: false }).limit(1)
    const max = (data?.[0] as any)?.ordem
    return typeof max === 'number' ? max + 1 : 0
  } catch { return 0 }
}
function erroModulo(m: string) { return /modulos|relation|does not exist|column/i.test(m) ? 'Currículo indisponível no banco. Aplique a migração 20261031030000.' : m }
function erroItem(m: string) { return /modulo_itens|relation|does not exist|column/i.test(m) ? 'Currículo indisponível no banco. Aplique a migração 20261031030000.' : m }
