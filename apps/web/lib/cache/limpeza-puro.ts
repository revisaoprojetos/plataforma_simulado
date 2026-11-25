/**
 * Lógica PURA (sem Redis/server-only) da limpeza e manutenção do cache `relatorio:*`.
 * Separada p/ ser testável por unidade.
 */

export const PREFIXO_CACHE = 'relatorio:'

/**
 * Grupos "descartáveis": agregados de listagem/relatório/KPI de ADMIN, 100% reconstruíveis do banco e sem
 * efeito funcional se sumirem (só a próxima abertura recomputa). Lista EXPLÍCITA — qualquer grupo fora dela
 * NUNCA é removido pela rotina automática (ex.: ranking/simulado ao vivo, board-tv, sidebar, gam-rail,
 * trilha/modulo do aluno). Sessão, rate limit (rl2:), locks de cron (cron:lock:), handoff e pubsub vivem
 * fora do prefixo `relatorio:` e jamais entram aqui.
 */
export const GRUPOS_DESCARTAVEIS: readonly string[] = [
  'resumos', 'graficos', 'dashboard', 'estudantes-kpis', 'banco-resumo', 'adaptativo-an', 'engaj-geral',
  'perfil-analytics', 'perfil-turma', 'comparativo-turma', 'grupo-engaj', 'revisao-rel', 'revisao-rel-grupos',
  'cs-grupos-kpis', 'cs-grupos-opcoes', 'cs-membros-cont', 'nps',
]

/** Parte do prefixo permitida (evita padrões glob/injeção no MATCH do SCAN). */
export function prefixoValido(p: string | null | undefined): boolean {
  return !p || /^[a-z0-9][a-z0-9:_-]{0,80}$/i.test(p)
}

/** `relatorio:<tenant>:<grupo>:...` → `{tenant, grupo}`; `null` se a chave não for do cache de relatórios. */
export function parseChave(chave: string): { tenant: string; grupo: string } | null {
  if (!chave.startsWith(PREFIXO_CACHE)) return null
  const partes = chave.slice(PREFIXO_CACHE.length).split(':')
  if (partes.length < 2 || !partes[0] || !partes[1]) return null
  return { tenant: partes[0], grupo: partes[1] }
}

/** Conta chaves por grupo (1ª parte após `relatorio:<tenant>:`), filtrando por tenant se informado. Ordena por contagem desc. */
export function agruparChaves(chaves: string[], tenantId?: string): { grupo: string; chaves: number }[] {
  const m = new Map<string, number>()
  for (const c of chaves) {
    const p = parseChave(c)
    if (!p || (tenantId && p.tenant !== tenantId)) continue
    m.set(p.grupo, (m.get(p.grupo) ?? 0) + 1)
  }
  return [...m.entries()].map(([grupo, chaves]) => ({ grupo, chaves })).sort((a, b) => b.chaves - a.chaves || a.grupo.localeCompare(b.grupo))
}

/** Padrão MATCH do SCAN. `tenantId` null = todos os tenants. */
export function padraoScan(tenantId: string | null, prefixo?: string | null): string {
  return `${PREFIXO_CACHE}${tenantId ?? '*'}:${prefixo ?? ''}*`
}

/** A chave pode ser removida pela rotina automática? (só `relatorio:` + grupo descartável) */
export function chaveDescartavel(chave: string): boolean {
  const p = parseChave(chave)
  return !!p && GRUPOS_DESCARTAVEIS.includes(p.grupo)
}

export function extrairInfo(texto: string, campo: string): number {
  const m = new RegExp(`^${campo}:(\\d+)`, 'm').exec(texto)
  return m ? Number(m[1]) : 0
}

/** Decide se a rotina automática deve limpar. `evictedAnterior` null = 1ª rodada (sem baseline → só pressão de memória). */
export function decidirLimpeza(o: { usada: number; max: number; evicted: number; evictedAnterior: number | null }): { limpar: boolean; motivo: string } {
  const pct = o.max > 0 ? o.usada / o.max : 0
  if (pct > 0.8) return { limpar: true, motivo: `memória em ${(pct * 100).toFixed(0)}% do limite` }
  if (o.evictedAnterior != null && o.evicted > o.evictedAnterior) return { limpar: true, motivo: `${o.evicted - o.evictedAnterior} chaves removidas por pressão desde a última rodada` }
  return { limpar: false, motivo: 'sem pressão de memória' }
}

export type GrupoDetalhado = { grupo: string; chaves: number; bytes: number; ttlMedioSeg: number | null }

/** Agrega entradas da memória do processo por grupo: contagem, bytes estimados e TTL restante médio (seg). */
export function agruparMemoria(entradas: { chave: string; bytes: number; exp: number }[], tenantId: string | undefined, agora: number): GrupoDetalhado[] {
  const m = new Map<string, { chaves: number; bytes: number; ttl: number }>()
  for (const e of entradas) {
    const p = parseChave(e.chave)
    if (!p || (tenantId && p.tenant !== tenantId)) continue
    const g = m.get(p.grupo) ?? { chaves: 0, bytes: 0, ttl: 0 }
    g.chaves++; g.bytes += e.bytes; g.ttl += Math.max(0, (e.exp - agora) / 1000)
    m.set(p.grupo, g)
  }
  return [...m.entries()].map(([grupo, g]) => ({ grupo, chaves: g.chaves, bytes: g.bytes, ttlMedioSeg: g.chaves ? Math.round(g.ttl / g.chaves) : null }))
    .sort((a, b) => b.chaves - a.chaves || a.grupo.localeCompare(b.grupo))
}
