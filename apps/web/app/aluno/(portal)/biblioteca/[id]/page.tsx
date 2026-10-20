import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { getSessaoAluno } from '@/lib/aluno-session'
import { carregarLeitura, registrarLeituraAluno } from '@/lib/conteudo/leitor'
import { LeitorConteudo } from '@/components/aluno/leitor-conteudo'

export const dynamic = 'force-dynamic'

export default async function LeituraConteudoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const sessao = await getSessaoAluno()
  if (!sessao) redirect('/aluno/entrar')
  const leitura = await carregarLeitura(id, sessao.estudanteId)
  if (!leitura) notFound()
  await registrarLeituraAluno(id, sessao.estudanteId, leitura.versaoId).catch(() => {})

  return (
    <div className="w-full">
      <div className="mx-auto max-w-3xl px-4 pt-4">
        <Link href="/aluno/biblioteca" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ChevronLeft className="h-4 w-4" />Biblioteca</Link>
      </div>
      <LeitorConteudo documentoId={leitura.documentoId} versaoId={leitura.versaoId} titulo={leitura.titulo} trechos={leitura.trechos} anotacoes={leitura.anotacoes} />
    </div>
  )
}
