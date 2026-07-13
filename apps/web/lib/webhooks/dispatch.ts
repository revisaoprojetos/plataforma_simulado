import 'server-only'
import crypto from 'crypto'
import { createServiceClient } from '@/lib/supabase/server'
import { rodarAutomacoes } from '@/lib/automacoes/run'

export const EVENTOS_WEBHOOK = [
  { chave: 'estudante.iniciou', label: 'Estudante iniciou o simulado' },
  { chave: 'estudante.finalizou', label: 'Estudante finalizou o simulado' },
  { chave: 'estudante.visualizou_relatorio', label: 'Estudante visualizou o relatório' },
  { chave: 'estudante.baixou_relatorio', label: 'Estudante baixou o relatório' },
  { chave: 'estudante.nao_finalizou', label: 'Estudante não finalizou (abandonou/expirou)' },
] as const

export type WebhookEvento = (typeof EVENTOS_WEBHOOK)[number]['chave']

// Status "humano" de cada evento (estilo `status` do payload da Guru).
const STATUS_EVENTO: Record<WebhookEvento, string> = {
  'estudante.iniciou': 'iniciado',
  'estudante.finalizou': 'finalizado',
  'estudante.nao_finalizou': 'nao_finalizado',
  'estudante.visualizou_relatorio': 'relatorio_visualizado',
  'estudante.baixou_relatorio': 'relatorio_baixado',
}

/**
 * Dispara um evento de progressão para os webhooks de saída ativos do tenant que
 * assinam esse evento. Best-effort: nunca lança (não quebra o fluxo do aluno) e
 * assina o corpo com HMAC-SHA256 quando o endpoint tem `secret`.
 */
export async function dispararWebhook(tenantId: string | null | undefined, evento: WebhookEvento, dados: Record<string, unknown>): Promise<void> {
  if (!tenantId) return
  // Além dos webhooks, roda as automações (aba n8n) do mesmo evento.
  await rodarAutomacoes(tenantId, evento, dados)
  try {
    const svc = await createServiceClient()
    const { data: eps } = await svc
      .from('simulado_webhook_saida')
      .select('id, url, eventos, secret, filtro_simulados')
      .eq('tenant_id', tenantId)
      .eq('ativo', true)
    const simId = (dados as any)?.simulado?.id
    const alvos = (eps ?? []).filter((e: any) => {
      if (!Array.isArray(e.eventos) || !e.eventos.includes(evento)) return false
      const filtro = Array.isArray(e.filtro_simulados) ? e.filtro_simulados : []
      return !(filtro.length && simId && !filtro.includes(simId)) // filtro vazio = todos os simulados
    })
    if (!alvos.length) return

    // Envelope no formato "guru" (fácil de filtrar no n8n): id/type/event/status/dates/contact/simulado/resultado.
    const d = dados as any
    const corpo = JSON.stringify({
      id: d.sessao_id ?? null,
      type: 'estudante',
      webhook_type: 'progressao_estudante',
      event: evento,
      status: STATUS_EVENTO[evento] ?? evento,
      dates: { created_at: new Date().toISOString() },
      tenant_id: tenantId,
      contact: d.contact ?? null,
      simulado: d.simulado ?? null,
      resultado: {
        sessao_id: d.sessao_id ?? null,
        nota: d.nota ?? null,
        acertos: d.acertos ?? null,
        total: d.total ?? null,
        tentativa: d.tentativa ?? null,
        motivo: d.motivo ?? null,
      },
    })

    await Promise.allSettled(alvos.map(async (e: any) => {
      const headers: Record<string, string> = { 'Content-Type': 'application/json', 'X-Webhook-Evento': evento }
      if (e.secret) headers['X-Webhook-Signature'] = 'sha256=' + crypto.createHmac('sha256', e.secret).update(corpo).digest('hex')
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 8000)
      try {
        const res = await fetch(e.url, { method: 'POST', headers, body: corpo, signal: ctrl.signal })
        await svc.from('simulado_webhook_saida').update({ ultimo_status: res.ok ? `ok (${res.status})` : `erro (${res.status})`, ultimo_envio: new Date().toISOString() }).eq('id', e.id)
      } catch {
        await svc.from('simulado_webhook_saida').update({ ultimo_status: 'erro de rede', ultimo_envio: new Date().toISOString() }).eq('id', e.id)
      } finally {
        clearTimeout(timer)
      }
    }))
  } catch {
    // best-effort — ignora
  }
}
