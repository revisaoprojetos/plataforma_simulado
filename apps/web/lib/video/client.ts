import 'server-only'
import { randomUUID } from 'node:crypto'
import { normalizarBase, type PlaybackServico } from './puro'
import { carregarConfigVideo, segredosVideo } from './config'

/**
 * Cliente HTTP SERVER-ONLY da video-api. Config em lib/video/config.ts (tabela global video_config,
 * com fallback às env VIDEO_*). Chave/credenciais NUNCA vão ao browser; o browser só recebe o token de
 * playback (5 min) e fala com a video-api pelo prefixo do próprio domínio da plataforma.
 */

export class VideoApiError extends Error {
  constructor(
    message: string,
    public readonly status: number | null,
    public readonly correlationId: string,
    public readonly corpo?: unknown,
  ) {
    super(message)
    this.name = 'VideoApiError'
  }
}

const TIMEOUT_MS = 15_000

export async function videoConfigurado(): Promise<boolean> {
  return !!(await carregarConfigVideo())
}

export async function baseInterna() {
  const c = await carregarConfigVideo()
  if (!c) throw new VideoApiError('Serviço de vídeo não configurado', null, 'local')
  return normalizarBase(c.urlInterna)
}

/**
 * Origem pública (a que o player usa p/ manifest/chave/heartbeat): pelo MESMO domínio do request
 * (`<origin do request><prefixo>`, ex.: https://plataforma/video-api), roteado pelo proxy ao serviço.
 * No fallback de env com VIDEO_PUBLIC_API_URL definida, mantém o comportamento antigo (origem fixa).
 */
export async function basePublica(origemRequest: string | undefined) {
  const c = await carregarConfigVideo()
  if (c?.publicaFixa) return normalizarBase(c.publicaFixa)
  const origem = (origemRequest ?? '').replace(/\/+$/, '')
  if (!origem && c?.fonte === 'env') return normalizarBase(c.urlInterna)
  return normalizarBase(origem + (c?.prefixoPublico ?? '/video-api'))
}

type Auth = { tipo: 'integracao'; slug: string } | { tipo: 'bearer'; token: string } | { tipo: 'admin'; slug: string }

interface Opcoes {
  metodo?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  corpo?: unknown
  query?: Record<string, string | number | undefined>
  auth: Auth
  origin?: string
  /** repetições em erro de rede/5xx/429 (só use em operações idempotentes). Default: 2 p/ GET, 0 p/ demais. */
  retries?: number
  timeoutMs?: number
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))

// ── JWT do admin do serviço (cache por empresa, single-flight) ──────────────
const jwtAdmin = new Map<string, { token: string; exp: number }>()
const jwtAdminVoo = new Map<string, Promise<string>>()

async function tokenAdmin(slug: string): Promise<string> {
  const c = jwtAdmin.get(slug)
  if (c && c.exp > Date.now() + 30_000) return c.token
  const voo = jwtAdminVoo.get(slug)
  if (voo) return voo
  const p = (async () => {
    const { adminEmail: email, adminSenha: password } = await segredosVideo(slug)
    if (!email || !password) throw new VideoApiError('Credenciais admin do serviço de vídeo não configuradas', null, 'local')
    const r = await req<{ accessToken: string; expiresIn: number }>('/auth/login', {
      metodo: 'POST', corpo: { tenant: slug, email, password }, auth: { tipo: 'bearer', token: '' }, retries: 1,
    })
    jwtAdmin.set(slug, { token: r.accessToken, exp: Date.now() + Math.max(60, r.expiresIn) * 1000 })
    return r.accessToken
  })().finally(() => jwtAdminVoo.delete(slug))
  jwtAdminVoo.set(slug, p)
  return p
}

async function req<T>(caminho: string, o: Opcoes): Promise<T> {
  const { v1 } = await baseInterna()
  const correlationId = `web-${randomUUID()}`
  const qs = o.query
    ? '?' + new URLSearchParams(Object.entries(o.query).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])).toString()
    : ''
  const metodo = o.metodo ?? 'GET'
  const tentativas = (o.retries ?? (metodo === 'GET' ? 2 : 0)) + 1

  let bearer = ''
  if (o.auth.tipo === 'bearer') bearer = o.auth.token
  else if (o.auth.tipo === 'integracao') {
    const k = (await segredosVideo(o.auth.slug)).chave
    if (!k) throw new VideoApiError('Chave de integração do vídeo não configurada', null, correlationId)
    bearer = k
  } else bearer = await tokenAdmin(o.auth.slug)

  let ultimo: VideoApiError | null = null
  for (let i = 0; i < tentativas; i++) {
    if (i > 0) await esperar(300 * 2 ** (i - 1) + Math.floor(Math.random() * 150))
    const ctl = new AbortController()
    const t = setTimeout(() => ctl.abort(), o.timeoutMs ?? TIMEOUT_MS)
    try {
      const res = await fetch(`${v1}${caminho}${qs}`, {
        method: metodo,
        headers: {
          ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
          ...(o.corpo !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(o.origin ? { Origin: o.origin } : {}),
          'X-Correlation-Id': correlationId,
          Accept: 'application/json',
        },
        body: o.corpo !== undefined ? JSON.stringify(o.corpo) : undefined,
        signal: ctl.signal,
        cache: 'no-store',
      })
      if (res.status === 204) return undefined as T
      const texto = await res.text()
      let json: any = undefined
      try { json = texto ? JSON.parse(texto) : undefined } catch { /* corpo não-JSON */ }
      if (res.ok) return json as T
      const msg = (Array.isArray(json?.message) ? json.message.join('; ') : json?.message) ?? `HTTP ${res.status}`
      ultimo = new VideoApiError(String(msg), res.status, json?.correlationId ?? correlationId, json)
      if (res.status >= 500 || res.status === 429) continue // repete (se ainda houver tentativas)
      throw ultimo
    } catch (e) {
      if (e instanceof VideoApiError && e.status !== null && e.status < 500 && e.status !== 429) throw e
      ultimo = e instanceof VideoApiError ? e : new VideoApiError(e instanceof Error ? e.message : 'falha de rede', null, correlationId)
    } finally {
      clearTimeout(t)
    }
  }
  throw ultimo ?? new VideoApiError('falha desconhecida', null, correlationId)
}

