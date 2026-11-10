import { WorkerMetrics } from './metrics';

describe('WorkerMetrics.handle', () => {
  it('/health responde sempre (liveness)', async () => {
    const r = await new WorkerMetrics().handle('/health');
    expect(r).toMatchObject({ status: 200, body: '{"status":"ok"}' });
  });

  it('sem METRICS_TOKEN o /metrics não existe', async () => {
    expect((await new WorkerMetrics().handle('/metrics')).status).toBe(404);
  });

  it('com token exige Bearer correto', async () => {
    const m = new WorkerMetrics('token-de-metricas-1234');
    expect((await m.handle('/metrics')).status).toBe(401);
    expect((await m.handle('/metrics', 'Bearer errado')).status).toBe(401);
    expect((await m.handle('/metrics', 'token-de-metricas-1234')).status).toBe(401);
    const ok = await m.handle('/metrics', 'Bearer token-de-metricas-1234');
    expect(ok.status).toBe(200);
    expect(ok.body).toContain('transcode_jobs_total');
    expect(ok.body).toContain('process_cpu_user_seconds_total');
  });

  it('registra jobs, duração e jobs ativos', async () => {
    const m = new WorkerMetrics('token-de-metricas-1234');
    m.jobs.inc({ status: 'completed' });
    m.jobs.inc({ status: 'failed' });
    m.jobs.inc({ status: 'failed' });
    m.duration.observe(42);
    m.active.inc();
    const { body } = await m.handle('/metrics', 'Bearer token-de-metricas-1234');
    expect(body).toContain('transcode_jobs_total{status="completed"} 1');
    expect(body).toContain('transcode_jobs_total{status="failed"} 2');
    expect(body).toContain('transcode_duration_seconds_count 1');
    expect(body).toContain('transcode_jobs_active 1');
  });

  it('outras rotas dão 404', async () => {
    expect((await new WorkerMetrics().handle('/admin')).status).toBe(404);
  });
});
