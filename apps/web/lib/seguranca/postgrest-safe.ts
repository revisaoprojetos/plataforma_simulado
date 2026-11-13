// Helper ÚNICO de saneamento p/ filtros PostgREST (.or()/.ilike()) — evita injeção de filtro
// (ex.: "x,id.not.is.null", "a),or(") e coringas de LIKE. Use SEMPRE que interpolar texto do
// usuário em `.or(\`...\`)`. Preferir `.eq()`/`.ilike(col, valor)` (parametrizados) quando só há 1 coluna.
const RE_EMAIL = /^[a-z0-9._%+'-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i
const RE_PROIBIDOS = /[,()*%{}"\\\s]/
// Metacaracteres de filtro PostgREST + curingas de LIKE + controle.
// eslint-disable-next-line no-control-regex
const RE_BUSCA = /[,()*%{}"\\\u0000-\u001f]/g

/** Retorna o e-mail normalizado (minúsculo/trim) ou null se inválido/perigoso. */
export function emailSeguro(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const e = raw.toLowerCase().trim()
  if (!e || e.length > 254 || RE_PROIBIDOS.test(e) || !RE_EMAIL.test(e)) return null
  return e
}

/** Filtro .or() para e-mail principal (ilike exato) ou secundário. Recebe e-mail JÁ validado por emailSeguro. */
export function filtroEmailOr(emailValidado: string): string {
  const exato = emailValidado.replace(/_/g, '\\_') // _ literal no ilike
  return `email.ilike.${exato},emails_secundarios.cs.{${emailValidado}}`
}

/** Saneia texto de busca livre p/ interpolar em .or()/ilike: remove metacaracteres de filtro PostgREST/LIKE. */
export function sanearBusca(raw: unknown, max = 100): string {
  if (typeof raw !== 'string') return ''
  return raw.replace(RE_BUSCA, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
}
