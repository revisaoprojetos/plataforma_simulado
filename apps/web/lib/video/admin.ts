import 'server-only'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/server'
import { VideoApiError, videoConfigurado } from './client'
import { carregarAula, carregarEmpresa, type AulaRow } from './dados'
import { guardAdminVideo } from './permissoes'

export const NO_STORE = { 'Cache-Control': 'no-store' }
const uuid = z.string().uuid()

export type CtxAdmin = { tenantId: string; userId: string; slug: string }

/** Gate + empresa de vídeo ativa. `nivel`: view (leitura) | manage (escrita). */
export async function contextoAdmin(nivel: 'view' | 'manage'): Promise<{ ok: true; ctx: CtxAdmin } | { ok: false; res: NextResponse }> {
  const g = await guardAdminVideo(nivel)
  if (!g.ok) return g
  if (!videoConfigurado()) return { ok: false, res: NextResponse.json({ code: 'video_indisponivel', message: 'VIDEO_API_URL não configurada.' }, { status: 503 }) }
  const empresa = await carregarEmpresa(g.tenantId, createAdminClient())
  if (!empresa?.ativo) return { ok: false, res: NextResponse.json({ code: 'video_nao_habilitado', message: 'Vídeo próprio não está habilitado para esta plataforma.' }, { status: 409 }) }
  return { ok: true, ctx: { tenantId: g.tenantId, userId: g.userId, slug: empresa.slug } }
}

/** Valida o `[id]` da URL e confirma que a aula é DESTE tenant (id vem do cliente). */
export async function aulaDoTenant(tenantId: string, id: string): Promise<{ aula: AulaRow } | { res: NextResponse }> {
  if (!uuid.safeParse(id).success) return { res: NextResponse.json({ message: 'id inválido.' }, { status: 400 }) }
  const aula = await carregarAula(tenantId, id)
  if (!aula) return { res: NextResponse.json({ message: 'Vídeo não encontrado.' }, { status: 404 }) }
  return { aula }
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
