/**
 * Defesa CSRF por verificação de Origin/Referer p/ as rotas mutáveis autenticadas pelo cookie
 * `aluno_session` (SameSite=None + Partitioned, necessário p/ rodar em iframe cross-site na Curseduca).
 *
 * Por que funciona com iframe: o JS que roda DENTRO do iframe pertence ao documento do NOSSO app,
 * então o Origin dos fetch/POST é o do próprio app (ex.: https://simulado.revisaopge.com.br), nunca o da
 * Curseduca. Logo "Origin == host da requisição" cobre o fluxo legítimo. Um site atacante enviaria
 * Origin: https://evil.com → bloqueado.
 *
 * Origens aceitas (qualquer uma):
 *  1. host do Origin == host da requisição (Host ou X-Forwarded-Host);
 *  2. mesmo domínio registrável do host da requisição (subdomínios do tenant, ex.: *.revisaopge.com.br);
 *  3. `*.curseduca.pro` (+ extras em ALUNO_ORIGENS_PERMITIDAS, lista separada por vírgula; aceita
 *     `host.exato.com` ou `*.sufixo.com`; SERVER_ACTION_ORIGINS também é considerada).
 *
 * Origin AUSENTE: browsers modernos SEMPRE enviam Origin em POST cross-origin; ausência = cliente não
 * navegador (server-to-server/curl/healthcheck — sem cookie de vítima, não é CSRF) ou navegação
 * same-origin antiga. Decisão: com Referer, valida o Referer; sem Referer, bloqueia só se
 * `Sec-Fetch-Site: cross-site`; senão PERMITE. Origin "null" (iframe sandbox) é tratado como ausente.
 *
 * Modo via env ALUNO_CSRF_ORIGIN: `enforce` (padrão) | `report` (só loga) | `off`.
 */
import { dominioCookieDeHost } from '../supabase/cookie-domain'

/** Prefixos de API autenticados pelo cookie do aluno. */
export const PREFIXOS_API_ALUNO = ['/api/aluno', '/api/sessoes', '/api/conteudo', '/api/leitura', '/api/jurisprudencia', '/api/maratona', '/api/simulado']
const METODOS_MUTAVEIS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export function deveVerificarOrigem(method: string, pathname: string): boolean {
  if (!METODOS_MUTAVEIS.has(method.toUpperCase())) return false
  // Callbacks server-to-server do OnlyOffice (autenticados por JWT próprio, sem cookie de aluno).
  if (pathname.endsWith('/callback')) return false
  return PREFIXOS_API_ALUNO.some((p) => pathname === p || pathname.startsWith(p + '/'))
}

function hostDe(valor: string | null | undefined): string | null {
  if (!valor) return null
  try { return new URL(valor).hostname.toLowerCase() } catch { return null }
}

function casaPadrao(host: string, padrao: string): boolean {
  const p = padrao.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').split(':')[0]
  if (!p) return false
  if (p.startsWith('*.')) { const suf = p.slice(1); return host.endsWith(suf) && host.length > suf.length }
  return host === p
}

export interface EntradaOrigem {
  origin: string | null
  referer: string | null
  secFetchSite: string | null
  host: string | null
  forwardedHost: string | null
}

function origemAceita(hostOrigem: string, e: EntradaOrigem, extras: string[]): boolean {
  const hostsReq = [e.forwardedHost, e.host]
    .map((h) => (h ?? '').split(',')[0].split(':')[0].trim().toLowerCase())
    .filter(Boolean)
  for (const h of hostsReq) {
    if (hostOrigem === h) return true
    const dom = dominioCookieDeHost(h) // ".revisaopge.com.br"
    if (dom && (hostOrigem === dom.slice(1) || hostOrigem.endsWith(dom))) return true
  }
  const lista = ['*.curseduca.pro', ...extras]
  return lista.some((p) => casaPadrao(hostOrigem, p))
}

export function extrasDoEnv(): string[] {
  return `${process.env.ALUNO_ORIGENS_PERMITIDAS ?? ''},${process.env.SERVER_ACTION_ORIGINS ?? ''}`.split(',').map((s) => s.trim()).filter(Boolean)
}

/** Pura: decide se a requisição mutável pode seguir. */
export function avaliarOrigem(e: EntradaOrigem, extras: string[] = extrasDoEnv()): { ok: boolean; motivo: string } {
  const origin = e.origin && e.origin !== 'null' ? e.origin : null
  const h = hostDe(origin) ?? hostDe(e.referer)
  if (h) return origemAceita(h, e, extras) ? { ok: true, motivo: 'origem-permitida' } : { ok: false, motivo: `origem-nao-permitida:${h}` }
  if ((e.secFetchSite ?? '').toLowerCase() === 'cross-site') return { ok: false, motivo: 'cross-site-sem-origem' }
  return { ok: true, motivo: 'sem-origem' }
}

export function modoCsrf(): 'enforce' | 'report' | 'off' {
  const m = (process.env.ALUNO_CSRF_ORIGIN ?? 'enforce').toLowerCase()
  return m === 'off' || m === 'report' ? m : 'enforce'
}
