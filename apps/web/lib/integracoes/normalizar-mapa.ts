/**
 * Normaliza um payload CRU (webhook) em pessoa + entitlement usando o MAPA dinâmico
 * (mapa[campo] → dot-path) com fallback aos padrões de CAMPOS_MAPA. Fonte única usada
 * tanto pelo parser do webhook quanto pelo processamento manual do inbox. Lógica pura.
 */
import { getStr } from '@/lib/integracoes/jsonpath'
import { CAMPOS_MAPA } from '@/lib/integracoes/mapa-campos'
import type { PessoaNormalizada, Entitlement, StatusEntitlement } from '@/lib/integracoes/tipos'

function firstStr(...vs: (string | null | undefined)[]): string | null { for (const v of vs) if (v) return v; return null }

/** Status bruto (approved/canceled/…) → status de entitlement. null = sem efeito no acesso. */
export function mapStatusMapa(bruto: string | null): StatusEntitlement | null {
  const s = (bruto ?? '').toLowerCase()
  if (['approved', 'paid', 'active', 'completed', 'trialing', 'trial'].includes(s)) return 'ativo'
  // Compra negada/recusada/cancelada → cancela o acesso (revoga).
  if (['canceled', 'cancelled', 'inactive', 'refused', 'denied', 'declined', 'rejected', 'abandoned'].includes(s)) return 'cancelado'
  if (['refunded', 'refund', 'chargeback', 'dispute'].includes(s)) return 'reembolsado'
  if (['expired', 'past_due', 'unpaid', 'ended'].includes(s)) return 'expirado'
  return null
}

export interface Normalizado {
  pessoa: PessoaNormalizada
  entitlement: Entitlement
  statusBruto: string | null
  pedidoId: string | null
}

/**
 * Extrai pessoa + entitlement do payload via mapa. `assumeAtivoSeDesconhecido`: quando o status
 * não mapeia (ex.: processamento manual), assume 'ativo' para conceder. Retorna null se faltar
 * o essencial (pessoa OU produto) — sem isso não dá para conceder acesso.
 */
export function normalizarPorMapa(payload: unknown, mapa?: Record<string, string>, assumeAtivoSeDesconhecido = false): Normalizado | null {
  const p = payload as any
  if (!p || typeof p !== 'object') return null
  const m = mapa ?? {}

  const val = (key: string): string | null => {
    const campo = CAMPOS_MAPA.find((c) => c.key === key)
    const caminhos = [m[key], campo?.padrao, ...(campo?.padroesAlt ?? [])].filter(Boolean) as string[]
    for (const c of caminhos) { const v = getStr(p, c); if (v) return v }
    return null
  }

  const pedidoId = val('pedido_id')
  const statusBruto = val('status')
  const status = mapStatusMapa(statusBruto) ?? (assumeAtivoSeDesconhecido ? 'ativo' : null)
  const produtoRef = val('produto_ref')
  const email = val('email')
  const cpf = val('cpf')
  const nome = val('nome')
  const ddd = val('ddd'); const tel = val('telefone')
  const telefone = tel ? `${ddd ?? ''}${tel}` : null

  const externalPessoa = firstStr(email, cpf, pedidoId)
  if (!externalPessoa || !produtoRef || !status) return null

  const entExternalId = pedidoId ?? `${produtoRef}:${externalPessoa}`
  return {
    statusBruto,
    pedidoId,
    pessoa: { nome: nome ?? email ?? 'Aluno', email, cpf, telefone, externalId: externalPessoa },
    entitlement: {
      externalId: entExternalId,
      produtoRef,
      produtoNome: val('produto_nome'),
      status,
      inicioEm: firstStr(getStr(p, 'subscription.started_at'), getStr(p, 'dates.confirmed_at'), getStr(p, 'created_at')),
      expiraEm: firstStr(getStr(p, 'subscription.next_cycle_at'), getStr(p, 'subscription.expires_at'), getStr(p, 'subscription.ended_at')),
    },
  }
}
