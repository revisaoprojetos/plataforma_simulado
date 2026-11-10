import { BadRequestException } from '@nestjs/common';

export interface Period {
  /** início, inclusivo */
  from: Date;
  /** fim, exclusivo */
  to: Date;
}

export const DEFAULT_DAYS = 30;
export const MAX_DAYS = 366;
const DAY_MS = 86_400_000;

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function parse(value: string, what: string): Date {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new BadRequestException(`${what} inválido: "${value}"`);
  return d;
}

/**
 * Período do relatório em UTC. Sem parâmetros: os últimos 30 dias até agora.
 * `to` só com data ("2026-10-31") inclui o dia inteiro. Máximo de 366 dias.
 */
export function resolvePeriod(from?: string, to?: string, now = new Date()): Period {
  let end: Date;
  if (!to) end = now;
  else if (DATE_ONLY.test(to)) end = new Date(parse(to, 'to').getTime() + DAY_MS);
  else end = parse(to, 'to');

  const start = from ? parse(from, 'from') : new Date(end.getTime() - DEFAULT_DAYS * DAY_MS);
  if (start >= end) throw new BadRequestException('"from" deve ser anterior a "to"');
  if (end.getTime() - start.getTime() > MAX_DAYS * DAY_MS) {
    throw new BadRequestException(`O período máximo é de ${MAX_DAYS} dias`);
  }
  return { from: start, to: end };
}

/** Todos os dias (UTC, "YYYY-MM-DD") do período, para preencher com zero os dias sem acesso. */
export function daysOf({ from, to }: Period): string[] {
  const days: string[] = [];
  const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  while (cursor < to) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}
