import 'server-only'

/**
 * Envelope ÚNICO dos webhooks de saída — usado pelo disparo real (`dispatch.ts`) E pelo "Enviar teste"
 * do admin, para o payload de teste ser IDÊNTICO ao de produção. Estrutura fixa em todos os eventos
 * (campos que não se aplicam vão null) para o n8n não quebrar por campo ausente.
 */

// Status "humano" de cada evento (estilo `status` do payload da Guru).
export const STATUS_EVENTO: Record<string, string> = {
  'estudante.iniciou': 'iniciado',
  'estudante.finalizou': 'finalizado',
  'estudante.nao_finalizou': 'nao_finalizado',
  'estudante.visualizou_relatorio': 'relatorio_visualizado',
  'estudante.baixou_relatorio': 'relatorio_baixado',
  'gamificacao.inativo': 'inativo',
  'gamificacao.sequencia': 'sequencia',
  'gamificacao.marco': 'marco',
}

export function montarCorpoWebhook(
  evento: string,
  plataforma: { id: string | null; nome: string | null; slug: string | null },
  tenantId: string,
  d: any,
  agoraISO: string,
): Record<string, unknown> {
  return {
    id: d.sessao_id ?? null,
    type: 'estudante',
    webhook_type: 'progressao_estudante',
    plataforma,
    event: evento,
    status: STATUS_EVENTO[evento] ?? evento,
    dates: { created_at: agoraISO, occurred_at: agoraISO },
    tenant_id: tenantId,
    contact: {
      id: d.contact?.id ?? null,
      name: d.contact?.name ?? null,
      email: d.contact?.email ?? null,
      doc: d.contact?.doc ?? null,
      phone_number: d.contact?.phone_number ?? null,
      phone_local_code: d.contact?.phone_local_code ?? null,
      plano: d.contact?.plano ?? null,
    },
    simulado: {
      id: d.simulado?.id ?? null,
      name: d.simulado?.name ?? null,
    },
    resultado: {
      sessao_id: d.sessao_id ?? null,
      nota: d.nota ?? null,
      acertos: d.acertos ?? null,
      total: d.total ?? null,
      tentativa: d.tentativa ?? null,
      motivo: d.motivo ?? null,
    },
    // Bloco de gamificação (eventos gamificacao.*) — preenchido nesses eventos, null nos demais.
    engajamento: {
      tipo: d.engajamento?.tipo ?? null,
      dias: d.engajamento?.dias ?? null,
      marco: d.engajamento?.marco ?? null,
      streak_atual: d.engajamento?.streak_atual ?? null,
      streak_maior: d.engajamento?.streak_maior ?? null,
      mensagem: d.engajamento?.mensagem ?? null,
    },
  }
}

/** Dados de EXEMPLO (pré-envelope) para o "Enviar teste" — variam por evento, como o envio real. */
export function dadosExemploWebhook(evento: string): any {
  const finalizado = evento === 'estudante.finalizou'
  const ehGam = evento.startsWith('gamificacao.')
  const contact = { id: 'a17b93c2-4d8e-4f1a-b6c0-2e9f7d3a5c88', name: 'João da Silva (teste)', email: 'joao.teste@example.com', doc: '12345678900', phone_number: '5571999670570', phone_local_code: '71', plano: 'passaporte' }
  const engajamento = evento === 'gamificacao.inativo'
    ? { tipo: 'inativo', dias: 1, marco: null, streak_atual: 3, streak_maior: 12, mensagem: 'Oi João! Faz 1 dia que você não aparece — bora voltar? 💪' }
    : evento === 'gamificacao.sequencia'
      ? { tipo: 'sequencia', dias: 4, marco: null, streak_atual: 4, streak_maior: 12, mensagem: 'Mandou bem, João! 4 dias seguidos. Continue firme! 🔥' }
      : evento === 'gamificacao.marco'
        ? { tipo: 'marco', dias: null, marco: 7, streak_atual: 7, streak_maior: 12, mensagem: 'Parabéns, João! 🏆 7 dias consecutivos!' }
        : undefined
  return {
    sessao_id: ehGam ? null : '3f9a1c7e-0b2d-4e6a-9c11-8d5e2a7b4f10',
    contact,
    simulado: ehGam ? undefined : { id: 'b2c4d6e8-1a3b-5c7d-9e0f-2b4d6f8a0c11', name: 'Simulado de teste' },
    nota: finalizado ? 8.5 : undefined,
    acertos: finalizado ? 17 : undefined,
    total: finalizado ? 20 : undefined,
    tentativa: ehGam ? undefined : 1,
    motivo: evento === 'estudante.nao_finalizou' ? 'tempo_esgotado' : undefined,
    engajamento,
  }
}

/** POST assinado (HMAC quando há segredo) com timeout. Retorna status legível + código HTTP + ms. */
export async function enviarWebhookHttp(
  url: string,
  evento: string,
  corpo: string,
  segredo: string | null,
): Promise<{ ok: boolean; status: number | null; ms: number; texto: string }> {
  const crypto = await import('crypto')
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'X-Webhook-Evento': evento }
  if (segredo) headers['X-Webhook-Signature'] = 'sha256=' + crypto.createHmac('sha256', segredo).update(corpo).digest('hex')
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 8000)
  const t0 = Date.now()
  try {
    const res = await fetch(url, { method: 'POST', headers, body: corpo, signal: ctrl.signal })
    clearTimeout(timer)
    const ms = Date.now() - t0
    return { ok: res.ok, status: res.status, ms, texto: res.ok ? `ok (${res.status})` : `erro (${res.status})` }
  } catch (e: any) {
    clearTimeout(timer)
    return { ok: false, status: null, ms: Date.now() - t0, texto: e?.name === 'AbortError' ? 'timeout (8s)' : 'erro de rede' }
  }
}
