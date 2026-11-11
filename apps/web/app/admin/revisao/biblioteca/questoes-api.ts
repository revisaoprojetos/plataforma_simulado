// Cliente da rota de GESTÃO do banco de questões (Classificação · Unificar · Etiquetas · painel da questão).
// Cache de 60 s por URL + pré-carga: voltar a uma tela/página já vista responde na hora (< 300 ms). Toda mutação limpa os caches
// (inclusive os do Banco, que se registra em `aoMutar`).

export const URL_G = '/api/admin/revisao/biblioteca/questoes/gestao'
const TTL = 60_000
const CACHE = new Map<string, { t: number; v: any }>()
const EM_VOO = new Map<string, Promise<any>>()
const limpadores = new Set<() => void>()

export type ParamsG = Record<string, string | number | boolean | undefined | null>
const qs = (p: ParamsG) => { const u = new URLSearchParams(); for (const [k, v] of Object.entries(p)) if (v !== undefined && v !== null && v !== '' && v !== false) u.set(k, v === true ? '1' : String(v)); return u.toString() }

/** Registra uma função chamada após qualquer mutação (ex.: o Banco limpa o próprio cache). */
export function aoMutar(fn: () => void) { limpadores.add(fn); return () => { limpadores.delete(fn) } }
export function limparCacheG() { CACHE.clear(); for (const f of limpadores) f() }

export function emCacheG(p: ParamsG): boolean { const e = CACHE.get(qs(p)); return !!e && Date.now() - e.t < TTL }
export function cacheG<T = any>(p: ParamsG): T | undefined { const e = CACHE.get(qs(p)); return e && Date.now() - e.t < TTL ? e.v : undefined }

/** GET com cache. `fresh` ignora o cache e pede dados novos ao servidor (e limpa o cache do servidor). */
export async function lerG<T = any>(p: ParamsG, o: { fresh?: boolean } = {}): Promise<T & { ok: boolean; error?: string }> {
  const k = qs(p)
  if (!o.fresh) { const e = CACHE.get(k); if (e && Date.now() - e.t < TTL) return e.v }
  const kk = o.fresh ? k + '&fresh=1' : k
  const voo = EM_VOO.get(kk); if (voo) return voo
  const pr = (async () => {
    try {
      const r = await fetch(`${URL_G}?${kk}`, { cache: 'no-store' })
      const j = await r.json().catch(() => ({ ok: false, error: `HTTP ${r.status}` }))
      if (r.ok && j?.ok !== false) CACHE.set(k, { t: Date.now(), v: j })
      return j
    } catch { return { ok: false, error: 'Falha de rede.' } } finally { EM_VOO.delete(kk) }
  })()
  EM_VOO.set(kk, pr)
  return pr
}
export function prefetchG(p: ParamsG) { if (!emCacheG(p)) void lerG(p).catch(() => {}) }

/** POST de gestão. `limpar:false` para PRÉVIAS (não grava nada, então não invalida os caches). */
export async function postG<T = any>(acao: string, corpo: Record<string, unknown> = {}, o: { limpar?: boolean } = {}): Promise<T & { ok: boolean; error?: string }> {
  try {
    const r = await fetch(URL_G, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ acao, ...corpo }) })
    const j = await r.json().catch(() => ({ ok: false, error: `HTTP ${r.status}` }))
    if (j?.ok && o.limpar !== false) limparCacheG()
    return j
  } catch { return { ok: false, error: 'Falha de rede.' } as any }
}

/** Semeia o cache cliente com dados vindos do SSR (props): a tela renderiza na hora e a primeira leitura não faz chamada de API. */
export function semearG(p: ParamsG, v: any) { if (v && !emCacheG(p)) CACHE.set(qs(p), { t: Date.now(), v: { ok: true, ...v } }) }
