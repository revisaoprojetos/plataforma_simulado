// Dados MOCK do fluxo do simulado por marca (spec 06 §1.6/§2.10/§3.10). Substituir por fetch real
// na rodada de wiring. Números/títulos vêm da coluna de mock da spec.

import type { Brand, SimMock, SimQuestao, SimCorrecaoItem, TipoResposta } from './types'

const BANK_ABCDE: Omit<SimQuestao, 'numero' | 'id'>[] = [
  { materia: 'Direito Administrativo', tipo: 'ABCDE', enunciado: 'Acerca do regime jurídico-administrativo e do princípio da legalidade, assinale a alternativa correta.', alternativas: letras(['A Administração pode agir sem previsão legal quando houver interesse público.', 'O princípio da legalidade para o administrador significa fazer apenas o que a lei autoriza.', 'A supremacia do interesse público afasta o controle judicial dos atos administrativos.', 'A autotutela impede a anulação de atos pela própria Administração.', 'Discricionariedade equivale a arbitrariedade.']) },
  { materia: 'Direito Constitucional', tipo: 'ABCDE', enunciado: 'Sobre os direitos fundamentais e sua aplicabilidade, é correto afirmar que:', alternativas: letras(['Todos os direitos fundamentais têm eficácia limitada.', 'As normas definidoras de direitos e garantias fundamentais têm aplicação imediata.', 'Direitos sociais não são cláusulas pétreas.', 'O rol do art. 5º é taxativo.', 'Estrangeiros não titularizam direitos fundamentais.']) },
  { materia: 'Direito Civil', tipo: 'ABCDE', enunciado: 'A respeito da prescrição e da decadência no Código Civil, assinale a correta.', alternativas: letras(['A prescrição pode ser reconhecida de ofício.', 'Os prazos decadenciais podem ser suspensos livremente.', 'A prescrição atinge a pretensão; a decadência, o direito potestativo.', 'Renúncia à prescrição é sempre vedada.', 'Decadência convencional não existe.']) },
  { materia: 'Direito Processual Civil', tipo: 'ABCDE', enunciado: 'Quanto à tutela provisória de urgência, é correto afirmar:', alternativas: letras(['Exige sempre caução real.', 'Pode ser concedida liminarmente, presentes probabilidade do direito e perigo de dano.', 'Não admite caráter antecedente.', 'É incompatível com o processo de execução.', 'Dispensa fundamentação.']) },
  { materia: 'Direito Penal', tipo: 'ABCDE', enunciado: 'Sobre o concurso de pessoas, assinale a alternativa correta.', alternativas: letras(['Adota-se a teoria pluralista como regra.', 'A participação de menor importância pode reduzir a pena.', 'Partícipe responde sempre como autor.', 'Não se admite coautoria em crime culposo.', 'A comunicabilidade das circunstâncias é absoluta.']) },
  { materia: 'Direito Tributário', tipo: 'ABCDE', enunciado: 'Acerca das limitações constitucionais ao poder de tributar, assinale a correta.', alternativas: letras(['A anterioridade nonagesimal não se aplica a nenhum tributo.', 'A imunidade recíproca alcança as empresas públicas em qualquer atividade.', 'O princípio da legalidade comporta exceções quanto a alíquotas de certos tributos.', 'Isenção e imunidade são sinônimos.', 'A capacidade contributiva é vedada como critério.']) },
]

const BANK_CE: Omit<SimQuestao, 'numero' | 'id'>[] = [
  { materia: 'Direito Administrativo', tipo: 'CE', enunciado: 'A Administração Pública pode anular seus próprios atos quando eivados de vícios que os tornem ilegais, independentemente de provocação.' },
  { materia: 'Direito Constitucional', tipo: 'CE', enunciado: 'As normas definidoras dos direitos e garantias fundamentais têm aplicação imediata.' },
  { materia: 'Língua Portuguesa', tipo: 'CE', enunciado: 'No período "Embora chovesse, saímos", a oração iniciada por "embora" exprime concessão.' },
  { materia: 'Raciocínio Lógico', tipo: 'CE', enunciado: 'A negação de "todo A é B" é "algum A não é B".' },
  { materia: 'Direito Penal', tipo: 'CE', enunciado: 'No crime culposo, admite-se a modalidade tentada.' },
  { materia: 'Informática', tipo: 'CE', enunciado: 'Em uma rede TCP/IP, o protocolo responsável pela tradução de nomes em endereços IP é o DNS.' },
]

function letras(txts: string[]) {
  const L = ['A', 'B', 'C', 'D', 'E']
  return txts.map((texto, i) => ({ letra: L[i], texto }))
}

function gerarQuestoes(n: number, tipo: TipoResposta): SimQuestao[] {
  const bank = tipo === 'CE' ? BANK_CE : BANK_ABCDE
  return Array.from({ length: n }, (_, i) => {
    const base = bank[i % bank.length]
    return { ...base, id: `q${i + 1}`, numero: i + 1 }
  })
}

