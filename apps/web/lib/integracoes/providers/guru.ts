import 'server-only'
import { aguardarVaga, idCredencial } from '@/lib/integracoes/ratelimit'
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

export const guruAdapter: ProviderAdapter = {
  provider: 'guru',

  async testarCredenciais(cfg) {
    const token = cfg.credenciais.api_token
    if (!token) return { ok: false, error: 'Informe o API Token da Guru.' }
    try {
      // ⚠️ VERIFICAR endpoint real da API Guru (v2). Best-effort para validar o token.
      const r = await fetch(`${cfg.baseUrl}/api/v2/accounts/me`, { headers: { accept: 'application/json', Authorization: `Bearer ${token}` }, cache: 'no-store' })
      if (r.ok) return { ok: true }
      if (r.status === 401 || r.status === 403) return { ok: false, error: 'Token inválido (401/403).' }
      return { ok: false, error: `Guru respondeu ${r.status}. Verifique o endpoint/credenciais.` }
    } catch (e) { return { ok: false, error: (e as Error).message } }
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

  // Guru é push: sem pull de pessoas por produto no MVP (reconciliação vem depois).
  async listarPessoas(): Promise<PessoaEntitlement[]> { return [] },

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

  /** Normaliza o payload da Guru em evento (comprador + direito de acesso). */
  async parseWebhook(payload): Promise<EventoNormalizado | null> {
    const p = payload as any
    if (!p || typeof p !== 'object') return null

    const contact = p.contact ?? p.buyer ?? p.customer ?? {}
    const product = p.product ?? p.items?.[0] ?? {}
    const subscription = p.subscription ?? {}

    const email = firstStr(contact.email, contact.mail)
    const cpf = firstStr(contact.doc, contact.document, contact.cpf)
    const externalPessoa = firstStr(contact.id, email, cpf)
    if (!externalPessoa) return null

    // status: assinatura (last_status) tem prioridade; senão o status da transação.
    const statusBruto = firstStr(subscription.last_status, subscription.status, p.last_status, p.status)
    const status = mapStatus(statusBruto)
    if (!status) return null // evento sem efeito no acesso (ex.: aguardando pagamento)

    const produtoRef = firstStr(product.marketplace_id, product.internal_id, product.id, p.product_id)
    if (!produtoRef) return null

    const entExternalId = firstStr(subscription.id, subscription.internal_id, p.id, p.transaction_id) ?? `${produtoRef}:${externalPessoa}`
    // event_id: id do evento/transação + status → dedupe por transição de estado.
    const eventId = firstStr(p.id, p.transaction_id, subscription.id) ? `${firstStr(p.id, p.transaction_id, subscription.id)}:${statusBruto}` : `${entExternalId}:${statusBruto}`

    return {
      eventId,
      tipo: firstStr(p.webhook_type, p.event, p.type) ?? statusBruto ?? 'guru',
      ocorridoEm: firstStr(p.dates?.confirmed_at, p.dates?.created_at, p.created_at),
      pessoa: {
        nome: firstStr(contact.name, contact.full_name) ?? email ?? 'Aluno',
        email, cpf, telefone: telefone(contact), externalId: externalPessoa,
      },
      entitlement: {
        externalId: entExternalId,
        produtoRef,
        produtoNome: firstStr(product.name, product.title),
        status,
        inicioEm: firstStr(subscription.started_at, p.dates?.confirmed_at, p.dates?.created_at),
        expiraEm: firstStr(subscription.next_cycle_at, subscription.expires_at, subscription.ended_at),
      },
    }
  },
}
