import Link from 'next/link'
import { listarDivergenciaPaginas } from '../../paginas-actions'
import { PaginasClient } from './paginas-client'
import { TituloTela } from '@/components/admin/cronograma/titulo-tela'

export const dynamic = 'force-dynamic'

// Admin: divergência de páginas planilha × Biblioteca (somente leitura; não altera planos) + recontagem de páginas.
export default async function DivergenciaPaginasPage() {
  const inicial = await listarDivergenciaPaginas({ pagina: 1, porPagina: 25, minPct: 10 })
  return (
    <div className="w-full space-y-4">
      <TituloTela titulo="Páginas divergentes" descricao={<>Compara as páginas da planilha (modelo) com as páginas reais da Biblioteca (versão atual menos a página inicial). O aluno vê o número real;
          esta tela mostra o quanto cada aula muda de duração. Nada aqui altera cronogramas já criados — isso é uma opção em{' '}
          <Link href="/admin/configuracoes" className="text-primary underline-offset-2 hover:underline">Configurações › Avançado</Link>.</>} />
      <PaginasClient inicial={inicial} />
    </div>
  )
}
