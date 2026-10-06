// Mock do Perfil (spec 05 §1.8) — números do spec/geradores (perfil.py, perfil_vnd.py, perfil_meq.py).
// PREVIEW: produção intacta. Tudo anonimizado/agregado (§1.1): nenhum nome de outro aluno, nenhum dado pessoal.

import type { Brand } from '../interna-tokens'
import type { PerfilData } from './data'

export type Trend = 'up' | 'down' | 'eq'

// Header (igual às 3 marcas; foco/liga variam por marca).
export const HEADER = {
  firstName: 'Joao',
  avatarInitial: 'J',
  level: 27,
  levelTitle: 'Aprovado',
  xpInLevel: 86,
  xpToNext: 145,
  leaguePosition: 7,
  bestStreakDays: 12,
  memberSince: 'março de 2024',
  cohortSize: '12.840',
}

export const FOCO: Record<Brand, string> = {
  revisao: 'Foco em Procuradorias',
  vnd: 'Foco em Defensoria Pública',
  meq: 'Foco em Polícias e Tribunais',
}

// Aviso de privacidade por marca (§1.1).
export const PRIVACY: Record<Brand, string> = {
  revisao: 'E-mail, telefone e outros dados pessoais ficam só nas configurações da conta e nunca aparecem no perfil.',
  vnd: 'Dados pessoais não aparecem no perfil.',
  meq: 'Dados pessoais ficam só nas configurações da conta.',
}

// KPI strip (Rev/compartilhado) — [icon, valor, label]
export const KPI: [string, string, string][] = [
  ['clip', '51', 'Simulados feitos'],
  ['star', '18,9', 'Nota média'],
  ['target', '36%', 'Acerto médio'],
  ['clock', '202 min', 'Tempo médio'],
  ['trophy', '100,0', 'Melhor nota'],
  ['bolt', '30', 'XP este mês'],
]

