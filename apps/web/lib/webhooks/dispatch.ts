import 'server-only'
import crypto from 'crypto'
import { createAdminClient } from '@/lib/supabase/server'
import { descriptografar } from '@/lib/crypto'
import { rodarAutomacoes } from '@/lib/automacoes/run'
import { montarCorpoWebhook } from './envelope'

export const EVENTOS_WEBHOOK = [
  { chave: 'estudante.iniciou', label: 'Estudante iniciou o simulado', grupo: 'entrega', descricao: 'Quando o aluno abre e começa o simulado.' },
  { chave: 'estudante.finalizou', label: 'Estudante finalizou o simulado', grupo: 'entrega', descricao: 'Quando o aluno envia/conclui o simulado (com nota e acertos).' },
  { chave: 'estudante.visualizou_relatorio', label: 'Estudante visualizou o relatório', grupo: 'entrega', descricao: 'Quando o aluno abre a tela de resultado/relatório.' },
  { chave: 'estudante.baixou_relatorio', label: 'Estudante baixou o relatório', grupo: 'entrega', descricao: 'Quando o aluno baixa o PDF do relatório final.' },
  { chave: 'estudante.nao_finalizou', label: 'Estudante não finalizou (abandonou/expirou)', grupo: 'entrega', descricao: 'Quando o aluno abandona ou o tempo/prazo expira sem envio.' },
  // Gamificação (sequência/status) — disparados pelo streak (tempo real) e pelo cron de inatividade.
  { chave: 'gamificacao.inativo', label: 'Gamificação: aluno parou de entrar (inativo)', grupo: 'gamificacao', descricao: 'Aluno ficou N dia(s) sem entrar depois de ter iniciado — chamada para voltar.' },
  { chave: 'gamificacao.sequencia', label: 'Gamificação: sequência de dias consecutivos', grupo: 'gamificacao', descricao: 'Aluno atingiu N dias consecutivos de estudo — incentivo para continuar.' },
  { chave: 'gamificacao.marco', label: 'Gamificação: marco de sequência (7/14/21/30…)', grupo: 'gamificacao', descricao: 'Aluno completou um marco de sequência (ex.: 7, 14, 21, 30 dias) — parabenização.' },
] as const

export type WebhookEvento = (typeof EVENTOS_WEBHOOK)[number]['chave']

/**
 * POST best-effort com RETRY + backoff exponencial. Repete em erro de rede/timeout e em 5xx/429
 * (até 3 tentativas: 0ms → 500ms → 1000ms); NÃO repete em 4xx (exceto 429), pois é erro do payload.
 * Retorna o texto de status a gravar em `ultimo_status`.
 */
type EnvioResultado = { status: string; ok: boolean; httpStatus: number | null; ms: number }
async function enviarComRetry(url: string, headers: Record<string, string>, corpo: string): Promise<EnvioResultado> {
  const MAX = 3
  const t0 = Date.now()
  for (let tentativa = 1; tentativa <= MAX; tentativa++) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 8000)
    try {
      const res = await fetch(url, { method: 'POST', headers, body: corpo, signal: ctrl.signal })
      clearTimeout(timer)
      if (res.ok) return { status: tentativa > 1 ? `ok (${res.status}) na tentativa ${tentativa}` : `ok (${res.status})`, ok: true, httpStatus: res.status, ms: Date.now() - t0 }
      // 4xx (menos 429) é erro do request — não adianta repetir.
      if (res.status < 500 && res.status !== 429) return { status: `erro (${res.status})`, ok: false, httpStatus: res.status, ms: Date.now() - t0 }
      if (tentativa === MAX) return { status: `erro (${res.status}) após ${MAX} tentativas`, ok: false, httpStatus: res.status, ms: Date.now() - t0 }
    } catch {
      clearTimeout(timer)
      if (tentativa === MAX) return { status: `erro de rede após ${MAX} tentativas`, ok: false, httpStatus: null, ms: Date.now() - t0 }
    }
    await new Promise((r) => setTimeout(r, 500 * 2 ** (tentativa - 1)))
  }
  return { status: 'erro', ok: false, httpStatus: null, ms: Date.now() - t0 }
}

export type PlataformaWh = { id: string; nome: string | null; slug: string | null }

