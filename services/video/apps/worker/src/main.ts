import { PrismaClient } from '@prisma/client';
import { Job, UnrecoverableError, WaitingError, Worker } from 'bullmq';
import Redis from 'ioredis';
import { tmpdir } from 'node:os';
import { JobTimeoutError, ShutdownError } from './abort';
import { cleanStaleWorkDirs, diskUsage } from './disk';
import { parseEnv } from './env';
import { WorkerMetrics } from './metrics';
import { Deps, processVideo } from './pipeline';
import { TRANSCODE_QUEUE, TranscodeJob } from './queue';
import { Storage } from './storage';

const log: Deps['log'] = (msg, extra) =>
  console.log(JSON.stringify({ time: new Date().toISOString(), msg, ...extra }));

async function main(): Promise<void> {
  const env = parseEnv(); // também resolve NOME_FILE (secrets) em process.env antes do Prisma
  const prisma = new PrismaClient();
  const deps: Deps = { env, prisma, storage: new Storage(env), log };
  const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  const metrics = new WorkerMetrics(env.METRICS_TOKEN);
  const server = metrics.listen(env.METRICS_PORT);
  const workDir = env.WORK_DIR ?? tmpdir();

  // Lixo de execuções anteriores mortas à força (SIGKILL/OOM). Só apaga o que é mais velho que um job inteiro.
  const removed = await cleanStaleWorkDirs(workDir, env.JOB_TIMEOUT_MS + 10 * 60_000).catch(
    () => [] as string[],
  );
  if (removed.length) log('pastas temporárias órfãs removidas', { count: removed.length });

  const refreshDisk = () =>
    diskUsage(workDir)
      .then((d) => {
        metrics.workDirFree.set(d.freeBytes);
        metrics.workDirTotal.set(d.totalBytes);
      })
      .catch(() => undefined);
  await refreshDisk();
  const diskTimer = setInterval(() => void refreshDisk(), 30_000);
  diskTimer.unref();

  /** Um AbortController por job em andamento: cancela por timeout do job ou por SIGTERM. */
  const running = new Set<AbortController>();
  let stopping = false;

  const worker = new Worker<TranscodeJob>(
    TRANSCODE_QUEUE,
    async (job: Job<TranscodeJob>, token?: string) => {
      const stop = metrics.duration.startTimer();
      metrics.active.inc();
      const ac = new AbortController();
      running.add(ac);
      // Tempo máximo do JOB inteiro (download + qualidades + upload), não de cada comando.
      const timer = setTimeout(
        () => ac.abort(new JobTimeoutError(env.JOB_TIMEOUT_MS)),
        env.JOB_TIMEOUT_MS,
      );
      try {
        await processVideo(deps, job.data, ac.signal);
        metrics.jobs.inc({ status: 'completed' });
      } catch (err) {
        // Erros de abort do S3/stream chegam como AbortError: o motivo real está no sinal.
        const e: unknown = ac.signal.aborted ? ac.signal.reason : err;
        if (e instanceof ShutdownError && token) {
          // Devolve o job à fila SEM gastar tentativa; outro worker (ou este, no restart) recomeça do zero.
          await prisma.video
            .updateMany({
              where: { id: job.data.videoId, tenantId: job.data.tenantId, status: 'processing' },
              data: { status: 'queued' },
            })
            .catch(() => undefined);
          await job.moveToWait(token);
          metrics.jobs.inc({ status: 'requeued' });
          log('job devolvido à fila (worker encerrando)', { videoId: job.data.videoId });
          throw new WaitingError();
        }
        metrics.jobs.inc({ status: e instanceof JobTimeoutError ? 'timeout' : 'failed' });
        throw e;
      } finally {
        clearTimeout(timer);
        running.delete(ac);
        stop();
        metrics.active.dec();
      }
    },
    {
      connection,
      concurrency: env.WORKER_CONCURRENCY,
      // O BullMQ renova o lock a cada lockDuration/2 enquanto o event loop vive (o ffmpeg é processo filho).
      // Se o processo morrer (SIGKILL/OOM), em ~lockDuration + stalledInterval o job é retomado por outro worker.
      lockDuration: env.WORKER_LOCK_DURATION_MS,
      stalledInterval: env.WORKER_STALLED_INTERVAL_MS,
      maxStalledCount: env.WORKER_MAX_STALLED_COUNT,
    },
  );

  worker.on('failed', (job, err) => {
    if (!job) return;
    const attempts = job.opts.attempts ?? 1;
    const finalFailure = err instanceof UnrecoverableError || job.attemptsMade >= attempts;
    log('falha no processamento', {
      videoId: job.data.videoId,
      attempt: job.attemptsMade,
      attempts,
      finalFailure,
      error: err.message,
    });
    if (!finalFailure) return;
    // Só marca "failed" quando não haverá mais tentativas.
    prisma.video
      .updateMany({
        where: { id: job.data.videoId, tenantId: job.data.tenantId },
        data: { status: 'failed', error: err.message.slice(0, 500) },
      })
      .catch((e: Error) => log('não foi possível gravar a falha', { error: e.message }));
  });
  worker.on('error', (err) => log('erro no worker', { error: err.message }));

  log('worker pronto', {
    queue: TRANSCODE_QUEUE,
    concurrency: env.WORKER_CONCURRENCY,
    jobTimeoutMs: env.JOB_TIMEOUT_MS,
    lockDurationMs: env.WORKER_LOCK_DURATION_MS,
    stalledIntervalMs: env.WORKER_STALLED_INTERVAL_MS,
  });

  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    log('encerrando worker', { signal, activeJobs: running.size });
    // Teto absoluto: garante a saída mesmo se algo travar (o stop_grace_period do Swarm é maior).
    setTimeout(() => process.exit(1), env.SHUTDOWN_DRAIN_MS + 90_000).unref();

    // 1) Para de pegar jobs novos; close() espera os ativos terminarem.
    const closing = worker.close();
    // 2) Passado o prazo de "drenagem", cancela o que sobrou: mata o ffmpeg e devolve o job à fila.
    const abortTimer = setTimeout(() => {
      for (const ac of running) ac.abort(new ShutdownError());
    }, env.SHUTDOWN_DRAIN_MS);
    await closing;
    clearTimeout(abortTimer);

    clearInterval(diskTimer);
    await prisma.$disconnect();
    connection.disconnect();
    server.close();
    log('worker encerrado');
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((e: Error) => {
  console.error(e.message);
  process.exit(1);
});
