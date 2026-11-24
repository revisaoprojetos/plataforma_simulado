import { Suspense } from 'react'
import { SemPermissao } from '@/components/ui/alert-box'
import { TituloTela } from '@/components/admin/cronograma/titulo-tela'
import { REGRAS_PADRAO } from '@/lib/cronograma/adaptativo/regras'
import { diffRegras } from '@/lib/cronograma/adaptativo/regras-campos'
import { carregarPaginaRegras } from '../regras-pagina'
import { InteligenciaClient, type LinhaComparacao, type ResumoFaixa } from './inteligencia-client'
import { EsqueletoTela } from '@/components/admin/cronograma/esqueleto-tela'

export const dynamic = 'force-dynamic'

// Admin: Cronograma Adaptativo — INTELIGÊNCIA (impacto em amostra, laboratório de bug, exportar/importar, comparação com o padrão).
// A page só LÊ: o diff e o resumo de faixas são calculados aqui; as simulações rodam em server actions, sob demanda.
const resumirFaixas = (r: typeof REGRAS_PADRAO): ResumoFaixa[] => r.faixas.map((f) => ({
  id: f.id, nome: f.nome, minMin: f.minMin, maxMin: f.maxMin, tetoPdf: f.tetoPdf, revisaoModo: f.revisaoModo,
  overrides: Object.entries(f.overrides ?? {}).filter(([, v]) => v && Object.keys(v as object).length).map(([k, v]) => `${k} (${Object.keys(v as object).length})`),
}))

export default function InteligenciaPage() {
  return (
    <div className="w-full space-y-4">
      <TituloTela titulo="Inteligência" descricao="Veja o impacto de uma mudança de regras em planos reais antes de aplicar, reproduza um bug com regras alteradas em memória e leve as regras entre plataformas em JSON. Nada é gravado, exceto ao aplicar com a trava de segurança." />
      <Suspense fallback={<EsqueletoTela linhas={5} />}><CorpoInteligencia /></Suspense>
    </div>
  )
}

async function CorpoInteligencia() {
  const p = await carregarPaginaRegras()
  if (p.semAcesso) return <SemPermissao>Você não tem permissão para ver a inteligência do cronograma adaptativo.</SemPermissao>
  const reg = p.registro
  const comparacao: LinhaComparacao[] = diffRegras(REGRAS_PADRAO, reg.regras).map((d) => ({ path: d.path, rotulo: d.rotulo, padrao: d.de, vigente: d.para }))
  return (
    <>
      <InteligenciaClient
        versao={reg.versao} hash={reg.hash} podeEditar={p.podeEditar}
        comparacao={comparacao} faixasVigentes={resumirFaixas(reg.regras)} faixasPadrao={resumirFaixas(REGRAS_PADRAO)}
      />
    </>
  )
}
