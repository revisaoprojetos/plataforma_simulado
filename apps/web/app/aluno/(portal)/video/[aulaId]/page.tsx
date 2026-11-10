import { notFound, redirect } from 'next/navigation'
import { getSessaoAluno } from '@/lib/aluno-session'
import { LessonPlayer } from '@/components/aluno/video/lesson-player'

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Videoaula hospedada ("Vídeo próprio"). A página só exige sessão de aluno; a AUTORIZAÇÃO de acesso é feita
 * por POST /api/aluno/video/playback (403 sem_acesso, 409 video_processando…), cujas mensagens o <LessonPlayer>
 * exibe no próprio quadro. Nenhum cálculo aqui (backend-first). Largura cheia; cores via tokens do tema.
 */
export default async function VideoAulaPage({ params }: { params: Promise<{ aulaId: string }> }) {
  const { aulaId } = await params
  if (!UUID_RE.test(aulaId)) notFound()
  const sessao = await getSessaoAluno()
  if (!sessao) redirect('/aluno/entrar')
  return (
    <div className="w-full">
      <LessonPlayer aulaId={aulaId.toLowerCase()} />
    </div>
  )
}
