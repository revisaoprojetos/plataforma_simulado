import './load-env' // 1º de tudo: carrega o .env (raiz do monorepo) antes dos processors
import { Worker } from 'bullmq'
import IORedis from 'ioredis'
import { pdfRelatorioProcessor } from './processors/pdf-relatorio'
import { pdfCadernoProcessor } from './processors/pdf-caderno'
import { importProcessor } from './processors/import'
import { reCorrecaoProcessor } from './processors/re-correcao'

// Fila BullMQ em Redis dedicado (noeviction) quando REDIS_QUEUE_URL existe; senão cai no REDIS_URL (retrocompatível).
const connection = new IORedis(process.env.REDIS_QUEUE_URL ?? process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
})

// Nota: o auto-encerramento NÃO é mais uma fila. Virou a rota web /api/cron/encerrar-expirados
// (tabelas corretas + rankearSimulado), chamada pelo agendador abaixo (setInterval).

const pdfWorker = new Worker('pdf-relatorio', pdfRelatorioProcessor, {
  connection,
  // CPU/RAM: PDF (Puppeteer) é o mais pesado -> 2 por vez (antes 3). Histórico pequeno no Redis.
  concurrency: 2,
  removeOnComplete: { count: 50 },
  removeOnFail: { count: 200 },
})

// PDF de caderno/resultado via Gotenberg (renderiza a URL /imprimir).
const pdfCadernoWorker = new Worker('pdf-caderno', pdfCadernoProcessor, {
  connection,
  concurrency: 2, // antes 4: cada job renderiza no Gotenberg
  removeOnComplete: { count: 50 },
  removeOnFail: { count: 200 },
})

const importWorker = new Worker('import', importProcessor, {
  connection,
  concurrency: 2, // antes 5: import é CPU/DB-bound
  removeOnComplete: { count: 50 },
  removeOnFail: { count: 200 },
})

const reCorrecaoWorker = new Worker('re-correcao', reCorrecaoProcessor, {
  connection,
  concurrency: 2, // antes 5: re-correção é transacional e pesada no Postgres
  removeOnComplete: { count: 50 },
  removeOnFail: { count: 200 },
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
// Guarda de sobreposição por rota: se a rodada anterior ainda roda, pula (evita empilhar chamadas pesadas).
const emVoo = new Set<string>()
async function chamarCron(caminho: string, rotulo: string, relevante: (j: any) => boolean, intervaloMs = 60_000) {
  if (!WEB_INTERNAL_URL || !CRON_SECRET) return
  if (emVoo.has(caminho)) { console.warn(`[${rotulo}] rodada anterior ainda em andamento — pulada`); return }
  emVoo.add(caminho)
  // Timeout do fetch: min(intervalo, 280s), mínimo 60s (a rota continua no web mesmo se abortarmos aqui).
  const timeoutMs = Math.max(60_000, Math.min(intervaloMs, 280_000))
  try {
    const r = await fetch(`${WEB_INTERNAL_URL}${caminho}`, { method: 'POST', headers: { 'x-cron-secret': CRON_SECRET }, signal: AbortSignal.timeout(timeoutMs) })
    if (!r.ok) { console.error(`[${rotulo}] HTTP ${r.status}`); return }
    const j: any = await r.json().catch(() => null)
    if (j && relevante(j)) console.log(`[${rotulo}]`, j)
  } catch (e) {
    console.error(`[${rotulo}] erro:`, (e as Error).message)
  } finally {
    emVoo.delete(caminho)
  }
}
// ── Agendador (CPU/RAM): rotas LEVES rodam direto (precisam de latência); rotas PESADAS entram numa fila
// SERIAL (1 por vez, nunca em paralelo entre si) com jitter inicial aleatório (evita todas dispararem juntas
// no boot/na hora cheia). Rotas "noturnas" só rodam na janela 01–06h (Brasília): nada que o aluno precise
// em tempo real. Uma rota já enfileirada/rodando não é enfileirada de novo (sem pile-up).
const filaPesada: Array<{ caminho: string; run: () => Promise<void> }> = []
const naFila = new Set<string>()
let drenando = false
async function drenar() {
  if (drenando) return
  drenando = true
  try {
    while (filaPesada.length) {
      const it = filaPesada.shift()!
      try { await it.run() } finally { naFila.delete(it.caminho) }
    }
  } finally { drenando = false }
}
function horaBrasilia(): number {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false }).format(new Date())) % 24
}
const naJanelaNoturna = () => { const h = horaBrasilia(); return h >= 1 && h < 6 }

type Opc = { pesado?: boolean; noturno?: boolean }
function agendar(caminho: string, rotulo: string, relevante: (j: any) => boolean, intervaloMs: number, opc: Opc = {}) {
  const tick = () => {
    if (opc.noturno && !naJanelaNoturna()) return
    if (!opc.pesado) { void chamarCron(caminho, rotulo, relevante, intervaloMs); return }
    if (naFila.has(caminho)) return
    naFila.add(caminho)
    filaPesada.push({ caminho, run: () => chamarCron(caminho, rotulo, relevante, intervaloMs) })
    void drenar()
  }
  if (opc.pesado) {
    // Jitter: 1ª execução entre 0 e min(intervalo, 5 min) depois do boot; depois, cadência fixa.
    setTimeout(() => { tick(); setInterval(tick, intervaloMs) }, Math.floor(Math.random() * Math.min(intervaloMs, 300_000)))
  } else setInterval(tick, intervaloMs)
}
const MIN = 60_000, H = 3_600_000

