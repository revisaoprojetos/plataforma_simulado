import 'server-only'
import { NextResponse } from 'next/server'
import { getSessaoAluno, type AlunoSession } from '@/lib/aluno-session'
import { ehTestadorGlobal } from '@/lib/sistema/testadores-globais'
import { createAdminClient } from '@/lib/supabase/server'
import { VideoApiError, videoConfigurado } from './client'
import { alunoTemAcessoAoCurso, carregarEmpresa, type AulaRow } from './dados'

/** Contexto comum das rotas do aluno: sessão da plataforma + empresa de vídeo ativa. */
export async function contextoAluno(): Promise<
  { ok: true; sessao: AlunoSession; slug: string } | { ok: false; res: NextResponse }
> {
  const sessao = await getSessaoAluno()
  if (!sessao) return { ok: false, res: NextResponse.json({ message: 'Não autenticado.' }, { status: 401 }) }
  if (!videoConfigurado()) return { ok: false, res: NextResponse.json({ code: 'video_indisponivel', message: 'Vídeo indisponível.' }, { status: 503 }) }
  const empresa = await carregarEmpresa(sessao.tenantId, createAdminClient())
  if (!empresa?.ativo) return { ok: false, res: NextResponse.json({ code: 'video_indisponivel', message: 'Vídeo indisponível.' }, { status: 503 }) }
  return { ok: true, sessao, slug: empresa.slug }
}

/**
 * Nosso gate (ANTES de chamar o serviço): aula pronta + (testador global OU matrícula sincronizada vigente no curso).
 * O serviço ainda reconfere a matrícula dele; os dois gates precisam passar.
 */
export async function podeAssistir(sessao: AlunoSession, aula: AulaRow): Promise<boolean> {
  if (aula.status !== 'pronta') return false
  if (await ehTestadorGlobal({ tenantId: sessao.tenantId, estudanteId: sessao.estudanteId }).catch(() => false)) return true
  return alunoTemAcessoAoCurso(sessao.tenantId, sessao.estudanteId, aula.curso_id)
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
