import 'server-only'
import { NextResponse } from 'next/server'
import { validarApiKey, prefixoChave, type ApiKeyOk } from '@/lib/api-keys'
import { medirApi } from '@/lib/api-v1/uso'
import { rateLimit, ipDeRequest } from '@/lib/rate-limit'
import { sanearBusca } from '@/lib/seguranca/postgrest-safe'

/** Helpers ÚNICOS da API pública v1 (somente leitura): auth+escopo, rate limit, paginação, envelope e erros. */

export const API_V1_ESCOPOS: Record<string, string> = {
  'alunos:read': 'Lista/detalhe de alunos (sem CPF/telefone/IP).',
  'acessos:read': 'Registro de acessos (sem IP/user-agent).',
  'acessos:pii': 'Adicional a acessos:read — inclui IP e user-agent (dado pessoal/LGPD).',
  'atividades:read': 'Atividades dos alunos (leitura, quiz, simulado...).',
  'simulados:read': 'Simulados e resultados por aluno (sem testadores).',
  'leitura:read': 'Progresso de leitura por aluno/documento.',
  'metricas:read': 'Métricas agregadas do período.',
}

const RL_MAX = 120
const RL_JANELA_MS = 60_000
// Limite por IP ANTES de validar a chave (frena força bruta/varredura de chaves). Generoso: vários clientes legítimos atrás do mesmo NAT.
const RL_ANON_MAX = 300
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const HEADERS = { 'cache-control': 'no-store' }

export function erro(status: number, message: string, extra: Record<string, string> = {}) {
  return NextResponse.json({ error: { status, message } }, { status, headers: { ...HEADERS, ...extra } })
}

export function ok<T>(data: T, meta?: Record<string, unknown>) {
  return NextResponse.json(meta ? { data, meta } : { data }, { headers: HEADERS })
}

export type Pagina = { page: number; perPage: number; from: number; to: number }

export function paginacao(url: URL): Pagina {
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1)
  const perPage = Math.min(100, Math.max(1, parseInt(url.searchParams.get('per_page') || '50', 10) || 50))
  const from = (page - 1) * perPage
  return { page, perPage, from, to: from + perPage - 1 }
}

export function okLista<T>(data: T[], pg: Pagina, total: number | null) {
  return ok(data, { page: pg.page, per_page: pg.perPage, total: total ?? 0 })
}

/** Data ISO válida ou null. */
export function dataParam(url: URL, nome: string): string | null {
  const v = url.searchParams.get(nome)
  if (!v) return null
  const d = new Date(v)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

export function uuidParam(url: URL, nome: string): string | null {
  const v = url.searchParams.get(nome)
  return v && UUID_RE.test(v) ? v : null
}

export const ehUuid = (v: string) => UUID_RE.test(v)

export function buscaParam(url: URL): string {
  return sanearBusca(url.searchParams.get('q') || '', 80)
}

export type Ctx = { auth: ApiKeyOk; url: URL; req: Request }

/**
 * Envolve um handler: autentica + valida escopo + rate limit por chave + tratamento de erro padronizado.
 * `escopo` pode ser string ou lista (basta ter 1 → exige todos? não: exige TODOS os listados).
 */
export async function handler(req: Request, escopo: string | string[], fn: (c: Ctx) => Promise<Response>): Promise<Response> {
  return medirApi(req, async (uso) => {
    const escopos = Array.isArray(escopo) ? escopo : [escopo]
    const rlIp = await rateLimit(`apiv1-anon:${ipDeRequest(req.headers)}`, RL_ANON_MAX, RL_JANELA_MS)
    if (!rlIp.ok) {
      uso.barrado = true; uso.erro = 'limite por IP'; uso.semLog = true
      return erro(429, 'Limite de requisições excedido.', { 'retry-after': String(rlIp.retryAfter) })
    }
    const auth = await validarApiKey(req, escopos[0])
    if (!auth.ok) {
      uso.keyId = auth.keyId ?? null; uso.tenantId = auth.tenantId ?? null
      uso.keyPrefix = prefixoChave(req); uso.erro = auth.error
      return erro(auth.status, auth.error)
    }
    uso.keyId = auth.keyId; uso.tenantId = auth.tenantId
    for (const e of escopos.slice(1)) {
      if (!auth.escopos.includes(e)) { uso.erro = `sem escopo ${e}`; return erro(403, `API key sem o escopo necessário: ${e}.`) }
    }
    const rl = await rateLimit(`apiv1:${auth.keyId}`, RL_MAX, RL_JANELA_MS)
    if (!rl.ok) {
      uso.barrado = true; uso.erro = 'limite de requisições'
      return erro(429, 'Limite de requisições excedido.', { 'retry-after': String(rl.retryAfter) })
    }
    try {
      return await fn({ auth, url: new URL(req.url), req })
    } catch (e) {
      console.error('[api/v1]', e)
      uso.erro = 'erro interno'
      return erro(500, 'Erro interno.')
    }
  })
}
