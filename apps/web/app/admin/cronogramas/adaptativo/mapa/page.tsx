import { SemPermissao } from '@/components/ui/alert-box'
import { AdaptativoTabs } from '@/components/admin/adaptativo-tabs'
import { montarMapa, resumirMapa } from '@/lib/cronograma/adaptativo/mapa-motor'
import { carregarPaginaRegras } from '../regras-pagina'
import { MapaClient } from './mapa-client'

export const dynamic = 'force-dynamic'

// Admin: Cronograma Adaptativo — MAPA do motor (catálogo de todas as regras/parâmetros). A page só LÊ; o catálogo é montado aqui, no servidor.
export default async function MapaPage() {
  const p = await carregarPaginaRegras()
  if (p.semAcesso) return <SemPermissao>Você não tem permissão para ver as regras do cronograma adaptativo.</SemPermissao>
  const linhas = montarMapa(p.registro.regras)
  return (
    <div className="w-full space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Cronograma adaptativo · Mapa do motor</h1>
        <p className="text-muted-foreground">Catálogo de todas as regras e parâmetros do motor: o que cada uma faz, onde é aplicada, em qual camada da precedência, o que muda ao alterá-la e quais testes a cobrem. O que difere do padrão fica destacado.</p>
      </div>
      <AdaptativoTabs />
      <MapaClient linhas={linhas} resumo={resumirMapa(linhas)} versao={p.registro.versao} />
    </div>
  )
}
