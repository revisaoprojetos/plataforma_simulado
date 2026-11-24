import { redirect } from 'next/navigation'
import { CabecalhoArea } from '@/components/admin/cabecalho-area'
import { checkPermission } from '@/lib/auth/permissions'
import { LEITURA_ATIVA } from '@/lib/flags'
import { carregarBiblioteca } from './actions'
import { BibliotecaClient } from '@/components/admin/biblioteca-client'

export const dynamic = 'force-dynamic'

// Biblioteca do Desafio — blocos HTML (Conteúdos) + Tags (selos), em pastas/subpastas (global por tenant).
export default async function BibliotecaPage() {
  if (!LEITURA_ATIVA) redirect('/admin')
  if (!(await checkPermission('leitura:view'))) redirect('/admin')
  const [conteudo, tags] = await Promise.all([carregarBiblioteca('conteudo'), carregarBiblioteca('tag')])
  return (
    <div className="w-full">
      <CabecalhoArea titulo="Biblioteca do Desafio" descricao="Blocos de HTML prontos e tags (selos) em pastas — reutilize na edição do conteúdo da leitura." className="mb-4" />
      <BibliotecaClient conteudo={conteudo} tags={tags} />
    </div>
  )
}