// Pré-respostas 1..12 (DEF_ANS), flags [5,9,11], atual 13 (spec §2.1).
function tentativaMock(n: number, tipo: TipoResposta, respondidas: number, tempoRestante?: string) {
  const respostas: Record<number, string | null> = {}
  const letras = tipo === 'CE' ? ['C', 'E'] : ['A', 'B', 'C', 'D', 'E']
  for (let i = 1; i <= Math.min(respondidas, n); i++) respostas[i] = letras[(i * 2) % letras.length]
  return {
    respostas,
    marcadas: [5, 9, 11].filter((f) => f <= n),
    eliminadas: {} as Record<number, string[]>,
    ultimaQuestao: Math.min(respondidas + 1, n),
    respondidas: Math.min(respondidas, n),
    ultimaAtividade: '09:42',
    tempoRestante,
  }
}

function correcaoMock(n: number, tipo: TipoResposta, certas: number, erradas: number): SimCorrecaoItem[] {
  const questoes = gerarQuestoes(n, tipo)
  return questoes.map((q, i) => {
    const status: SimCorrecaoItem['status'] = i < certas ? 'certa' : i < certas + erradas ? 'errada' : 'branco'
    const gabarito = tipo === 'CE' ? (i % 2 === 0 ? 'C' : 'E') : ['A', 'B', 'C', 'D', 'E'][i % 5]
    const sua = status === 'branco' ? null : status === 'certa' ? gabarito : tipo === 'CE' ? (gabarito === 'C' ? 'E' : 'C') : ['A', 'B', 'C', 'D', 'E'][(i + 1) % 5]
    return {
      numero: q.numero,
      materia: q.materia,
      status,
      gabarito,
      suaResposta: sua,
      enunciado: q.enunciado,
      comentario: 'O gabarito decorre da literalidade da norma e da jurisprudência consolidada sobre o tema. Observe o fundamento central destacado no enunciado.',
      alternativas: q.alternativas?.map((a) => ({ ...a, correta: a.letra === gabarito, suaResposta: a.letra === sua })),
    }
  })
}

const TOP3 = [
  { pos: 1, iniciais: 'A.L.', pct: 91 },
  { pos: 2, iniciais: 'M.C.', pct: 89 },
  { pos: 3, iniciais: 'R.S.', pct: 88 },
]

const DOWNLOADS = [
  { grupo: 'Como você fez', itens: [{ nome: 'Caderno de questões · PDF' }, { nome: 'Folha de respostas · PDF' }] },
  { grupo: 'Com gabarito', itens: [{ nome: 'Folha com gabarito' }, { nome: 'Diagnóstico' }, { nome: 'Gabarito comentado', destaque: true }] },
]

function materias(lista: [string, number, number, number?][]) {
  return lista.map(([nome, total, certas, mediaPct]) => ({ nome, total, certas, mediaPct }))
}

