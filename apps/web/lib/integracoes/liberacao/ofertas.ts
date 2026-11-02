import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import type { FimConfig, RegraFiltros } from './tipos'

/**
 * OFERTA FINA do Estúdio de Conteúdo (decidido: "fino sobre regras de liberação").
 * ------------------------------------------------------------------------------
 * Uma OFERTA é, no modelo real, uma **regra de liberação** (`simulado_liberacao_regras`)
 * marcada por `oferta = true` que AGRUPA produtos (`simulado_liberacao_regra_produtos`) para
 * liberação. SEM preço/checkout/cupom — só agrupamento + janela de acesso. Reusa integralmente as
 * tabelas e o motor de liberação; não duplica Guru/Curseduca.
 *
 * Tudo aqui é tolerante: se a migração de regras (ou a coluna `oferta`) ainda não rodou, as
 * leituras degradam para vazio e as escritas retornam um erro amigável. server-only; recebe tenantId.
 */

const COLUNA_AUSENTE = /oferta|descricao|column|does not exist|relation|schema cache/i

export interface OfertaAdmin {
  id: string
  nome: string
  descricao: string | null
  status: 'active' | 'paused' | 'canceled'
  produtoIds: string[]
  produtoNomes: string[]
  fim: FimConfig
  grantsAtivos: number
  criadoEm: string | null
}

/** Lista as ofertas (regras com `oferta=true`). Tolerante → [] se o schema não suporta. */
export async function listarOfertas(tenantId: string): Promise<OfertaAdmin[]> {
  const svc = createAdminClient()
  let regras: any[] = []
  try {
    const { data, error } = await svc.from('simulado_liberacao_regras')
      .select('id, nome, descricao, status, fim, criado_em')
      .eq('tenant_id', tenantId).eq('oferta', true)
      .order('criado_em', { ascending: false })
    if (error) { if (COLUNA_AUSENTE.test(error.message)) return []; throw error }
    regras = data ?? []
  } catch (e: any) {
    if (COLUNA_AUSENTE.test(e?.message ?? String(e))) return []
    throw e
  }
  if (!regras.length) return []

  const ids = regras.map((r) => r.id)
  const rp = await svc.from('simulado_liberacao_regra_produtos').select('regra_id, produto_id').in('regra_id', ids).then((r) => r.data ?? [], () => [])
  let grants: any[] = []
  try {
    const r = await svc.from('simulado_access_grants').select('regra_id').eq('tenant_id', tenantId).eq('status', 'active').in('regra_id', ids)
    grants = r.data ?? []
  } catch { /* tabela ausente */ }

  const prodIds = [...new Set((rp as any[]).map((x) => x.produto_id))]
  const nomeProd = new Map<string, string>()
  if (prodIds.length) {
    const { data: prods } = await svc.from('simulado_produtos').select('id, nome').in('id', prodIds)
    for (const p of prods ?? []) nomeProd.set(p.id, p.nome)
  }
  const prodsPorRegra = new Map<string, string[]>()
  for (const x of rp as any[]) { const a = prodsPorRegra.get(x.regra_id) ?? []; a.push(x.produto_id); prodsPorRegra.set(x.regra_id, a) }
  const grantsPorRegra = new Map<string, number>()
  for (const g of grants) if (g.regra_id) grantsPorRegra.set(g.regra_id, (grantsPorRegra.get(g.regra_id) ?? 0) + 1)

  return regras.map((r: any) => {
    const pids = prodsPorRegra.get(r.id) ?? []
    return {
      id: r.id, nome: r.nome, descricao: r.descricao ?? null, status: (r.status ?? 'active') as OfertaAdmin['status'],
      produtoIds: pids, produtoNomes: pids.map((pid) => nomeProd.get(pid) ?? pid),
      fim: (r.fim ?? { tipo: 'lifetime' }) as FimConfig, grantsAtivos: grantsPorRegra.get(r.id) ?? 0,
      criadoEm: r.criado_em ?? null,
    }
  })
}

