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
  // EGRESS: intervalos aumentados (2026-09-26). O auto-encerramento lê sessões+respostas em_andamento a
  // cada tick; a validação server-side por acesso a questão (U1) já auto-finaliza no estouro, então o cron
  // é só a REDE DE SEGURANÇA — 180s cobre bem sem varrer o banco a cada minuto.
  setInterval(() => { void chamarCron('/api/cron/encerrar-expirados', 'cron encerramento', (j) => !!(j.sessoesEncerradas || j.simuladosEncerrados)) }, 180_000)
  setInterval(() => { void chamarCron('/api/cron/curseduca-jobs', 'cron curseduca', (j) => !!j.processados) }, 60_000)
  // curseduca-sync lê ~18k canais/tick no modo agrupamento → 300s (não precisa ser a cada minuto).
  setInterval(() => { void chamarCron('/api/cron/curseduca-sync', 'cron curseduca-sync', (j) => !!j.rodadas) }, 300_000)
  setInterval(() => { void chamarCron('/api/cron/integracoes-eventos', 'cron integracoes-eventos', (j) => !!(j.processados || j.erros)) }, 60_000)
  // Leitura: publica as aulas AGENDADAS cuja data (publicarEm) já chegou → publicado=true. Idempotente.
  // 300s: 5 min de atraso máx. p/ publicar uma aula agendada é aceitável.
  setInterval(() => { void chamarCron('/api/cron/leitura-publicar', 'cron leitura-publicar', (j) => !!j.publicadas) }, 300_000)
  // Self-healing do elo grupo→banco (lê vínculos+membros+matrículas inteiros). Não precisa ser rápido →
  // 30 min (o webhook de entrada no grupo já matricula na hora; isto é só a rede de segurança).
  setInterval(() => { void chamarCron('/api/cron/sincronizar-grupos-bancos', 'cron sync grupos→bancos', (j) => !!(j.pastaInseridos || j.matriculasInseridas)) }, 1_800_000)
  // Warm-up de cache de relatórios: 60 min (antes 30). Recomputar com mais frequência que o TTL só gasta
  // egress; o remember() serve do cache enquanto não expira.
  setInterval(() => { void chamarCron('/api/cron/warm-cache', 'cron warm-cache', (j) => !!j.aquecidos) }, 3_600_000)
  // Reconciliação Guru (rede de segurança): reaplica liberações das assinaturas ativas ALTERADAS
  // nas últimas 48h (incremental → barato). A cada 6h: robusto a restart do worker (não depende de
  // um único disparo diário) e a janela de 48h cobre qualquer buraco entre execuções. Só concede.
  setInterval(() => { void chamarCron('/api/cron/guru-reconcile', 'cron guru-reconcile', (j) => !!(j.resultados?.length)) }, 21_600_000)
  // Gamificação: zera a sequência (streak) de quem não teve atividade ontem. De hora em hora (idempotente).
  setInterval(() => { void chamarCron('/api/cron/gamificacao-streak', 'cron gamificacao-streak', (j) => !!j.zerados) }, 3_600_000)
  // Engajamento: webhook de inatividade (aluno parou de entrar). De hora em hora (idempotente pelo log).
  setInterval(() => { void chamarCron('/api/cron/gamificacao-engajamento', 'cron gamificacao-engajamento', (j) => !!j.enviados) }, 3_600_000)
  // Engajamento da LEITURA: webhook de inatividade POR MÓDULO. Lê respostas de leitura em massa → 3h
  // (inatividade não precisa de granularidade de 1h).
  setInterval(() => { void chamarCron('/api/cron/leitura-engajamento', 'cron leitura-engajamento', (j) => !!j.enviados) }, 10_800_000)
  // Armazenamento: BFS de TODO o Storage (caro). A cada 24h (idempotente); o console dispara sob demanda
  // quando precisa reconciliar na hora.
  setInterval(() => { void chamarCron('/api/cron/storage-reconcile', 'cron storage', (j) => !!(j.inseridos || j.removidos)) }, 86_400_000)
  console.log('[cron] agendado (egress-otimizado): encerramento 180s; curseduca-jobs/integracoes 60s; curseduca-sync/leitura-publicar 300s; sync grupos→bancos 30min; warm-cache 60min; guru-reconcile 6h; gamificacao-streak/engajamento 1h; leitura-engajamento 3h; storage-reconcile 24h')
} else {
  console.warn('[cron] DESATIVADO — defina WEB_INTERNAL_URL e CRON_SECRET')
}

process.on('SIGTERM', async () => {
  await Promise.all(workers.map((w) => w.close()))
  await connection.quit()
  process.exit(0)
})

console.log('Worker iniciado — filas: pdf-relatorio, pdf-caderno, import, re-correcao')
