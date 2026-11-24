import { SemPermissao } from '@/components/ui/alert-box'
import { TituloTela } from '@/components/admin/cronograma/titulo-tela'
import { carregarPaginaRegras } from '../regras-pagina'
import { FaixasClient } from './faixas-client'

export const dynamic = 'force-dynamic'

// Admin: Cronograma Adaptativo — FAIXAS E LIMITES (regras do motor como dados). A page só LÊ; salvar/validar roda nas server actions.
export default async function FaixasPage() {
  const p = await carregarPaginaRegras()
  if (p.semAcesso) return <SemPermissao>Você não tem permissão para ver as regras do cronograma adaptativo.</SemPermissao>
  return (
    <div className="w-full space-y-4">
      <TituloTela titulo="Faixas e limites" descricao={<>Regras estruturais do motor desta plataforma. O que difere do padrão fica destacado. Salvar vale só para planos <b>gerados dali em diante</b>; planos já gravados não mudam.</>} />
      <FaixasClient registro={p.registro} podeEditar={p.podeEditar} />
    </div>
  )
}
