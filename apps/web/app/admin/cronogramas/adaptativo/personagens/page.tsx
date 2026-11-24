import { SemPermissao } from '@/components/ui/alert-box'
import { TituloTela } from '@/components/admin/cronograma/titulo-tela'
import { createAdminClient } from '@/lib/supabase/server'
import { TIPOS_META, SLUGS_META } from '@/lib/cronograma/adaptativo/tipos-meta'
import { fichaDoTipo } from '@/lib/cronograma/adaptativo/regras-campos'
import { lerParamsMotor } from '@/lib/cronograma/adaptativo/config-metas'
import { carregarPaginaRegras } from '../regras-pagina'
import { PersonagensClient, type PersonagemLinha } from './personagens-client'

// Admin: Cronograma Adaptativo — PERSONAGENS (tipos de meta). Somente leitura: o registro de tipos é estático no código;
// o que é editável via regras aparece em cada ficha. Tudo calculado aqui no servidor.
export default async function PersonagensPage() {
  const p = await carregarPaginaRegras()
  if (p.semAcesso) return <SemPermissao>Você não tem permissão para ver os tipos de meta do cronograma adaptativo.</SemPermissao>
  const params = (await lerParamsMotor(createAdminClient(), p.tenantId)) as unknown as Record<string, unknown>
  const linhas: PersonagemLinha[] = SLUGS_META.map((s) => {
    const t = TIPOS_META[s]
    const vig = t.paramDuracao ? Number(params[t.paramDuracao]) : NaN
    const off = t.paramDeslocamento ? Number(params[t.paramDeslocamento]) : NaN
    return {
      slug: s, rotulo: t.rotulo, nomeAluno: t.nomeAluno, familia: t.familia, ordem: t.ordem,
      duracaoPadraoMin: t.duracaoPadraoMin, duracaoVigenteMin: Number.isFinite(vig) ? vig : t.duracaoPadraoMin,
      deslocamentoPadraoSem: t.deslocamentoPadraoSem, deslocamentoVigenteSem: Number.isFinite(off) ? off : t.deslocamentoPadraoSem,
      prioridadePadrao: t.prioridade, prioridadeVigente: p.registro.regras.prioridades.porTipo[s] ?? p.registro.regras.prioridades.outros,
      ficha: fichaDoTipo(s, p.registro.regras),
    }
  })
  return (
    <div className="w-full space-y-4">
      <TituloTela titulo="Personagens" descricao="Os tipos de meta do motor, como “fichas de personagem”: quanto duram, quando voltam e quais limites seguem, conforme as regras vigentes desta plataforma." />
      <PersonagensClient linhas={linhas} versao={p.registro.versao} />
    </div>
  )
}
