import { Queue } from 'bullmq'
import IORedis from 'ioredis'

/**
 * Produtor da fila `pdf-caderno`. O web só enfileira; o worker consome, chama o
 * Gotenberg (renderiza a URL /imprimir), sobe o PDF no storage e atualiza o job.
 *
 * Singleton lazy: a conexão Redis só abre quando o primeiro job é enfileirado —
 * assim o build/dev do Next não exige Redis no ar até realmente gerar um PDF.
 */

export interface PdfCadernoJob {
  jobId: string // id da linha em simulado_pdf_jobs
  url: string // URL interna /imprimir/... (com pdftoken quando necessário)
  tenantId: string
}

let queue: Queue<PdfCadernoJob> | null = null
let connection: IORedis | null = null

export function getPdfQueue(): Queue<PdfCadernoJob> {
  if (queue) return queue
  connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
  })
  queue = new Queue<PdfCadernoJob>('pdf-caderno', { connection })
  return queue
}

export async function enfileirarPdfCaderno(data: PdfCadernoJob) {
  return getPdfQueue().add('gerar', data, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5_000 },
    removeOnComplete: 100,
    removeOnFail: 200,
  })
}
