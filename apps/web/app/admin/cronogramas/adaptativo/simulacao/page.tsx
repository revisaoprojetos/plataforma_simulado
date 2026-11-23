import { SemPermissao } from '@/components/ui/alert-box'
import { AdaptativoTabs } from '@/components/admin/adaptativo-tabs'
import { createAdminClient } from '@/lib/supabase/server'
import { hojeBrtISO } from '@/lib/brt'
import { carregarConteudoBanco } from '@/lib/cronograma/adaptativo/conteudo-banco'
import { TIPOS_META } from '@/lib/cronograma/adaptativo/tipos-meta'
import { carregarPaginaRegras } from '../regras-pagina'
import { SimulacaoClient } from './simulacao-client'

export const dynamic = 'force-dynamic'

// Admin: Cronograma Adaptativo — SIMULAÇÃO de regras (rascunho × vigentes). O plano é gerado no servidor (action simularRegras); nada é gravado.
export default async function SimulacaoPage() {
  const p = await carregarPaginaRegras()
  if (p.semAcesso) return <SemPermissao>Você não tem permissão para ver o cronograma adaptativo.</SemPermissao>
  const disciplinas = p.podeEditar ? (await carregarConteudoBanco(createAdminClient(), p.tenantId)).disciplinas.map((d) => d.nome) : []
  const rotulos = Object.fromEntries(Object.entries(TIPOS_META).map(([k, t]) => [k, t.rotulo]))
  return (
    <div className="w-full space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Cronograma adaptativo · Simulação</h1>
        <p className="text-muted-foreground">Gera, no servidor, o mesmo plano de exemplo com as regras em edição (rascunho não salvo da aba Faixas e limites) e com as vigentes, e mostra o que muda. Nada é gravado.</p>
      </div>
      <AdaptativoTabs />
      <SimulacaoClient podeSimular={p.podeEditar} disciplinas={disciplinas} vigente={p.registro.regras} inicioPadrao={hojeBrtISO()} rotulos={rotulos} />
    </div>
  )
}
