import 'server-only'
import IORedis from 'ioredis'
import { createHash } from 'node:crypto'

/**
 * Cliente da API da Curseduca (prof.curseduca.pro).
 * Credenciais são POR TENANT: cada chamada recebe um `CurseducaCfg` (base/apiKey/user/pass).
 * O `resolverCfg` das actions lê a config do tenant no banco e cai para o `.env` (CURSEDUCA_*)
 * quando o tenant não tem config própria — assim funciona multi-cliente e mantém compat.
 * Login (api_key + usuário/senha) → accessToken cacheado em MEMÓRIA + REDIS (por tenant),
 * evitando várias réplicas fazendo /login ao mesmo tempo (a Curseduca bloqueia rajada).
 * Endpoints: /login, /groups, /members?groupId=, /members/{id}, /groups/{id}/members.
 */

export type CurseducaCfg = { base: string; apiKey: string; user: string; pass: string }

/** Teto por request à Curseduca — evita pendurar a UI se a API não responder (rede/firewall). */
const TIMEOUT_MS = 15_000

/** Config global do .env (fallback quando o tenant não tem credenciais próprias). */
export function configDoEnv(): CurseducaCfg | null {
  const apiKey = process.env.CURSEDUCA_API_KEY || ''
  const user = process.env.CURSEDUCA_USER || ''
  const pass = process.env.CURSEDUCA_PASS || ''
  if (!(apiKey && user && pass)) return null
  return { base: process.env.CURSEDUCA_BASE_URL || 'https://prof.curseduca.pro', apiKey, user, pass }
}

// ── Cache de token por tenant (chave = hash da apiKey): memória + Redis opcional ──
type TokenCache = { token: string; exp: number }
const cacheMem = new Map<string, TokenCache>()
const idDe = (cfg: CurseducaCfg) => createHash('sha1').update(cfg.apiKey).digest('hex').slice(0, 16)
const chaveRedis = (cfg: CurseducaCfg) => `curseduca:token:${idDe(cfg)}`

let redis: IORedis | null = null
let redisResolvido = false
/** Conexão Redis lazy — SÓ se REDIS_URL existir. Erros silenciados (fallback p/ memória). */
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

async function invalidarToken(cfg: CurseducaCfg): Promise<void> {
  cacheMem.delete(idDe(cfg))
  const r = getRedis()
  if (r) { try { await r.del(chaveRedis(cfg)) } catch { /* ignora */ } }
}

