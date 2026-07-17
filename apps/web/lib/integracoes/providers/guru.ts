import 'server-only'
import { aguardarVaga, idCredencial } from '@/lib/integracoes/ratelimit'
import { getStr } from '@/lib/integracoes/jsonpath'
import { CAMPOS_MAPA } from '@/lib/integracoes/mapa-campos'
import type { ProviderAdapter, ProviderCfg, FonteImport, PessoaEntitlement, EventoNormalizado, StatusEntitlement } from '@/lib/integracoes/tipos'

/**
 * Adaptador Guru (digitalmanager.guru) — plataforma de PAGAMENTO (push/webhook).
 * O núcleo é o `parseWebhook`: normaliza o evento de compra/assinatura em conceder/revogar.
 *
 * ⚠️ VERIFICAR com um payload/doc REAL da Guru: os nomes de campos abaixo seguem o formato
 * conhecido (contact/product/subscription/status), mas podem variar por conta/versão. Ajustar
 * `mapStatus`, os caminhos de `contact`/`product` e os endpoints de API quando tivermos a doc.
 */

const RATE = { maxPorJanela: 60, janelaMs: 60_000 }

function toStr(v: unknown): string | null { return v == null ? null : String(v) }
function firstStr(...vs: unknown[]): string | null { for (const v of vs) { const s = toStr(v); if (s) return s } return null }

/** Mapeia o status da Guru → status de entitlement. `null` = irrelevante (ex.: aguardando pagamento). */
function mapStatus(bruto: string | null): StatusEntitlement | null {
  const s = (bruto ?? '').toLowerCase()
  if (['approved', 'paid', 'active', 'completed', 'trialing', 'trial'].includes(s)) return 'ativo'
  if (['canceled', 'cancelled', 'inactive'].includes(s)) return 'cancelado'
  if (['refunded', 'refund'].includes(s)) return 'reembolsado'
  if (['chargeback', 'dispute'].includes(s)) return 'reembolsado'
  if (['expired', 'past_due', 'unpaid', 'ended'].includes(s)) return 'expirado'
  // waiting_payment, pending, abandoned, billet_printed… → não mexe no acesso
  return null
}

/** Telefone da Guru: junta DDI/DDD + número quando vierem separados. */
function telefone(contact: any): string | null {
  if (!contact) return null
  return firstStr(
    contact.phone_number && `${contact.phone_local_code ?? ''}${contact.phone_number}`,
    contact.phone, contact.phone_number, contact.cellphone,
  )
}

/** Normaliza um item de assinatura da API Guru em pessoa+entitlement. ⚠️ VERIFICAR campos. */
function normalizarAssinatura(s: any): PessoaEntitlement | null {
  if (!s || typeof s !== 'object') return null
  const contact = s.subscriber ?? s.contact ?? s.customer ?? s.buyer ?? {}
  const product = s.product ?? s.items?.[0] ?? {}
  const email = firstStr(contact.email, contact.mail)
  const cpf = firstStr(contact.doc, contact.document, contact.cpf)
  const externalPessoa = firstStr(contact.id, email, cpf)
  if (!externalPessoa) return null
  const produtoRef = firstStr(product.marketplace_id, product.internal_id, product.id, s.product_id)
  if (!produtoRef) return null
  // Na listagem, mantém o status real; se não mapear, assume 'ativo' (está na lista de assinaturas).
  const status = mapStatus(firstStr(s.last_status, s.status, s.subscription?.last_status)) ?? 'ativo'
  const entExternalId = firstStr(s.id, s.internal_id, s.subscription_code, s.code) ?? `${produtoRef}:${externalPessoa}`
  return {
    pessoa: {
      nome: firstStr(contact.name, contact.full_name) ?? email ?? 'Aluno',
      email, cpf, telefone: telefone(contact), externalId: externalPessoa,
    },
    entitlement: {
      externalId: entExternalId,
      produtoRef,
      produtoNome: firstStr(product.name, product.title),
      status,
      inicioEm: firstStr(s.started_at, s.dates?.started_at, s.created_at),
      expiraEm: firstStr(s.next_cycle_at, s.dates?.next_cycle_at, s.expires_at, s.ended_at),
    },
  }
}

