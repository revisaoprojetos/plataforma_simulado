import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import { temAcessoEfetivo } from '@/lib/integracoes/liberacao/motor'

/**
 * ACESSO EFETIVO por aluno — união das DUAS origens de concessão a produtos:
 *  - REGRAS de venda  → simulado_access_grants (status scheduled/active/expired/revoked, datas da regra)
 *  - CATÁLOGO/manual  → simulado_assinaturas (status ativo/cancelado/..., origem integracao/manual)
 * Deduplica por produto e resolve status/validade usando a MESMA regra de "ativo" do motor
 * (temAcessoEfetivo). Só leitura; tolerante a tabelas/colunas ausentes (migrações pendentes).
 */

export type OrigemAcesso = 'regra' | 'integracao' | 'manual'
export type StatusAcesso = 'active' | 'scheduled' | 'expired' | 'revoked'

export interface AcessoProdutoAluno {
  produtoId: string
  nome: string
  tier: string | null
  status: StatusAcesso
  inicioEm: string | null
  fimEm: string | null // null = vitalício
  origens: OrigemAcesso[]
  temAcesso: boolean
}

const ms = (d: string | null | undefined): number | null => { if (!d) return null; const t = +new Date(d); return isNaN(t) ? null : t }

export async function acessoEfetivoDoEstudante(tenantId: string, estudanteId: string): Promise<AcessoProdutoAluno[]> {
  const svc = createAdminClient()
  const agora = new Date()
  const nowMs = +agora

  let grants: any[] = []
  try {
    const r = await svc.from('simulado_access_grants').select('produto_id, status, inicio_em, fim_em').eq('tenant_id', tenantId).eq('estudante_id', estudanteId)
    grants = r.data ?? []
  } catch { /* tabela ausente */ }
  let ass: any[] = []
  try {
    const r = await svc.from('simulado_assinaturas').select('produto_id, status, origem, inicio_em, expira_em').eq('tenant_id', tenantId).eq('estudante_id', estudanteId).not('produto_id', 'is', null)
    ass = r.data ?? []
  } catch { /* coluna produto_id ausente */ }

  const byProd = new Map<string, { grants: any[]; ass: any[] }>()
  for (const g of grants) { if (!g.produto_id) continue; const e = byProd.get(g.produto_id) ?? { grants: [], ass: [] }; e.grants.push(g); byProd.set(g.produto_id, e) }
  for (const a of ass) { if (!a.produto_id) continue; const e = byProd.get(a.produto_id) ?? { grants: [], ass: [] }; e.ass.push(a); byProd.set(a.produto_id, e) }
  const ids = [...byProd.keys()]
  if (!ids.length) return []

  const meta = new Map<string, { nome: string; tier: string | null }>()
  try {
    const { data } = await svc.from('simulado_produtos').select('id, nome, tier').in('id', ids)
    for (const p of data ?? []) meta.set(p.id, { nome: p.nome, tier: (p as any).tier ?? null })
  } catch { /* colunas ricas podem não existir ainda */ }

  const out: AcessoProdutoAluno[] = []
  for (const [pid, src] of byProd) {
    const grantsAtivos = temAcessoEfetivo(src.grants.map((g) => ({ status: g.status, startsAt: g.inicio_em, endsAt: g.fim_em })), agora)
    const assAtiva = src.ass.some((a) => (a.status ?? '').toLowerCase() === 'ativo' && (ms(a.expira_em) == null || ms(a.expira_em)! > nowMs) && (ms(a.inicio_em) == null || ms(a.inicio_em)! <= nowMs))
    const temAcesso = grantsAtivos || assAtiva

    const origens = new Set<OrigemAcesso>()
    if (src.grants.length) origens.add('regra')
    for (const a of src.ass) origens.add((a.origem ?? '') === 'manual' ? 'manual' : 'integracao')

    let status: StatusAcesso
    if (temAcesso) status = 'active'
    else {
      const agendado = src.grants.some((g) => g.status === 'scheduled' && ms(g.inicio_em) != null && ms(g.inicio_em)! > nowMs)
        || src.ass.some((a) => (a.status ?? '').toLowerCase() === 'ativo' && ms(a.inicio_em) != null && ms(a.inicio_em)! > nowMs)
      const revogado = src.grants.some((g) => g.status === 'revoked') || src.ass.some((a) => ['cancelado', 'reembolsado'].includes((a.status ?? '').toLowerCase()))
      status = agendado ? 'scheduled' : revogado ? 'revoked' : 'expired'
    }

    // Janela efetiva: entre as fontes relevantes (ativas, se há acesso; senão todas) — menor início, maior fim.
    const janelas = [
      ...src.grants.map((g) => ({ inicio: g.inicio_em as string | null, fim: g.fim_em as string | null, ativa: temAcessoEfetivo([{ status: g.status, startsAt: g.inicio_em, endsAt: g.fim_em }], agora) })),
      ...src.ass.map((a) => ({ inicio: a.inicio_em as string | null, fim: a.expira_em as string | null, ativa: (a.status ?? '').toLowerCase() === 'ativo' && (ms(a.expira_em) == null || ms(a.expira_em)! > nowMs) })),
    ]
    const relev = temAcesso ? janelas.filter((j) => j.ativa) : janelas
    let inicioEm: string | null = null, fimEm: string | null = null, vitalicio = false
    for (const j of relev) {
      if (j.inicio && (inicioEm == null || ms(j.inicio)! < ms(inicioEm)!)) inicioEm = j.inicio
      if (!j.fim) vitalicio = true
      else if (fimEm == null || ms(j.fim)! > ms(fimEm)!) fimEm = j.fim
    }

    const m = meta.get(pid)
    out.push({ produtoId: pid, nome: m?.nome ?? 'Produto', tier: m?.tier ?? null, status, inicioEm, fimEm: vitalicio ? null : fimEm, origens: [...origens], temAcesso })
  }
  out.sort((a, b) => (Number(b.temAcesso) - Number(a.temAcesso)) || a.nome.localeCompare(b.nome))
  return out
}

