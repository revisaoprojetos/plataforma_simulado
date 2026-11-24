import { SemPermissao } from '@/components/ui/alert-box'
import { TituloTela } from '@/components/admin/cronograma/titulo-tela'
import { carregarPaginaRegras } from '../regras-pagina'
import { RestricoesClient } from './restricoes-client'

export const dynamic = 'force-dynamic'

// Admin: Cronograma Adaptativo — RESTRIÇÕES por personagem (regras declarativas). A page só LÊ; validar/salvar roda nas server actions.
export default async function RestricoesPage() {
  const p = await carregarPaginaRegras()
  if (p.semAcesso) return <SemPermissao>Você não tem permissão para ver as regras do cronograma adaptativo.</SemPermissao>
  return (
    <div className="w-full space-y-4">
      <TituloTela titulo="Restrições" descricao={<>Regras declarativas por tipo de meta (ex.: PDFull não no mesmo dia que Questões; sem 2 dias seguidos de PDFlash). Sem restrições ativas o motor se comporta exatamente como o padrão. Vale só para planos <b>gerados dali em diante</b>.</>} />
      <RestricoesClient registro={p.registro} podeEditar={p.podeEditar} />
    </div>
  )
}
