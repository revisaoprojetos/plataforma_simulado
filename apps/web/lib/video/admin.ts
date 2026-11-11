import 'server-only'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { VideoApiError, videoConfigurado } from './client'
import { slugDoTenant } from './catalogo'
import { guardAdminVideo } from './permissoes'

export const NO_STORE = { 'Cache-Control': 'no-store' }
export const uuid = z.string().uuid()

export type CtxAdmin = { tenantId: string; userId: string; slug: string }

/** Gate (checkPermission video:view/manage) + slug do tenant (= empresa no serviço). `nivel`: view | manage. */
export async function contextoAdmin(nivel: 'view' | 'manage'): Promise<{ ok: true; ctx: CtxAdmin } | { ok: false; res: NextResponse }> {
  const g = await guardAdminVideo(nivel)
  if (!g.ok) return g
  if (!(await videoConfigurado())) return { ok: false, res: NextResponse.json({ code: 'video_indisponivel', message: 'Serviço de vídeo não configurado.' }, { status: 503 }) }
  const slug = await slugDoTenant(g.tenantId)
  if (!slug) return { ok: false, res: NextResponse.json({ code: 'video_nao_habilitado', message: 'Plataforma sem identificador de vídeo.' }, { status: 409 }) }
  return { ok: true, ctx: { tenantId: g.tenantId, userId: g.userId, slug } }
}

/** Valida um id vindo da URL. */
export function idValido(id: string): NextResponse | null {
  return uuid.safeParse(id).success ? null : NextResponse.json({ message: 'id inválido.' }, { status: 400 })
}

export function respostaErroAdmin(e: unknown): NextResponse {
  if (e instanceof VideoApiError) {
    const status = e.status !== null && e.status >= 400 && e.status < 500 ? e.status : 502
    return NextResponse.json({ message: status === 502 ? 'Serviço de vídeo indisponível.' : e.message, correlationId: e.correlationId }, { status })
  }
  console.error('[video/admin] erro inesperado:', e)
  return NextResponse.json({ message: 'Erro interno.' }, { status: 500 })
}

export async function lerJson<T extends z.ZodTypeAny>(req: Request, schema: T): Promise<{ ok: true; data: z.infer<T> } | { ok: false; res: NextResponse }> {
  const r = schema.safeParse(await req.json().catch(() => null))
  if (!r.success) return { ok: false, res: NextResponse.json({ message: 'Dados inválidos.', detalhes: r.error.issues.slice(0, 5).map((i) => `${i.path.join('.')}: ${i.message}`) }, { status: 400 }) }
  return { ok: true, data: r.data }
}
