import { MapLru } from '@/lib/util/lru'
import 'server-only'

/**
 * Provisionamento do BookStack por aluno (TESTE do "OneNote externo"). Ver docs/cadernos-externos-teste.md.
 * Idempotente: usuario (external_auth_id = `${tenantId}:${estudanteId}`) + 1 estante 'Meus cadernos' + 1 livro
 * 'Meu caderno', ambos com tag `aluno:<sub>` e permissoes isoladas (owner = aluno, fallback tudo negado).
 * NUNCA lanca: erros viram { ok:false, motivo } para a pagina mostrar um aviso. Secrets so no servidor.
 * Rate limit da API do BookStack: 180/min (o cache evita repetir a cada abertura).
 */

export type ResultadoBookStack =
  | { ok: true; usuarioId: number; livroId: number; estanteId: number }
  | { ok: false; motivo: string }

type Args = { tenantId: string; estudanteId: string; email?: string | null; nome?: string | null }

const TTL_MS = 10 * 60 * 1000
const cache = new MapLru<string, { ate: number; v: ResultadoBookStack & { ok: true } }>(2000)
const emVoo = new Map<string, Promise<ResultadoBookStack>>()

function cfg() {
  const base = (process.env.BOOKSTACK_INTERNAL_URL || '').replace(/\/+$/, '')
  const id = process.env.BOOKSTACK_API_TOKEN_ID || ''
  const secret = process.env.BOOKSTACK_API_TOKEN_SECRET || ''
  const role = Number(process.env.BOOKSTACK_ROLE_ALUNO_ID || '')
  if (!base || !id || !secret || !Number.isFinite(role) || role <= 0) return null
  return { base, auth: `Token ${id}:${secret}`, role }
}

async function api<T = any>(c: NonNullable<ReturnType<typeof cfg>>, metodo: string, caminho: string, corpo?: unknown): Promise<T> {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), 8000)
  try {
    const r = await fetch(`${c.base}/api/${caminho}`, {
      method: metodo,
      headers: { Authorization: c.auth, Accept: 'application/json', ...(corpo ? { 'Content-Type': 'application/json' } : {}) },
      body: corpo ? JSON.stringify(corpo) : undefined,
      signal: ctl.signal,
      cache: 'no-store',
    })
    if (!r.ok) throw new Error(`BookStack ${metodo} ${caminho.split('?')[0]} -> ${r.status}`)
    return (await r.json()) as T
  } finally { clearTimeout(t) }
}

const q = encodeURIComponent

async function achaPorTag(c: NonNullable<ReturnType<typeof cfg>>, tipo: 'book' | 'bookshelf', sub: string): Promise<number | null> {
  // /api/search aceita a sintaxe de busca do BookStack: [tag=valor] e {type:...}.
  const r = await api<{ data: { id: number; type: string }[] }>(c, 'GET', `search?query=${q(`[aluno=${sub}] {type:${tipo}}`)}&count=5`)
  const hit = (r.data ?? []).find((x) => x.type === tipo)
  return hit ? hit.id : null
}

async function isolar(c: NonNullable<ReturnType<typeof cfg>>, tipo: 'book' | 'bookshelf', id: number, usuarioId: number) {
  await api(c, 'PUT', `content-permissions/${tipo}/${id}`, {
    owner_id: usuarioId,
    role_permissions: [],
    fallback_permissions: { inheriting: false, view: false, create: false, update: false, delete: false },
  })
}

async function provisionar(a: Required<Pick<Args, 'tenantId' | 'estudanteId'>> & Args, c: NonNullable<ReturnType<typeof cfg>>): Promise<ResultadoBookStack> {
  const sub = `${a.tenantId}:${a.estudanteId}`
  const email = (a.email || '').trim().toLowerCase()
  if (!email) return { ok: false, motivo: 'Aluno sem e-mail cadastrado.' }

  // 1) usuario
  let usuarioId: number | null = null
  const porSub = await api<{ data: { id: number }[] }>(c, 'GET', `users?filter[external_auth_id]=${q(sub)}&count=1`)
  if (porSub.data?.[0]) usuarioId = porSub.data[0].id
  if (usuarioId == null) {
    const porEmail = await api<{ data: { id: number; external_auth_id?: string }[] }>(c, 'GET', `users?filter[email]=${q(email)}&count=1`)
    if (porEmail.data?.[0]) {
      // E-mail e unico no BookStack: nao duplica nem assume a conta de outro vinculo.
      return { ok: false, motivo: `Ja existe um usuario BookStack com o e-mail ${email} e outro external_auth_id (conflito, resolver manualmente).` }
    }
    const novo = await api<{ id: number }>(c, 'POST', 'users', {
      name: (a.nome || email.split('@')[0]).slice(0, 100), email, external_auth_id: sub, roles: [c.role], language: 'pt_BR',
    })
    usuarioId = novo.id
  }

  // 2) livro + estante do aluno (achados por tag; criados pelo admin e depois isolados)
  let livroId = await achaPorTag(c, 'book', sub)
  if (livroId == null) {
    livroId = (await api<{ id: number }>(c, 'POST', 'books', { name: 'Meu caderno', tags: [{ name: 'aluno', value: sub }] })).id
  }
  let estanteId = await achaPorTag(c, 'bookshelf', sub)
  if (estanteId == null) {
    estanteId = (await api<{ id: number }>(c, 'POST', 'shelves', { name: 'Meus cadernos', books: [livroId], tags: [{ name: 'aluno', value: sub }] })).id
  }
  // PUT e idempotente: reaplicar corrige um provisionamento interrompido no meio.
  await isolar(c, 'book', livroId, usuarioId)
  await isolar(c, 'bookshelf', estanteId, usuarioId)
  return { ok: true, usuarioId, livroId, estanteId }
}

export async function ensureAlunoBookStack(args: Args): Promise<ResultadoBookStack> {
  const c = cfg()
  if (!c) return { ok: false, motivo: 'Provisionamento nao configurado (BOOKSTACK_INTERNAL_URL / token / role).' }
  const chave = `${args.tenantId}:${args.estudanteId}`
  const hit = cache.get(chave)
  if (hit && hit.ate > Date.now()) return hit.v
  const andando = emVoo.get(chave)
  if (andando) return andando
  const p = provisionar(args, c)
    .then((v) => { if (v.ok) cache.set(chave, { ate: Date.now() + TTL_MS, v }); return v })
    .catch((e): ResultadoBookStack => ({ ok: false, motivo: e instanceof Error ? e.message : 'Falha ao provisionar o BookStack.' }))
    .finally(() => { emVoo.delete(chave) })
  emVoo.set(chave, p)
  return p
}