/**
 * Envia UM evento para uma URL de webhook ESPECÍFICA (usado pelos webhooks de engajamento, que têm
 * regras/URL próprias). Monta o mesmo envelope, assina com HMAC (secret CRIPTOGRAFADO), grava
 * ultimo_status e o log de saída. Best-effort: nunca lança.
 */
export async function enviarWebhookDireto(
  svc: any, tenantId: string, plataforma: PlataformaWh, evento: WebhookEvento,
  dados: Record<string, unknown>, alvo: { webhookId: string; nome: string | null; url: string; secret: string | null },
): Promise<boolean> {
  try {
    const corpo = JSON.stringify(montarCorpoWebhook(evento, plataforma, tenantId, dados as any, new Date().toISOString()))
    const headers: Record<string, string> = { 'Content-Type': 'application/json', 'X-Webhook-Evento': evento }
    const seg = descriptografar(alvo.secret)
    if (seg) headers['X-Webhook-Signature'] = 'sha256=' + crypto.createHmac('sha256', seg).update(corpo).digest('hex')
    const r = await enviarComRetry(alvo.url, headers, corpo)
    await svc.from('simulado_webhook_saida').update({ ultimo_status: r.status, ultimo_envio: new Date().toISOString() }).eq('id', alvo.webhookId)
    try {
      await svc.from('simulado_webhook_saida_logs').insert({
        tenant_id: tenantId, webhook_id: alvo.webhookId, nome: alvo.nome ?? null, url: alvo.url, evento,
        status: r.ok ? 'ok' : 'erro', http_status: r.httpStatus, ms: r.ms, erro: r.ok ? null : r.status,
      })
    } catch { /* tabela de log ausente → ignora */ }
    return r.ok
  } catch { return false }
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
    const svc = createAdminClient()
    const { data: eps } = await svc
      .from('simulado_webhook_saida')
      .select('id, nome, url, eventos, secret, filtro_simulados')
      .eq('tenant_id', tenantId)
      .eq('ativo', true)
    const simId = (dados as any)?.simulado?.id
    const alvos = (eps ?? []).filter((e: any) => {
      if (!Array.isArray(e.eventos) || !e.eventos.includes(evento)) return false
      const filtro = Array.isArray(e.filtro_simulados) ? e.filtro_simulados : []
      return !(filtro.length && simId && !filtro.includes(simId)) // filtro vazio = todos os simulados
    })
    if (!alvos.length) return

    // Nome da plataforma (tenant) — para o payload trazer o NOME, não só o UUID.
    const { data: tnt } = await svc.from('simulado_tenants').select('nome, slug').eq('id', tenantId).maybeSingle()

    // Envelope no formato "guru" (fácil de filtrar no n8n). Estrutura FIXA e completa em
    // TODOS os eventos (mesmos campos sempre — os que não se aplicam vão null), para o n8n
    // não quebrar por campo ausente.
    const d = dados as any
    const agora = new Date().toISOString()
    const corpo = JSON.stringify(montarCorpoWebhook(evento, { id: tenantId, nome: (tnt as any)?.nome ?? null, slug: (tnt as any)?.slug ?? null }, tenantId, d, agora))

    await Promise.allSettled(alvos.map(async (e: any) => {
      const headers: Record<string, string> = { 'Content-Type': 'application/json', 'X-Webhook-Evento': evento }
      // Segredo guardado CRIPTOGRAFADO em repouso → descriptografa só aqui p/ assinar (texto puro legado passa direto).
      const seg = descriptografar(e.secret)
      if (seg) headers['X-Webhook-Signature'] = 'sha256=' + crypto.createHmac('sha256', seg).update(corpo).digest('hex')
      const r = await enviarComRetry(e.url, headers, corpo)
      await svc.from('simulado_webhook_saida').update({ ultimo_status: r.status, ultimo_envio: new Date().toISOString() }).eq('id', e.id)
      // Log de entrega (histórico p/ a sub-aba "Logs de saída"). Best-effort + tolerante à tabela ausente.
      try {
        await svc.from('simulado_webhook_saida_logs').insert({
          tenant_id: tenantId, webhook_id: e.id, nome: e.nome ?? null, url: e.url, evento,
          status: r.ok ? 'ok' : 'erro', http_status: r.httpStatus, ms: r.ms, erro: r.ok ? null : r.status,
        })
      } catch { /* tabela ainda não migrada → ignora */ }
    }))
  } catch {
    // best-effort — ignora
  }
}
