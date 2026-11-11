import { NextRequest, NextResponse } from 'next/server'
import { playbackReqSchema } from '@/lib/video/tipos'
import { basePublica, iniciarPlayback, tokenDoAluno, esquecerTokenDoAluno, VideoApiError } from '@/lib/video/client'
import { mapearPlayback } from '@/lib/video/puro'
import { contextoAluno, garantirMatricula, origemDoRequest, podeAssistir, respostaDeErro } from '@/lib/video/aluno'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * POST /api/aluno/video/playback  { courseId, lessonId }  (ids do gerenciador de vídeo)
 * Gate nosso (acesso na plataforma) -> matrícula sob demanda -> /access/sessions (JWT do aluno, chave de integração) + /lessons/:id/playback.
 * A chave de integração NUNCA vai ao browser; o browser recebe só o token de playback (5 min) e fala direto
 * com a video-api (manifest/chave/heartbeat). Contrato: docs/video/CONTRATO-WEB.md.
 */
export async function POST(req: NextRequest) {
  const ctx = await contextoAluno()
  if (!ctx.ok) return ctx.res
  const { sessao, slug } = ctx

  // Visualização de admin (impersonation) somente leitura não pode abrir sessão de vídeo (poluiria o progresso do aluno).
  if (sessao.impersonation && sessao.impersonation.actionLevel !== 'read_and_act') {
    return NextResponse.json({ code: 'visualizacao_somente_leitura', message: 'Indisponível na visualização somente leitura.' }, { status: 403 })
  }

  const body = playbackReqSchema.safeParse(await req.json().catch(() => null))
  if (!body.success) return NextResponse.json({ code: 'requisicao_invalida', message: 'courseId/lessonId inválidos.' }, { status: 400 })
  const { courseId, lessonId } = body.data

  if (!(await podeAssistir(sessao, courseId, lessonId))) return NextResponse.json({ code: 'sem_acesso', message: 'Sem acesso a esta aula.' }, { status: 403 })

  try {
    await garantirMatricula(slug, sessao, courseId)
    const origin = origemDoRequest(req)
    let token = await tokenDoAluno(slug, sessao.estudanteId)
    let r
    try {
      r = await iniciarPlayback(token, lessonId, origin)
    } catch (e) {
      // JWT do cache pode ter sido invalidado no serviço (revogação/rotação): refaz UMA vez.
      if (e instanceof VideoApiError && e.status === 401) {
        esquecerTokenDoAluno(slug, sessao.estudanteId)
        token = await tokenDoAluno(slug, sessao.estudanteId)
        r = await iniciarPlayback(token, lessonId, origin)
      } else throw e
    }
    // "Próxima aula": client.ts ainda não expõe listagem das aulas do módulo -> null (botão não aparece).
    return NextResponse.json(mapearPlayback(r, await basePublica(origin), null, lessonId), { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    return respostaDeErro(e)
  }
}
