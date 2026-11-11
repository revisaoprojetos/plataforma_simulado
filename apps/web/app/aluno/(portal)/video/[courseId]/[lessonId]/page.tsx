import { notFound, redirect } from 'next/navigation'
import { getSessaoAluno } from '@/lib/aluno-session'
import { LessonPlayer } from '@/components/aluno/video/lesson-player'

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Videoaula hospedada ("Vídeo próprio"), rota /aluno/video/<courseId>/<lessonId> (ids do gerenciador de vídeo).
 * A página só exige sessão de aluno; a AUTORIZAÇÃO é feita por POST /api/aluno/video/playback (403 sem_acesso,
 * 503 video_indisponivel…), cujas mensagens o <LessonPlayer> exibe no próprio quadro. Nenhum cálculo aqui
 * (backend-first). Largura cheia; cores via tokens do tema.
 */
export default async function VideoAulaPage({ params }: { params: Promise<{ courseId: string; lessonId: string }> }) {
  const { courseId, lessonId } = await params
  if (!UUID_RE.test(courseId) || !UUID_RE.test(lessonId)) notFound()
  const sessao = await getSessaoAluno()
  if (!sessao) redirect('/aluno/entrar')
  return (
    <div className="w-full">
      <LessonPlayer courseId={courseId.toLowerCase()} lessonId={lessonId.toLowerCase()} />
    </div>
  )
}