export const MONTHS = ['Nov', 'Dez', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out']
export const EVO = [12.5, 15.0, 9.8, 18.2, 22.0, 16.4, 19.9, 24.5, 21.0, 18.9, 26.3, 28.0]
export const AVG = [16.0, 16.5, 15.8, 17.2, 18.0, 17.5, 18.1, 18.9, 18.4, 18.0, 19.2, 19.5]

export const DISC: [string, number][] = [
  ['Processual Civil', 100], ['Civil', 50], ['Ambiental', 50], ['Administrativo', 43], ['Financeiro', 40],
  ['Previdenciário', 40], ['Constitucional', 30], ['Trabalho', 28], ['Tributário', 25], ['Língua Portuguesa', 19],
  ['Proc. do Trabalho', 17], ['Agrário', 0],
]

export const BANCAS: [string, number, number][] = [
  ['FCC', 41, 120], ['FGV', 33, 96], ['Cebraspe', 29, 80], ['Vunesp', 45, 40], ['Outras', 38, 60],
]

// Histórico de simulados (Rev): [title, date, score, accuracy, timeMin]
export const HIST: [string, string, number, number, number][] = [
  ['Simulado Mensal – 09/2026', '28/09/2026', 1.0, 12, 185],
  ['PGM Manaus/AM – Simulado 02', '26/09/2026', 0.0, 8, 160],
  ['PGM Manaus/AM – Simulado 01', '24/09/2026', 2.0, 14, 172],
  ['PGE/MA – Simulado 01', '20/09/2026', 3.0, 18, 201],
  ['AGU – Simulado 02', '18/09/2026', 3.0, 21, 240],
  ['PGE/RS – Simulado 02', '15/09/2026', 0.0, 10, 150],
  ['PGM Valinhos/SP – Minissimulado', '12/09/2026', 10.0, 40, 45],
  ['PGFN 2023 – Cebraspe', '10/09/2026', 1.0, 22, 230],
  ['AGU 2023 – Cebraspe', '08/09/2026', 7.0, 31, 236],
  ['Direito Financeiro – 7 dias', '26/07/2026', 40.0, 52, 60],
]

// Conquistas (25) — [icon, title, color, unlocked, criteria]
export type Ach = [string, string, string, boolean, string]
export const ACH: Ach[] = [
  ['shield', 'Veterano', '#F2A93B', true, '50 simulados'],
  ['flame', 'Primeira chama', '#F0773A', true, '3 dias seguidos'],
  ['star', 'Nota máxima', '#E8A93A', true, 'Tirou 100 num simulado'],
  ['bolt', 'Maratonista', '#7C6CF0', true, '100 questões num dia'],
  ['books', 'Leitor da lei', '#3FB68B', true, '30 aulas de lei seca'],
  ['gavel', 'Jurisprudente', '#5B8DEF', true, '100 julgados'],
  ['trophy', 'Liga Ouro', '#E8A93A', true, 'Chegou à Liga Ouro'],
  ['target', 'Mira certeira', '#E36F6F', true, '10 acertos seguidos'],
  ['cal', 'Constância', '#4BB3C7', true, '4 semanas ativas'],
  ['medal', 'Pódio', '#C0C7CF', true, 'Top 3 da liga'],
  ['clip', 'Simulado completo', '#3FB68B', true, 'Terminou 80 questões'],
  ['bulb', 'Curioso', '#D9A441', true, '20 comentários lidos'],
  ['users', 'Clube', '#B07CD8', true, 'Entrou num JurisClub'],
  ['book', 'Banco de questões', '#5B8DEF', true, '500 questões'],
  ['check', 'Sem erros', '#1FA868', true, 'Caderno 100%'],
  ['star', 'Primeiro passo', '#E58BB0', true, 'Primeiro simulado'],
  ['crown', 'Lenda dos simulados', '#2CC5A8', false, '51/100 simulados'],
  ['diamond', 'Liga Diamante', '#3FB6E0', false, '2.101/3.000 XP'],
  ['flame', 'Semana em chamas', '#F0773A', false, '0/7 dias'],
  ['gem', 'Ametista', '#9B5DE5', false, '2.101/5.000 XP'],
  ['star', '25.000 XP', '#F0628E', false, '2.101/25.000 XP'],
  ['trophy', 'Imparável', '#7C6CF0', false, '51/200 simulados'],
  ['target', 'Sniper', '#E36F6F', false, '0/25 acertos seguidos'],
  ['books', 'Lei seca completa', '#3FB68B', false, '45/120 aulas'],
  ['gavel', 'Mestre da juris', '#5B8DEF', false, '146/500 julgados'],
]

export const STICKERS: [string, string][] = [
  ['flame', '#F0773A'], ['star', '#E8A93A'], ['trophy', '#7C6CF0'], ['books', '#3FB68B'], ['gavel', '#5B8DEF'],
]

export const SLOTS = ['6–9h', '9–12h', '12–15h', '15–18h', '18–21h', '21–24h']
export const WD = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

// Estatísticas KPIs com sparkline — [label, valor, delta, good, serie]
export const EST_KPIS: [string, string, string, boolean, number[]][] = [
  ['Nota média', '18,9', '+3,2 vs. set', true, [12, 14, 13, 16, 15, 17, 18.9]],
  ['Acerto médio', '36%', '+4 pp vs. set', true, [28, 30, 29, 33, 31, 34, 36]],
  ['Questões no mês', '412', '+18% vs. set', true, [210, 260, 240, 300, 330, 350, 412]],
  ['Tempo por questão', '2min 31s', '−12s vs. set', true, [190, 182, 175, 170, 166, 160, 151]],
  ['Posição na plataforma', 'Top 18%', 'subiu 6 posições', true, [30, 28, 27, 24, 22, 20, 18]],
]

// ================================================================= VND
export const VND_YEAR: [string, string][] = [['51', 'simulados'], ['3.420', 'questões'], ['168h', 'de estudo'], ['2.101', 'XP']]
export const VND_MISSIONS: [string, number, number, string, string][] = [
  ['Resolva 100 questões', 64, 100, '+40 XP', 'clip'],
  ['Faça 1 simulado completo', 0, 1, '+60 XP', 'layers'],
  ['Estude 5 dias seguidos', 2, 5, '+50 XP', 'flame'],
  ['Acerte 10 julgados', 7, 10, '+30 XP', 'gavel'],
]
export const VND_CHIPS: [string, string[]][] = [
  ['Objetivo', ['Defensoria Pública', 'DPE/SP', 'DPU']],
  ['Bancas favoritas', ['FCC', 'FGV', 'Cebraspe']],
  ['Matérias que domina', ['Processual Civil', 'Civil']],
  ['Quer melhorar', ['Agrário', 'Proc. do Trabalho', 'Português']],
]
// Calendário sequência (setembro 2026): dias estudados (set determinístico do mock).
export const VND_STUDIED = [1, 3, 4, 6, 7, 9, 10, 12, 14, 15, 16, 17, 18, 19, 20, 21, 24, 25, 27, 28, 29]
export const VND_CATS: [string, number[]][] = [
  ['Simulados', [0, 10, 2, 16, 21]],
  ['Sequência', [1, 8, 18]],
  ['Liga e ranking', [6, 9, 17, 19]],
  ['Estudo', [3, 4, 5, 11, 13, 14, 22, 23, 24]],
  ['Comunidade', [12, 15, 20, 7]],
]
// Histórico timeline — [title, date, score, accuracy, timeMin]
export const VH: [string, string, number, number, number][] = [
  ['DPE/RJ (2025) – FGV', '28/09', 68.0, 68, 210],
  ['Simulado Nacional #3', '26/09', 54.5, 55, 180],
  ['DPU (2026) – Cebraspe', '22/09', 71.0, 71, 225],
  ['DPE/MG (2025) – Fundep', '19/09', 42.0, 42, 190],
  ['DPE/BA – Simulado 02', '15/09', 25.0, 25, 160],
  ['DPE/PR – Simulado 01', '29/08', 63.5, 64, 175],
  ['Rodada semanal #5', '22/08', 80.0, 80, 60],
  ['Analista Jurídico – DPE/SC', '15/08', 58.0, 58, 140],
  ['Execução penal – personalizado', '08/08', 38.0, 38, 45],
]
export const VND_RADAR_LAB = ['Constit.', 'Admin.', 'Civil', 'Proc. Civil', 'Penal', 'Proc. Penal', 'Dir. Hum.', 'ECA']
export const VND_RADAR_YOU = [30, 43, 50, 100, 58, 47, 64, 39]
export const VND_RADAR_AVG = [44, 46, 48, 55, 52, 50, 57, 45]
export const VND_WEEKS = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9', 'S10', 'S11', 'S12']
export const VND_ACC_W = [24, 27, 25, 31, 29, 33, 30, 35, 34, 38, 36, 41]
export const VND_LEAGUE = [14, 12, 12, 9, 10, 8, 8, 7]
export const VND_LEAGUE_LAB = ['S5', 'S6', 'S7', 'S8', 'S9', 'S10', 'S11', 'S12']
export const VND_TIME: [string, string, string][] = [
  ['Simulados', '77h', '#1FA868'], ['Banco de questões', '40h', '#E8C877'],
  ['Lei seca', '30h', '#5B8DEF'], ['Jurisprudência', '21h', '#B07CD8'],
]
export const VND_RECORDS: [string, string, string, string][] = [
  ['star', '100,0', 'Melhor nota', 'Minissimulado PGM'],
  ['flame', '12 dias', 'Maior sequência', 'em maio'],
  ['bolt', '186', 'Questões num dia', '14/08'],
  ['trophy', '3º', 'Melhor posição', 'Liga Prata'],
]

// ================================================================= MEQ
export const MEQ_TARGET: [string, string][] = [
  ['51', 'Simulados'], ['18,9', 'Nota média'], ['36%', 'Acerto'],
  ['202 min', 'Tempo médio'], ['100,0', 'Melhor nota'], ['30', 'XP no mês'],
]
export const MEQ_READINESS: [string, number, string, string][] = [
  ['PF · Agente', 0.58, 'var(--brand2)', '142 dias'],
  ['PRF · Policial', 0.51, '#5ECEF0', '210 dias'],
  ['TJ/SP · Escrevente', 0.66, '#2EC77A', 'sem data'],
]
export const MEQ_EDITAL: [string, number, number, number][] = [
  ['Língua Portuguesa', 18, 24, 62], ['Raciocínio Lógico', 9, 15, 48], ['Informática', 6, 12, 66],
  ['Direito Constitucional', 14, 20, 30], ['Direito Administrativo', 12, 18, 43], ['Direito Penal', 10, 22, 74],
  ['Processo Penal', 5, 16, 40], ['Legislação Especial', 4, 14, 33],
]
export const MEQ_PLAN: [string, [string, number][]][] = [
  ['Seg', [['Português', 1], ['Constitucional', 1]]],
  ['Ter', [['RLM', 1], ['Penal', 2]]],
  ['Qua', [['Informática', 1], ['Administrativo', 1]]],
  ['Qui', [['Simulado', 3]]],
  ['Sex', [['Proc. Penal', 2], ['Português', 1]]],
  ['Sáb', [['Revisão', 2]]],
  ['Dom', [['Descanso', 0]]],
]
export const MEQ_PCOL: Record<string, string> = {
  'Português': '#3E7FE0', 'Constitucional': '#7C6CF0', 'RLM': '#2EC77A', 'Penal': '#E36F6F',
  'Informática': '#4BB3C7', 'Administrativo': '#D9A441', 'Simulado': '#171E3B', 'Proc. Penal': '#E58BB0',
  'Revisão': '#8AA05A', 'Descanso': 'var(--track)',
}
export const MEQ_PERFIL: [string, string][] = [
  ['Cargo-alvo', 'Agente de Polícia Federal'], ['Escolaridade exigida', 'Superior'],
  ['Bancas favoritas', 'Cebraspe · Vunesp'], ['Horário produtivo', '19h – 21h'], ['Na plataforma desde', 'Março de 2024'],
]
// Matriz de prioridade — [subject, weight, accuracy, labelPos]
export const MEQ_MATRIX: [string, number, number, 't' | 'b'][] = [
  ['Português', 23, 62, 't'], ['RLM', 7, 48, 't'], ['Informática', 4, 66, 't'], ['Constitucional', 14, 30, 't'],
  ['Administrativo', 18, 43, 't'], ['Penal', 16, 74, 't'], ['Proc. Penal', 10, 40, 'b'], ['Leg. Especial', 21, 33, 'b'],
]
export const MEQ_STACK_MONTHS = ['Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out']
export const MEQ_STACK_OK = [80, 120, 95, 140, 160, 70]
export const MEQ_STACK_BAD = [150, 170, 140, 180, 190, 90]
export const MEQ_HIST_BINS = [2, 4, 7, 11, 16, 19, 17, 12, 7, 4, 1]
export const MEQ_HIST_ME = 7
export const MEQ_ASSUNTOS: [string, string, number, number, Trend][] = [
  ['Crase', 'Português', 24, 71, 'up'],
  ['Atos administrativos', 'Administrativo', 31, 39, 'down'],
  ['Inquérito policial', 'Proc. Penal', 18, 61, 'up'],
  ['Direitos fundamentais', 'Constitucional', 40, 28, 'eq'],
  ['Lógica proposicional', 'RLM', 22, 45, 'up'],
  ['Crimes contra a Adm.', 'Penal', 27, 52, 'eq'],
]
// Simulados — [title, banca, date, score, cutoff, position]
export const MEQ_SIMS: [string, string, string, number, number, number][] = [
  ['PF – Simulado 03', 'Cebraspe', '28/09', 64.0, 60.0, 412],
  ['PRF – Simulado 02', 'Cebraspe', '24/09', 52.5, 58.0, 980],
  ['TJ/SP – Escrevente', 'Vunesp', '20/09', 71.0, 68.0, 205],
  ['PF – Simulado 02', 'Cebraspe', '15/09', 55.0, 60.0, 1102],
  ['INSS – Técnico', 'Cebraspe', '10/09', 61.5, 62.0, 760],
  ['PF – Simulado 01', 'Cebraspe', '04/09', 47.0, 60.0, 1640],
]
export const MEQ_SELO_DATES = ['12/09', '02/09', '28/08', '20/08', '11/08', '30/07', '21/07', '15/07', '02/07', '18/06', '05/06', '22/05', '10/05', '28/04', '09/04', '20/03']

// ================================================================= PerfilData (preview)
// Mapeia o conteúdo de amostra acima para o contrato de DADOS REAIS. As telas consomem SEMPRE
// PerfilData (preview via este mock, produção via backend) — nunca mais os arrays soltos.
export function perfilMock(): PerfilData {
  return {
    header: {
      nome: HEADER.firstName,
      iniciais: HEADER.avatarInitial,
      nivel: HEADER.level,
      tituloNivel: HEADER.levelTitle,
      xpNivelAtual: HEADER.xpInLevel,
      xpNivelMax: HEADER.xpToNext,
      xpTotal: 2101,
      liga: 'Liga Ouro',
      posicaoLiga: HEADER.leaguePosition,
      streak: 0,
      recorde: HEADER.bestStreakDays,
      memberSince: HEADER.memberSince,
      foco: 'Procuradorias',
      avatarUrl: null,
      avatarCor: null,
      gamAtivo: true,
    },
    kpis: {
      simuladosFeitos: 51,
      notaMedia: 18.9,
      acertoMedio: 36,
      tempoMedioMin: 202,
      melhorNota: 100.0,
      xpMes: 30,
    },
    porDisciplina: DISC.map(([nome, aluno]) => ({ nome, aluno, turma: Math.max(0, Math.round(aluno * 0.8)) })),
    evolucao: MONTHS.map((rotulo, i) => ({ rotulo, nota: EVO[i] })),
    historico: HIST.map(([simulado, quando, nota, acerto, tempo]) => ({
      simulado, quando, nota, acerto, tempo: `${tempo} min`, href: '/aluno/simulados/mock',
    })),
    conquistas: ACH.map(([, titulo, cor, desbloqueada, criterio]) => ({ titulo, desbloqueada, cor, criterio })),
    leiSeca: [
      { lei: 'Constituição Federal', feitas: 4, total: 30 },
      { lei: 'Código Tributário Nacional', feitas: 12, total: 25 },
      { lei: 'Lei de Licitações', feitas: 22, total: 22 },
    ],
    matForte: 'Processual Civil · 100%',
    matReforcar: 'Agrário · 0%',
    trilhaHref: '/aluno/leitura',
  }
}
