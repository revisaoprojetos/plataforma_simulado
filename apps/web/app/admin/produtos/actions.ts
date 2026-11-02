'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { getProdutoDetalhe, listarProdutos, listarMembrosProduto } from '@/lib/produtos/produtos'
import { concederProduto, revogarProduto } from '@/lib/produtos/conceder'
import type { Produto, ProdutoItem } from '@/lib/produtos/tipos'

async function guard(manage = false) {
  const access = await getCurrentAccess()
  const ok = access.isAdmin
    || access.permissions.includes(manage ? 'produtos:manage' : 'produtos:view')
    || access.permissions.includes('produtos:manage')
  if (!ok) return { error: 'Sem permissão.' as const }
  if (!access.tenantId) return { error: 'Tenant não resolvido — recarregue a página.' as const }
  return { tenantId: access.tenantId }
}

// ───────── leitura ─────────
export async function listarProdutosAction() {
  const g = await guard(); if ('error' in g) return { error: g.error }
  return { ok: true as const, produtos: await listarProdutos(g.tenantId) }
}
export async function getProdutoAction(id: string) {
  const g = await guard(); if ('error' in g) return { error: g.error }
  const produto = await getProdutoDetalhe(g.tenantId, id)
  if (!produto) return { error: 'Produto não encontrado.' }
  return { ok: true as const, produto, membros: await listarMembrosProduto(g.tenantId, id) }
}

// ───────── produto (geral) ─────────
export async function salvarProdutoAction(input: Partial<Produto> & { id?: string }) {
  const g = await guard(true); if ('error' in g) return { error: g.error }
  const svc = createAdminClient()
  const campos = {
    nome: (input.nome ?? '').trim(), tipo: input.tipo ?? 'extensivo', descricao: input.descricao ?? null,
    tier: input.tier ?? 'normal', validade_tipo: input.validade_tipo ?? 'vitalicio',
    validade_dias: input.validade_dias ?? null, validade_data: input.validade_data ?? null,
    ativo: input.ativo ?? true, atualizado_em: new Date().toISOString(),
    // Identidade visual (branding do produto).
    cor: input.cor ?? null, cor_secundaria: input.cor_secundaria ?? null, tema: input.tema ?? 'claro',
    logo_url: input.logo_url ?? null, capa_url: input.capa_url ?? null,
    banner_url: input.banner_url ?? null, banner_mobile_url: input.banner_mobile_url ?? null,
    gamificacao: input.gamificacao ?? false,
  }
  if (!campos.nome) return { error: 'Informe o nome do produto.' }
  if (input.id) {
    const { error } = await svc.from('simulado_produtos').update(campos).eq('id', input.id).eq('tenant_id', g.tenantId)
    if (error) return { error: error.message }
    await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_produtos', entidadeId: input.id, depois: campos, tenantId: g.tenantId })
    revalidatePath('/admin/produtos'); revalidatePath('/admin/conteudos/produtos'); return { ok: true as const, id: input.id }
  }
  // slug é NOT NULL no schema (tabela compartilhada com o módulo de regras). Gera a partir do nome
  // + sufixo curto p/ evitar colisão. Só no CREATE (editar o nome não muda o slug).
  const slug = (campos.nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'produto') + '-' + Math.random().toString(16).slice(2, 8)
  const { data, error } = await svc.from('simulado_produtos').insert({ ...campos, slug, tenant_id: g.tenantId }).select('id').single()
  if (error) return { error: error.message }
  await registrarAudit({ operacao: 'INSERT', entidade: 'simulado_produtos', entidadeId: (data as any).id, depois: campos, tenantId: g.tenantId })
  revalidatePath('/admin/produtos'); revalidatePath('/admin/conteudos/produtos'); return { ok: true as const, id: (data as any).id }
}

export async function excluirProdutoAction(id: string) {
  const g = await guard(true); if ('error' in g) return { error: g.error }
  const svc = createAdminClient()
  const { error } = await svc.from('simulado_produtos').delete().eq('id', id).eq('tenant_id', g.tenantId)
  if (error) return { error: error.message }
  await registrarAudit({ operacao: 'DELETE', entidade: 'simulado_produtos', entidadeId: id, tenantId: g.tenantId })
  revalidatePath('/admin/produtos'); return { ok: true as const }
}

// ───────── fontes (substitui o conjunto) ─────────
export async function salvarFontesAction(produtoId: string, fontes: { provider: string; fonte_ref: string | null; fonte_nome: string | null }[]) {
  const g = await guard(true); if ('error' in g) return { error: g.error }
  const svc = createAdminClient()
  await svc.from('simulado_produto_fontes').delete().eq('produto_id', produtoId).eq('tenant_id', g.tenantId)
  const rows = fontes.filter((f) => f.provider).map((f) => ({
    tenant_id: g.tenantId, produto_id: produtoId, provider: f.provider,
    fonte_ref: f.fonte_ref?.trim() || null, fonte_nome: f.fonte_nome?.trim() || null, ativo: true,
  }))
  if (rows.length) { const { error } = await svc.from('simulado_produto_fontes').insert(rows); if (error) return { error: error.message } }
  revalidatePath('/admin/produtos'); return { ok: true as const }
}