async function token(cfg: CurseducaCfg): Promise<string> {
  const mem = cacheMem.get(idDe(cfg))
  if (mem && mem.exp > Date.now() + 30_000) return mem.token

  // 1) Cache compartilhado no Redis (outra réplica pode já ter logado com essa credencial).
  const r = getRedis()
  if (r) {
    try {
      const raw = await r.get(chaveRedis(cfg))
      if (raw) {
        const j = JSON.parse(raw) as TokenCache
        if (j?.token && j.exp > Date.now() + 30_000) { cacheMem.set(idDe(cfg), j); return j.token }
      }
    } catch { /* ignora → faz login */ }
  }

  // 2) Login na Curseduca com as credenciais deste tenant.
  // Timeout obrigatório: sem AbortSignal, um /login lento ou inacessível (rede/firewall
  // do servidor) pendura a request para sempre — o botão "Validando…" nunca termina.
  const resp = await fetch(`${cfg.base}/login`, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json', api_key: cfg.apiKey },
    body: JSON.stringify({ username: cfg.user, password: cfg.pass, device: { app: { uuid: 'revisao' }, device: 'server', registrationToken: 'server' }, accessTokenValidity: 'string' }),
    cache: 'no-store',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  }).catch((e) => { throw new Error(e?.name === 'TimeoutError' ? 'Curseduca: login expirou (sem resposta em 15s)' : `Curseduca: falha de rede no login (${e?.message ?? e})`) })
  if (!resp.ok) throw new Error(`Curseduca: login falhou (${resp.status})`)
  const j = await resp.json()
  if (!j.accessToken) throw new Error('Curseduca: resposta de login sem accessToken')
  const exp = j.expiresAt ? new Date(j.expiresAt).getTime() : Date.now() + 25 * 60_000
  const nova: TokenCache = { token: j.accessToken, exp }
  cacheMem.set(idDe(cfg), nova)

  // 3) Publica no Redis para as outras réplicas (TTL até expirar).
  if (r) {
    try { await r.set(chaveRedis(cfg), JSON.stringify(nova), 'EX', Math.max(60, Math.floor((exp - Date.now()) / 1000))) } catch { /* ignora */ }
  }
  return j.accessToken
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function api(cfg: CurseducaCfg, path: string): Promise<any> {
  const fazer = async (t: string) => fetch(`${cfg.base}${path}`, { headers: { accept: 'application/json', api_key: cfg.apiKey, Authorization: `Bearer ${t}` }, cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT_MS) })
  let ultimo = 0
  for (let tentativa = 0; tentativa < 4; tentativa++) {
    let r: Response
    try {
      r = await fazer(await token(cfg))
      if (r.status === 401) { await invalidarToken(cfg); r = await fazer(await token(cfg)) } // token expirou → renova (uma vez)
    } catch (e: any) {
      // Timeout/queda de rede: nunca pendura — faz backoff e tenta de novo; desiste após as tentativas.
      if (tentativa < 3) { await dormir(Math.min(8_000, 500 * 2 ** tentativa) + Math.floor(Math.random() * 250)); continue }
      throw new Error(`Curseduca ${path}: ${e?.name === 'TimeoutError' ? 'sem resposta (timeout)' : (e?.message ?? 'falha de rede')}`)
    }
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

/** Testa as credenciais fazendo um /login (usado ao salvar a config do tenant). */
export async function testarCredenciais(cfg: CurseducaCfg): Promise<{ ok: boolean; error?: string }> {
  try {
    await invalidarToken(cfg)
    await token(cfg)
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'Falha ao autenticar na Curseduca.' }
  }
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
export async function listarTodosGrupos(cfg: CurseducaCfg): Promise<GrupoCurseduca[]> {
  const limit = 100
  let offset = 0
  const out: GrupoCurseduca[] = []
  for (let p = 0; p < 30; p++) {
    const j = await api(cfg, `/groups?limit=${limit}&offset=${offset}`)
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
 */
export async function mapaMatriculasGrupo(cfg: CurseducaCfg, groupId: number, maxPaginas = 100): Promise<Map<number, MatriculaGrupo>> {
  const limit = 200
  let offset = 0
  const mapa = new Map<number, MatriculaGrupo>()
  for (let p = 0; p < maxPaginas; p++) {
    const j = await api(cfg, `/groups/${groupId}/members?limit=${limit}&offset=${offset}`)
    const data = (j.data ?? []) as any[]
    for (const x of data) mapa.set(x.id, { entrouEm: x.enteredAt ?? null, expiraEm: x.expiresAt ?? null })
    if (!j.metadata?.hasMore || data.length === 0) break
    offset += limit
  }
  return mapa
}

/** Nº de membros de um grupo (rápido — 1 requisição). */
export async function contarMembros(cfg: CurseducaCfg, groupId: number): Promise<number> {
  const j = await api(cfg, `/members?groupId=${groupId}&limit=1&offset=0`)
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
export async function listarMembrosDoGrupo(cfg: CurseducaCfg, groupId: number, maxPaginas = 100): Promise<MembroCurseduca[]> {
  const limit = 200
  let offset = 0
  const out: MembroCurseduca[] = []
  for (let p = 0; p < maxPaginas; p++) {
    const j = await api(cfg, `/members?groupId=${groupId}&limit=${limit}&offset=${offset}`)
    const data = (j.data ?? []) as any[]
    out.push(...data.map(mapMembro))
    if (!j.metadata?.hasMore || data.length === 0) break
    offset += limit
  }
  return out
}

export type DetalheMembro = { ok: boolean; cpf: string | null; telefone: string | null; gruposNomes: string[] }

/** Detalhe do membro (`/members/{id}`): CPF (`document`), telefone (`phone`) e nomes dos grupos. */
export async function detalheMembro(cfg: CurseducaCfg, id: number): Promise<DetalheMembro> {
  try {
    const j = await api(cfg, `/members/${id}`)
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

// Cache de contagens por tenant (chave = hash da apiKey).
const cacheContagens = new Map<string, { at: number; dados: Record<number, number> }>()

/** Conta membros de vários grupos (concorrência limitada + cache de 5 min por tenant). */
export async function contarMuitosGrupos(cfg: CurseducaCfg, ids: number[]): Promise<Record<number, number>> {
  const chave = idDe(cfg)
  const agora = Date.now()
  const atual = cacheContagens.get(chave)
  if (atual && agora - atual.at < 5 * 60_000 && ids.every((id) => id in atual.dados)) return atual.dados
  const dados: Record<number, number> = { ...(atual?.dados ?? {}) }
  await comLimite(ids, 10, async (id) => { try { dados[id] = await contarMembros(cfg, id) } catch { /* mantém ausente */ } })
  cacheContagens.set(chave, { at: agora, dados })
  return dados
}
