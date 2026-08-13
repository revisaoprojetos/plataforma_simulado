import type { MissaoDef, MissoesConfig } from './config'

/**
 * Missões que valem em um dia específico (puro, sem dependências de engine — pode rodar no cliente).
 * `modo='todas'` → todas as ativas. `modo='rodizio'` → janela determinística de `por_dia` missões
 * da pool ativa, que avança a cada dia (rodízio ao longo da semana). Determinístico → display e award batem.
 */
export function missoesDoDia(defs: MissaoDef[], cfg: MissoesConfig, dia: string): MissaoDef[] {
  const pool = (defs ?? []).filter((m) => m.ativa !== false)
  const n = Math.max(1, cfg?.por_dia ?? 3)
  if (!cfg || cfg.modo !== 'rodizio' || pool.length === 0 || n >= pool.length) return pool
  const dayNum = Math.floor(Date.parse(dia + 'T00:00:00Z') / 86_400_000)
  const start = (((dayNum * n) % pool.length) + pool.length) % pool.length
  return Array.from({ length: n }, (_, i) => pool[(start + i) % pool.length])
}
