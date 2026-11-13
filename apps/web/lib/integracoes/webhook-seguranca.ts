import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Segurança dos webhooks de entrada (Guru / Curseduca / receptor genérico).
 *
 * Modelo de adoção COMPATÍVEL (não derruba produção):
 *  - Tenant COM segredo configurado → a requisição só passa se token/assinatura conferir (sempre rejeita se não bater).
 *  - Tenant SEM segredo e `webhook_estrito` DESLIGADO → continua aceitando (só o token único da URL protege),
 *    mas o resultado fica marcado no inbox com AVISO e o admin vê o alerta em Integrações.
 *  - `webhook_estrito` LIGADO (flag por tenant+provedor, em credenciais.webhook_estrito='1') → segredo OBRIGATÓRIO:
 *    sem segredo configurado ou sem assinatura válida = 401.
 */

/** Comparação de segredos em tempo constante (hash antes: esconde também o tamanho). */
export function compararSegredo(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false
  const ha = createHash('sha256').update(String(a)).digest()
  const hb = createHash('sha256').update(String(b)).digest()
  return timingSafeEqual(ha, hb)
}

/** HMAC-SHA256 (hex) do corpo CRU. */
export function hmacHex(raw: string, segredo: string): string {
  return createHmac('sha256', segredo).update(raw, 'utf8').digest('hex')
}

/** Confere uma assinatura HMAC-SHA256 do corpo CRU (aceita hex ou base64, com/sem prefixo `sha256=`), em tempo constante. */
export function verificarHmac(raw: string, assinatura: string | null | undefined, segredo: string): boolean {
  if (!assinatura || !segredo) return false
  const sig = assinatura.trim().replace(/^sha256=/i, '')
  const esperadoHex = hmacHex(raw, segredo)
  const esperadoB64 = createHmac('sha256', segredo).update(raw, 'utf8').digest('base64')
  // compara as duas representações (ambas em tempo constante); o `||` não vaza segredo, só qual formato.
  return compararSegredo(sig.toLowerCase(), esperadoHex) || compararSegredo(sig, esperadoB64)
}

/** Extrai uma assinatura HMAC dos headers usuais (se o provedor/proxy mandar). */
export function assinaturaDosHeaders(headers: Record<string, string>): string | null {
  return headers['x-guru-signature'] || headers['x-webhook-signature'] || headers['x-hub-signature-256'] || headers['x-signature'] || null
}

/** Segredo estático enviado em header (`x-webhook-secret` ou `Authorization: Bearer`), p/ quem não assina. */
export function segredoDosHeaders(headers: Record<string, string>): string | null {
  const h = headers['x-webhook-secret'] || headers['authorization']?.replace(/^Bearer\s+/i, '') || null
  return h && h.trim() ? h.trim() : null
}

/** A flag estrita está ligada nas credenciais (já descriptografadas) do tenant? */
export function estritoAtivo(cred: Record<string, string> | undefined | null): boolean {
  const v = cred?.webhook_estrito
  return v === '1' || v === 'true'
}

export type VeredictoWebhook =
  | { ok: true; aviso?: string }
  | { ok: false; motivo: string }

/**
 * Decide se o webhook é autêntico. `segredo` = segredo do tenant (ou env fallback).
 * `validarCustom` = validação específica do provedor (ex.: Guru confere o Account Token no corpo).
 */
export function avaliarWebhook(args: {
  raw: string
  headers: Record<string, string>
  segredo: string
  estrito: boolean
  validarCustom?: (raw: string, headers: Record<string, string>, segredo: string) => boolean
}): VeredictoWebhook {
  const { raw, headers, segredo, estrito, validarCustom } = args
  if (!segredo) {
    if (estrito) return { ok: false, motivo: 'modo estrito: segredo do webhook não configurado' }
    return { ok: true, aviso: 'AVISO: webhook sem segredo configurado (protegido só pelo token da URL) — configure o segredo e ative o modo estrito' }
  }
  const sig = assinaturaDosHeaders(headers)
  if (sig && verificarHmac(raw, sig, segredo)) return { ok: true }
  const estatico = segredoDosHeaders(headers)
  if (estatico && compararSegredo(estatico, segredo)) return { ok: true }
  if (validarCustom && validarCustom(raw, headers, segredo)) return { ok: true }
  return { ok: false, motivo: 'assinatura/segredo do webhook não confere' }
}
