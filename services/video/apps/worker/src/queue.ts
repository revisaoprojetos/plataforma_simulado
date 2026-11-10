/** Contrato com a API (apps/api/src/queue/transcode.queue.ts) — manter os dois lados iguais. */
export const TRANSCODE_QUEUE = 'transcode';

export interface TranscodeJob {
  videoId: string;
  tenantId: string;
}
