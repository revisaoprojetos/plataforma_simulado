// Mock data da área "Ligas" (spec 04 §4). Preview = mock; produção = `data` real injetado no index.
// Privacidade (§0): os outros alunos aparecem SÓ com as INICIAIS (ex. "O.F."), nunca o nome completo.
// Apenas o aluno logado é "Você". Números-base do §4: Liga Ouro, 7º de 18, 2.101 XP, 899 p/ Diamante,
// encerra em 2 dias, streak 0/recorde 3. Divisões Bronze→Prata→Ouro(atual)→Diamante→Ametista.

import type { LigaData } from './data'

// Divisões (divtrack §4): nome / xpMin / cor. Ouro é a atual.
export const DIVISOES: { nome: string; xpMin: number; cor: string }[] = [
  { nome: 'Bronze', xpMin: 0, cor: '#B9773F' },
  { nome: 'Prata', xpMin: 1000, cor: '#9AA5B1' },
  { nome: 'Ouro', xpMin: 2000, cor: '#E8A93A' },
  { nome: 'Diamante', xpMin: 3000, cor: '#3FB6E0' },
  { nome: 'Ametista', xpMin: 5000, cor: '#9B5DE5' },
]

// Pódio da semana (top 3) — SÓ iniciais (§0). O 1º é o líder da liga.
export const PODIO: { pos: number; iniciais: string; xp: number; eu?: boolean }[] = [
  { pos: 1, iniciais: 'O.F.', xp: 2995 },
  { pos: 2, iniciais: 'O.A.', xp: 2593 },
  { pos: 3, iniciais: 'I.T.', xp: 2505 },
]

// XP na semana do aluno logado (7 dias).
export const SEMANA: { dia: string; xp: number }[] = [
  { dia: 'Seg', xp: 40 },
  { dia: 'Ter', xp: 85 },
  { dia: 'Qua', xp: 0 },
  { dia: 'Qui', xp: 120 },
  { dia: 'Sex', xp: 60 },
  { dia: 'Sáb', xp: 30 },
  { dia: 'Dom', xp: 95 },
]

export const PRIVACY = 'Outros alunos aparecem de forma anônima.'

export function ligaMock(): LigaData {
  const xpTotal = 2101
  const proxima = DIVISOES.find((d) => d.xpMin > xpTotal) ?? null
  return {
    ligaNome: 'Liga Ouro',
    ligaCor: '#E8A93A',
    posicao: 7,
    membros: 18,
    xpTotal,
    xpSemana: SEMANA.reduce((a, b) => a + b.xp, 0),
    streak: 3,
    proximaNome: proxima?.nome ?? null,
    faltam: proxima ? proxima.xpMin - xpTotal : 0,
    tiers: DIVISOES.map((d) => ({
      nome: d.nome,
      xpMin: d.xpMin,
      cor: d.cor,
      atual: d.nome === 'Ouro',
      passada: d.xpMin < 2000, // Bronze e Prata já conquistadas
    })),
    podio: PODIO,
    semana: SEMANA,
  }
}
