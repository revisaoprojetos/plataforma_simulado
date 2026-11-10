import { BadRequestException } from '@nestjs/common';

const DAY_MS = 86_400_000;
/** São Paulo não tem horário de verão desde 2019: o deslocamento é fixo (UTC−3). */
const SAO_PAULO = '-03:00';

/**
 * Converte a data enviada pelo sistema integrado em instante UTC.
 * - "2026-11-30": o dia inteiro em America/Sao_Paulo (início = 00:00, fim = 23:59:59.999);
 * - com "Z" ou deslocamento ("+02:00"): como veio;
 * - data-hora sem fuso: horário de São Paulo.
 */
export function parseWhen(value: string, edge: 'start' | 'end', field: string): Date {
  const v = value.trim();
  let iso: string;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    iso = edge === 'start' ? `${v}T00:00:00.000${SAO_PAULO}` : `${v}T23:59:59.999${SAO_PAULO}`;
  } else if (/(Z|[+-]\d{2}:?\d{2})$/i.test(v)) {
    iso = v;
  } else {
    iso = `${v}${SAO_PAULO}`;
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new BadRequestException(`${field} inválido: "${value}"`);
  return d;
}

export interface WindowInput {
  startsAt?: string;
  endsAt?: string;
  accessDays?: number;
}

/**
 * Janela de acesso pedida pelo sistema integrado. `accessDays` conta a partir do início
 * (ou de agora, se não houver início). Sem nenhuma data: acesso sem limite.
 */
export function resolveWindow(
  input: WindowInput,
  now: Date = new Date(),
): { startsAt: Date | null; endsAt: Date | null } {
  if (input.endsAt !== undefined && input.accessDays !== undefined) {
    throw new BadRequestException('Informe endsAt ou accessDays, não os dois');
  }
  const startsAt = input.startsAt ? parseWhen(input.startsAt, 'start', 'startsAt') : null;
  let endsAt: Date | null = null;
  if (input.endsAt) endsAt = parseWhen(input.endsAt, 'end', 'endsAt');
  else if (input.accessDays !== undefined) {
    endsAt = new Date((startsAt ?? now).getTime() + input.accessDays * DAY_MS);
  }
  if (endsAt && endsAt <= (startsAt ?? now)) {
    throw new BadRequestException('O fim do acesso deve ser depois do início');
  }
  return { startsAt, endsAt };
}

/** A chamada trouxe alguma data/prazo? (sem nenhum, uma matrícula existente mantém a janela atual) */
export const hasWindowInput = (d: WindowInput): boolean =>
  d.startsAt !== undefined || d.endsAt !== undefined || d.accessDays !== undefined;
