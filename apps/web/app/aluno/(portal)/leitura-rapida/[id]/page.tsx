import { notFound, redirect } from 'next/navigation'
import { getSessaoAluno } from '@/lib/aluno-session'
import { carregarDocumentoAluno } from '@/lib/leitura/acesso'
import { temAcessoDesafio } from '@/lib/jurisprudencia/conteudo'
import { LeituraRapidaPlayer } from '@/components/aluno/leitura-rapida-player'

export const dynamic = 'force-dynamic'

/**
 * "Leitura rápida" (aluno): abre o HTML enxuto (leitura + questões) num iframe isolado. Ao responder
 * todas as questões, o HTML avisa via postMessage e o player grava a conclusão (mesmo motor do desafio:
 * XP + sequência + ranking + medalhas) — ver lib/leitura/leitura-rapida.ts e o player.
 */
export default async function LeituraRapidaPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ desafio?: string; voltar?: string }> }) {
  const { id } = await params
  const { desafio, voltar } = await searchParams
  const sessao = await getSessaoAluno()
  if (!sessao) redirect('/aluno/entrar')
  if (desafio && !(await temAcessoDesafio(sessao.estudanteId, sessao.tenantId, desafio))) notFound()
  const doc = await carregarDocumentoAluno(id, sessao.estudanteId, sessao.tenantId)
  if (!doc || !doc.leituraRapida) notFound()
  const voltarHref = voltar || (desafio ? `/aluno/jurisprudencia?desafio=${encodeURIComponent(desafio)}` : '/aluno')
  return <LeituraRapidaPlayer documentoId={id} versao={doc.versao} html={doc.leituraRapida} titulo={doc.titulo} voltarHref={voltarHref} />
}