export const guruAdapter: ProviderAdapter = {
  provider: 'guru',

  async testarCredenciais(cfg) {
    const token = cfg.credenciais.api_token
    if (!token) return { ok: false, error: 'Informe o API Token da Guru.' }
    const base = (cfg.baseUrl || 'https://digitalmanager.guru').replace(/\/+$/, '')
    // Tenta alguns endpoints conhecidos; OK se QUALQUER um responder 200. 401/403 = token inválido.
    const rotas = ['/api/v2/accounts/me', '/api/v2/subscriptions?per_page=1', '/api/v2/transactions?per_page=1', '/api/v2/products?per_page=1']
    let ultimo = 0
    for (const path of rotas) {
      try {
        const r = await fetch(`${base}${path}`, { headers: { accept: 'application/json', Authorization: `Bearer ${token}` }, cache: 'no-store' })
        if (r.ok) return { ok: true }
        if (r.status === 401 || r.status === 403) return { ok: false, error: `Token inválido (${r.status}). Confira o User Token na Guru.` }
        ultimo = r.status // 404/400 → endpoint pode diferir; tenta o próximo
      } catch (e) { return { ok: false, error: `Falha de rede: ${(e as Error).message}` } }
    }
    return { ok: false, error: `Não foi possível validar (último status ${ultimo}). Confira o Base URL e o token.` }
  },

  async listarFontes(cfg): Promise<FonteImport[]> {
    const token = cfg.credenciais.api_token
    if (!token) return []
    const key = idCredencial('guru', token)
    await aguardarVaga('guru', key, RATE)
    try {
      // ⚠️ VERIFICAR endpoint real de produtos da Guru.
      const r = await fetch(`${cfg.baseUrl}/api/v2/products`, { headers: { accept: 'application/json', Authorization: `Bearer ${token}` }, cache: 'no-store' })
      if (!r.ok) return []
      const j: any = await r.json()
      const arr: any[] = Array.isArray(j) ? j : (j.data ?? j.products ?? j.items ?? [])
      return arr.map((p) => ({ ref: String(p.marketplace_id ?? p.internal_id ?? p.id), nome: String(p.name ?? p.title ?? p.marketplace_id ?? p.id) }))
    } catch { return [] }
  },

  /**
   * Pull de assinaturas da API Guru (para a tela de análise "Assinaturas" e reconciliação).
   * ⚠️ VERIFICAR com a doc/token real: endpoint `/api/v2/subscriptions`, paginação por cursor
   * e caminhos de `subscriber`/`product`/`last_status`. Robusto a variações de envelope.
   * `refs` opcional filtra por produto (produtoRef); vazio = todas.
   */
  async listarPessoas(cfg, refs): Promise<PessoaEntitlement[]> {
    const token = cfg.credenciais.api_token
    if (!token) return []
    const key = idCredencial('guru', token)
    const refSet = new Set((refs ?? []).filter(Boolean))
    const out: PessoaEntitlement[] = []
    let cursor: string | null = null
    for (let pag = 0; pag < 50; pag++) { // teto de segurança (50 páginas)
      await aguardarVaga('guru', key, RATE)
      const url = new URL(`${cfg.baseUrl}/api/v2/subscriptions`)
      if (cursor) url.searchParams.set('cursor', cursor)
      let j: any
      try {
        const r = await fetch(url.toString(), { headers: { accept: 'application/json', Authorization: `Bearer ${token}` }, cache: 'no-store' })
        if (!r.ok) break
        j = await r.json()
      } catch { break }
      const arr: any[] = Array.isArray(j) ? j : (j.data ?? j.subscriptions ?? j.items ?? [])
      if (!arr.length) break
      for (const s of arr) {
        const pe = normalizarAssinatura(s)
        if (!pe) continue
        if (refSet.size && !refSet.has(pe.entitlement.produtoRef)) continue
        out.push(pe)
      }
      cursor = firstStr(j?.next_cursor, j?.meta?.next_cursor, j?.links?.next)
      const temMais = j?.has_more_pages ?? j?.has_more ?? !!cursor
      if (!temMais || !cursor) break
    }
    return out
  },

  /**
   * Validação: a Guru envia o `api_token` da conta NO CORPO do webhook (confirmado em
   * payload real). Comparamos com o token configurado — só a conta certa conhece esse valor.
   * A URL já tem token único por tenant (2ª barreira). Sem segredo configurado, aceita (só URL).
   */
  validarWebhook(rawBody, headers, segredo) {
    if (!segredo) return true
    try {
      const j = JSON.parse(rawBody)
      if (j?.api_token === segredo || j?.token === segredo || j?.webhook?.token === segredo) return true
    } catch { /* ignora */ }
    // fallback: header (caso a conta use assinatura por header)
    const cand = headers['x-guru-signature'] || headers['x-webhook-secret'] || headers['authorization'] || ''
    if (cand && cand.includes(segredo)) return true
    return false
  },

  /**
   * Normaliza o payload da Guru em evento (comprador + direito de acesso).
   * Usa o MAPA DINÂMICO (cfg.mapa) quando configurado: cada campo tenta o caminho do mapa,
   * depois o padrão e os fallbacks conhecidos. O `pedido_id` é a CHAVE ÚNICA (principal).
   */
  async parseWebhook(payload, _headers, cfg): Promise<EventoNormalizado | null> {
    const p = payload as any
    if (!p || typeof p !== 'object') return null
    const mapa = (cfg as ProviderCfg | undefined)?.mapa ?? {}

    // Resolve um campo pelo mapa → padrão → fallbacks (1º caminho que devolver valor).
    const val = (key: string): string | null => {
      const campo = CAMPOS_MAPA.find((c) => c.key === key)
      const caminhos = [mapa[key], campo?.padrao, ...(campo?.padroesAlt ?? [])].filter(Boolean) as string[]
      for (const c of caminhos) { const v = getStr(p, c); if (v) return v }
      return null
    }

    const pedidoId = val('pedido_id')          // CHAVE ÚNICA (principal)
    const statusBruto = val('status')
    const status = mapStatus(statusBruto)
    if (!status) return null                   // evento sem efeito no acesso (ex.: aguardando pagamento)

    const produtoRef = val('produto_ref')
    if (!produtoRef) return null

    const email = val('email')
    const cpf = val('cpf')
    const nome = val('nome')
    const ddd = val('ddd'); const tel = val('telefone')
    const telefoneCompleto = tel ? `${ddd ?? ''}${tel}` : null

    const externalPessoa = firstStr(email, cpf, pedidoId)
    if (!externalPessoa) return null

    const entExternalId = pedidoId ?? `${produtoRef}:${externalPessoa}`
    // event_id: id do pedido + status → dedupe por transição de estado (idempotência).
    const eventId = `${pedidoId ?? entExternalId}:${statusBruto}`

    return {
      eventId,
      tipo: firstStr(p.webhook_type, p.event, p.type) ?? statusBruto ?? 'guru',
      ocorridoEm: firstStr(getStr(p, 'dates.confirmed_at'), getStr(p, 'dates.created_at'), getStr(p, 'created_at')),
      pessoa: { nome: nome ?? email ?? 'Aluno', email, cpf, telefone: telefoneCompleto, externalId: externalPessoa },
      entitlement: {
        externalId: entExternalId,
        produtoRef,
        produtoNome: val('produto_nome'),
        status,
        inicioEm: firstStr(getStr(p, 'subscription.started_at'), getStr(p, 'dates.confirmed_at'), getStr(p, 'created_at')),
        expiraEm: firstStr(getStr(p, 'subscription.next_cycle_at'), getStr(p, 'subscription.expires_at'), getStr(p, 'subscription.ended_at')),
      },
    }
  },
}
