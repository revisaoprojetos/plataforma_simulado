import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { chaveSemantica } from './disciplina-semantica'

/**
 * Resolve uma entrada de taxonomia (disciplina/banca/órgão) por NOME — a ÚNICA implementação usada pelas importações.
 *
 * Por que existe (bug "importar cria disciplina duplicada"): os resolvedores antigos faziam
 * `.ilike('nome', n).maybeSingle()`. Isso (1) não casa acento/espaço diferente ("Direito Tributário" × "Direito Tributario"),
 * (2) trata `%`/`_` do nome como curinga e, pior, (3) quando JÁ existem 2 iguais o `maybeSingle` devolve erro → parecia que
 * "não existe" e o código CRIAVA UMA TERCEIRA, multiplicando as duplicadas e quebrando os vínculos (pasta/cronograma/questões).
 *
 * Aqui: chave normalizada (sem acento, minúscula, espaços colapsados), escolha DETERMINÍSTICA da "canônica" quando há várias
 * (a que já tem classificação/ordem/vínculos e a mais antiga) e criação só se realmente não houver nenhuma.
 */

export type TabelaTaxonomia = 'simulado_bancas' | 'simulado_orgaos' | 'simulado_disciplinas'

/** Chave de comparação: sem acento, minúscula, espaços colapsados. */
export function chaveNome(s: string): string {
  return (s ?? '').normalize('NFD').replace(/[̀-ͯ​-‍﻿]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

interface Linha { id: string; nome: string; classificacao?: string | null; ordem?: number | null; created_at?: string | null }

/** Entre homônimas, a "canônica": tem classificação > tem ordem > mais antiga > menor id (estável). */
export function escolherCanonica<T extends Linha>(linhas: T[]): T {
  return [...linhas].sort((a, b) => {
    const ca = a.classificacao ? 0 : 1, cb = b.classificacao ? 0 : 1; if (ca !== cb) return ca - cb
    const oa = a.ordem != null ? 0 : 1, ob = b.ordem != null ? 0 : 1; if (oa !== ob) return oa - ob
    const ta = a.created_at ? Date.parse(a.created_at) : Infinity, tb = b.created_at ? Date.parse(b.created_at) : Infinity
    if (ta !== tb) return ta - tb
    return String(a.id).localeCompare(String(b.id))
  })[0]
}

// Cache curto por (tenant, tabela): uma importação chama isto por linha da planilha. Atualizado ao criar/aprender.
interface Entrada { t: number; porChave: Map<string, Linha[]>; porSem: Map<string, Linha[]>; aliases: Map<string, string> }
const CACHE = new Map<string, Entrada>()
const TTL_MS = 15_000

async function carregar(svc: SupabaseClient, table: TabelaTaxonomia, tenantId: string): Promise<Entrada> {
  const k = `${tenantId}:${table}`
  const hit = CACHE.get(k)
  if (hit && Date.now() - hit.t < TTL_MS) return hit
  const colunas = table === 'simulado_disciplinas' ? ['id, nome, classificacao, ordem, created_at', 'id, nome, created_at', 'id, nome'] : ['id, nome, created_at', 'id, nome']
  let rows: Linha[] = []
  for (const cols of colunas) {
    try { rows = (await fetchAll<Linha>(() => (svc.from(table).select(cols) as any).eq('tenant_id', tenantId).order('id', { ascending: true }))) ?? []; break }
    catch { rows = [] }
  }
  const porChave = new Map<string, Linha[]>(), porSem = new Map<string, Linha[]>()
  for (const r of rows) {
    const c = chaveNome(r.nome); if (!c) continue
    const a = porChave.get(c) ?? []; a.push(r); porChave.set(c, a)
    if (table === 'simulado_disciplinas') { const sk = chaveSemantica(r.nome); if (sk) { const b = porSem.get(sk) ?? []; b.push(r); porSem.set(sk, b) } }
  }
  // aliases (nomes já unificados numa disciplina) — só disciplinas; tabela ausente (migração pendente) = sem aliases
  const aliases = new Map<string, string>()
  if (table === 'simulado_disciplinas') {
    try {
      const ids = new Set(rows.map((r) => r.id))
      const al = (await fetchAll<{ alias_norm: string; disciplina_id: string }>(() => (svc.from('simulado_disciplina_aliases').select('alias_norm, disciplina_id') as any).eq('tenant_id', tenantId).order('alias_norm', { ascending: true }))) ?? []
      for (const a of al) if (ids.has(a.disciplina_id)) aliases.set(a.alias_norm, a.disciplina_id)
    } catch { /* sem a tabela */ }
  }
  const e: Entrada = { t: Date.now(), porChave, porSem, aliases }
  CACHE.set(k, e)
  return e
}

/** Casa o nome com o que já existe: 1) nome exato normalizado; 2) alias já decidido; 3) mesma disciplina por chave SEMÂNTICA. */
function procurar(e: Entrada, table: TabelaTaxonomia, n: string): { id: string; via: 'exato' | 'alias' | 'semantica' } | null {
  const chave = chaveNome(n)
  const exatas = e.porChave.get(chave)
  if (table !== 'simulado_disciplinas') return exatas?.length ? { id: escolherCanonica(exatas).id, via: 'exato' } : null
  if (exatas?.length) {
    // já existem variantes da MESMA disciplina (ex.: "Direito Tributário" e "Direito Tributário - verificar")? importa p/ a canônica
    const sk0 = chaveSemantica(n)
    const grupo = sk0 ? e.porSem.get(sk0) : undefined
    return { id: escolherCanonica(grupo && grupo.length > exatas.length ? grupo : exatas).id, via: 'exato' }
  }
  const al = e.aliases.get(chave)
  if (al) return { id: al, via: 'alias' }
  const sk = chaveSemantica(n)
  const sem = sk ? e.porSem.get(sk) : undefined
  if (sem?.length) return { id: escolherCanonica(sem).id, via: 'semantica' }
  return null
}

// Chamadas CONCORRENTES do mesmo nome (a importação processa linhas em paralelo) dividem UMA só resolução: sem isto, N linhas com a
// mesma disciplina nova liam "não existe" ao mesmo tempo e cada uma inseria a sua — duplicada com texto IDÊNTICO.
// (Entre instâncias do servidor quem garante é o índice único do banco — migração 20261105030000 — + o relê abaixo.)
const EM_VOO = new Map<string, Promise<string | null>>()

/**
 * id da entrada com esse nome; cria só se NÃO existir nem como nome exato, nem como alias, nem como a mesma disciplina escrita de
 * outro jeito (disciplinas: "Processo Civil" ≡ "Direito Processual Civil"). `null` = nome vazio/erro.
 * Ao casar por alias/semântica, o nome novo é gravado como alias da existente → a decisão fica "aprendida".
 */
export function resolverTaxonomiaPorNome(
  svc: SupabaseClient, table: TabelaTaxonomia, tenantId: string, nome?: string | null,
  opc: { criar?: boolean } = {},
): Promise<string | null> {
  const chave = chaveNome(nome ?? '')
  if (!chave) return Promise.resolve(null)
  const k = `${tenantId}:${table}:${chave}:${opc.criar === false ? 'ro' : 'rw'}`
  const emVoo = EM_VOO.get(k)
  if (emVoo) return emVoo
  const p = resolverUnico(svc, table, tenantId, nome, opc).finally(() => EM_VOO.delete(k))
  EM_VOO.set(k, p)
  return p
}

async function resolverUnico(
  svc: SupabaseClient, table: TabelaTaxonomia, tenantId: string, nome?: string | null,
  opc: { criar?: boolean } = {},
): Promise<string | null> {
  const n = (nome ?? '').replace(/\s+/g, ' ').trim()
  if (!n) return null
  const chave = chaveNome(n)
  let e = await carregar(svc, table, tenantId)
  const achou = procurar(e, table, n)
  if (achou) {
    if (achou.via === 'semantica' && opc.criar !== false) {
      // aprende: esse texto passa a apontar p/ a disciplina existente (próxima importação resolve direto, sem recalcular)
      e.aliases.set(chave, achou.id)
      void Promise.resolve(svc.from('simulado_disciplina_aliases').upsert({ tenant_id: tenantId, alias_norm: chave, disciplina_id: achou.id, alias_texto: n }, { onConflict: 'tenant_id,alias_norm' })).then(() => {}, () => {})
    }
    return achou.id
  }
  if (opc.criar === false) return null

  const { data: cr, error } = await svc.from(table).insert({ nome: n, tenant_id: tenantId }).select('id').single()
  if (error || !cr) {
    // corrida (outra instância criou agora) ou índice único: invalida o cache e relê
    CACHE.delete(`${tenantId}:${table}`)
    e = await carregar(svc, table, tenantId)
    return procurar(e, table, n)?.id ?? null
  }
  const id = (cr as { id: string }).id
  const novo: Linha = { id, nome: n, created_at: new Date().toISOString() }
  e.porChave.set(chave, [...(e.porChave.get(chave) ?? []), novo])
  if (table === 'simulado_disciplinas') { const sk = chaveSemantica(n); if (sk) e.porSem.set(sk, [...(e.porSem.get(sk) ?? []), novo]) }
  return id
}

/** Mapa nome-normalizado → id (canônica) de TODAS as disciplinas do tenant — p/ importadores que só casam (não criam).
 *  `get()` também resolve alias e "mesma disciplina escrita de outro jeito" (cronograma: "Processo Civil" → "Direito Processual Civil"). */
export class MapaDisciplinas extends Map<string, string> {
  constructor(private readonly e: Entrada) { super() }
  override get(chave: string): string | undefined {
    const direto = super.get(chave)
    if (direto) return direto
    const a = this.e.aliases.get(chaveNome(chave)); if (a) return a
    const sk = chaveSemantica(chave)
    const sem = sk ? this.e.porSem.get(sk) : undefined
    return sem?.length ? escolherCanonica(sem).id : undefined
  }
}
export async function indiceDisciplinasCanonicas(svc: SupabaseClient, tenantId: string): Promise<Map<string, string>> {
  const e = await carregar(svc, 'simulado_disciplinas', tenantId)
  const out = new MapaDisciplinas(e)
  for (const [k, linhas] of e.porChave) out.set(k, escolherCanonica(linhas).id)
  return out
}
