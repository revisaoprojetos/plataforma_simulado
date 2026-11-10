// Interpretação PURA dos ids de meta do Cronograma Adaptativo (sem 'server-only': usado pelo servidor e pelos testes).
//
// Formatos do motor:
//   pf:i · pp:i:k · fl:i · qu:i · lp:<lei>:<n> · rf:s:i · rq:s:i (legado)
//   pf:i:revisao:s · fl:i:revisao:s   → revisão adaptativa (semana especial s)
//   pf:i:reforco:s · fl:i:reforco:s   → reforço do diagnóstico histórico
//   qu:i:hist:s                       → questões do diagnóstico histórico (semana s)
//   jp:s                              → jurisprudência semanal (semana s)

export type SubtipoMeta = 'revisao' | 'reforco' | 'historico' | null

const RE_ADAPT = /^(pf|fl):(\d+):(revisao|reforco):(\d+)$/
const RE_HIST = /^qu:(\d+):hist:(\d+)$/

export function subtipoMeta(id: string): SubtipoMeta {
  const m = RE_ADAPT.exec(id)
  if (m) return m[3] === 'revisao' ? 'revisao' : 'reforco'
  return RE_HIST.test(id) ? 'historico' : null
}

/** Revisão adaptativa (pf|fl:i:revisao:s) — nunca "PDFull/PDFlash regular". */
export const ehRevisaoAdaptativa = (id: string) => subtipoMeta(id) === 'revisao'

/** Índice da aula (posição em AS) a que a meta se refere; `null` quando a meta não é de aula (lp, jp, inválida). */
export function indiceAulaDaMeta(id: string): number | null {
  const p = id.split(':')
  const t = p[0]
  if (t === 'lp' || t === 'jp') return null
  const bruto = t === 'rf' || t === 'rq' ? p[2] : p[1]
  return bruto != null && /^\d{1,6}$/.test(bruto) ? Number(bruto) : null
}

/** Semana de origem (semana do plano em que nasceu a meta de revisão/reforço/histórico/jurisprudência). */
export function semanaOrigemDaMeta(id: string, detalhe?: { semanaOrigemRevisao?: unknown } | null): number | null {
  const p = id.split(':')
  let s: string | undefined
  if (RE_ADAPT.test(id)) s = p[3]
  else if (RE_HIST.test(id)) s = p[3]
  else if (p[0] === 'rf' || p[0] === 'rq' || p[0] === 'jp') s = p[1]
  if (s != null && /^\d{1,5}$/.test(s)) return Number(s)
  const d = Number(detalhe?.semanaOrigemRevisao)
  return Number.isInteger(d) && d > 0 ? d : null
}

/** Rótulo da meta quando ela NÃO é a regular do tipo (null = usar o rótulo padrão do tipo). */
export function rotuloMeta(id: string): string | null {
  const m = RE_ADAPT.exec(id)
  if (m) {
    const base = m[1] === 'pf' ? 'PDFull' : 'PDFlash'
    return m[3] === 'revisao' ? `Revisão adaptativa (${base})` : `Reforço (${base})`
  }
  if (RE_HIST.test(id)) return 'Questões (diagnóstico)'
  return null
}

// ── detalhes por meta (persistidos em `detalhes_metas` / `plano_meta.detalhes`) ──────────────────────
const ID_META = /^(pf|pp|fl|qu|lp|rf|rq|jp):[A-Za-z0-9:_-]{1,60}$/
const CAMPOS_BOOL = ['semanaRevisao', 'essencialNaoSelecionada', 'continuacao', 'deslocada', 'jurisprudencia', 'historico', 'reforco'] as const
const CAMPOS_NUM = ['semanaOrigemRevisao', 'ordemAlternancia', 'percentualOrigem', 'paginaInicio', 'paginaFim', 'totalPaginas'] as const
const CAMPOS_TXT = ['material', 'origem', 'pai', 'artigo', 'geracao'] as const

/** Valida/limpa o mapa { meta_id: detalhe } vindo do cliente (whitelist de campos, tipos e tamanho). `null` = inválido. */
export function sanearDetalhes(raw: unknown): Record<string, Record<string, unknown>> | null {
  if (raw == null) return {}
  if (typeof raw !== 'object' || Array.isArray(raw)) return null
  const entradas = Object.entries(raw as Record<string, unknown>)
  if (entradas.length > 30000) return null
  const out: Record<string, Record<string, unknown>> = {}
  for (const [id, v] of entradas) {
    if (!ID_META.test(id) || !v || typeof v !== 'object' || Array.isArray(v)) continue
    const o = v as Record<string, unknown>, d: Record<string, unknown> = {}
    for (const k of CAMPOS_BOOL) if (typeof o[k] === 'boolean') d[k] = o[k]
    for (const k of CAMPOS_NUM) if (typeof o[k] === 'number' && Number.isFinite(o[k])) d[k] = o[k]
    for (const k of CAMPOS_TXT) if (typeof o[k] === 'string' && o[k]) d[k] = (o[k] as string).slice(0, 120)
    if (Object.keys(d).length) out[id] = d
  }
  return out
}

const ISO = /^\d{4}-\d{2}-\d{2}$/
/** Data de conclusão válida (AAAA-MM-DD) ou null. Aceita ISO completo (corta a data). */
export function dataConclusao(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const d = v.slice(0, 10)
  return ISO.test(d) ? d : null
}
/** Certeza/acertos nas questões: inteiro >= 0 (e <= res, quando conhecido) ou null. */
export function certValido(v: unknown, res?: number | null): number | null {
  if (v == null || v === '') return null
  const n = Math.round(Number(v))
  if (!Number.isFinite(n) || n < 0) return null
  if (res != null && Number.isFinite(res) && n > res) return null
  return n
}
