import './load-env' // 1º de tudo: carrega o .env (raiz do monorepo) antes dos processors
import { Worker } from 'bullmq'
import IORedis from 'ioredis'
import { pdfRelatorioProcessor } from './processors/pdf-relatorio'
import { pdfCadernoProcessor } from './processors/pdf-caderno'
import { importProcessor } from './processors/import'
import { reCorrecaoProcessor } from './processors/re-correcao'

const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
})

// Nota: o auto-encerramento NÃO é mais uma fila. Virou a rota web /api/cron/encerrar-expirados
// (tabelas corretas + rankearSimulado), chamada pelo agendador abaixo (setInterval).

const pdfWorker = new Worker('pdf-relatorio', pdfRelatorioProcessor, {
  connection,
  concurrency: 3,
})

// PDF de caderno/resultado via Gotenberg (renderiza a URL /imprimir).
const pdfCadernoWorker = new Worker('pdf-caderno', pdfCadernoProcessor, {
  connection,
  concurrency: 4,
})

const importWorker = new Worker('import', importProcessor, {
  connection,
  concurrency: 5,
})

const reCorrecaoWorker = new Worker('re-correcao', reCorrecaoProcessor, {
  connection,
  concurrency: 5,
})

const workers = [pdfWorker, pdfCadernoWorker, importWorker, reCorrecaoWorker]

workers.forEach((w) => {
  w.on('completed', (job) => console.log(`[${w.name}] Job ${job.id} concluído`))
  w.on('failed', (job, err) =>
    console.error(`[${w.name}] Job ${job?.id} falhou:`, err.message),
  )
})

// Agendador de auto-encerramento: chama a rota de cron do web a cada 60s.
// A rota é idempotente (só toca em sessões em_andamento / simulados publicado),
// então múltiplas réplicas do worker chamando em paralelo são seguras.
const WEB_INTERNAL_URL = process.env.WEB_INTERNAL_URL
const CRON_SECRET = process.env.CRON_SECRET
async function tickEncerramento() {
  if (!WEB_INTERNAL_URL || !CRON_SECRET) return
  try {
    const r = await fetch(`${WEB_INTERNAL_URL}/api/cron/encerrar-expirados`, {
      method: 'POST',
      headers: { 'x-cron-secret': CRON_SECRET },
    })
    if (!r.ok) console.error(`[cron encerramento] HTTP ${r.status}`)
    else {
      const j: any = await r.json().catch(() => null)
      if (j && (j.sessoesEncerradas || j.simuladosEncerrados)) console.log('[cron encerramento]', j)
    }
  } catch (e) {
    console.error('[cron encerramento] erro:', (e as Error).message)
  }
}
if (WEB_INTERNAL_URL && CRON_SECRET) {
  setInterval(tickEncerramento, 60_000)
  console.log('[cron encerramento] agendado a cada 60s')
} else {
  console.warn('[cron encerramento] DESATIVADO — defina WEB_INTERNAL_URL e CRON_SECRET')
}

process.on('SIGTERM', async () => {
  await Promise.all(workers.map((w) => w.close()))
  await connection.quit()
  process.exit(0)
})

console.log('Worker iniciado — filas: pdf-relatorio, pdf-caderno, import, re-correcao')