if (WEB_INTERNAL_URL && CRON_SECRET) {
  // ── LEVES (latência importa; todas têm early-exit barato na rota) ──
  // Encerramento: rede de segurança (a validação U1 por acesso já auto-finaliza); 180s mantido — precisão de sessão/janela.
  agendar('/api/cron/encerrar-expirados', 'cron encerramento', (j) => !!(j.sessoesEncerradas || j.simuladosEncerrados), 3 * MIN)
  // Jobs de import/eventos: 60s→120/180s (reprocesso de 'erro' por até 48h era a cada minuto; tolera atraso).
  agendar('/api/cron/curseduca-jobs', 'cron curseduca', (j) => !!j.processados, 2 * MIN)
  agendar('/api/cron/integracoes-eventos', 'cron integracoes-eventos', (j) => !!(j.processados || j.erros), 3 * MIN)
  // Publicação agendada de aulas/edições: 5→10 min (atraso máx. de 10 min na liberação por data é aceitável).
  agendar('/api/cron/leitura-publicar', 'cron leitura-publicar', (j) => !!j.publicadas, 10 * MIN)
  agendar('/api/cron/jurisclub-publicar', 'cron jurisclub-publicar', (j) => !!j.publicadas, 10 * MIN)
  // Liberação de acesso por data (rota agora pré-checa transição vencida): 5 min mantido.
  agendar('/api/cron/liberacao-transicoes', 'cron liberacao-transicoes', (j) => !!(j.resultados?.some((r: any) => r.ativados || r.expirados)), 5 * MIN)
  agendar('/api/cron/guru-silencio', 'cron guru-silencio', (j) => j && j.ok === false, 15 * MIN)

  // ── PESADAS (fila serial + jitter) ──
  // Agrupamento por nome roda em lotes por tick (cursor) → mantém 300s.
  agendar('/api/cron/curseduca-sync', 'cron curseduca-sync', (j) => !!j.rodadas, 5 * MIN, { pesado: true })
  // Self-healing grupo→banco (webhook já matricula na hora): 30min→2h.
  agendar('/api/cron/sincronizar-grupos-bancos', 'cron sync grupos→bancos', (j) => !!(j.pastaInseridos || j.matriculasInseridas), 2 * H, { pesado: true })
  agendar('/api/cron/cache-manutencao', 'cron cache-manutencao', (j) => !!(j.cache?.limpou || j.ok === false), 30 * MIN, { pesado: true })
  // Warm-cache: já gated por atividade recente na rota; só entra na fila serial.
  agendar('/api/cron/warm-cache', 'cron warm-cache', (j) => !!j.aquecidos, H, { pesado: true })
  agendar('/api/cron/guru-reconcile', 'cron guru-reconcile', (j) => !!(j.resultados?.length), 6 * H, { pesado: true })
  // Gamificação: streak é "dia virou" → janela noturna. Engajamento envia webhook ao aluno → NÃO noturno (só serial).
  agendar('/api/cron/gamificacao-streak', 'cron gamificacao-streak', (j) => !!j.zerados, H, { pesado: true, noturno: true })
  agendar('/api/cron/gamificacao-engajamento', 'cron gamificacao-engajamento', (j) => !!j.enviados, H, { pesado: true })
  agendar('/api/cron/leitura-engajamento', 'cron leitura-engajamento', (j) => !!j.enviados, 3 * H, { pesado: true })
  // Rolls de snapshot (1ª abertura do dia pronta): janela noturna, a cada 30 min dentro dela (teto/rodada mantido).
  // Fora da janela o aluno cai no recálculo sob demanda já existente (comportamento anterior ao roll).
  for (const r of ['painel-roll', 'home-roll', 'desempenho-roll', 'cursos-roll', 'perfil-roll']) {
    agendar(`/api/cron/${r}`, `cron ${r}`, (j) => !!j.rolados, 30 * MIN, { pesado: true, noturno: true })
  }
  // Agregado do adaptativo (passada funda às 03h BRT exige rodar nessa hora): hora a hora, mas serial.
  agendar('/api/cron/adaptativo-agg', 'cron adaptativo-agg', (j) => j && j.ok === false, H, { pesado: true })
  // Diárias de retenção/varredura: serial (a cada 24h).
  agendar('/api/cron/storage-reconcile', 'cron storage', (j) => !!(j.inseridos || j.removidos), 24 * H, { pesado: true })
  agendar('/api/cron/lixeira-purge?aplicar=1', 'cron lixeira-purge', (j) => !!j.totalPurgados, 24 * H, { pesado: true })
  agendar('/api/cron/acessos-purge', 'cron acessos-purge', (j) => !!(j.atividades || j.acessos), 24 * H, { pesado: true })
  agendar('/api/cron/api-uso-purge', 'cron api-uso-purge', (j) => !!j.apagadas, 24 * H, { pesado: true })
  agendar('/api/cron/admin-rastreio-purge', 'cron admin-rastreio-purge', (j) => !!(j.atividades || j.sessoes), 24 * H, { pesado: true })
  agendar('/api/cron/egress-monitor', 'cron egress-monitor', (j) => j && j.ok === false, 6 * H, { pesado: true })
  agendar('/api/cron/seguranca-varredura', 'cron seguranca-varredura', (j) => !!(j.novos || j.notificados), 24 * H, { pesado: true })
  console.log('[cron] agendado (CPU-otimizado): leves direto (encerramento 3min, curseduca-jobs 2min, integracoes 3min, publicar 10min, liberacao 5min); pesadas em fila SERIAL c/ jitter; rolls+streak só 01–06h BRT')
} else {
  console.warn('[cron] DESATIVADO — defina WEB_INTERNAL_URL e CRON_SECRET')
}

process.on('SIGTERM', async () => {
  await Promise.all(workers.map((w) => w.close()))
  await connection.quit()
  process.exit(0)
})

console.log('Worker iniciado — filas: pdf-relatorio, pdf-caderno, import, re-correcao')