// ── Acesso (chave de integração) ────────────────────────────────────────────

export interface EnrollReq {
  email: string
  name?: string
  externalId: string
  courseId: string
  startsAt?: string
  endsAt?: string
  externalRef?: string
}
export interface EnrollRes { enrollmentId: string; userId: string; courseId: string; created: boolean; replayed: boolean; revoked: boolean }

export const matricular = (slug: string, dto: EnrollReq) =>
  req<EnrollRes>('/access/enrollments', { metodo: 'POST', corpo: dto, auth: { tipo: 'integracao', slug }, retries: 2 })

export const revogar = (slug: string, dto: { externalId: string; courseId: string }) =>
  req<void>('/access/enrollments/revoke', { metodo: 'POST', corpo: dto, auth: { tipo: 'integracao', slug }, retries: 2 })

export const sessaoAluno = (slug: string, externalId: string) =>
  req<{ accessToken: string; expiresIn: number; user: { id: string; name: string } }>('/access/sessions', {
    metodo: 'POST', corpo: { externalId }, auth: { tipo: 'integracao', slug }, retries: 1,
  })

// ── Aluno (Bearer do aluno) ─────────────────────────────────────────────────

export const iniciarPlayback = (token: string, lessonId: string, origin: string | undefined, sessionId?: string) =>
  req<PlaybackServico>(`/lessons/${lessonId}/playback`, {
    metodo: 'POST', corpo: sessionId ? { sessionId } : {}, auth: { tipo: 'bearer', token }, origin, retries: 0,
  })

export interface NotaServico { id: string; atS: number; text: string; createdAt?: string }
export const listarNotas = (token: string, lessonId: string) =>
  req<NotaServico[]>(`/lessons/${lessonId}/notes`, { auth: { tipo: 'bearer', token } })
export const criarNota = (token: string, lessonId: string, dto: { atS: number; text: string }) =>
  req<NotaServico>(`/lessons/${lessonId}/notes`, { metodo: 'POST', corpo: dto, auth: { tipo: 'bearer', token } })
export const editarNota = (token: string, id: string, dto: { atS?: number; text?: string }) =>
  req<NotaServico>(`/notes/${id}`, { metodo: 'PATCH', corpo: dto, auth: { tipo: 'bearer', token } })
export const removerNota = (token: string, id: string) =>
  req<void>(`/notes/${id}`, { metodo: 'DELETE', auth: { tipo: 'bearer', token } })

// ── Admin (login admin da empresa) ──────────────────────────────────────────

export const criarCurso = (slug: string, title: string) =>
  req<{ id: string }>('/courses', { metodo: 'POST', corpo: { title, status: 'published' }, auth: { tipo: 'admin', slug } })
export const criarModulo = (slug: string, courseId: string, title: string) =>
  req<{ id: string }>(`/courses/${courseId}/modules`, { metodo: 'POST', corpo: { title }, auth: { tipo: 'admin', slug } })
export const criarAula = (slug: string, moduleId: string, title: string, position?: number) =>
  req<{ id: string }>(`/modules/${moduleId}/lessons`, {
    metodo: 'POST', corpo: { title, status: 'published', ...(position !== undefined ? { position } : {}) }, auth: { tipo: 'admin', slug },
  })
export const renomearAula = (slug: string, lessonId: string, title: string) =>
  req<unknown>(`/lessons/${lessonId}`, { metodo: 'PATCH', corpo: { title }, auth: { tipo: 'admin', slug } })
export const removerAulaServico = (slug: string, lessonId: string) =>
  req<void>(`/lessons/${lessonId}`, { metodo: 'DELETE', auth: { tipo: 'admin', slug } })

export interface UploadRes { videoId: string; uploadId: string; partSize: number; partCount: number; parts: { partNumber: number; url: string }[] }
export const criarUpload = (slug: string, dto: { lessonId: string; filename: string; size: number; contentType: string }) =>
  req<UploadRes>('/uploads', { metodo: 'POST', corpo: dto, auth: { tipo: 'admin', slug } })
