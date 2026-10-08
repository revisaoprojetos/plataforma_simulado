// Contrato de DADOS REAIS do Perfil (quando ligado ao backend). Só o que tem fonte real;
// sub-widgets do mock sem dado real (heatmap dia×hora, sparklines, radar, meta diária config,
// preferências, resumo da semana) NÃO entram aqui — os componentes devem OMITI-LOS (nada de botão inerte).

export interface PerfilHeader {
  nome: string
  iniciais: string
  nivel: number
  tituloNivel: string
  xpNivelAtual: number
  xpNivelMax: number
  xpTotal: number
  liga: string | null
  posicaoLiga: number | null
  streak: number
  recorde: number
  memberSince: string | null // "março de 2024"
  foco: string | null
  avatarUrl: string | null
  avatarCor: string | null
  gamAtivo: boolean
}

export interface PerfilKpis {
  simuladosFeitos: number
  notaMedia: number | null
  acertoMedio: number | null // %
  tempoMedioMin: number | null
  melhorNota: number | null
  xpMes: number | null
}

export interface PerfilDisciplina { nome: string; aluno: number; turma: number }
export interface PerfilEvolucao { rotulo: string; nota: number; media?: number | null }

// ── Blocos ricos do design (spec 05). Todos OPCIONAIS: a UI só renderiza o bloco quando há fonte
// real; nada de número fabricado. Preenchidos por lib/aluno/perfil-analytics.ts (produção) e pelo
// mock (preview). ────────────────────────────────────────────────────────────────────────────────
export type PerfilTrend = 'up' | 'down' | 'eq'
/** Resumo da semana (vs. semana anterior) + barras por dia (Seg..Dom). */
export interface PerfilResumoSemana {
  questoes: number; questoesDeltaPct: number | null
  simulados: number; simuladosDelta: number | null
  tempoMin: number; tempoDeltaMin: number | null
  acerto: number; acertoDeltaPp: number | null
  dias: { label: string; valor: number }[]
}
/** Heatmap "Atividade de estudo" — intensidade 0..4 por dia, janela de ~6 meses. */
export interface PerfilAtividade { dias: { data: string; nivel: number }[]; totalDias: number }
/** Card de KPI das Estatísticas, com sparkline e variação. */
export interface PerfilEstatKpi { label: string; valor: string; delta: string | null; good: boolean; serie: number[] }
/** Linha "Você x média dos alunos". */
export interface PerfilVoceMedia { label: string; voce: number; media: number; sufixo?: string; melhor: boolean }
/** Acerto por banca + donut geral de respostas. */
export interface PerfilBanca { nome: string; acerto: number; total: number }
export interface PerfilBancaResumo { bancas: PerfilBanca[]; acertos: number; erros: number; brancos: number }
/** Pontos fortes / a reforçar (derivado do acerto por disciplina). */
export interface PerfilForteFraco { nome: string; pct: number; trend: PerfilTrend }
/** "Quando você rende mais": matriz dia×faixa de hora (acerto %; -1 = sem dado). */
export interface PerfilRendimentoHora { matriz: number[][]; slots: string[]; dias: string[]; insight: string | null }
/** Tempo por questão (segundos). */
export interface PerfilTempoQuestao {
  geralSeg: number | null; acertaSeg: number | null; erraSeg: number | null
  lenta: { nome: string; seg: number } | null; rapida: { nome: string; seg: number } | null
}
/** Meta diária de questões (config do aluno) + feitas hoje. */
export interface PerfilMetaDiaria { meta: number; feitas: number }
/** Toggles de preferências do aluno. */
export interface PerfilPreferencias { lembrete: boolean; resumoSemanal: boolean; aparecerRanking: boolean; modoFoco: boolean }
export interface PerfilHistorico { simulado: string; quando: string; nota: number | null; acerto: number; tempo: string; href: string | null }
export interface PerfilConquista { titulo: string; desbloqueada: boolean; cor?: string | null; criterio?: string | null }
export interface PerfilLeiSeca { lei: string; feitas: number; total: number; href?: string | null }

export interface PerfilData {
  header: PerfilHeader
  kpis: PerfilKpis
  porDisciplina: PerfilDisciplina[]
  evolucao: PerfilEvolucao[]
  historico: PerfilHistorico[]
  conquistas: PerfilConquista[]
  leiSeca: PerfilLeiSeca[]
  matForte: string | null
  matReforcar: string | null
  /** Link da trilha de Lei Seca ("Ir para a trilha"). */
  trilhaHref: string
  // ── Blocos ricos (opcionais; renderizados só quando presentes) ──
  resumoSemana?: PerfilResumoSemana | null
  atividade?: PerfilAtividade | null
  estatKpis?: PerfilEstatKpi[] | null
  voceXmedia?: PerfilVoceMedia[] | null
  porBanca?: PerfilBancaResumo | null
  fortesFracos?: { fortes: PerfilForteFraco[]; fracos: PerfilForteFraco[] } | null
  rendimentoHora?: PerfilRendimentoHora | null
  tempoPorQuestao?: PerfilTempoQuestao | null
  metaDiaria?: PerfilMetaDiaria | null
  preferencias?: PerfilPreferencias | null
}
