import type { AchadoScan, ResultadoChecagem } from '../tipos'

/** Probes HTTP inofensivos no próprio domínio público. Timeout curto; nunca envia credenciais reais. */

export interface RespostaProbe { status: number; headers: Record<string, string> }
export type Fetcher = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<RespostaProbe | null>

export function criarFetcher(timeoutMs = 6000): Fetcher {
  return async (url, init) => {
    const ctl = new AbortController()
    const t = setTimeout(() => ctl.abort(), timeoutMs)
    try {
      const r = await fetch(url, { method: init?.method ?? 'GET', headers: init?.headers, body: init?.body, redirect: 'manual', signal: ctl.signal, cache: 'no-store' })
      const headers: Record<string, string> = {}
      r.headers.forEach((v, k) => { headers[k.toLowerCase()] = v })
      return { status: r.status, headers }
    } catch { return null } finally { clearTimeout(t) }
  }
}

/** Pura: avalia os headers da página inicial. */
export function avaliarHeaders(h: Record<string, string>): AchadoScan[] {
  const out: AchadoScan[] = []
  const csp = h['content-security-policy'] ?? ''
  if (!csp) {
    out.push({ categoria: 'headers', severidade: 'medio', titulo: 'Sem Content-Security-Policy', recomendacao: 'Definir CSP com script-src e frame-ancestors.', fingerprint: 'http:csp-ausente' })
  } else {
    if (!/script-src/i.test(csp)) out.push({ categoria: 'headers', severidade: 'medio', titulo: 'CSP sem diretiva script-src', detalhe: 'Sem script-src a CSP não mitiga XSS.', recomendacao: 'Adicionar script-src (nonce/strict-dynamic).', fingerprint: 'http:csp-sem-script-src' })
    const fa = /frame-ancestors\s+([^;]*)/i.exec(csp)?.[1]?.trim()
    if (!fa) out.push({ categoria: 'headers', severidade: 'baixo', titulo: 'CSP sem frame-ancestors', recomendacao: 'Definir frame-ancestors (origens permitidas do embed).', fingerprint: 'http:csp-sem-frame-ancestors' })
    else if (/(^|\s)\*(\s|$)/.test(fa)) out.push({ categoria: 'headers', severidade: 'medio', titulo: 'frame-ancestors permite qualquer origem (*)', detalhe: 'Clickjacking possível na página inicial.', recomendacao: 'Restringir às origens do embed; falhar fechado.', fingerprint: 'http:frame-ancestors-wildcard' })
  }
  if (!h['strict-transport-security']) out.push({ categoria: 'headers', severidade: 'baixo', titulo: 'Sem Strict-Transport-Security (HSTS)', recomendacao: 'Adicionar HSTS (max-age>=15552000; includeSubDomains).', fingerprint: 'http:hsts-ausente' })
  if ((h['x-content-type-options'] ?? '').toLowerCase() !== 'nosniff') out.push({ categoria: 'headers', severidade: 'baixo', titulo: 'Sem X-Content-Type-Options: nosniff', recomendacao: 'Adicionar o header globalmente.', fingerprint: 'http:nosniff-ausente' })
  if (!h['referrer-policy']) out.push({ categoria: 'headers', severidade: 'baixo', titulo: 'Sem Referrer-Policy', recomendacao: 'Adicionar Referrer-Policy: strict-origin-when-cross-origin.', fingerprint: 'http:referrer-policy-ausente' })
  return out
}

/** Pura: rota sensível sem credencial. 401/403/404/405/redirect = ok; 2xx ou erro de validação/500 = exposta. */
export function rotaExposta(status: number | undefined): boolean {
  if (status === undefined) return false
  return status < 300 || status === 400 || status === 422 || status === 500
}

const ROTAS_SENSIVEIS = ['/api/teste/seed', '/api/teste/modelos', '/api/teste/lab-sim', '/api/teste/docs', '/api/teste/doc-tags', '/api/dev/set-tenant']
const CRONS = ['/api/cron/egress-monitor', '/api/cron/seguranca-varredura', '/api/cron/encerrar-expirados']

export async function checarHttp(baseUrl: string | undefined, fetcher: Fetcher = criarFetcher()): Promise<ResultadoChecagem> {
  if (!baseUrl) return { nome: 'http', achados: [], erro: 'NEXT_PUBLIC_APP_URL ausente — probes HTTP pulados' }
  const base = baseUrl.replace(/\/+$/, '')
  const achados: AchadoScan[] = []

  const home = await fetcher(`${base}/`)
  if (!home) return { nome: 'http', achados: [], erro: `sem resposta de ${base}` }
  achados.push(...avaliarHeaders(home.headers))

  for (const p of ROTAS_SENSIVEIS) {
    const r = await fetcher(`${base}${p}`)
    if (r && rotaExposta(r.status)) {
      achados.push({
        categoria: 'rotas_expostas', severidade: 'critico', titulo: `Rota ${p} responde sem autenticação (HTTP ${r.status})`,
        detalhe: 'Rota de teste/dev acessível em produção.', recomendacao: 'Remover do build de produção ou bloquear por NODE_ENV + auth.',
        fingerprint: `http:rota-exposta:${p}`,
      })
    }
  }
  for (const p of CRONS) {
    const r = await fetcher(`${base}${p}`, { method: 'POST' })
    if (r && r.status !== 401 && r.status !== 403 && r.status !== 404 && r.status !== 405) {
      achados.push({
        categoria: 'rotas_expostas', severidade: 'alto', titulo: `Cron ${p} sem segredo devolveu HTTP ${r.status} (esperado 401)`,
        recomendacao: 'Exigir CRON_SECRET (comparação em tempo constante).', fingerprint: `http:cron-sem-segredo:${p}`,
      })
    }
  }

  // Rate limit de login: 12 tentativas com e-mail fictício (domínio reservado .invalid → nunca casa com aluno real).
  const email = 'varredura-seguranca@sec-probe.invalid'
  let bloqueou = false
  let respondeu = false
  for (let i = 0; i < 12; i++) {
    const r = await fetcher(`${base}/api/aluno/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) })
    if (!r) break
    respondeu = true
    if (r.status === 429) { bloqueou = true; break }
    if (r.status === 404 || r.status === 503) break // sem tenant / manutenção: inconclusivo
  }
  if (respondeu && !bloqueou) {
    achados.push({
      categoria: 'rate_limit', severidade: 'medio', titulo: '/api/aluno/login não retornou 429 após 12 tentativas',
      detalhe: 'O limite pode não estar atuando (em memória por réplica) ou o probe foi inconclusivo.',
      recomendacao: 'Mover o rate limit para Redis e validar limite por IP e por e-mail.', fingerprint: 'http:rate-limit-login-aluno',
    })
  }
  return { nome: 'http', achados }
}
