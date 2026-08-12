// Utilidades de "dia local" (na timezone do tenant) para streak e missões. Guardamos strings
// 'YYYY-MM-DD' — a fronteira do dia fica inequívoca e as chaves de idempotência ficam estáveis.

/** Dia local (na timezone do tenant) como 'YYYY-MM-DD'. */
export function diaLocal(timezone: string, ref?: Date): string {
  const d = ref ?? new Date()
  try {
    // en-CA formata como YYYY-MM-DD.
    return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
  } catch {
    return d.toISOString().slice(0, 10)
  }
}

/** Dia anterior a um 'YYYY-MM-DD' (comparação de streak: ontem === última atividade?). */
export function diaAnterior(dia: string): string {
  const [y, m, d] = dia.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() - 1)
  return dt.toISOString().slice(0, 10)
}

/** Início da semana (segunda-feira) em UTC-ish, para a janela do leaderboard semanal. */
export function inicioDaSemanaISO(ref?: Date): string {
  const d = ref ?? new Date()
  const dow = (d.getUTCDay() + 6) % 7 // 0 = segunda
  const seg = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow))
  return seg.toISOString()
}

/** Início do mês (UTC) para a janela do leaderboard mensal. */
export function inicioDoMesISO(ref?: Date): string {
  const d = ref ?? new Date()
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString()
}
