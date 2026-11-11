'use server'

// AÇÕES de versões/presets da página do extensivo (P4): publicar (rótulo + sincronização de itens liberados), comparar,
// histórico, restaurar como rascunho, descartar, variações salvas (presets). produtos:manage + service role + tenant_id +
// auditoria + revalidate. Leituras: produtos:view|manage. Tolerante à migração 20261113130000 ausente.
// 'use server': só funções async exportadas (tipos ficam em versoes.ts/tipos.ts).

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { accessCan, getCurrentAccess } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { carregarPaginaProduto, lerVersao } from './loader'
import { publicarRascunho, salvarRascunho } from './actions-base'
import { normalizarPagina } from './normalizar'
import { MSG_MIGRACAO, listarPresets as listarPresetsDb, listarVersoes as listarVersoesDb, lerPaginaDeVersao, lerPreset, removerRascunho, tabelaAusente } from './versoes'
import type { PaginaV1 } from './tipos'

const V = 'simulado_produto_pagina_versoes'
const P = 'simulado_pagina_presets'
const MAX_PRESETS = 100

async function guard(manage: boolean) {
  const access = await getCurrentAccess()
  if (!accessCan(access, 'produtos:manage') && !(!manage && accessCan(access, 'produtos:view'))) return { error: 'Sem permissão.' as const }
  if (!access.tenantId) return { error: 'Tenant não resolvido — recarregue a página.' as const }
  return { tenantId: access.tenantId, userId: access.userId }
}
async function produtoExiste(tenantId: string, produtoId: string) {
  const { data } = await createAdminClient().from('simulado_produtos').select('id').eq('tenant_id', tenantId).eq('id', produtoId).maybeSingle()
  return !!data
}

type ItemLib = { tipo_item: string; item_id: string }
function itensDosCarrosseis(p: PaginaV1): ItemLib[] {
  const seen = new Set<string>(); const out: ItemLib[] = []
  for (const b of p.blocos) if (b.tipo === 'carrossel') for (const it of b.conteudo.itens) {
    if (!it?.tipo_item || !it?.item_id || it.tipo_item === 'grupo') continue
    const k = `${it.tipo_item}:${it.item_id}`; if (seen.has(k)) continue; seen.add(k); out.push({ tipo_item: it.tipo_item, item_id: it.item_id })
  }
  return out
}

// ───────────────────────── publicar / comparar ─────────────────────────

/** Rascunho × publicado (ou legado) para o diálogo de publicação. NÃO grava. O diff é calculado no cliente com diffPaginas. */
export async function compararParaPublicar(produtoId: string) {
  const g = await guard(false); if ('error' in g) return { error: g.error }
  if (!(await produtoExiste(g.tenantId, produtoId))) return { error: 'Produto não encontrado.' }
  const rasc = await lerVersao(g.tenantId, produtoId, 'rascunho')
  const pub = await carregarPaginaProduto(produtoId, { estado: 'publicado', tenantId: g.tenantId })
  return {
    ok: true as const,
    temRascunho: !!rasc,
    rascunho: rasc ? normalizarPagina(rasc.blocos, rasc.tema) : null,
    publicado: pub.pagina,
    publicadoOrigem: pub.origem,
  }
}

/**
 * Publica o rascunho com rótulo opcional (publicado anterior → arquivado) e SINCRONIZA os itens liberados
 * (simulado_produto_itens, não-grupo) a partir dos carrosséis — mesma regra da ação v0: só re-deriva se há ou havia
 * carrosséis, para não apagar itens liberados por outras vias.
 */
