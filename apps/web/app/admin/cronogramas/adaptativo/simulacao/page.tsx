import { Suspense } from 'react'
import { SemPermissao } from '@/components/ui/alert-box'
import { TituloTela } from '@/components/admin/cronograma/titulo-tela'
import { createAdminClient } from '@/lib/supabase/server'
import { hojeBrtISO } from '@/lib/brt'
import { carregarConteudoBanco } from '@/lib/cronograma/adaptativo/conteudo-banco'
import { TIPOS_META } from '@/lib/cronograma/adaptativo/tipos-meta'
import { carregarPaginaRegras } from '../regras-pagina'
import { SimulacaoClient } from './simulacao-client'
import { EsqueletoTela } from '@/components/admin/cronograma/esqueleto-tela'

export const dynamic = 'force-dynamic'

// Admin: Cronograma Adaptativo — SIMULAÇÃO de regras (rascunho × vigentes). O plano é gerado no servidor (action simularRegras); nada é gravado.
export default async function SimulacaoPage() {
  const p = await carregarPaginaRegras()
  if (p.semAcesso) return <SemPermissao>Você não tem permissão para ver o cronograma adaptativo.</SemPermissao>
  const rotulos = Object.fromEntries(Object.entries(TIPOS_META).map(([k, t]) => [k, t.rotulo]))
  return (
    <div className="w-full space-y-4">
      <TituloTela titulo="Simulação" descricao="Gera, no servidor, o mesmo plano de exemplo com as regras em edição (rascunho não salvo da aba Faixas e limites) e com as vigentes, e mostra o que muda. Nada é gravado." />
      <Suspense fallback={<EsqueletoTela linhas={4} />}>
        <CorpoSimulacao tenantId={p.tenantId} podeEditar={p.podeEditar} vigente={p.registro.regras} rotulos={rotulos} />
      </Suspense>
    </div>
  )
}

async function CorpoSimulacao({ tenantId, podeEditar, vigente, rotulos }: { tenantId: string; podeEditar: boolean; vigente: React.ComponentProps<typeof SimulacaoClient>['vigente']; rotulos: Record<string, string> }) {
  const disciplinas = podeEditar ? (await carregarConteudoBanco(createAdminClient(), tenantId)).disciplinas.map((d) => d.nome) : []
  return <SimulacaoClient podeSimular={podeEditar} disciplinas={disciplinas} vigente={vigente} inicioPadrao={hojeBrtISO()} rotulos={rotulos} />
}
