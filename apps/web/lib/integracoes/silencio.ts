import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Alerta de SILÊNCIO do webhook de venda (Guru).
 *
 * Incidente (set–out/2026): o Guru ficou ~6 semanas sem entregar NADA à plataforma (zero requisições no inbox,
 * nem falhas) e ninguém percebeu — compradores do período ficaram sem acesso. Um webhook de venda tem fluxo
 * contínuo (centenas/dia); horas sem nenhuma requisição em horário comercial = algo quebrou (URL/token/webhook
 * desativado). Esta função só LÊ a última requisição recebida (1 query indexada por tenant+provider+recebido_em).
 */

/** Minutos de silêncio tolerados em horário comercial (8h–22h BRT). Ajustável por env. */
const LIMITE_DIA_MIN = Number(process.env.WEBHOOK_SILENCIO_DIA_MIN) || 180
/** Minutos tolerados de madrugada (22h–8h BRT), quando o fluxo natural de vendas cai. */
const LIMITE_NOITE_MIN = Number(process.env.WEBHOOK_SILENCIO_NOITE_MIN) || 720

export interface SilencioWebhook {
  provider: string
  ultimoEm: string | null
  /** minutos desde a última requisição (null = nunca recebeu nada). */
  silencioMin: number | null
  limiteMin: number
  emSilencio: boolean
}

/** Hora (0–23) em Brasília para um instante. */
function horaBrt(d: Date): number {
  return Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: 'America/Sao_Paulo' }).format(d)) % 24
}

export function limiteSilencioMin(agora: Date = new Date()): number {
  const h = horaBrt(agora)
  return h >= 8 && h < 22 ? LIMITE_DIA_MIN : LIMITE_NOITE_MIN
}

/** A última requisição do provedor está mais velha que o tolerado? Tolerante a tabela ausente (→ não alerta). */
export async function verificarSilencioWebhook(svc: SupabaseClient, tenantId: string, provider = 'guru', agora: Date = new Date()): Promise<SilencioWebhook> {
  const limiteMin = limiteSilencioMin(agora)
  try {
    const { data, error } = await svc.from('simulado_webhook_inbox').select('recebido_em')
      .eq('tenant_id', tenantId).eq('provider', provider).order('recebido_em', { ascending: false }).limit(1).maybeSingle()
    if (error) return { provider, ultimoEm: null, silencioMin: null, limiteMin, emSilencio: false }
    const ultimoEm = (data as { recebido_em?: string } | null)?.recebido_em ?? null
    // Nunca recebeu nada: integração recém-criada/sem tráfego — não é "silêncio" (não houve fluxo a perder).
    if (!ultimoEm) return { provider, ultimoEm: null, silencioMin: null, limiteMin, emSilencio: false }
    const silencioMin = Math.floor((agora.getTime() - new Date(ultimoEm).getTime()) / 60_000)
    return { provider, ultimoEm, silencioMin, limiteMin, emSilencio: silencioMin > limiteMin }
  } catch {
    return { provider, ultimoEm: null, silencioMin: null, limiteMin, emSilencio: false }
  }
}

/** "3h 20min" / "2 dias" — legível para o alerta. */
export function formatarSilencio(min: number): string {
  if (min >= 2880) return `${Math.floor(min / 1440)} dias`
  if (min >= 60) return `${Math.floor(min / 60)}h ${min % 60}min`
  return `${min}min`
}