export async function publicarPagina(produtoId: string, rotulo?: string) {
  const g = await guard(true); if ('error' in g) return { error: g.error }
  const svc = createAdminClient()
  if (!(await produtoExiste(g.tenantId, produtoId))) return { error: 'Produto não encontrado.' }
  const rasc = await lerVersao(g.tenantId, produtoId, 'rascunho')
  if (!rasc) return { error: 'Não há rascunho para publicar.' }
  const nova = normalizarPagina(rasc.blocos, rasc.tema)

  // havia carrosséis? (versão publicada anterior OU legado v0)
  const anterior = await lerVersao(g.tenantId, produtoId, 'publicado')
  let haviaCarrossel = !!anterior && normalizarPagina(anterior.blocos, anterior.tema).blocos.some((b) => b.tipo === 'carrossel')
  if (!haviaCarrossel) {
    const { data } = await svc.from('simulado_produto_secoes').select('id').eq('tenant_id', g.tenantId).eq('produto_id', produtoId).eq('tipo', 'carrossel').limit(1)
    haviaCarrossel = (data ?? []).length > 0
  }

  const r = await publicarRascunho(produtoId, rotulo)
  if ('error' in r) return r

  let itensSincronizados: number | null = null
  const haCarrossel = nova.blocos.some((b) => b.tipo === 'carrossel')
  if (haCarrossel || haviaCarrossel) {
    const itens = itensDosCarrosseis(nova)
    const del = await svc.from('simulado_produto_itens').delete().eq('produto_id', produtoId).eq('tenant_id', g.tenantId).neq('tipo_item', 'grupo')
    if (del.error) return { ok: true as const, versaoId: r.versaoId, itensSincronizados, aviso: `Publicado, mas os itens liberados não foram sincronizados: ${del.error.message}` }
    if (itens.length) {
      const ins = await svc.from('simulado_produto_itens').insert(itens.map((i) => ({ tenant_id: g.tenantId, produto_id: produtoId, tipo_item: i.tipo_item, item_id: i.item_id, ativo: true })))
      if (ins.error) return { ok: true as const, versaoId: r.versaoId, itensSincronizados, aviso: `Publicado, mas os itens liberados não foram sincronizados: ${ins.error.message}` }
    }
    itensSincronizados = itens.length
    await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_produto_itens', entidadeId: produtoId, depois: { origem: 'publicacao_pagina', itens: itens.length }, tenantId: g.tenantId })
  }
  return { ok: true as const, versaoId: r.versaoId, itensSincronizados, aviso: null as string | null }
}

// ───────────────────────── histórico ─────────────────────────

export async function listarVersoes(produtoId: string, pagina = 1, pps = 10) {
  const g = await guard(false); if ('error' in g) return { error: g.error }
  if (!(await produtoExiste(g.tenantId, produtoId))) return { error: 'Produto não encontrado.' }
  const r = await listarVersoesDb(produtoId, { tenantId: g.tenantId, pagina, pps })
  if (r.erro) return { error: r.erro }
  return { ok: true as const, itens: r.itens, total: r.total }
}

/** Carrega uma versão do histórico como RASCUNHO (substitui o rascunho atual). Devolve a página para o editor. */
export async function restaurarVersaoComoRascunho(produtoId: string, versaoId: string) {
  const g = await guard(true); if ('error' in g) return { error: g.error }
  if (!(await produtoExiste(g.tenantId, produtoId))) return { error: 'Produto não encontrado.' }
  const v = await lerPaginaDeVersao(produtoId, versaoId, g.tenantId)
  if ('erro' in v) return { error: v.erro }
  const r = await salvarRascunho(produtoId, v.pagina)
  if ('error' in r) return r
  await registrarAudit({ operacao: 'UPDATE', entidade: V, entidadeId: r.versaoId ?? produtoId, depois: { produto_id: produtoId, restaurado_de: versaoId, estado: 'rascunho' }, tenantId: g.tenantId })
  return { ok: true as const, pagina: r.pagina }
}

/** Descarta o rascunho: o editor volta ao publicado (ou à derivação legada). Devolve a página resultante. */
export async function descartarRascunho(produtoId: string) {
  const g = await guard(true); if ('error' in g) return { error: g.error }
  if (!(await produtoExiste(g.tenantId, produtoId))) return { error: 'Produto não encontrado.' }
  const r = await removerRascunho(produtoId, g.tenantId)
  if ('erro' in r) return { error: r.erro }
  if (r.removido) await registrarAudit({ operacao: 'DELETE', entidade: V, entidadeId: r.id ?? produtoId, antes: { produto_id: produtoId, estado: 'rascunho' }, tenantId: g.tenantId })
  const c = await carregarPaginaProduto(produtoId, { estado: 'rascunho', tenantId: g.tenantId })
  revalidatePath(`/admin/conteudos/produtos/${produtoId}`)
  return { ok: true as const, pagina: c.pagina, removido: r.removido }
}

// ───────────────────────── variações salvas (presets) ─────────────────────────

const limpar = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max)

export async function listarPresets(pagina = 1, pps = 10) {
  const g = await guard(false); if ('error' in g) return { error: g.error }
  const r = await listarPresetsDb({ tenantId: g.tenantId, pagina, pps })
  if (r.erro) return { error: r.erro }
  return { ok: true as const, itens: r.itens, total: r.total }
}