// ───────── itens (o que libera — substitui o conjunto) ─────────
export async function salvarItensAction(produtoId: string, itens: { tipo_item: string; item_id: string }[]) {
  const g = await guard(true); if ('error' in g) return { error: g.error }
  const svc = createAdminClient()
  await svc.from('simulado_produto_itens').delete().eq('produto_id', produtoId).eq('tenant_id', g.tenantId)
  const rows = itens.filter((i) => i.tipo_item && i.item_id).map((i) => ({
    tenant_id: g.tenantId, produto_id: produtoId, tipo_item: i.tipo_item, item_id: i.item_id, ativo: true,
  }))
  if (rows.length) { const { error } = await svc.from('simulado_produto_itens').insert(rows); if (error) return { error: error.message } }
  revalidatePath('/admin/produtos'); return { ok: true as const }
}

// ───────── vitrine (seções) — substitui o conjunto E deriva os itens de conteúdo liberados ─────────
type SecaoIn = { tipo: string; nome?: string | null; tamanho?: string; ordenacao?: string; config?: { imagem?: string; imagem_mobile?: string; link?: string; itens?: { tipo_item: string; item_id: string }[] } }
export async function salvarVitrineAction(produtoId: string, secoes: SecaoIn[]) {
  const g = await guard(true); if ('error' in g) return { error: g.error }
  const svc = createAdminClient()
  // 1) Substitui as seções (ordem = índice).
  await svc.from('simulado_produto_secoes').delete().eq('produto_id', produtoId).eq('tenant_id', g.tenantId)
  const rows = secoes.map((s, i) => ({
    tenant_id: g.tenantId, produto_id: produtoId, ordem: i, tipo: s.tipo === 'banner' ? 'banner' : 'carrossel',
    nome: s.nome?.trim() || null, tamanho: s.tamanho || 'vertical_small', ordenacao: s.ordenacao || 'manual',
    config: s.config ?? {}, ativo: true,
  }))
  if (rows.length) { const { error } = await svc.from('simulado_produto_secoes').insert(rows); if (error) return { error: error.message } }
  // 2) Deriva os itens de CONTEÚDO liberados (não-grupo) = união dos itens dos carrosséis. Mantém os
  //    grupos (geridos na aba Acesso) intactos — eles são "acesso", não "apresentação".
  const seen = new Set<string>(); const itens: { tipo_item: string; item_id: string }[] = []
  for (const s of secoes) if (s.tipo === 'carrossel') for (const it of (s.config?.itens ?? [])) {
    if (!it?.tipo_item || !it?.item_id || it.tipo_item === 'grupo') continue
    const k = `${it.tipo_item}:${it.item_id}`; if (seen.has(k)) continue; seen.add(k); itens.push({ tipo_item: it.tipo_item, item_id: it.item_id })
  }
  await svc.from('simulado_produto_itens').delete().eq('produto_id', produtoId).eq('tenant_id', g.tenantId).neq('tipo_item', 'grupo')
  if (itens.length) { const { error } = await svc.from('simulado_produto_itens').insert(itens.map((i) => ({ tenant_id: g.tenantId, produto_id: produtoId, tipo_item: i.tipo_item, item_id: i.item_id, ativo: true }))); if (error) return { error: error.message } }
  revalidatePath('/admin/produtos'); return { ok: true as const }
}

// ───────── acesso: grupos liberados (itens tipo 'grupo', separados da vitrine) ─────────
export async function salvarGruposAction(produtoId: string, grupoIds: string[]) {
  const g = await guard(true); if ('error' in g) return { error: g.error }
  const svc = createAdminClient()
  await svc.from('simulado_produto_itens').delete().eq('produto_id', produtoId).eq('tenant_id', g.tenantId).eq('tipo_item', 'grupo')
  const ids = [...new Set((grupoIds ?? []).filter(Boolean))]
  if (ids.length) { const { error } = await svc.from('simulado_produto_itens').insert(ids.map((item_id) => ({ tenant_id: g.tenantId, produto_id: produtoId, tipo_item: 'grupo', item_id, ativo: true }))); if (error) return { error: error.message } }
  revalidatePath('/admin/produtos'); return { ok: true as const }
}