/** Resumo em lote (para a coluna da lista): nº de produtos com acesso ATIVO por estudante. Barato (chunk 80). */
export async function resumoAcessoLote(tenantId: string, estudanteIds: string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {}
  const ids = [...new Set((estudanteIds ?? []).filter(Boolean))]
  if (!ids.length) return out
  const svc = createAdminClient()
  const nowMs = Date.now()
  const porAluno = new Map<string, Set<string>>()
  const add = (est: string, prod: string) => { const s = porAluno.get(est) ?? new Set<string>(); s.add(prod); porAluno.set(est, s) }

  try {
    for (let i = 0; i < ids.length; i += 80) {
      const { data } = await svc.from('simulado_access_grants').select('estudante_id, produto_id, inicio_em, fim_em').eq('tenant_id', tenantId).eq('status', 'active').in('estudante_id', ids.slice(i, i + 80))
      for (const g of data ?? []) { if (g.produto_id && (ms(g.inicio_em) == null || ms(g.inicio_em)! <= nowMs) && (ms(g.fim_em) == null || ms(g.fim_em)! > nowMs)) add(g.estudante_id, g.produto_id) }
    }
  } catch { /* ausente */ }
  try {
    for (let i = 0; i < ids.length; i += 80) {
      const { data } = await svc.from('simulado_assinaturas').select('estudante_id, produto_id, expira_em').eq('tenant_id', tenantId).eq('status', 'ativo').not('produto_id', 'is', null).in('estudante_id', ids.slice(i, i + 80))
      for (const a of data ?? []) { if (a.produto_id && (ms(a.expira_em) == null || ms(a.expira_em)! > nowMs)) add(a.estudante_id, a.produto_id) }
    }
  } catch { /* ausente */ }

  for (const id of ids) out[id] = porAluno.get(id)?.size ?? 0
  return out
}
