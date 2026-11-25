import 'server-only'
import { redisCache, limparMemoriaPorPrefixo, listarMemoria } from '@/lib/cache/relatorio-cache'
import {
  PREFIXO_CACHE, agruparChaves, agruparMemoria, parseChave, type GrupoDetalhado, padraoScan, chaveDescartavel, extrairInfo, decidirLimpeza, prefixoValido,
} from '@/lib/cache/limpeza-puro'

/**
 * Limpeza CONTROLADA do cache `relatorio:*` (Redis de CACHE — nunca o redis-filas do BullMQ).
 * Sempre SCAN (COUNT 500) — nunca KEYS — e UNLINK (remoção assíncrona no Redis) em lotes de 200 com pausa de 25ms,
 * p/ não travar o Redis nem provocar thundering herd no banco (apagar tudo de uma vez faz todo mundo recomputar junto).
 */
const SCAN_COUNT = 500
const LOTE = 200
const PAUSA_MS = 25
const LIMITE_VARREDURA_LISTA = 20_000
const LIMITE_VARREDURA_LIMPEZA = 200_000
const dorme = (ms: number) => new Promise((r) => setTimeout(r, ms))

export type GrupoCache = GrupoDetalhado

const AMOSTRA = 50

/** Grupos do tenant NA MEMÓRIA deste processo (por réplica): chaves, bytes (JSON) e TTL restante médio. */
export function listarGruposMemoria(tenantId: string): GrupoCache[] {
  return agruparMemoria(listarMemoria(), tenantId, Date.now())
}

/** Grupos do tenant no Redis (varredura ≤20k → `truncado`), com bytes estimados (MEMORY USAGE, amostra de 50/grupo extrapolada) e TTL médio. */
export async function listarGruposCache(tenantId: string): Promise<{ grupos: GrupoCache[]; varridas: number; truncado: boolean; disponivel: boolean }> {
  const r = redisCache()
  if (!r) return { grupos: [], varridas: 0, truncado: false, disponivel: false }
  const coletadas: string[] = []
  let cursor = '0'
  let truncado = false
  try {
    do {
      const [prox, chaves] = await r.scan(cursor, 'MATCH', padraoScan(tenantId), 'COUNT', SCAN_COUNT)
      cursor = prox
      coletadas.push(...chaves)
      if (coletadas.length >= LIMITE_VARREDURA_LISTA) { truncado = cursor !== '0'; break }
    } while (cursor !== '0')
    const porGrupo = new Map<string, string[]>()
    for (const k of coletadas) {
      const p = parseChave(k)
      if (!p || p.tenant !== tenantId) continue
      const arr = porGrupo.get(p.grupo) ?? []
      arr.push(k); porGrupo.set(p.grupo, arr)
    }
    const grupos: GrupoCache[] = []
    for (const [grupo, chaves] of porGrupo) {
      let bytes = 0, ttl = 0, nb = 0, nt = 0
      for (const k of chaves.slice(0, AMOSTRA)) {
        try { const b = await r.call('MEMORY', 'USAGE', k); if (typeof b === 'number') { bytes += b; nb++ } } catch { /* ignora */ }
        try { const t = await r.ttl(k); if (t >= 0) { ttl += t; nt++ } } catch { /* ignora */ }
      }
      grupos.push({ grupo, chaves: chaves.length, bytes: nb ? Math.round((bytes / nb) * chaves.length) : 0, ttlMedioSeg: nt ? Math.round(ttl / nt) : null })
    }
    grupos.sort((a, b) => b.chaves - a.chaves || a.grupo.localeCompare(b.grupo))
    return { grupos, varridas: coletadas.length, truncado, disponivel: true }
  } catch { return { grupos: [], varridas: 0, truncado: false, disponivel: false } }
}

/** Núcleo: varre `padrao`, (opcional) filtra por `aceitar`, remove em lotes. `max` limita as remoções. */
async function varrerERemover(padrao: string, o: { dryRun?: boolean; aceitar?: (k: string) => boolean; max?: number }): Promise<{ removidas: number; varridas: number }> {
  const r = redisCache()
  if (!r) return { removidas: 0, varridas: 0 }
  let cursor = '0'
  let removidas = 0
  let varridas = 0
  let pendentes: string[] = []
  const max = o.max ?? Infinity
  const descarregar = async () => {
    while (pendentes.length) {
      const lote = pendentes.splice(0, LOTE)
      if (!o.dryRun) { await r.unlink(...lote); await dorme(PAUSA_MS) }
      removidas += lote.length
    }
  }
  try {
    do {
      const [prox, chaves] = await r.scan(cursor, 'MATCH', padrao, 'COUNT', SCAN_COUNT)
      cursor = prox
      varridas += chaves.length
      for (const k of chaves) {
        if (removidas + pendentes.length >= max) break
        if (!o.aceitar || o.aceitar(k)) pendentes.push(k)
      }
      if (pendentes.length >= LOTE) await descarregar()
      if (removidas + pendentes.length >= max || varridas >= LIMITE_VARREDURA_LIMPEZA) break
    } while (cursor !== '0')
    await descarregar()
  } catch { /* best-effort: devolve o que removeu até aqui */ }
  return { removidas, varridas }
}