// ───────── membros manuais ─────────
export async function adicionarMembrosAction(produtoId: string, emailsOuTexto: string) {
  const g = await guard(true); if ('error' in g) return { error: g.error }
  const svc = createAdminClient()
  const produto = await getProdutoDetalhe(g.tenantId, produtoId)
  if (!produto) return { error: 'Produto não encontrado.' }
  const emails = [...new Set((emailsOuTexto || '').split(/[\s,;]+/).map((s) => s.trim().toLowerCase()).filter(Boolean))]
  if (!emails.length) return { error: 'Informe ao menos um e-mail.' }
  let adicionados = 0; const naoEncontrados: string[] = []
  for (let i = 0; i < emails.length; i += 100) {
    const chunk = emails.slice(i, i + 100)
    const { data: ests } = await svc.from('simulado_estudantes').select('id, email').eq('tenant_id', g.tenantId).in('email', chunk)
    const achados = new Map((ests ?? []).map((e: any) => [String(e.email).toLowerCase(), e.id]))
    for (const email of chunk) {
      const estId = achados.get(email)
      if (!estId) { naoEncontrados.push(email); continue }
      await concederProduto(svc, g.tenantId, estId, produto as Produto, produto.itens as ProdutoItem[], { origem: 'manual' })
      adicionados++
    }
  }
  await registrarAudit({ operacao: 'INSERT', entidade: 'simulado_produtos', entidadeId: produtoId, depois: { membros_add: adicionados }, tenantId: g.tenantId })
  revalidatePath('/admin/produtos')
  return { ok: true as const, adicionados, naoEncontrados }
}

export async function removerMembroAction(produtoId: string, estudanteId: string) {
  const g = await guard(true); if ('error' in g) return { error: g.error }
  const svc = createAdminClient()
  const produto = await getProdutoDetalhe(g.tenantId, produtoId)
  if (!produto) return { error: 'Produto não encontrado.' }
  await revogarProduto(svc, g.tenantId, estudanteId, produto as Produto, produto.itens as ProdutoItem[])
  revalidatePath('/admin/produtos'); return { ok: true as const }
}

// ───────── pickers (recursos internos do tenant) ─────────
export async function listarRecursosAction() {
  const g = await guard(); if ('error' in g) return { error: g.error }
  const svc = createAdminClient()
  const [grupos, simulados, pastas, cronogramas] = await Promise.all([
    svc.from('simulado_grupos').select('id, nome').eq('tenant_id', g.tenantId).eq('deletado', false).order('nome'),
    svc.from('simulado_simulados').select('id, titulo').eq('tenant_id', g.tenantId).eq('deletado', false).order('titulo').limit(500),
    svc.from('simulado_pastas').select('id, nome, folder_area').eq('tenant_id', g.tenantId).eq('deletado', false).order('nome').limit(1000),
    svc.from('simulado_cronogramas').select('id, nome').eq('tenant_id', g.tenantId).eq('deletado', false).order('nome').limit(200),
  ])
  return {
    ok: true as const,
    grupos: (grupos.data ?? []).map((r: any) => ({ id: r.id, nome: r.nome })),
    simulados: (simulados.data ?? []).map((r: any) => ({ id: r.id, nome: r.titulo })),
    pastas: (pastas.data ?? []).map((r: any) => ({ id: r.id, nome: r.nome, area: r.folder_area ?? null })),
    cronogramas: (cronogramas.data ?? []).map((r: any) => ({ id: r.id, nome: r.nome })),
  }
}

// ───────── avisos por produto (Fase 2.3) ─────────
export async function listarAvisosAction(produtoId: string) {
  const g = await guard(); if ('error' in g) return { error: g.error }
  const svc = createAdminClient()
  const { data } = await svc.from('simulado_produto_avisos').select('id, titulo, corpo, fixado, ativo, criado_em').eq('tenant_id', g.tenantId).eq('produto_id', produtoId).order('fixado', { ascending: false }).order('criado_em', { ascending: false })
  return { ok: true as const, avisos: data ?? [] }
}

export async function salvarAvisoAction(produtoId: string, input: { id?: string; titulo: string; corpo?: string | null; fixado?: boolean; ativo?: boolean }) {
  const g = await guard(true); if ('error' in g) return { error: g.error }
  const svc = createAdminClient()
  const titulo = (input.titulo ?? '').trim()
  if (!titulo) return { error: 'Informe o título do aviso.' }
  const campos = { titulo, corpo: input.corpo?.trim() || null, fixado: input.fixado ?? false, ativo: input.ativo ?? true }
  if (input.id) {
    const { error } = await svc.from('simulado_produto_avisos').update(campos).eq('id', input.id).eq('tenant_id', g.tenantId)
    if (error) return { error: error.message }
  } else {
    const { error } = await svc.from('simulado_produto_avisos').insert({ ...campos, tenant_id: g.tenantId, produto_id: produtoId })
    if (error) return { error: error.message }
  }
  revalidatePath('/admin/produtos'); return { ok: true as const }
}

export async function excluirAvisoAction(id: string) {
  const g = await guard(true); if ('error' in g) return { error: g.error }
  const svc = createAdminClient()
  const { error } = await svc.from('simulado_produto_avisos').delete().eq('id', id).eq('tenant_id', g.tenantId)
  if (error) return { error: error.message }
  revalidatePath('/admin/produtos'); return { ok: true as const }
}
