import 'server-only'
import { propagarGrupoAosBancos } from '@/lib/simulado/propagar-grupo'
import { matricularEmSimuladosDoBanco } from '@/lib/simulado/matricular-banco'
import type { Produto, ProdutoItem, AssinaturaOrigem, ItemTipo } from './tipos'
import { ITENS_PASTA } from './tipos'

/**
 * CONCESSÃO de um produto a um aluno — materializa o acesso nas tabelas que JÁ existem (nenhum gate
 * novo em runtime). Reaproveita a mecânica provada: grupo→bancos (propagarGrupoAosBancos), pasta→
 * pasta_estudantes + matrícula nos simulados vivos, simulado→matrícula, cronograma→matrícula.
 * banco/biblioteca_pasta/desafio são todos `simulado_pastas` → mesmo caminho.
 * `origem` ('integracao' | 'manual') carimba as linhas p/ revogação segura (nunca apaga acesso manual).
 */

function expiraDe(p: Produto): string | null {
  if (p.validade_tipo === 'data_fixa') return p.validade_data ?? null
  if (p.validade_tipo === 'dias' && p.validade_dias && p.validade_dias > 0) {
    return new Date(Date.now() + p.validade_dias * 86400_000).toISOString()
  }
  return null // vitalicio
}

/** Insere uma linha se ainda não existe (idempotente). `origem` cai p/ sem-coluna com tolerância. */
async function inserirSeAusente(svc: any, table: string, match: Record<string, unknown>, extra: Record<string, unknown>, origem?: string) {
  try {
    let q = svc.from(table).select('id')
    for (const [k, v] of Object.entries(match)) q = q.eq(k, v)
    const { data } = await q.maybeSingle()
    if (data) return
    const row = { ...match, ...extra }
    if (origem) {
      const r = await svc.from(table).insert({ ...row, origem })
      if (r.error && /origem|column/i.test(r.error.message)) await svc.from(table).insert(row)
    } else {
      await svc.from(table).insert(row)
    }
  } catch { /* concessão best-effort, nunca derruba o fluxo */ }
}

/** Materializa UM item do produto para UM aluno. */
export async function concederItem(svc: any, tenantId: string, estudanteId: string, tipo: ItemTipo, itemId: string, origem: AssinaturaOrigem) {
  if (tipo === 'grupo') {
    await inserirSeAusente(svc, 'simulado_grupo_membros', { tenant_id: tenantId, grupo_id: itemId, estudante_id: estudanteId }, {}, origem)
    await propagarGrupoAosBancos(svc, tenantId, itemId, [estudanteId], origem)
    return
  }
  if (ITENS_PASTA.includes(tipo)) {
    await inserirSeAusente(svc, 'simulado_pasta_estudantes', { tenant_id: tenantId, pasta_id: itemId, estudante_id: estudanteId }, {}, origem)
    try { await matricularEmSimuladosDoBanco(svc, tenantId, itemId, [estudanteId]) } catch { /* best-effort */ }
    return
  }
  if (tipo === 'simulado') {
    await inserirSeAusente(svc, 'simulado_matriculas', { tenant_id: tenantId, simulado_id: itemId, estudante_id: estudanteId }, { liberado: true }, origem)
    return
  }
  if (tipo === 'cronograma') {
    await inserirSeAusente(svc, 'simulado_cronograma_matriculas', { tenant_id: tenantId, cronograma_id: itemId, estudante_id: estudanteId }, { liberado: true, status: 'ativa' }, origem)
    return
  }
  // biblioteca_doc: liberação por DOCUMENTO fica p/ fase seguinte (hoje o acesso da Biblioteca é por PASTA).
}

/** Concede o produto inteiro (itens + tier) e registra/atualiza a assinatura. Idempotente. */
export async function concederProduto(
  svc: any,
  tenantId: string,
  estudanteId: string,
  produto: Produto,
  itens: ProdutoItem[],
  opts: { origem: AssinaturaOrigem; provider?: string; fonteRef?: string | null; externalId?: string },
) {
  for (const it of itens) {
    if (it.ativo === false) continue
    await concederItem(svc, tenantId, estudanteId, it.tipo_item, it.item_id, opts.origem)
  }
  // Tier → classificacao do estudante (gates já leem a coluna). Só eleva (não rebaixa aqui).
  if (produto.tier && produto.tier !== 'normal') {
    try { await svc.from('simulado_estudantes').update({ classificacao: produto.tier }).eq('id', estudanteId).eq('tenant_id', tenantId) } catch { /* best-effort */ }
  }
  // Assinatura (ciclo de vida). external_id sintético p/ manual; UNIQUE(provider, external_id).
  const provider = opts.provider ?? (opts.origem === 'manual' ? 'manual' : 'curseduca')
  const externalId = opts.externalId ?? `produto:${produto.id}:${estudanteId}`
  const row = {
    tenant_id: tenantId, estudante_id: estudanteId, provider, produto_id: produto.id,
    produto_ref: opts.fonteRef ?? produto.id, external_id: externalId, origem: opts.origem,
    status: 'ativo', inicio_em: new Date().toISOString(), expira_em: expiraDe(produto), atualizado_em: new Date().toISOString(),
  }
  try {
    const r = await svc.from('simulado_assinaturas').upsert(row, { onConflict: 'provider,external_id' })
    if (r.error && /produto_id|origem|column/i.test(r.error.message)) {
      const { produto_id, origem, ...semNovas } = row
      await svc.from('simulado_assinaturas').upsert(semNovas, { onConflict: 'provider,external_id' })
    }
  } catch { /* best-effort */ }
}