/** Carrega UMA oferta (para o editor). Tolerante → null. */
export async function obterOferta(tenantId: string, id: string): Promise<OfertaAdmin | null> {
  const svc = createAdminClient()
  try {
    const { data, error } = await svc.from('simulado_liberacao_regras')
      .select('id, nome, descricao, status, fim, criado_em')
      .eq('tenant_id', tenantId).eq('id', id).eq('oferta', true).maybeSingle()
    if (error) { if (COLUNA_AUSENTE.test(error.message)) return null; throw error }
    if (!data) return null
    const rp = await svc.from('simulado_liberacao_regra_produtos').select('produto_id').eq('regra_id', id).then((r) => r.data ?? [], () => [])
    const pids = (rp as any[]).map((x) => x.produto_id)
    const nomeProd = new Map<string, string>()
    if (pids.length) { const { data: prods } = await svc.from('simulado_produtos').select('id, nome').in('id', pids); for (const p of prods ?? []) nomeProd.set(p.id, p.nome) }
    let grantsAtivos = 0
    try { const { count } = await svc.from('simulado_access_grants').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('regra_id', id).eq('status', 'active'); grantsAtivos = count ?? 0 } catch { /* ausente */ }
    return {
      id: data.id, nome: data.nome, descricao: (data as any).descricao ?? null, status: ((data as any).status ?? 'active') as OfertaAdmin['status'],
      produtoIds: pids, produtoNomes: pids.map((pid) => nomeProd.get(pid) ?? pid),
      fim: ((data as any).fim ?? { tipo: 'lifetime' }) as FimConfig, grantsAtivos, criadoEm: (data as any).criado_em ?? null,
    }
  } catch (e: any) {
    if (COLUNA_AUSENTE.test(e?.message ?? String(e))) return null
    throw e
  }
}

export interface SalvarOfertaInput {
  id?: string
  nome: string
  descricao?: string | null
  produtoIds: string[]
  fim: FimConfig
  publicar?: boolean // true = status 'active'; false/omitido = rascunho ('paused')
}

/**
 * Cria/atualiza uma oferta. A regra casa por NOME da oferta (`filtros.ofertas`) para que uma venda
 * dessa oferta conceda o bundle; o início é imediato e o fim vem da config. Escreve de forma
 * tolerante (degrada removendo colunas ausentes). Retorna erro amigável se o schema não existir.
 */
export async function salvarOfertaDb(
  tenantId: string, userId: string | null, input: SalvarOfertaInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const svc = createAdminClient()
  const nome = (input.nome ?? '').trim()
  if (!nome) return { ok: false, error: 'Informe o nome da oferta.' }
  if (!input.produtoIds?.length) return { ok: false, error: 'Selecione ao menos um produto para a oferta.' }

  const filtros: RegraFiltros = { plataformas: [], produtos: [], ofertas: [{ tipo: 'nome', valor: nome, modo: 'igual' }], periodoDe: null, periodoAte: null, aplicarATudo: false }
  const campos: any = {
    tenant_id: tenantId, nome, descricao: input.descricao?.trim() || null, oferta: true,
    status: input.publicar ? 'active' : 'paused', prioridade: 100,
    filtros, inicio: { tipo: 'immediate' }, fim: input.fim ?? { tipo: 'lifetime' },
    atualizado_em: new Date().toISOString(),
  }

  // Insert/update tolerante: remove colunas ausentes (oferta/descricao) e tenta de novo.
  async function gravar(obj: any): Promise<{ id?: string; error?: string }> {
    for (let i = 0; i < 4; i++) {
      if (input.id) {
        const { error } = await svc.from('simulado_liberacao_regras').update(obj).eq('id', input.id).eq('tenant_id', tenantId)
        if (!error) return { id: input.id }
        const falta = /\boferta\b/.test(error.message) ? 'oferta' : /descricao/.test(error.message) ? 'descricao' : null
        if (!falta) return { error: error.message }
        if (falta === 'oferta') return { error: 'Ofertas indisponíveis: aplique a migração 20261031040001_liberacao_oferta.' }
        delete obj[falta]
      } else {
        const r = await svc.from('simulado_liberacao_regras').insert({ ...obj, criado_por: userId }).select('id').single()
        if (!r.error) return { id: r.data!.id }
        const m = r.error.message
        if (/relation|does not exist/i.test(m) && /liberacao_regras/i.test(m)) return { error: 'Ofertas indisponíveis: aplique a migração de regras de liberação (20261030000001) e de oferta (20261031040001).' }
        const falta = /\boferta\b/.test(m) ? 'oferta' : /descricao/.test(m) ? 'descricao' : null
        if (!falta) return { error: m }
        if (falta === 'oferta') return { error: 'Ofertas indisponíveis: aplique a migração 20261031040001_liberacao_oferta.' }
        delete obj[falta]
      }
    }
    return { error: 'Falha ao salvar a oferta.' }
  }

  const res = await gravar(campos)
  if (res.error || !res.id) return { ok: false, error: res.error ?? 'Falha ao salvar a oferta.' }
  const regraId = res.id

  // Sincroniza os produtos (mesmo contrato do admin de Regras).
  await svc.from('simulado_liberacao_regra_produtos').delete().eq('regra_id', regraId).eq('tenant_id', tenantId)
  if (input.produtoIds.length) {
    const { error } = await svc.from('simulado_liberacao_regra_produtos').insert(input.produtoIds.map((pid) => ({ tenant_id: tenantId, regra_id: regraId, produto_id: pid })))
    if (error) return { ok: false, error: error.message }
  }
  return { ok: true, id: regraId }
}
