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

/**
 * Janela UTC [ini, fim) que corresponde ao DIA LOCAL 'YYYY-MM-DD' na timezone do tenant.
 * Usa o offset efetivo do tz naquele dia (robusto a horário de verão) — serve para filtrar
 * `finalizado_em`/`criado_em` (timestamptz) por "dia local" sem depender de -03:00 fixo.
 */
export function janelaDiaUtc(timezone: string, dia: string): { ini: string; fim: string } {
  const [y, m, d] = dia.split('-').map(Number)
  const base = new Date(Date.UTC(y, (m || 1) - 1, d || 1, 12, 0, 0)) // meio-dia evita bordas de DST
  let offsetMs = 0
  try {
    const asLocal = new Date(base.toLocaleString('en-US', { timeZone: timezone }))
    const asUtc = new Date(base.toLocaleString('en-US', { timeZone: 'UTC' }))
    offsetMs = asUtc.getTime() - asLocal.getTime()
  } catch { /* tz inválida → trata como UTC */ }
  const iniLocalMeiaNoite = Date.UTC(y, (m || 1) - 1, d || 1, 0, 0, 0)
  const ini = new Date(iniLocalMeiaNoite + offsetMs)
  const fim = new Date(ini.getTime() + 86_400_000)
  return { ini: ini.toISOString(), fim: fim.toISOString() }
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