/**
 * Itens (tipo:item_id) que OUTRA FONTE ATIVA do aluno ainda concede — p/ não revogar o que outro
 * produto garante. Considera DUAS origens de concessão por produto:
 *  - assinaturas ativas (fonte/manual) — `simulado_assinaturas.produto_id`;
 *  - concessões de REGRA ativas (webhook de venda) — `simulado_access_grants` status='active'.
 * A união dos itens dos produtos dessas duas fontes é o que NÃO pode ser removido.
 */
export async function cobertosPorOutros(svc: any, tenantId: string, estudanteId: string, produtoIdExcluir: string): Promise<Set<string>> {
  const cob = new Set<string>()
  try {
    const outros = new Set<string>()
    const { data: ass } = await svc.from('simulado_assinaturas').select('produto_id').eq('tenant_id', tenantId).eq('estudante_id', estudanteId).eq('status', 'ativo')
    for (const a of (ass ?? []) as any[]) if (a.produto_id && a.produto_id !== produtoIdExcluir) outros.add(a.produto_id)
    try {
      const { data: grants } = await svc.from('simulado_access_grants').select('produto_id').eq('tenant_id', tenantId).eq('estudante_id', estudanteId).eq('status', 'active')
      for (const g of (grants ?? []) as any[]) if (g.produto_id && g.produto_id !== produtoIdExcluir) outros.add(g.produto_id)
    } catch { /* tabela de grants pode não existir (migração pendente) */ }
    if (!outros.size) return cob
    const { data: itens } = await svc.from('simulado_produto_itens').select('tipo_item, item_id').eq('tenant_id', tenantId).in('produto_id', [...outros]).eq('ativo', true)
    for (const it of (itens ?? []) as any[]) cob.add(`${it.tipo_item}:${it.item_id}`)
  } catch { /* se falhar, não cobre nada (revoga só o que for seguro) */ }
  return cob
}

/** Remove a linha de acesso materializada por um item — só a que veio por integração/produto. */
export async function revogarItem(svc: any, tenantId: string, estudanteId: string, tipo: ItemTipo, itemId: string) {
  const del = async (table: string, match: Record<string, unknown>) => {
    try {
      const r = await svc.from(table).delete().match({ ...match, origem: 'integracao' })
      if (r.error && /origem|column/i.test(r.error.message)) await svc.from(table).delete().match(match)
    } catch { /* best-effort */ }
  }
  if (tipo === 'grupo') return del('simulado_grupo_membros', { tenant_id: tenantId, grupo_id: itemId, estudante_id: estudanteId })
  if (ITENS_PASTA.includes(tipo)) return del('simulado_pasta_estudantes', { tenant_id: tenantId, pasta_id: itemId, estudante_id: estudanteId })
  if (tipo === 'simulado') return del('simulado_matriculas', { tenant_id: tenantId, simulado_id: itemId, estudante_id: estudanteId })
  if (tipo === 'cronograma') return del('simulado_cronograma_matriculas', { tenant_id: tenantId, cronograma_id: itemId, estudante_id: estudanteId })
}

/** Revoga o produto de um aluno: marca a assinatura e remove o acesso que NENHUM outro produto ativo garante. */
export async function revogarProduto(svc: any, tenantId: string, estudanteId: string, produto: Produto, itens: ProdutoItem[]) {
  // Encerra a assinatura deste produto.
  try { await svc.from('simulado_assinaturas').update({ status: 'cancelado', atualizado_em: new Date().toISOString() }).eq('tenant_id', tenantId).eq('estudante_id', estudanteId).eq('produto_id', produto.id).eq('status', 'ativo') } catch { /* best-effort */ }
  const coberto = await cobertosPorOutros(svc, tenantId, estudanteId, produto.id)
  for (const it of itens) {
    if (coberto.has(`${it.tipo_item}:${it.item_id}`)) continue
    await revogarItem(svc, tenantId, estudanteId, it.tipo_item, it.item_id)
  }
}
