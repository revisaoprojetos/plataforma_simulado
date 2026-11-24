import type { QS } from '../../../_comp/lista'
import { Nota } from '../../../_comp/lista'
import { ResumoKpis } from '@/components/admin/cronograma/resumo-kpis'
import { lerGerador } from '@/lib/revisao/resumo-cronogramas'
import PainelDisciplinas from './painel-disciplinas'

// Sub-aba "Visão geral" (Gerador): resumo no MESMO padrão do Adaptativo (<ResumoKpis/>) + totais por disciplina x tipo de meta.
// Tudo vem de SQL agregado com cache de 60 s por tenant (lib/revisao/resumo-cronogramas.ts); a página só LÊ.
// Falha de leitura NUNCA é engolida: log no servidor + aviso na tela (e a falha não é cacheada).
export default async function GeradorVisao({ tenantId, sp }: { tenantId: string; sp?: unknown; basePath?: string }) {
  const { dados: d, erro } = await lerGerador(tenantId)
  return (
    <>
      {erro && <Nota tipo="aviso">Não foi possível carregar o resumo agora ({erro}). Atualize a página em instantes.</Nota>}
      <ResumoKpis resumo={d?.resumo ?? null} lado="gerador" />
      <Nota tipo="info">Use os grupos acima: Catálogo (cronogramas), Conteúdos (conjuntos e links), Regras (tipos e auditoria de metas), Acessos e liberação, Relatórios e importação.</Nota>
      {d && d.disciplinas.length > 0 && <PainelDisciplinas base={d.disciplinas} sp={(sp ?? {}) as QS} href="/admin/revisao/cronograma" />}
      {d && d.disciplinas.length === 0 && <Nota tipo="aviso">Totais por disciplina indisponíveis nesta leitura simplificada; os números acima continuam válidos.</Nota>}
    </>
  )
}
