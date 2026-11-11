import 'server-only'
// CAMADA DE DADOS de versões/presets da página do extensivo (server-only). Quem chama (actions-versoes.ts) faz a
// autorização; aqui tudo é filtrado por tenant_id. Tolerante à migração 20261113130000 ausente (`ausente: true`).
import { createAdminClient } from '@/lib/supabase/server'
import { normalizarPagina } from './normalizar'
import type { PaginaV1 } from './tipos'

const V = 'simulado_produto_pagina_versoes'
const P = 'simulado_pagina_presets'
export const MSG_MIGRACAO = 'Recurso indisponível até aplicar a migração 20261113130000 (pnpm migracoes aplicar).'
export const tabelaAusente = (e: any) => !!e && (e.code === '42P01' || e.code === 'PGRST205' || /does not exist|schema cache/i.test(e.message ?? ''))

export interface VersaoResumo {
  id: string; estado: 'publicado' | 'arquivado'; rotulo: string | null; autor: string | null
  criado_em: string; publicado_em: string | null; blocos: number
}
export interface PresetResumo {
  id: string; nome: string; descricao: string | null; global: boolean; autor: string | null; criado_em: string; blocos: number
}

const nBlocos = (b: unknown) => (Array.isArray(b) ? b.length : 0)

/** Nome (metadata.nome ou e-mail) dos autores — poucos ids por página, resolvidos em paralelo. */
async function nomesAutores(ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const svc = createAdminClient(); const m = new Map<string, string>()
  await Promise.all([...new Set(ids.filter((x): x is string => !!x))].map(async (uid) => {
    try {
      const { data } = await svc.auth.admin.getUserById(uid); const u = data?.user
      if (u) m.set(uid, ((u.user_metadata as any)?.nome as string) || u.email || '')
    } catch { /* ignora */ }
  }))
  return m
}

/** Versões publicada/arquivadas (mais recentes primeiro), paginadas no servidor (.range() + count). */
export async function listarVersoes(produtoId: string, o: { tenantId: string; pagina: number; pps: number }) {
  const pps = Math.min(Math.max(Math.floor(o.pps) || 10, 1), 50), pagina = Math.max(Math.floor(o.pagina) || 1, 1)
  const de = (pagina - 1) * pps
  const { data, error, count } = await createAdminClient().from(V)
    .select('id, estado, rotulo, criado_por, criado_em, publicado_em, blocos', { count: 'exact' })
    .eq('tenant_id', o.tenantId).eq('produto_id', produtoId).in('estado', ['publicado', 'arquivado'])
    .order('publicado_em', { ascending: false, nullsFirst: false }).order('id', { ascending: false }).range(de, de + pps - 1)
  if (error) return { ausente: tabelaAusente(error), erro: tabelaAusente(error) ? MSG_MIGRACAO : error.message, itens: [] as VersaoResumo[], total: 0 }
  const rows = (data ?? []) as any[]
  const nomes = await nomesAutores(rows.map((r) => r.criado_por))
  const itens: VersaoResumo[] = rows.map((r) => ({
    id: r.id, estado: r.estado, rotulo: r.rotulo ?? null, autor: r.criado_por ? nomes.get(r.criado_por) || null : null,
    criado_em: r.criado_em, publicado_em: r.publicado_em ?? null, blocos: nBlocos(r.blocos),
  }))
  return { ausente: false, erro: null as string | null, itens, total: count ?? itens.length }
}

/** Página de uma versão específica (qualquer estado) do produto. */
export async function lerPaginaDeVersao(produtoId: string, versaoId: string, tenantId: string): Promise<{ pagina: PaginaV1 } | { erro: string }> {
  const { data, error } = await createAdminClient().from(V).select('blocos, tema').eq('tenant_id', tenantId).eq('produto_id', produtoId).eq('id', versaoId).maybeSingle()
  if (error) return { erro: tabelaAusente(error) ? MSG_MIGRACAO : error.message }
  if (!data) return { erro: 'Versão não encontrada.' }
  return { pagina: normalizarPagina((data as any).blocos, (data as any).tema) }
}

/** Remove o ÚNICO rascunho do produto. Devolve se havia algo a remover. */
export async function removerRascunho(produtoId: string, tenantId: string): Promise<{ removido: boolean; id?: string } | { erro: string }> {
  const svc = createAdminClient()
  const ex = await svc.from(V).select('id').eq('tenant_id', tenantId).eq('produto_id', produtoId).eq('estado', 'rascunho').maybeSingle()
  if (ex.error) return { erro: tabelaAusente(ex.error) ? MSG_MIGRACAO : ex.error.message }
  if (!ex.data) return { removido: false }
  const del = await svc.from(V).delete().eq('id', (ex.data as any).id).eq('tenant_id', tenantId).eq('estado', 'rascunho')
  if (del.error) return { erro: del.error.message }
  return { removido: true, id: (ex.data as any).id }
}

/** Presets do tenant + globais (leitura), paginados. Globais primeiro. */
export async function listarPresets(o: { tenantId: string; pagina: number; pps: number }) {
  const pps = Math.min(Math.max(Math.floor(o.pps) || 10, 1), 50), pagina = Math.max(Math.floor(o.pagina) || 1, 1)
  const de = (pagina - 1) * pps
  const { data, error, count } = await createAdminClient().from(P)
    .select('id, tenant_id, nome, descricao, criado_por, criado_em, blocos', { count: 'exact' })
    .or(`tenant_id.eq.${o.tenantId},tenant_id.is.null`)
    .order('tenant_id', { ascending: true, nullsFirst: true }).order('criado_em', { ascending: false }).order('id', { ascending: false }).range(de, de + pps - 1)
  if (error) return { ausente: tabelaAusente(error), erro: tabelaAusente(error) ? MSG_MIGRACAO : error.message, itens: [] as PresetResumo[], total: 0 }
  const rows = (data ?? []) as any[]
  const nomes = await nomesAutores(rows.map((r) => r.criado_por))
  const itens: PresetResumo[] = rows.map((r) => ({
    id: r.id, nome: r.nome, descricao: r.descricao ?? null, global: !r.tenant_id, autor: r.criado_por ? nomes.get(r.criado_por) || null : null,
    criado_em: r.criado_em, blocos: nBlocos(r.blocos),
  }))
  return { ausente: false, erro: null as string | null, itens, total: count ?? itens.length }
}

/** Preset visível ao tenant (próprio ou global). */
export async function lerPreset(presetId: string, tenantId: string): Promise<{ pagina: PaginaV1; nome: string; global: boolean } | { erro: string }> {
  const { data, error } = await createAdminClient().from(P).select('nome, blocos, tema, tenant_id').eq('id', presetId).or(`tenant_id.eq.${tenantId},tenant_id.is.null`).maybeSingle()
  if (error) return { erro: tabelaAusente(error) ? MSG_MIGRACAO : error.message }
  if (!data) return { erro: 'Variação não encontrada.' }
  const d = data as any
  return { pagina: normalizarPagina(d.blocos, d.tema), nome: d.nome, global: !d.tenant_id }
}
