import 'server-only'
import IORedis from 'ioredis'

/**
 * Cliente da API da Curseduca (prof.curseduca.pro).
 * Login (api_key + usuário/senha) → accessToken cacheado em MEMÓRIA + REDIS (quando REDIS_URL existe).
 * O cache no Redis é COMPARTILHADO entre réplicas do web → evita várias réplicas fazendo /login
 * ao mesmo tempo (a Curseduca bloqueia rajada de logins). Sem Redis, cai para memória (dev/single).
 * Endpoints: /login, /groups, /members?groupId=, /members/{id}, /groups/{id}/members.
 * Credenciais em env (CURSEDUCA_*). TODO futuro: mover para config por tenant.
 */

const BASE = process.env.CURSEDUCA_BASE_URL || 'https://prof.curseduca.pro'
const API_KEY = process.env.CURSEDUCA_API_KEY || ''
const USER = process.env.CURSEDUCA_USER || ''
const PASS = process.env.CURSEDUCA_PASS || ''

export function curseducaConfigurado() {
  return !!(API_KEY && USER && PASS)
}

// ── Cache de token: memória (rápido) + Redis (compartilhado, opcional) ──────────
type TokenCache = { token: string; exp: number }
let cache: TokenCache | null = null
const CHAVE_REDIS = 'curseduca:token'

let redis: IORedis | null = null
let redisResolvido = false
/** Conexão Redis lazy — SÓ se REDIS_URL existir. Erros são silenciados (fallback p/ memória). */
function getRedis(): IORedis | null {
  if (redisResolvido) return redis
  redisResolvido = true
  const url = process.env.REDIS_URL
  if (!url) return null
  try {
    redis = new IORedis(url, { maxRetriesPerRequest: 2, enableOfflineQueue: false, lazyConnect: false })
    redis.on('error', () => { /* Redis fora do ar → usa memória/login */ })
  } catch { redis = null }
  return redis
}

/** Invalida o token em memória E no Redis (usado quando a API responde 401). */
async function invalidarToken(): Promise<void> {
  cache = null
  const r = getRedis()
  if (r) { try { await r.del(CHAVE_REDIS) } catch { /* ignora */ } }
}

async function token(): Promise<string> {
  if (cache && cache.exp > Date.now() + 30_000) return cache.token

  // 1) Tenta o cache compartilhado no Redis (outra réplica pode já ter logado).
  const r = getRedis()
  if (r) {
    try {
      const raw = await r.get(CHAVE_REDIS)
      if (raw) {
        const j = JSON.parse(raw) as TokenCache
        if (j?.token && j.exp > Date.now() + 30_000) { cache = j; return j.token }
      }
    } catch { /* ignora → faz login */ }
  }

  // 2) Login na Curseduca.
  const resp = await fetch(`${BASE}/login`, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json', api_key: API_KEY },
    body: JSON.stringify({ username: USER, password: PASS, device: { app: { uuid: 'revisao' }, device: 'server', registrationToken: 'server' }, accessTokenValidity: 'string' }),
    cache: 'no-store',
  })
  if (!resp.ok) throw new Error(`Curseduca: login falhou (${resp.status})`)
  const j = await resp.json()
  if (!j.accessToken) throw new Error('Curseduca: resposta de login sem accessToken')
  const exp = j.expiresAt ? new Date(j.expiresAt).getTime() : Date.now() + 25 * 60_000
  cache = { token: j.accessToken, exp }

  // 3) Publica no Redis para as outras réplicas (TTL até expirar).
  if (r) {
    try { await r.set(CHAVE_REDIS, JSON.stringify(cache), 'EX', Math.max(60, Math.floor((exp - Date.now()) / 1000))) } catch { /* ignora */ }
  }
  return j.accessToken
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function api(path: string): Promise<any> {
  const fazer = async (t: string) => fetch(`${BASE}${path}`, { headers: { accept: 'application/json', api_key: API_KEY, Authorization: `Bearer ${t}` }, cache: 'no-store' })
  let ultimo = 0
  for (let tentativa = 0; tentativa < 4; tentativa++) {
    let r = await fazer(await token())
    if (r.status === 401) { await invalidarToken(); r = await fazer(await token()) } // token expirou → renova (uma vez)
    if (r.ok) return r.json()
    ultimo = r.status
    // Rate limit / indisponibilidade temporária → backoff exponencial com jitter e tenta de novo.
    if (r.status === 429 || r.status === 503 || r.status === 500) {
      await dormir(Math.min(8_000, 500 * 2 ** tentativa) + Math.floor(Math.random() * 250))
      continue
    }
    break // 404, 400, 401 persistente… não adianta repetir
  }
  throw new Error(`Curseduca ${path} (${ultimo})`)
}

export type GrupoCurseduca = { id: number; uuid: string; nome: string; criadoEm: string | null }
export type MembroCurseduca = {
  id: number
  nome: string
  email: string | null
  cpf: string | null
  telefone: string | null
  situacao: string | null       // ACTIVE / INACTIVE / …
  criadoEm: string | null       // data de cadastro na Curseduca (ENTRADA)
  ultimoAcesso: string | null
  cidade: string | null
  uf: string | null
}

/** Lista TODOS os grupos de acesso (pagina até acabar). São ~230 → poucas requisições. */
export async function listarTodosGrupos(): Promise<GrupoCurseduca[]> {
  const limit = 100
  let offset = 0
  const out: GrupoCurseduca[] = []
  for (let p = 0; p < 30; p++) {
    const j = await api(`/groups?limit=${limit}&offset=${offset}`)
    const data = (j.data ?? []) as any[]
    out.push(...data.map((g) => ({ id: g.id, uuid: g.uuid, nome: g.name ?? '', criadoEm: g.createdAt ?? null })))
    if (!j.metadata?.hasMore || data.length === 0) break
    offset += limit
  }
  return out
}