const MOCKS: Record<Brand, SimMock> = {
  revisao: {
    info: {
      titulo: 'Simulado Mensal – 10/2026', curto: 'SIMULADO MENSAL – 10/2026', subtitulo: 'PGE/PGM',
      n: 100, tipo: 'ABCDE', banca: 'Padrão PGE/PGM · objetiva A–E', duracaoMin: null,
      inicioISO: '2026-10-05T08:00:00', fimISO: '2026-10-12T23:59:00', inscritos: 1380,
      regras: ['Sem limite de tempo · pause quando quiser', 'Ranking top 50 → correção de peça', 'Ranking só na 1ª realização'],
      recompensa: 'Top 50 no ranking → correção de peça discursiva', permiteFolha: true, permitePausa: true,
    },
    questoes: gerarQuestoes(100, 'ABCDE'),
    tentativa: tentativaMock(100, 'ABCDE', 37),
    resultado: {
      certas: 62, erradas: 31, branco: 7, nota: '62%', posicao: 214, total: 1380, mediaTurma: 53, deltaMedia: 9,
      tempo: '3h35', inicio: '08:12', termino: '11:47', data: '05/10/2026',
      porMateria: materias([['Direito Administrativo', 10, 8, 60], ['Direito Constitucional', 10, 7, 58], ['Direito Civil', 10, 6, 55], ['Direito Processual Civil', 8, 5, 52], ['Direito Penal', 8, 4, 50], ['Direito Tributário', 8, 6, 54], ['Direito do Trabalho', 8, 5, 51], ['Direito Ambiental', 6, 4, 48], ['Direito Financeiro', 6, 5, 47], ['Direito Urbanístico', 6, 5, 46], ['Direito Empresarial', 6, 3, 49], ['Ética', 4, 3, 62], ['Língua Portuguesa', 4, 2, 57], ['Raciocínio Lógico', 3, 1, 44], ['Legislação Específica', 3, 2, 53]]),
      histograma: [3, 6, 11, 17, 22, 19, 12, 7, 3], faixaAluno: 5, top3: TOP3, correcao: correcaoMock(100, 'ABCDE', 62, 31), downloads: DOWNLOADS,
    },
    aluno: { primeiroNome: 'Joao' },
    countdown: { dias: 6, horas: 14, min: 32, dataLabel: '12/10 08:00' },
  },
  vnd: {
    info: {
      titulo: 'Simulado Nacional – Defensorias 10/2026', curto: 'SIMULADO NACIONAL 10/2026', subtitulo: 'RODADA NACIONAL · DEFENSORIAS',
      n: 80, tipo: 'ABCDE', banca: 'Padrão FCC', duracaoMin: 240,
      inicioISO: '2026-10-05T08:00:00', fimISO: '2026-10-08T23:59:00', inscritos: 2140,
      regras: ['4 horas · o tempo não para após iniciar', '+120 XP + medalha ao enviar', '≥70% → Liga Ouro'],
      recompensa: '+120 XP + medalha · ≥70% entra na Liga Ouro', permiteFolha: true, permitePausa: false,
    },
    questoes: gerarQuestoes(80, 'ABCDE'),
    tentativa: tentativaMock(80, 'ABCDE', 30, '2h38'),
    resultado: {
      certas: 51, erradas: 24, branco: 5, nota: '63,8%', posicao: 341, total: 2140, percentil: 84,
      tempo: '3h35', inicio: '08:12', termino: '11:47', data: '05/10/2026', xpGanho: 120,
      porMateria: materias([['Direito Constitucional', 12, 9, 70], ['Direito Administrativo', 10, 7, 62], ['Direito Civil', 10, 6, 58], ['Processo Civil', 10, 7, 60], ['Direito Penal', 10, 6, 55], ['Processo Penal', 8, 5, 54], ['Direitos Humanos', 10, 7, 65], ['Princípios Institucionais', 6, 2, 48], ['Legislação da Defensoria', 4, 2, 50]]),
      histograma: [2, 5, 9, 15, 21, 18, 13, 8, 3], faixaAluno: 5, top3: [{ pos: 1, iniciais: 'T.R.', pct: 92 }, { pos: 2, iniciais: 'M.S.', pct: 90 }, { pos: 3, iniciais: 'A.P.', pct: 88 }],
      vizinhanca: [{ pos: 339, iniciais: 'L.C.', pct: 64 }, { pos: 340, iniciais: 'B.M.', pct: 64 }, { pos: 341, iniciais: 'EU', pct: 63.8, eu: true }, { pos: 342, iniciais: 'P.A.', pct: 63 }, { pos: 343, iniciais: 'G.N.', pct: 63 }],
      correcao: correcaoMock(80, 'ABCDE', 51, 24), downloads: DOWNLOADS,
    },
    aluno: { primeiroNome: 'Joao' },
    countdown: { dias: 3, horas: 10, min: 15, dataLabel: '08/10 08:00' },
  },
  meq: {
    info: {
      titulo: 'Simulado PF 2026 – Agente', curto: 'CADERNO DE PROVA · SIMULADO', subtitulo: 'Polícia Federal · Cargo 1 · Tipo A',
      n: 120, tipo: 'CE', banca: 'Padrão Cebraspe · Certo ou Errado', duracaoMin: 210,
      inicioISO: '2026-10-05T14:00:00', fimISO: '2026-10-06T23:59:00', inscritos: 3905,
      regras: ['3h30 · o tempo não para após iniciar', 'Cebraspe: +1 / −1 / 0 (uma errada anula uma certa)', 'Na dúvida, deixe em branco'],
      recompensa: 'Nota líquida + posição no ranking na hora', permiteFolha: true, permitePausa: false,
    },
    questoes: gerarQuestoes(120, 'CE'),
    tentativa: tentativaMock(120, 'CE', 44, '2h05'),
    resultado: {
      certas: 78, erradas: 30, branco: 12, nota: '48', liquida: 48, cortEstimado: 52, posicao: 612, total: 3905, percentil: 84,
      tempo: '3h11', inicio: '14:05', termino: '17:16', data: '05/10/2026',
      porMateria: materias([['Direito Administrativo', 20, 14, 60], ['Direito Constitucional', 18, 12, 58], ['Língua Portuguesa', 18, 13, 62], ['Raciocínio Lógico', 14, 9, 55], ['Direito Penal', 16, 10, 52], ['Processo Penal', 14, 8, 50], ['Informática', 10, 7, 61], ['Legislação Especial', 10, 5, 47]]),
      histograma: [4, 8, 14, 20, 22, 16, 10, 5, 1], faixaAluno: 5,
      top3: [{ pos: 1, iniciais: 'G.T.', pct: 96 }, { pos: 2, iniciais: 'L.B.', pct: 91 }, { pos: 3, iniciais: 'D.R.', pct: 88 }],
      correcao: correcaoMock(120, 'CE', 78, 30), downloads: DOWNLOADS,
    },
    aluno: { primeiroNome: 'Joao' },
    countdown: { dias: 1, horas: 6, min: 40, dataLabel: '06/10 14:00' },
  },
}

export function simMock(brand: Brand): SimMock {
  return MOCKS[brand] ?? MOCKS.revisao
}
