import { redirect } from 'next/navigation'
import { getSessaoAluno } from '@/lib/aluno-session'
import { arvoreBibliotecaAluno } from '@/lib/conteudo/leitor'
import { BibliotecaDrive } from '@/components/aluno/biblioteca-drive'

export const dynamic = 'force-dynamic'

export default async function BibliotecaAlunoPage() {
  const sessao = await getSessaoAluno()
  if (!sessao) redirect('/aluno/entrar')
  const arvore = await arvoreBibliotecaAluno(sessao.estudanteId, null)
  return <BibliotecaDrive inicial={arvore} />
}