export type MatriculaGrupo = { entrouEm: string | null; expiraEm: string | null }

/**
 * Mapa de matrícula por membro no grupo via `/groups/{id}/members`, que traz
 * `enteredAt` (entrada no grupo) e `expiresAt` (null = vitalício, ou data de expiração).
 * Retorna Map<idMembro, {entrouEm, expiraEm}>.
 */
export async function mapaMatriculasGrupo(groupId: number, maxPaginas = 100): Promise<Map<number, MatriculaGrupo>> {
  const limit = 200
  let offset = 0
  const mapa = new Map<number, MatriculaGrupo>()
  for (let p = 0; p < maxPaginas; p++) {
    const j = await api(`/groups/${groupId}/members?limit=${limit}&offset=${offset}`)
    const data = (j.data ?? []) as any[]
    for (const x of data) mapa.set(x.id, { entrouEm: x.enteredAt ?? null, expiraEm: x.expiresAt ?? null })
    if (!j.metadata?.hasMore || data.length === 0) break
    offset += limit
  }
  return mapa
}

/** Nº de membros de um grupo (rápido — 1 requisição). */
export async function contarMembros(groupId: number): Promise<number> {
  const j = await api(`/members?groupId=${groupId}&limit=1&offset=0`)
  return j.metadata?.totalCount ?? 0
}

const soDigitos = (s?: string | null) => (s ? String(s).replace(/\D/g, '') : '')
const fmtTelefone = (p: any): string | null => {
  if (!p) return null
  const t = [p.countryCode, p.areaCode, p.number].map((x) => soDigitos(x)).join('')
  return t || null
}
/** CPF: `document` pode vir como string (detalhe) ou objeto {value} — tolerante. */
const extrairCpf = (doc: any): string | null =>
  doc == null ? null : (typeof doc === 'string' ? (soDigitos(doc) || null) : (soDigitos(doc?.value) || null))
/** Telefone: `phone` vem como string ("+null null undefined" quando vazio) ou objeto. */
const extrairTelefone = (p: any): string | null =>
  p == null ? null : (typeof p === 'string' ? (soDigitos(p) || null) : fmtTelefone(p))

const mapMembro = (m: any): MembroCurseduca => ({
  id: m.id,
  nome: (m.name ?? '').trim(),
  email: (m.email ?? '').trim().toLowerCase() || null,
  cpf: extrairCpf(m.document),
  telefone: extrairTelefone(m.phone),
  situacao: m.situation ?? null,
  criadoEm: m.createdAt ?? null,
  ultimoAcesso: m.lastAccess ?? null,
  cidade: m.address?.city ?? null,
  uf: m.address?.state ?? null,
})

/** Lista TODOS os membros de um grupo (paginando). Cap de segurança em maxPaginas. */
export async function listarMembrosDoGrupo(groupId: number, maxPaginas = 100): Promise<MembroCurseduca[]> {
  const limit = 200
  let offset = 0
  const out: MembroCurseduca[] = []
  for (let p = 0; p < maxPaginas; p++) {
    const j = await api(`/members?groupId=${groupId}&limit=${limit}&offset=${offset}`)
    const data = (j.data ?? []) as any[]
    out.push(...data.map(mapMembro))
    if (!j.metadata?.hasMore || data.length === 0) break
    offset += limit
  }
  return out
}

export type DetalheMembro = { ok: boolean; cpf: string | null; telefone: string | null; gruposNomes: string[] }

/** Detalhe do membro (`/members/{id}`): CPF (`document`), telefone (`phone`) e nomes dos grupos. `ok=false` se a busca falhou. */
export async function detalheMembro(id: number): Promise<DetalheMembro> {
  try {
    const j = await api(`/members/${id}`)
    const m = j?.data ?? j
    const gruposNomes = Array.isArray(m?.groups)
      ? m.groups.map((g: any) => g?.group?.name ?? g?.name).filter(Boolean) as string[]
      : []
    return { ok: true, cpf: extrairCpf(m?.document), telefone: extrairTelefone(m?.phone), gruposNomes }
  } catch {
    return { ok: false, cpf: null, telefone: null, gruposNomes: [] }
  }
}

/** Executa `fn` sobre `items` com concorrência limitada (evita rajada que dispara rate limit). */
async function comLimite<T, R>(items: T[], limite: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let i = 0
  async function worker() {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx]) }
  }
  await Promise.all(Array.from({ length: Math.min(limite, items.length) }, worker))
  return out
}

let cacheContagens: { at: number; dados: Record<number, number> } | null = null

/** Conta membros de vários grupos (concorrência limitada + cache de 5 min). */
export async function contarMuitosGrupos(ids: number[]): Promise<Record<number, number>> {
  const agora = Date.now()
  if (cacheContagens && agora - cacheContagens.at < 5 * 60_000) {
    if (ids.every((id) => id in cacheContagens!.dados)) return cacheContagens.dados
  }
  const dados: Record<number, number> = { ...(cacheContagens?.dados ?? {}) }
  await comLimite(ids, 10, async (id) => { try { dados[id] = await contarMembros(id) } catch { /* mantém ausente */ } })
  cacheContagens = { at: agora, dados }
  return dados
}