/** Salva a página informada (normalizada no servidor) como variação do tenant. */
export async function salvarPreset(nome: string, descricao: string, pagina: unknown) {
  const g = await guard(true); if ('error' in g) return { error: g.error }
  const n = limpar(nome, 80); if (!n) return { error: 'Informe um nome para a variação.' }
  const svc = createAdminClient()
  const c = await svc.from(P).select('id', { count: 'exact', head: true }).eq('tenant_id', g.tenantId)
  if (c.error) return { error: tabelaAusente(c.error) ? MSG_MIGRACAO : c.error.message }
  if ((c.count ?? 0) >= MAX_PRESETS) return { error: `Limite de ${MAX_PRESETS} variações salvas atingido. Exclua alguma antes.` }
  const p = normalizarPagina(pagina)
  const ins = await svc.from(P).insert({ tenant_id: g.tenantId, nome: n, descricao: limpar(descricao, 300) || null, blocos: p.blocos as any, tema: (p.tema ?? {}) as any, criado_por: g.userId }).select('id').maybeSingle()
  if (ins.error) return { error: tabelaAusente(ins.error) ? MSG_MIGRACAO : ins.error.message }
  const id = (ins.data as any)?.id as string | undefined
  await registrarAudit({ operacao: 'INSERT', entidade: P, entidadeId: id ?? null, depois: { nome: n, blocos: p.blocos.length }, tenantId: g.tenantId })
  return { ok: true as const, id: id ?? null }
}

/** Aplica o preset POR CIMA do rascunho do produto (módulos inexistentes no produto são descartados pela validação do rascunho). */
export async function aplicarPreset(produtoId: string, presetId: string) {
  const g = await guard(true); if ('error' in g) return { error: g.error }
  if (!(await produtoExiste(g.tenantId, produtoId))) return { error: 'Produto não encontrado.' }
  const pr = await lerPreset(presetId, g.tenantId)
  if ('erro' in pr) return { error: pr.erro }
  const r = await salvarRascunho(produtoId, pr.pagina)
  if ('error' in r) return r
  await registrarAudit({ operacao: 'UPDATE', entidade: V, entidadeId: r.versaoId ?? produtoId, depois: { produto_id: produtoId, preset_aplicado: presetId, nome: pr.nome, estado: 'rascunho' }, tenantId: g.tenantId })
  return { ok: true as const, pagina: r.pagina }
}

/** Renomeia (e opcionalmente re-descreve) uma variação do PRÓPRIO tenant. Globais são só leitura. */
export async function renomearPreset(presetId: string, nome: string, descricao?: string) {
  const g = await guard(true); if ('error' in g) return { error: g.error }
  const n = limpar(nome, 80); if (!n) return { error: 'Informe um nome.' }
  const svc = createAdminClient()
  const ex = await svc.from(P).select('id, nome').eq('id', presetId).eq('tenant_id', g.tenantId).maybeSingle()
  if (ex.error) return { error: tabelaAusente(ex.error) ? MSG_MIGRACAO : ex.error.message }
  if (!ex.data) return { error: 'Variação não encontrada (variações globais não podem ser alteradas).' }
  const upd: Record<string, unknown> = { nome: n }; if (descricao !== undefined) upd.descricao = limpar(descricao, 300) || null
  const { error } = await svc.from(P).update(upd).eq('id', presetId).eq('tenant_id', g.tenantId)
  if (error) return { error: error.message }
  await registrarAudit({ operacao: 'UPDATE', entidade: P, entidadeId: presetId, antes: { nome: (ex.data as any).nome }, depois: { nome: n }, tenantId: g.tenantId })
  return { ok: true as const }
}

export async function excluirPreset(presetId: string) {
  const g = await guard(true); if ('error' in g) return { error: g.error }
  const svc = createAdminClient()
  const ex = await svc.from(P).select('id, nome').eq('id', presetId).eq('tenant_id', g.tenantId).maybeSingle()
  if (ex.error) return { error: tabelaAusente(ex.error) ? MSG_MIGRACAO : ex.error.message }
  if (!ex.data) return { error: 'Variação não encontrada (variações globais não podem ser excluídas).' }
  const { error } = await svc.from(P).delete().eq('id', presetId).eq('tenant_id', g.tenantId)
  if (error) return { error: error.message }
  await registrarAudit({ operacao: 'DELETE', entidade: P, entidadeId: presetId, antes: { nome: (ex.data as any).nome }, tenantId: g.tenantId })
  return { ok: true as const }
}
