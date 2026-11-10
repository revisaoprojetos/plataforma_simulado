import { NextFunction, Request, Response } from 'express';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

const store = new AsyncLocalStorage<{ id: string }>();

/** ID de correlação da requisição em andamento (para logs e respostas de erro). */
export const currentCorrelationId = (): string | undefined => store.getStore()?.id;

// Aceita o ID de um proxy/cliente só se for curto e inofensivo (nada de quebra de linha em logs).
const VALID = /^[A-Za-z0-9._-]{8,64}$/;

/**
 * Atribui um `X-Correlation-Id` a cada requisição (reaproveita o recebido, se válido), devolve-o
 * no cabeçalho da resposta e o deixa disponível em `req.id` e no contexto assíncrono.
 */
export function correlationMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers['x-correlation-id'];
  const id = typeof incoming === 'string' && VALID.test(incoming) ? incoming : randomUUID();
  res.setHeader('X-Correlation-Id', id);
  (req as Request & { id: string }).id = id;
  store.run({ id }, next);
}

/** Esconde tokens de playback (`?t=`) para que nunca apareçam em logs. */
export function redactUrl(url: string): string {
  return url.replace(/([?&])t=[^&#]*/g, '$1t=[redacted]');
}
