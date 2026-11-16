import 'server-only'
import { randomUUID } from 'crypto'
import { after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

/**
 * Rastreio de USO da API pública (API keys) — tabela `simulado_api_uso`.
 * `medirApi(req, fn)` envolve o handler: mede latência, gera `x-request-id` (devolvido no header) e grava
 * 1 linha por chamada via after() (best-effort: nunca atrasa a resposta nem quebra sem a migração).
 * Registra também 401/403/429 (chave inválida → api_key_id null, só o PREFIXO). NUNCA grava chave, header
 * Authorization, query string nem payload.
 */

export interface UsoCtx {
  keyId?: string | null
  tenantId?: string | null
  /** Prefixo (8 chars) da chave apresentada — só quando a chave não foi identificada. */
  keyPrefix?: string | null
  barrado?: boolean
  erro?: string | null
  /** Não grava linha (ex.: barrado por IP antes de identificar a chave). */
  semLog?: boolean
}

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi

/** /api/v1/alunos/<uuid> → /api/v1/alunos/{id} (agrupa por recurso, sem cardinalidade explosiva). */
export function recursoDe(pathname: string): string {
  return pathname.replace(UUID_RE, '{id}').replace(/\/\d+(?=\/|$)/g, '/{n}').slice(0, 200)
}

function ipDe(req: Request): string | null {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip')?.trim() || null
  return ip ? ip.slice(0, 64) : null
}

// Tabela ausente (migração pendente) → pausa as gravações por 10 min.
let pausadoAte = 0
function tabelaAusente(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false
  const m = String(err.message ?? '')
  if (err.code === '42P01' || err.code === 'PGRST205' || /does not exist|Could not find the table|schema cache/i.test(m)) {
    pausadoAte = Date.now() + 10 * 60_000
    return true
  }
  return false
}

function depois(fn: () => Promise<void>) {
  const seguro = async () => { try { await fn() } catch { /* best-effort */ } }
  try { after(seguro) } catch { void seguro() }
}

export function medirApi(req: Request, fn: (u: UsoCtx) => Promise<Response>): Promise<Response> {
  return (async () => {
    const t0 = Date.now()
    const requestId = randomUUID()
    const u: UsoCtx = {}
    let res: Response
    try {
      res = await fn(u)
    } catch (e) {
      u.erro = 'excecao_nao_tratada'
      res = new Response(JSON.stringify({ error: { status: 500, message: 'Erro interno.' } }), {
        status: 500, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      })
    }
    try { res.headers.set('x-request-id', requestId) } catch { /* headers imutáveis */ }

    // Chave desconhecida (401 sem key/tenant) e barrados por IP anônimo NÃO geram linha: evita inflar a tabela por varredura.
    const anonimo = !u.keyId && !u.tenantId
    if (Date.now() >= pausadoAte && !u.semLog && !(anonimo && res.status === 401)) {
      const duracao = Date.now() - t0
      const status = res.status
      let pathname = '/'
      try { pathname = new URL(req.url).pathname } catch { /* mantém */ }
      const linha = {
        tenant_id: u.tenantId ?? null,
        api_key_id: u.keyId ?? null,
        key_prefix: u.keyId ? null : (u.keyPrefix ?? null),
        recurso: recursoDe(pathname),
        metodo: req.method.slice(0, 10),
        rota: pathname.slice(0, 300),
        status,
        duracao_ms: Math.min(duracao, 2_000_000),
        ip: ipDe(req),
        user_agent: req.headers.get('user-agent')?.slice(0, 400) ?? null,
        barrado_limite: !!u.barrado || status === 429,
        erro: status >= 400 ? (u.erro ?? null)?.slice(0, 200) ?? null : null,
        request_id: requestId,
      }
      depois(async () => {
        const { error } = await createAdminClient().from('simulado_api_uso').insert(linha)
        tabelaAusente(error)
      })
    }
    return res
  })()
}