export const assinarPartes = (slug: string, videoId: string, partNumbers: number[]) =>
  req<{ parts: { partNumber: number; url: string }[] }>(`/uploads/${videoId}/parts`, { metodo: 'POST', corpo: { partNumbers }, auth: { tipo: 'admin', slug } })
export const concluirUpload = (slug: string, videoId: string, parts: { partNumber: number; etag: string }[]) =>
  req<{ id: string; status: string }>(`/uploads/${videoId}/complete`, { metodo: 'POST', corpo: { parts }, auth: { tipo: 'admin', slug }, retries: 1 })
export const statusVideo = (slug: string, videoId: string) =>
  req<{ id: string; status: string; durationS: number | null; error: string | null }>(`/videos/${videoId}`, { auth: { tipo: 'admin', slug } })
export const reprocessarVideo = (slug: string, videoId: string) =>
  req<unknown>(`/videos/${videoId}/reprocess`, { metodo: 'POST', auth: { tipo: 'admin', slug } })
export const removerVideo = (slug: string, videoId: string) =>
  req<void>(`/videos/${videoId}`, { metodo: 'DELETE', auth: { tipo: 'admin', slug } })
export const analyticsAula = (slug: string, lessonId: string, from?: string, to?: string) =>
  req<unknown>(`/analytics/lessons/${lessonId}`, { query: { from, to }, auth: { tipo: 'admin', slug } })

// ── Cache do JWT de sessão do aluno (curto; evita /access/sessions a cada nota) ──
const sessaoCache = new Map<string, { token: string; exp: number }>()
const SESSAO_CACHE_MAX = 5000

export async function tokenDoAluno(slug: string, estudanteId: string): Promise<string> {
  const k = `${slug}:${estudanteId}`
  const c = sessaoCache.get(k)
  if (c && c.exp > Date.now() + 30_000) return c.token
  const r = await sessaoAluno(slug, estudanteId)
  if (sessaoCache.size >= SESSAO_CACHE_MAX) sessaoCache.delete(sessaoCache.keys().next().value as string)
  sessaoCache.set(k, { token: r.accessToken, exp: Date.now() + Math.max(60, r.expiresIn) * 1000 })
  return r.accessToken
}
export function esquecerTokenDoAluno(slug: string, estudanteId: string) { sessaoCache.delete(`${slug}:${estudanteId}`) }

// ── Catálogo admin (listagens/edição direta no serviço — sem espelho) ───────

export interface CursoServico { id: string; title: string; description?: string | null; status: string; createdAt?: string }
export interface AulaServico { id: string; moduleId: string; title: string; position: number; status: string; videoId: string | null }
export interface ModuloServico { id: string; courseId: string; title: string; position: number; lessons: AulaServico[] }
export interface PaginaServico<T> { data: T[]; page: number; limit: number; total: number }
export interface VideoServico { id: string; status: string; lessonId: string | null; originalName?: string; sizeBytes?: number; durationS: number | null; error: string | null; createdAt?: string }

export const listarCursos = (slug: string, page = 1, limit = 50) =>
  req<PaginaServico<CursoServico>>('/courses', { query: { page, limit }, auth: { tipo: 'admin', slug } })
export const obterCurso = (slug: string, courseId: string) =>
  req<CursoServico>(`/courses/${courseId}`, { auth: { tipo: 'admin', slug } })
/** Módulos do curso já com as aulas (ordenados por posição). */
export const listarModulos = (slug: string, courseId: string) =>
  req<ModuloServico[]>(`/courses/${courseId}/modules`, { auth: { tipo: 'admin', slug } })
export const listarAulasModulo = (slug: string, moduleId: string) =>
  req<AulaServico[]>(`/modules/${moduleId}/lessons`, { auth: { tipo: 'admin', slug } })
export const obterAula = (slug: string, lessonId: string) =>
  req<AulaServico>(`/lessons/${lessonId}`, { auth: { tipo: 'admin', slug } })
export const obterVideo = (slug: string, videoId: string) =>
  req<VideoServico>(`/videos/${videoId}`, { auth: { tipo: 'admin', slug } })
export const renomearCurso = (slug: string, courseId: string, title: string) =>
  req<unknown>(`/courses/${courseId}`, { metodo: 'PATCH', corpo: { title }, auth: { tipo: 'admin', slug } })
export const removerCurso = (slug: string, courseId: string) =>
  req<void>(`/courses/${courseId}`, { metodo: 'DELETE', auth: { tipo: 'admin', slug } })
export const renomearModulo = (slug: string, moduleId: string, title: string) =>
  req<unknown>(`/modules/${moduleId}`, { metodo: 'PATCH', corpo: { title }, auth: { tipo: 'admin', slug } })
export const removerModulo = (slug: string, moduleId: string) =>
  req<void>(`/modules/${moduleId}`, { metodo: 'DELETE', auth: { tipo: 'admin', slug } })
