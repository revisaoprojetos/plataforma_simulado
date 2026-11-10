import { Prisma } from '@prisma/client';

/**
 * Matrícula vigente: não revogada e dentro da janela `startsAt`/`endsAt` (nulo = sem limite).
 * Toda checagem de acesso do aluno a um curso usa este filtro, então o prazo vale igual na
 * REST, no playback e no MCP. Matrículas antigas (sem datas) continuam valendo sempre.
 */
export function activeEnrollment(now: Date = new Date()): Prisma.EnrollmentWhereInput {
  return {
    revokedAt: null,
    AND: [
      { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
      { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
    ],
  };
}

export interface EnrollmentWindow {
  startsAt: Date | null;
  endsAt: Date | null;
  revokedAt: Date | null;
}

/** Mesma regra de `activeEnrollment`, para quem já carregou a linha. */
export function isEnrollmentActive(e: EnrollmentWindow, now: Date = new Date()): boolean {
  if (e.revokedAt) return false;
  if (e.startsAt && e.startsAt > now) return false;
  if (e.endsAt && e.endsAt <= now) return false;
  return true;
}
