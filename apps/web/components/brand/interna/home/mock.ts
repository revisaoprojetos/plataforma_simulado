// Dados MOCK da Home por marca (spec 03 §3.5). Substituir por dados reais no wiring de /aluno.

import type { Brand, HomeData } from './types'

const SEMANA = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'].map((dia, i) => ({ dia, estudou: i >= 1 && i <= 4 }))

const MISSOES = [
  { titulo: 'Complete 1 simulado', xp: 30, progresso: 1, total: 1 },
  { titulo: 'Acerte 20 questões', xp: 20, progresso: 0, total: 20 },
  { titulo: 'Pratique 10 questões', xp: 15, progresso: 0, total: 10 },
]

const AGENDA = [
  { diaSemana: 'SEG', data: '06/10', titulo: 'Direito Administrativo', detalhe: 'Aula 12 · Atos administrativos' },
  { diaSemana: 'TER', data: '07/10', titulo: 'Resolução de questões', detalhe: 'Constitucional · 20 questões' },
  { diaSemana: 'QUA', data: '08/10', titulo: 'Revisão de Lei Seca', detalhe: 'Lei 8.112/90 · arts. 116–132' },
]

function cards(prefixo: string, banca: string): HomeData['recentes'] {
  return [
    { id: `${prefixo}1`, titulo: 'PGE/MT (2025) – FCC', capa: { rotulo: 'PGE/MT', sub: '2025 · FCC' }, tipo: 'Prova real', banca: 'FCC', status: 'Em andamento', progresso: 48, cadernoUrl: '#' },
    { id: `${prefixo}2`, titulo: 'PGE/AC (2026) – FGV', capa: { rotulo: 'PGE/AC', sub: '2026 · FGV' }, tipo: 'Inédito', banca: 'FGV', status: 'Não iniciado', progresso: 0, cadernoUrl: '#' },
    { id: `${prefixo}3`, titulo: `Simulado Mensal – 10/2026`, capa: { rotulo: 'Mensal', sub: '10/2026' }, tipo: 'Inédito', banca, status: 'Concluído', progresso: 100, cadernoUrl: '#' },
  ]
}

function pastas(cat: string[]): HomeData['pastas'] {
  const base = [
    { nome: 'Carreiras AGU', rotuloCapa: 'AGU', subCapa: '2023', qtd: 4 },
    { nome: 'Procuradorias', rotuloCapa: 'PGE', subCapa: 'Estaduais', qtd: 8 },
    { nome: 'Defensorias', rotuloCapa: 'DPE', subCapa: 'Nacionais', qtd: 6 },
  ]
  return base.map((b, i) => ({ id: `p${i}`, nome: b.nome, rotuloCapa: b.rotuloCapa, subCapa: b.subCapa, qtdSimulados: b.qtd, concluidos: Math.floor(b.qtd / 2), categoria: cat[i % cat.length] }))
}

function base(brand: Brand): HomeData {
  return {
    usuario: {
      nome: 'Joao', iniciais: 'J', nivel: 27, tituloNivel: 'Aprovado', proximoTitulo: 'Mestre',
      xpNivelAtual: 126, xpNivelMax: 145, xpTotal: 2141, liga: 'Ouro', posicaoLiga: 7, xpParaProximaLiga: 420, plano: 'PRO',
    },
    sequenciaMeta: { diasSeguidos: 1, recordeDias: 12, semana: SEMANA, checkinHoje: true, metaDiariaXp: 50, xpHoje: 40, bauDias: 7, bauXp: 10 },
    missoes: MISSOES,
    renovaEm: 'meia-noite',
    continuar: {
      simuladoId: 's1', titulo: 'PGE/MT (2025) – FCC', capa: { rotulo: 'PGE/MT', sub: '2025 · FCC' },
      questaoAtual: 38, totalQuestoes: 80, tempoRestante: '42 min', acertos: 21, ultimaAtividade: 'há 2 dias', cadernoUrl: '#',
    },
    resumo: { simuladosFeitos: 24, questoesResolvidas: 1248, taxaAcerto: 72, pendentes: 6 },
    desempenho: [
      { materia: 'Direito Constitucional', pctAcerto: 78 },
      { materia: 'Direito Administrativo', pctAcerto: 71 },
      { materia: 'Direito Civil', pctAcerto: 64 },
      { materia: 'Direito Penal', pctAcerto: 55 },
      { materia: 'Raciocínio Lógico', pctAcerto: 44 },
    ],
    pontoAtencao: 'Raciocínio Lógico',
    agenda: AGENDA,
    destaques: [
      { eyebrow: 'DESTAQUE DA SEMANA', titulo: 'Simulado Mensal 10/2026', subtitulo: 'Participe e dispute o ranking nacional', chips: ['100 questões', 'Padrão PGE/PGM'], cta: { rotulo: 'Começar agora', url: '#' } },
      { eyebrow: 'NOVO', titulo: 'Caderno de erros', subtitulo: 'Treine o que você mais erra', chips: ['Personalizado'], cta: { rotulo: 'Ver reforço', url: '#' } },
      { eyebrow: 'CRONOGRAMA', titulo: 'Seu plano de hoje', subtitulo: '3 atividades programadas', chips: ['2h'], cta: { rotulo: 'Abrir cronograma', url: '#' } },
      { eyebrow: 'LIGAS', titulo: 'Você está em 7º na Liga Ouro', subtitulo: 'Faltam 420 XP para subir', chips: ['Ouro'], cta: { rotulo: 'Ver liga', url: '#' } },
      { eyebrow: 'JURISPRUDÊNCIA', titulo: 'Desafio de Jurisprudência', subtitulo: 'Informativos e súmulas do dia', chips: ['Diário'], cta: { rotulo: 'Jogar', url: '#' } },
    ],
    recentes: cards('r', brand === 'vnd' ? 'FCC' : brand === 'meq' ? 'Cebraspe' : 'FGV'),
    pastas: pastas(brand === 'vnd' ? ['Defensor', 'Analista', 'Técnico'] : brand === 'meq' ? ['Tribunais', 'Polícias', 'Fiscais'] : ['Federais', 'Estaduais', 'Municipais']),
    outros: cards('o', 'FGV').slice(0, 2),
    outrosDisponiveis: 2,
  }
}

const MOCKS: Record<Brand, HomeData> = {
  revisao: base('revisao'),
  vnd: { ...base('vnd'), rotativo: ['Defensor(a) Público(a)', 'Analista da Defensoria', 'Técnico(a) da Defensoria'] },
  meq: {
    ...base('meq'),
    rotativo: ['Tribunais', 'Polícias', 'Fiscais'],
    meqObjetivo: { cargoAlvo: 'Polícia Federal – Agente', dataProva: '15/11/2026', banca: 'Cebraspe', diasRestantes: 42, pctPlano: 67, focoArea: 'Polícias' },
  },
}

export function homeMock(brand: Brand): HomeData {
  return MOCKS[brand] ?? MOCKS.revisao
}
