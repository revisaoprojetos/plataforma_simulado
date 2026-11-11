import 'server-only'
import { NextResponse } from 'next/server'
import { getSessaoAluno, type AlunoSession } from '@/lib/aluno-session'
import { ehTestadorGlobal } from '@/lib/sistema/testadores-globais'
import { createAdminClient } from '@/lib/supabase/server'
import { acessoAoProduto } from '@/lib/produtos/aluno'
import { videoLiberadoPorProduto } from '@/lib/produtos/curriculo-aluno'
import { VideoApiError, matricular, type EnrollReq } from './client'
import { carregarConfigVideo } from './config'

/**
 * Contexto comum das rotas do aluno: sessão da plataforma + serviço de vídeo configurado/ativo (tabela
 * global video_config) + slug da empresa no serviço = slug do tenant da sessão.
 */
export async function contextoAluno(): Promise<
  { ok: true; sessao: AlunoSession; slug: string } | { ok: false; res: NextResponse }
> {
  const sessao = await getSessaoAluno()
  if (!sessao) return { ok: false, res: NextResponse.json({ message: 'Não autenticado.' }, { status: 401 }) }
  if (!(await carregarConfigVideo())) return { ok: false, res: NextResponse.json({ code: 'video_indisponivel', message: 'Vídeo indisponível.' }, { status: 503 }) }
  const slug = await slugDoTenant(sessao.tenantId)
  if (!slug) return { ok: false, res: NextResponse.json({ code: 'video_indisponivel', message: 'Vídeo indisponível.' }, { status: 503 }) }
  return { ok: true, sessao, slug }
}

const slugCache = new Map<string, { slug: string; exp: number }>()
async function slugDoTenant(tenantId: string): Promise<string | null> {
  const c = slugCache.get(tenantId)
  if (c && c.exp > Date.now()) return c.slug
  try {
    const { data } = await createAdminClient().from('simulado_tenants').select('slug').eq('id', tenantId).maybeSingle()
    const slug = (data as { slug?: string } | null)?.slug
    if (!slug) return null
    slugCache.set(tenantId, { slug, exp: Date.now() + 10 * 60_000 })
    return slug
  } catch { return null }
}

// Cache positivo curto do gate (rota de anotações/playback chamam várias vezes por aula). Revogação vale em até 60 s.
const GATE_TTL_MS = 60_000
const GATE_MAX = 5000
const gateCache = new Map<string, number>()

/**
 * Nosso gate (ANTES de chamar o serviço): testador global OU o aluno tem acesso, NA PLATAFORMA, a um conteúdo
 * que referencia `video-proprio:<courseId>:<lessonId>` (aula ativa e já liberada no currículo de um produto a que
 * ele tem acesso — mesmas regras do leitor: assinatura/grupo/segmento + disponibilidade). O serviço ainda
 * reconfere a matrícula dele; os dois gates precisam passar.
 */
export async function podeAssistir(sessao: AlunoSession, courseId: string, lessonId: string): Promise<boolean> {
  const k = `${sessao.tenantId}:${sessao.estudanteId}:${courseId}:${lessonId}`
  const hit = gateCache.get(k)
  if (hit && hit > Date.now()) return true
  const svc = createAdminClient()
  let ok = false
  if (await ehTestadorGlobal({ tenantId: sessao.tenantId, estudanteId: sessao.estudanteId }).catch(() => false)) ok = true
  else {
    ok = await videoLiberadoPorProduto(svc, sessao.tenantId, sessao.estudanteId, courseId, lessonId,
      async (produtoId) => !!(await acessoAoProduto(svc, sessao.tenantId, sessao.estudanteId, produtoId))).catch(() => false)
  }
  if (ok) {
    if (gateCache.size >= GATE_MAX) gateCache.delete(gateCache.keys().next().value as string)
    gateCache.set(k, Date.now() + GATE_TTL_MS)
  }
  return ok
}

// Matrícula SOB DEMANDA (just-in-time) no serviço: janela de 1 dia renovada a cada acesso; cache ~10 min por (aluno, curso).
const MATRICULA_TTL_MS = 10 * 60_000
const MATRICULA_MAX = 10_000
const matriculaCache = new Map<string, number>()
const matriculaVoo = new Map<string, Promise<void>>()

export async function garantirMatricula(slug: string, sessao: AlunoSession, courseId: string): Promise<void> {
  const k = `${slug}:${sessao.estudanteId}:${courseId}`
  const hit = matriculaCache.get(k)
  if (hit && hit > Date.now()) return
  const voo = matriculaVoo.get(k)
  if (voo) return voo
  const p = (async () => {
    const { data } = await createAdminClient().from('simulado_estudantes').select('nome, email')
      .eq('id', sessao.estudanteId).eq('tenant_id', sessao.tenantId).maybeSingle()
    const email = ((data as any)?.email ?? sessao.email ?? '').toString().trim()
    const name = ((data as any)?.nome ?? sessao.nome ?? '').toString().trim() || undefined
    if (!email) throw new VideoApiError('Aluno sem e-mail cadastrado.', 422, 'local')
    // accessDays/reactivate existem no serviço; EnrollReq (client.ts) ainda não os declara.
    const dto = { email, name, externalId: sessao.estudanteId, courseId, accessDays: 1, reactivate: true } as EnrollReq
    await matricular(slug, dto)
    if (matriculaCache.size >= MATRICULA_MAX) matriculaCache.delete(matriculaCache.keys().next().value as string)
    matriculaCache.set(k, Date.now() + MATRICULA_TTL_MS)
  })().finally(() => matriculaVoo.delete(k))
  matriculaVoo.set(k, p)
  return p
}

/** Traduz erro da video-api para a resposta HTTP do nosso contrato. */
export function respostaDeErro(e: unknown): NextResponse {
  if (e instanceof VideoApiError) {
    const cid = e.correlationId
    if (e.status === 403) return NextResponse.json({ code: 'sem_acesso', message: e.message, correlationId: cid }, { status: 403 })
    if (e.status === 404) return NextResponse.json({ code: 'nao_encontrado', message: e.message, correlationId: cid }, { status: 404 })
    if (e.status === 409) return NextResponse.json({ code: 'conflito', message: e.message, correlationId: cid }, { status: 409 })
    if (e.status === 429) return NextResponse.json({ code: 'limite', message: 'Muitas requisições. Tente em instantes.', correlationId: cid }, { status: 429 })
    if (e.status !== null && e.status >= 400 && e.status < 500) return NextResponse.json({ code: 'requisicao_invalida', message: e.message, correlationId: cid }, { status: 400 })
    return NextResponse.json({ code: 'video_indisponivel', message: 'Serviço de vídeo indisponível.', correlationId: cid }, { status: 502 })
  }
  console.error('[video] erro inesperado:', e)
  return NextResponse.json({ code: 'erro', message: 'Erro interno.' }, { status: 500 })
}

/** Origem (Origin) a enviar à video-api: a do navegador; senão o host público do tenant. */
export function origemDoRequest(req: Request): string | undefined {
  const o = req.headers.get('origin')
  if (o && o !== 'null') return o
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host')
  if (!host) return undefined
  const proto = req.headers.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  return `${proto}://${host}`
}
