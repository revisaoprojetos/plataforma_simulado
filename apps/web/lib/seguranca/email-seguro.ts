// Sanitização de e-mail para filtros PostgREST (.or(...)). Evita injeção de filtro
// (ex.: "x,id.not.is.null") e coringas de ilike.
const RE_EMAIL = /^[a-z0-9._%+'-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i
const RE_PROIBIDOS = /[,()*%{}"\\\s]/

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
  return raw.replace(/[,()*%{}"\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
}