/**
 * Limpa o cache de um tenant (ou de 'todos' — a ROTA exige super-admin), opcionalmente só um grupo/prefixo.
 * `dryRun` só conta. Também esvazia o fallback em memória do processo quando aplicável.
 */
export async function limparCache(o: { tenantId: string | 'todos'; prefixo?: string | null; dryRun?: boolean; origem?: 'redis' | 'memoria' }): Promise<{ removidas: number; varridas: number; disponivel: boolean }> {
  if (!prefixoValido(o.prefixo)) return { removidas: 0, varridas: 0, disponivel: false }
  const tenant = o.tenantId === 'todos' ? null : o.tenantId
  if (o.origem === 'memoria') {
    const alvo = listarMemoria().filter((e) => {
      const p = parseChave(e.chave)
      return !!p && (!tenant || p.tenant === tenant) && (!o.prefixo || e.chave.split(":").slice(2).join(":").startsWith(o.prefixo))
    })
    if (!o.dryRun) for (const e of alvo) limparMemoriaPorPrefixo(e.chave)
    return { removidas: alvo.length, varridas: alvo.length, disponivel: true }
  }
  const r = redisCache()
  if (!r) return { removidas: 0, varridas: 0, disponivel: false }
  const res = await varrerERemover(padraoScan(tenant, o.prefixo), { dryRun: o.dryRun })
  return { ...res, disponivel: true }
}

export type InfoRedisCache = { disponivel: boolean; usadaBytes: number; maxBytes: number; pct: number | null; evicted: number; chaves: number; politica: string }

/** Memória / evicted_keys / nº de chaves do Redis de cache (INFO). */
export async function infoRedisCache(): Promise<InfoRedisCache> {
  const vazio: InfoRedisCache = { disponivel: false, usadaBytes: 0, maxBytes: 0, pct: null, evicted: 0, chaves: 0, politica: '' }
  const r = redisCache()
  if (!r) return vazio
  try {
    const [mem, stats, chaves] = await Promise.all([r.info('memory'), r.info('stats'), r.dbsize()])
    const usadaBytes = extrairInfo(mem, 'used_memory')
    const maxBytes = extrairInfo(mem, 'maxmemory')
    const politica = /^maxmemory_policy:(\S+)/m.exec(mem)?.[1] ?? ''
    return { disponivel: true, usadaBytes, maxBytes, pct: maxBytes > 0 ? Math.round((usadaBytes / maxBytes) * 1000) / 10 : null, evicted: extrairInfo(stats, 'evicted_keys'), chaves, politica }
  } catch { return vazio }
}

const CHAVE_ESTADO = 'cache-manutencao:estado'
const LIMITE_POR_RODADA = 5000

export type ResultadoManutencaoCache = { ok: boolean; motivo?: string; limpou?: boolean; removidas?: number; usadaPct?: number | null; evicted?: number }

/**
 * Manutenção automática (cron a cada 30 min): se a memória passou de 80% do limite OU `evicted_keys` cresceu
 * desde a última rodada, remove (até 5000/rodada, em lotes) SÓ chaves `relatorio:` de GRUPOS_DESCARTAVEIS.
 * O estado (evicted anterior) fica em `cache-manutencao:estado` (fora do prefixo `relatorio:`).
 */
export async function manutencaoCache(): Promise<ResultadoManutencaoCache> {
  const r = redisCache()
  if (!r) return { ok: false, motivo: 'redis indisponível' }
  try {
    const info = await infoRedisCache()
    if (!info.disponivel) return { ok: false, motivo: 'redis indisponível' }
    const ant = await r.get(CHAVE_ESTADO)
    const evictedAnterior = ant != null && Number.isFinite(Number(ant)) ? Number(ant) : null
    const dec = decidirLimpeza({ usada: info.usadaBytes, max: info.maxBytes, evicted: info.evicted, evictedAnterior })
    await r.set(CHAVE_ESTADO, String(info.evicted), 'EX', 7 * 86400)
    if (!dec.limpar) return { ok: true, limpou: false, motivo: dec.motivo, usadaPct: info.pct, evicted: info.evicted }
    const { removidas } = await varrerERemover(`${PREFIXO_CACHE}*`, { aceitar: chaveDescartavel, max: LIMITE_POR_RODADA })
    return { ok: true, limpou: true, motivo: dec.motivo, removidas, usadaPct: info.pct, evicted: info.evicted }
  } catch (e) {
    return { ok: false, motivo: String((e as Error)?.message ?? e) }
  }
}

/** SET NX com TTL: `true` se esta chamada "ganhou" a janela (usado p/ limitar a purga a 1x/dia). Sem Redis → false. */
export async function reservarJanela(chave: string, ttlSeg: number): Promise<boolean> {
  const r = redisCache()
  if (!r) return false
  try { return (await r.set(chave, '1', 'EX', ttlSeg, 'NX')) === 'OK' } catch { return false }
}
