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
async function chamarCron(caminho: string, rotulo: string, relevante: (j: any) => boolean) {
  if (!WEB_INTERNAL_URL || !CRON_SECRET) return
  try {
    const r = await fetch(`${WEB_INTERNAL_URL}${caminho}`, { method: 'POST', headers: { 'x-cron-secret': CRON_SECRET } })
    if (!r.ok) { console.error(`[${rotulo}] HTTP ${r.status}`); return }
    const j: any = await r.json().catch(() => null)
    if (j && relevante(j)) console.log(`[${rotulo}]`, j)
  } catch (e) {
    console.error(`[${rotulo}] erro:`, (e as Error).message)
  }
}
if (WEB_INTERNAL_URL && CRON_SECRET) {
  setInterval(() => { void chamarCron('/api/cron/encerrar-expirados', 'cron encerramento', (j) => !!(j.sessoesEncerradas || j.simuladosEncerrados)) }, 60_000)
  setInterval(() => { void chamarCron('/api/cron/curseduca-jobs', 'cron curseduca', (j) => !!j.processados) }, 60_000)
  setInterval(() => { void chamarCron('/api/cron/curseduca-sync', 'cron curseduca-sync', (j) => !!j.rodadas) }, 60_000)
  setInterval(() => { void chamarCron('/api/cron/integracoes-eventos', 'cron integracoes-eventos', (j) => !!(j.processados || j.erros)) }, 60_000)
  // Self-healing do elo grupo→banco: destrava alunos que entraram no grupo mas ficaram sem
  // pasta/matrícula (lag de deploy, banco vinculado depois, erro transitório). Idempotente.
  setInterval(() => { void chamarCron('/api/cron/sincronizar-grupos-bancos', 'cron sync grupos→bancos', (j) => !!(j.pastaInseridos || j.matriculasInseridas)) }, 180_000)
  console.log('[cron] agendado: encerramento + import + sync Curseduca + eventos Integrações (60s); sync grupos→bancos (180s)')
} else {
  console.warn('[cron] DESATIVADO — defina WEB_INTERNAL_URL e CRON_SECRET')
}

process.on('SIGTERM', async () => {
  await Promise.all(workers.map((w) => w.close()))
  await connection.quit()
  process.exit(0)
})

console.log('Worker iniciado — filas: pdf-relatorio, pdf-caderno, import, re-correcao')
