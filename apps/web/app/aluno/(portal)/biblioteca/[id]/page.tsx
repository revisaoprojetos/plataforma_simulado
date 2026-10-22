import { notFound, redirect } from 'next/navigation'
import { getSessaoAluno } from '@/lib/aluno-session'
import { carregarLeituraPdf, registrarLeituraAluno } from '@/lib/conteudo/leitor'
import { LeitorBiblioteca } from '@/components/aluno/leitor-biblioteca'

export const dynamic = 'force-dynamic'

export default async function LeituraConteudoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const sessao = await getSessaoAluno()
  if (!sessao) redirect('/aluno/entrar')
  const leitura = await carregarLeituraPdf(id, sessao.estudanteId)
  if (!leitura) notFound()
  await registrarLeituraAluno(id, sessao.estudanteId, leitura.versaoId).catch(() => {})

  // Leitor do Juris (real) + conteúdo = PDF fiel; grifos salvos no perfil do aluno.
  return (
    <LeitorBiblioteca
      documentoId={leitura.documentoId}
      versaoId={leitura.versaoId}
      titulo={leitura.titulo}
      pdfUrl={leitura.pdfUrl}
      grifos={leitura.grifos}
      voltarHref="/aluno/biblioteca"
    />
  )
}
