/**
 * Auto-mapeamento: dado um payload JSON, DETECTA sozinho qual caminho (dot-path) corresponde
 * a cada campo do sistema — combinando (a) nome da chave (sinônimos) e (b) validação do VALOR
 * (email tem @, CPF tem 11 dígitos, status é uma palavra conhecida, etc.). Retorna, por campo,
 * o melhor caminho e uma confiança 0–100. Tipos-only (client + server).
 */
import { flattenPaths, getByPath } from '@/lib/integracoes/jsonpath'
import { CAMPOS_MAPA } from '@/lib/integracoes/mapa-campos'

// Sinônimos por campo (ordem = prioridade). Casam com o NOME da chave-folha.
const SINONIMOS: Record<string, string[]> = {
  pedido_id: ['transaction_id', 'order_id', 'pedido_id', 'sale_id', 'invoice_id', 'transaction', 'order', 'pedido', 'code', 'uuid', 'id'],
  email: ['email', 'e_mail', 'mail', 'email_address'],
  nome: ['full_name', 'customer_name', 'buyer_name', 'name', 'nome'],
  cpf: ['doc', 'document', 'cpf', 'cnpj', 'documento', 'tax_id'],
  telefone: ['phone_number', 'cellphone', 'phone', 'telefone', 'celular', 'mobile', 'whatsapp'],
  ddd: ['phone_local_code', 'ddd', 'area_code', 'local_code'],
  produto_ref: ['marketplace_id', 'product_id', 'offer_id', 'product_code', 'sku', 'internal_id', 'plan_id'],
  produto_nome: ['product_name', 'product_title', 'plan_name', 'offer_name', 'name', 'title'],
  status: ['last_status', 'payment_status', 'order_status', 'status', 'situacao'],
}

const digits = (v: string) => v.replace(/\D/g, '')
const isEmail = (v: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)
const isCpf = (v: string) => { const d = digits(v); return d.length === 11 || d.length === 14 }
const isPhone = (v: string) => { const d = digits(v); return d.length >= 8 && d.length <= 13 }
const STATUS_WORDS = ['approved', 'paid', 'active', 'completed', 'trial', 'trialing', 'canceled', 'cancelled', 'refunded', 'chargeback', 'dispute', 'expired', 'past_due', 'unpaid', 'pending', 'waiting_payment', 'billet_printed', 'abandoned', 'ended']
const isStatus = (v: string) => STATUS_WORDS.includes(v.toLowerCase())

export interface AutoMatch { path: string; confianca: number }

export function autoMapear(payload: unknown): Record<string, AutoMatch> {
  const paths = flattenPaths(payload, 500)
  const out: Record<string, AutoMatch> = {}

  for (const campo of CAMPOS_MAPA) {
    const syns = SINONIMOS[campo.key] ?? []
    let best: { path: string; score: number } | null = null

    for (const { path } of paths) {
      const low = path.toLowerCase()
      const leaf = low.split('.').pop()!.replace(/\[\d+\]/g, '')
      const val = String(getByPath(payload, path) ?? '')
      let score = 0

      // (a) nome da chave
      const idx = syns.indexOf(leaf)
      if (idx >= 0) score += 90 - idx * 4          // match exato; sinônimo mais forte = maior
      else if (syns.some((s) => leaf.includes(s))) score += 45

      // pistas de caminho para campos de produto
      if ((campo.key === 'produto_ref' || campo.key === 'produto_nome') && /product|produto|offer|plan|item/.test(low)) score += 20
      // pedido_id: prioriza um `id` de nível alto (fora de contact/buyer/product/address)
      if (campo.key === 'pedido_id' && /(^|\.)id$/.test(low) && !/contact|buyer|customer|address|product|affiliation/.test(low)) score += 35

      // (b) validação do VALOR
      if (campo.key === 'email' && isEmail(val)) score += 60
      if (campo.key === 'cpf' && isCpf(val)) score += 45
      if (campo.key === 'telefone' && isPhone(val) && digits(val).length >= 10) score += 30
      if (campo.key === 'status' && isStatus(val)) score += 60
      if (campo.key === 'ddd' && /^\d{2,3}$/.test(digits(val)) && digits(val).length <= 3) score += 20
      if (campo.key === 'produto_nome' && val && /[a-zA-ZÀ-ÿ]/.test(val) && val.length >= 3) score += 8

      // penaliza caminhos muito profundos (leve)
      score -= (low.split('.').length - 1)

      if (score > 0 && (!best || score > best.score)) best = { path, score }
    }

    if (best && best.score >= 40) out[campo.key] = { path: best.path, confianca: Math.max(1, Math.min(100, best.score)) }
  }
  return out
}
