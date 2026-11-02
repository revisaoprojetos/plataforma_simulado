import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import { concederProduto } from './conceder'
import type { Produto, ProdutoDetalhe, ProdutoFonte, ProdutoItem, ProdutoSecao } from './tipos'

const COLS = 'id, nome, slug, tipo, descricao, tier, validade_tipo, validade_dias, validade_data, ativo, cor, cor_secundaria, tema, logo_url, capa_url, banner_url, banner_mobile_url, gamificacao, ordem'

/** Lista os produtos do tenant com a contagem de membros ativos (assinaturas status='ativo'). */
export async function listarProdutos(tenantId: string): Promise<(Produto & { membros: number; fontes: number; itens: number })[]> {
  const svc = createAdminClient()
  const { data: prods } = await svc.from('simulado_produtos').select(COLS).eq('tenant_id', tenantId).order('ordem', { ascending: true }).order('nome', { ascending: true })
  const lista = (prods ?? []) as Produto[]
  if (!lista.length) return []
  const ids = lista.map((p) => p.id)
  const [{ data: ass }, { data: fontes }, { data: itens }] = await Promise.all([
    svc.from('simulado_assinaturas').select('produto_id').eq('tenant_id', tenantId).eq('status', 'ativo').in('produto_id', ids),
    svc.from('simulado_produto_fontes').select('produto_id').eq('tenant_id', tenantId).in('produto_id', ids),
    svc.from('simulado_produto_itens').select('produto_id').eq('tenant_id', tenantId).in('produto_id', ids),
  ])
  const tally = (rows: any[] | null | undefined) => {
    const m = new Map<string, number>()
    for (const r of rows ?? []) m.set(r.produto_id, (m.get(r.produto_id) ?? 0) + 1)
    return m
  }
  const mA = tally(ass), mF = tally(fontes), mI = tally(itens)
  return lista.map((p) => ({ ...p, membros: mA.get(p.id) ?? 0, fontes: mF.get(p.id) ?? 0, itens: mI.get(p.id) ?? 0 }))
}

/** Produto + fontes + itens + nº de membros. null se não existe no tenant. */
export async function getProdutoDetalhe(tenantId: string, id: string): Promise<ProdutoDetalhe | null> {
  const svc = createAdminClient()
  const { data: p } = await svc.from('simulado_produtos').select(COLS).eq('tenant_id', tenantId).eq('id', id).maybeSingle()
  if (!p) return null
  const [{ data: fontes }, { data: itens }, { data: secoes }, { count }] = await Promise.all([
    svc.from('simulado_produto_fontes').select('id, produto_id, provider, fonte_ref, fonte_nome, ativo').eq('tenant_id', tenantId).eq('produto_id', id),
    svc.from('simulado_produto_itens').select('id, produto_id, tipo_item, item_id, permissoes, ativo').eq('tenant_id', tenantId).eq('produto_id', id),
    svc.from('simulado_produto_secoes').select('id, produto_id, ordem, tipo, nome, tamanho, ordenacao, config, ativo').eq('tenant_id', tenantId).eq('produto_id', id).order('ordem', { ascending: true }),
    svc.from('simulado_assinaturas').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('produto_id', id).eq('status', 'ativo'),
  ])
  return { ...(p as Produto), fontes: (fontes ?? []) as ProdutoFonte[], itens: (itens ?? []) as ProdutoItem[], secoes: (secoes ?? []) as ProdutoSecao[], membros: count ?? 0 }
}

/** Membros de um produto (assinaturas) com nome/email e origem/validade. */
export async function listarMembrosProduto(tenantId: string, produtoId: string) {
  const svc = createAdminClient()
  const { data } = await svc
    .from('simulado_assinaturas')
    .select('estudante_id, status, origem, inicio_em, expira_em, estudante:simulado_estudantes(nome, email)')
    .eq('tenant_id', tenantId).eq('produto_id', produtoId)
    .order('inicio_em', { ascending: false })
  return (data ?? []).map((r: any) => ({
    estudante_id: r.estudante_id,
    nome: r.estudante?.nome ?? '—',
    email: r.estudante?.email ?? '',
    status: r.status as string,
    origem: (r.origem ?? 'integracao') as string,
    inicio_em: r.inicio_em as string | null,
    expira_em: r.expira_em as string | null,
  }))
}

/**
 * HOOK de integração: quando um aluno ENTRA por uma fonte (grupo Curseduca / produto Guru), aplica os
 * produtos que têm aquela fonte. Aditivo e idempotente — roda DEPOIS do fluxo de concessão existente,
 * sem substituí-lo. Fast-path: sem produto_fontes casando, não faz nada.
 */
export async function aplicarProdutosPorFonte(svc: any, tenantId: string, provider: string, fonteRef: string, estudanteIds: string[]): Promise<void> {
  const ids = [...new Set((estudanteIds ?? []).filter(Boolean))]
  if (!ids.length || !fonteRef) return
  try {
    const { data: fontes } = await svc.from('simulado_produto_fontes').select('produto_id').eq('tenant_id', tenantId).eq('provider', provider).eq('fonte_ref', fonteRef).eq('ativo', true)
    const prodIds = [...new Set((fontes ?? []).map((f: any) => f.produto_id).filter(Boolean))] as string[]
    if (!prodIds.length) return
    for (const pid of prodIds) {
      const { data: p } = await svc.from('simulado_produtos').select(COLS).eq('tenant_id', tenantId).eq('id', pid).eq('ativo', true).maybeSingle()
      if (!p) continue
      const { data: itens } = await svc.from('simulado_produto_itens').select('id, produto_id, tipo_item, item_id, permissoes, ativo').eq('tenant_id', tenantId).eq('produto_id', pid)
      for (const estudanteId of ids) {
        await concederProduto(svc, tenantId, estudanteId, p as Produto, (itens ?? []) as ProdutoItem[], {
          origem: 'integracao', provider, fonteRef, externalId: `produto:${pid}:${estudanteId}`,
        })
      }
    }
  } catch { /* hook nunca derruba o import */ }
}
