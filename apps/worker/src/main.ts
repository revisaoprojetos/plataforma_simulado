import 'dotenv/config'
import { Worker } from 'bullmq'
import IORedis from 'ioredis'
import { autoEncerramentoProcessor } from './processors/auto-encerramento'
import { pdfRelatorioProcessor } from './processors/pdf-relatorio'
import { pdfCadernoProcessor } from './processors/pdf-caderno'
import { importProcessor } from './processors/import'
import { reCorrecaoProcessor } from './processors/re-correcao'

const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
})

const autoEncerramentoWorker = new Worker('auto-encerramento', autoEncerramentoProcessor, {
  connection,
  concurrency: 10,
})

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

const workers = [autoEncerramentoWorker, pdfWorker, pdfCadernoWorker, importWorker, reCorrecaoWorker]

workers.forEach((w) => {
  w.on('completed', (job) => console.log(`[${w.name}] Job ${job.id} concluído`))
  w.on('failed', (job, err) =>
    console.error(`[${w.name}] Job ${job?.id} falhou:`, err.message),
  )
})

process.on('SIGTERM', async () => {
  await Promise.all(workers.map((w) => w.close()))
  await connection.quit()
  process.exit(0)
})

console.log('Worker iniciado — filas: auto-encerramento, pdf-relatorio, pdf-caderno, import, re-correcao')
