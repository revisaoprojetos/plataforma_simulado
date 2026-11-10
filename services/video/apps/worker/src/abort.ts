import { UnrecoverableError } from 'bullmq';

/** O worker recebeu SIGTERM/SIGINT: o job em andamento deve voltar à fila (sem gastar tentativa). */
export class ShutdownError extends Error {
  constructor() {
    super('worker encerrando: job devolvido à fila');
    this.name = 'ShutdownError';
  }
}

/** O job passou do tempo total permitido. Não adianta repetir o mesmo arquivo, então não há retry. */
export class JobTimeoutError extends UnrecoverableError {
  constructor(timeoutMs: number) {
    super(`processamento excedeu o tempo limite de ${Math.round(timeoutMs / 60000)} min`);
    this.name = 'JobTimeoutError';
  }
}

/** Lança o motivo do cancelamento (ShutdownError ou JobTimeoutError) se o sinal já foi acionado. */
export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw signal.reason instanceof Error ? signal.reason : new ShutdownError();
}
