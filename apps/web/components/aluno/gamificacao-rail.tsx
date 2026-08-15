import { MetaDiariaCard } from '@/components/aluno/meta-diaria-card'
import { StreakCalendario } from '@/components/aluno/streak-calendario'
import { MissoesLista } from '@/components/aluno/missoes-lista'
import { LigaPainel } from '@/components/aluno/liga-painel'
import { RankingLiga } from '@/components/aluno/ranking-liga'
import { ConquistasProgressoLista } from '@/components/aluno/conquistas-progresso'
import type { ResumoGamificacao, MissaoView, DiaAtivo, ConquistaProgresso } from '@/lib/gamificacao/leitura'
import type { GamConfig } from '@/lib/gamificacao/config'

/** Coluna direita de gamificação (meta, sequência, missões, liga, conquistas) — compartilhada
 * entre a Início e a Trilha. Fica fixa ao rolar no desktop. */
export function GamificacaoRail({ resumo, missoes, semana, conquistas, config }: {
  resumo: ResumoGamificacao
  missoes: MissaoView[]
  semana: DiaAtivo[]
  conquistas: ConquistaProgresso[]
  config: GamConfig
}) {
  const chest = config.xp_regras.chest
  const proxima = resumo.proxima ?? null
  return (
    <aside data-tour="rail" className="space-y-4 lg:sticky lg:top-6 lg:self-start">
      {resumo.metaDiaXp > 0 && <div data-tour="meta"><MetaDiariaCard xpHoje={resumo.xpHoje} meta={resumo.metaDiaXp} /></div>}
      <div data-tour="sequencia"><StreakCalendario dias={semana} streak={resumo.streakAtual} feitoHoje={resumo.feitoHoje} chestXp={chest?.xp ?? 0} chestCadaN={chest?.cada_n_dias ?? 0} /></div>
      {missoes.length > 0 && <div data-tour="missoes"><MissoesLista missoes={missoes} renova="meia-noite" /></div>}
      <LigaPainel ligas={config.ligas} ligaAtual={resumo.liga.id} xpTotal={resumo.xpTotal} proximaNome={proxima?.nome ?? null} faltam={proxima ? Math.max(0, proxima.xp_min - resumo.xpTotal) : 0} />
      <div data-tour="ranking"><RankingLiga inicial="total" /></div>
      {conquistas.length > 0 && <div data-tour="conquistas"><ConquistasProgressoLista itens={conquistas} /></div>}
    </aside>
  )
}
