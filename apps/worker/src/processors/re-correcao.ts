import { Job } from 'bullmq'

/**
 * Processor da fila `re-correcao`.
 *
 * NÃO contém lógica de nota — apenas dispara a rota interna do web
 * (/api/internal/recorrecao), que executa a MESMA regra canônica usada pela
 * server action síncrona (contextoNota/calcularNotaSessao/rankearSimulado).
 * Isso elimina a duplicação que deixava o processor antigo desatualizado
 * (tabelas pré-rename + nota ingênua corretas/total*100).
 */
const WEB_INTERNAL_URL = process.env.WEB_INTERNAL_URL
const CRON_SECRET = process.env.CRON_SECRET

export async function reCorrecaoProcessor(job: Job) {
  if (!WEB_INTERNAL_URL || !CRON_SECRET) {
    throw new Error('[re-correcao] WEB_INTERNAL_URL/CRON_SECRET não configurados')
  }
  // Re-correção de simulado grande pode levar minutos (recálculo por sessão). Timeout generoso.
  const r = await fetch(`${WEB_INTERNAL_URL}/api/internal/recorrecao`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-cron-secret': CRON_SECRET },
    body: JSON.stringify(job.data),
    signal: AbortSignal.timeout(900_000), // 15 min
  })
  const txt = await r.text()
  if (!r.ok) throw new Error(`[re-correcao] HTTP ${r.status}: ${txt.slice(0, 300)}`)
  let out: any = null
  try { out = JSON.parse(txt) } catch { /* corpo não-JSON */ }
  // ok:false real → retenta; jaAplicado (idempotência) → considera concluído.
  if (out && out.ok === false && !out.jaAplicado) throw new Error(`[re-correcao] falhou: ${out.error ?? 'erro'}`)
  return out ?? { ok: true }
}
