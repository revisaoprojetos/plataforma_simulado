// Mock data da área "Simulados realizados" (spec 03 §4). Números do §4: 23 feitos / 20 concluídos /
// 3 em andamento / 6 personalizados. Privacidade (§6): só primeiro nome, nenhum dado de terceiros.
// NÃO buscar nada em rede — preview = mock. Em produção, `index.tsx` recebe `data` real.

import type { RealizadosData } from './data'

export interface EmAndamento { id: string; titulo: string; banca: string; area: string; capa: string; capaSub: string; capaGrad: string; questaoAtual: number; total: number; pct: number }
export interface Concluido { id: string; titulo: string; banca: string; area: string; capa: string; capaSub: string; capaGrad: string; data: string; nota: number }
export interface Personalizado { id: string; nome: string; status: 'rascunho' | 'concluido'; nQuestoes: number; materias: string[]; nota?: number }

// ------------------------------------------------------------------ stats por marca (§4)
export const STATS = {
  // Revisão: 23 feitos · 20 concluídos · 48% média · 72,5 melhor nota
  revisao: { realizados: 23, concluidos: 20, mediaGeral: 48, melhorNota: 72.5 },
  // VND: realizados / concluídos / média geral / melhor nota
  vnd: { realizados: 23, concluidos: 20, mediaGeral: 58, melhorNota: 80 },
  // MEQ: 4 KPIs com sublinha
  meq: { realizados: 23, concluidos: 20, mediaGeral: 58.1, melhorNota: 82.0, melhorNotaOrigem: 'Banco do Brasil', novosNoMes: 3, pctDoTotal: 87 },
}

// ------------------------------------------------------------------ Em andamento (3) por marca
export const EM_ANDAMENTO_REV: EmAndamento[] = [
  { id: 'r-a1', titulo: 'PGE/MT (2025) – FCC', banca: 'FCC', area: 'Procuradorias', capa: 'PGE/MT', capaSub: '2025 · FCC', capaGrad: 'linear-gradient(135deg,#2A1E4A,#4A31B8)', questaoAtual: 38, total: 80, pct: 47 },
  { id: 'r-a2', titulo: 'PGE/AC (2026) – FGV', banca: 'FGV', area: 'Procuradorias', capa: 'PGE/AC', capaSub: '2026 · FGV', capaGrad: 'linear-gradient(135deg,#1C1540,#3E2A93)', questaoAtual: 18, total: 80, pct: 22 },
  { id: 'r-a3', titulo: 'Simulado Semanal #6', banca: 'Revisão', area: 'Procuradorias', capa: 'Semanal', capaSub: 'Procuradorias', capaGrad: 'linear-gradient(135deg,#2B1150,#6A2FB0)', questaoAtual: 48, total: 60, pct: 80 },
]
export const EM_ANDAMENTO_VND: EmAndamento[] = [
  { id: 'v-a1', titulo: 'Técnico – DPE/RS', banca: 'FCC', area: 'Técnico', capa: 'DPE/RS', capaSub: '2026 · FCC', capaGrad: 'linear-gradient(140deg,#062A1B,#16804F)', questaoAtual: 6, total: 50, pct: 12 },
  { id: 'v-a2', titulo: 'Analista – DPE/SP', banca: 'FCC', area: 'Analista', capa: 'DPE/SP', capaSub: '2026 · FCC', capaGrad: 'linear-gradient(140deg,#0B3A24,#1C9A5E)', questaoAtual: 34, total: 100, pct: 34 },
  { id: 'v-a3', titulo: 'Defensor – DPU', banca: 'Cebraspe', area: 'Defensor', capa: 'DPU', capaSub: '2025 · Cebraspe', capaGrad: 'linear-gradient(140deg,#07301E,#12643D)', questaoAtual: 72, total: 120, pct: 60 },
]
export const EM_ANDAMENTO_MEQ: EmAndamento[] = [
  { id: 'm-a1', titulo: 'PRF (2026) – Policial', banca: 'Cebraspe', area: 'Polícias', capa: 'PRF', capaSub: 'POLÍCIAS', capaGrad: 'linear-gradient(150deg,#121A3A,#2B4A8F)', questaoAtual: 35, total: 100, pct: 35 },
  { id: 'm-a2', titulo: 'TRT 2 – Técnico Judiciário', banca: 'FCC', area: 'Tribunais', capa: 'TRT 2', capaSub: 'TRIBUNAIS', capaGrad: 'linear-gradient(150deg,#1F2A55,#306AB5)', questaoAtual: 30, total: 100, pct: 30 },
  { id: 'm-a3', titulo: 'Caixa – Técnico Bancário', banca: 'Cesgranrio', area: 'Bancários', capa: 'Caixa', capaSub: 'BANCÁRIOS', capaGrad: 'linear-gradient(150deg,#1B2F6B,#4A7BE0)', questaoAtual: 12, total: 100, pct: 12 },
]

// ------------------------------------------------------------------ Concluídos (12 Rev / 8 VND / tabela MEQ)
// nota 0–100 (1 casa); datas/títulos mock. Grades variadas de capa.
const GRADS_REV = ['linear-gradient(135deg,#241047,#5B2A9E)', 'linear-gradient(135deg,#2A1150,#6A2FB0)', 'linear-gradient(135deg,#1C1540,#3E2A93)', 'linear-gradient(135deg,#2A1E4A,#4A31B8)']
export const CONCLUIDOS_REV: Concluido[] = [
  { id: 'r-d1', titulo: 'Simulado Mensal – 09/2026', banca: 'Revisão', area: 'Procuradorias', capa: 'Simulado Mensal', capaSub: 'PROCURADORIAS', capaGrad: GRADS_REV[0], data: '28/09', nota: 1.0 },
  { id: 'r-d2', titulo: 'PGE/SP (2025) – Vunesp', banca: 'Vunesp', area: 'Procuradorias', capa: 'PGE/SP', capaSub: '2025 · VUNESP', capaGrad: GRADS_REV[1], data: '26/09', nota: 78.0 },
  { id: 'r-d3', titulo: 'PGM Itajaí (2024) – FGV', banca: 'FGV', area: 'Municipais', capa: 'PGM Itajaí', capaSub: '2024 · FGV', capaGrad: GRADS_REV[2], data: '24/09', nota: 64.0 },
  { id: 'r-d4', titulo: 'AGU (2023) – Cebraspe', banca: 'Cebraspe', area: 'Federais', capa: 'AGU', capaSub: '2023 · CEBRASPE', capaGrad: GRADS_REV[3], data: '20/09', nota: 52.0 },
  { id: 'r-d5', titulo: 'PGE/MA (2024) – FCC', banca: 'FCC', area: 'Procuradorias', capa: 'PGE/MA', capaSub: '2024 · FCC', capaGrad: GRADS_REV[0], data: '18/09', nota: 72.5 },
  { id: 'r-d6', titulo: 'PGE/RS (2023) – Fundatec', banca: 'Fundatec', area: 'Procuradorias', capa: 'PGE/RS', capaSub: '2023 · FUNDATEC', capaGrad: GRADS_REV[1], data: '15/09', nota: 41.0 },
  { id: 'r-d7', titulo: 'Simulado Semanal #5', banca: 'Revisão', area: 'Procuradorias', capa: 'Semanal #5', capaSub: 'PROCURADORIAS', capaGrad: GRADS_REV[2], data: '12/09', nota: 58.0 },
  { id: 'r-d8', titulo: 'PGM Manaus (2023) – FCC', banca: 'FCC', area: 'Municipais', capa: 'PGM Manaus', capaSub: '2023 · FCC', capaGrad: GRADS_REV[3], data: '10/09', nota: 29.0 },
  { id: 'r-d9', titulo: 'PGM Valinhos (2022) – VUNESP', banca: 'Vunesp', area: 'Municipais', capa: 'PGM Valinhos', capaSub: '2022 · VUNESP', capaGrad: GRADS_REV[0], data: '08/09', nota: 67.0 },
  { id: 'r-d10', titulo: 'Simulado Mensal – 07/2026', banca: 'Revisão', area: 'Procuradorias', capa: 'Mensal 07', capaSub: 'PROCURADORIAS', capaGrad: GRADS_REV[1], data: '26/07', nota: 44.0 },
  { id: 'r-d11', titulo: 'PGE/BA (2024) – FCC', banca: 'FCC', area: 'Procuradorias', capa: 'PGE/BA', capaSub: '2024 · FCC', capaGrad: GRADS_REV[2], data: '25/07', nota: 61.0 },
  { id: 'r-d12', titulo: 'PGE/PE (2023) – Cebraspe', banca: 'Cebraspe', area: 'Procuradorias', capa: 'PGE/PE', capaSub: '2023 · CEBRASPE', capaGrad: GRADS_REV[3], data: '24/07', nota: 70.0 },
]

const GRADS_VND = ['linear-gradient(140deg,#0B3340,#1C7A8C)', 'linear-gradient(140deg,#062A1B,#16804F)', 'linear-gradient(140deg,#0B3A24,#1C9A5E)', 'linear-gradient(140deg,#07301E,#12643D)']
export const CONCLUIDOS_VND: Concluido[] = [
  { id: 'v-d1', titulo: 'DPE/RJ – Defensor', banca: 'FGV', area: 'Defensor', capa: 'DPE/RJ', capaSub: '2025 · FGV', capaGrad: GRADS_VND[0], data: '28/09', nota: 68.0 },
  { id: 'v-d2', titulo: 'DPE/SP – Analista', banca: 'FCC', area: 'Analista', capa: 'DPE/SP', capaSub: '2025 · FCC', capaGrad: GRADS_VND[1], data: '24/09', nota: 80.0 },
  { id: 'v-d3', titulo: 'DPU – Defensor', banca: 'Cebraspe', area: 'Defensor', capa: 'DPU', capaSub: '2024 · CEBRASPE', capaGrad: GRADS_VND[2], data: '20/09', nota: 55.0 },
  { id: 'v-d4', titulo: 'DPE/MG – Técnico', banca: 'FUMARC', area: 'Técnico', capa: 'DPE/MG', capaSub: '2024 · FUMARC', capaGrad: GRADS_VND[3], data: '16/09', nota: 42.0 },
  { id: 'v-d5', titulo: 'DPE/BA – Defensor', banca: 'FCC', area: 'Defensor', capa: 'DPE/BA', capaSub: '2023 · FCC', capaGrad: GRADS_VND[0], data: '12/09', nota: 73.0 },
  { id: 'v-d6', titulo: 'DPE/PR – Analista', banca: 'FGV', area: 'Analista', capa: 'DPE/PR', capaSub: '2023 · FGV', capaGrad: GRADS_VND[1], data: '08/09', nota: 28.0 },
  { id: 'v-d7', titulo: 'DPE/RS – Técnico', banca: 'FCC', area: 'Técnico', capa: 'DPE/RS', capaSub: '2022 · FCC', capaGrad: GRADS_VND[2], data: '03/09', nota: 61.0 },
  { id: 'v-d8', titulo: 'DPE/CE – Defensor', banca: 'Cebraspe', area: 'Defensor', capa: 'DPE/CE', capaSub: '2022 · CEBRASPE', capaGrad: GRADS_VND[3], data: '28/08', nota: 66.0 },
]

// MEQ concluídos (tabela — 10 seg.). área/banca/data/melhorNota.
export const CONCLUIDOS_MEQ: Concluido[] = [
  { id: 'm-d1', titulo: 'Banco do Brasil – Escriturário', banca: 'Cesgranrio', area: 'Bancários', capa: 'BB', capaSub: 'BANCÁRIOS', capaGrad: 'linear-gradient(150deg,#121A3A,#2B4A8F)', data: '03/10', nota: 82.0 },
  { id: 'm-d2', titulo: 'PF – Agente', banca: 'Cebraspe', area: 'Polícias', capa: 'PF', capaSub: 'POLÍCIAS', capaGrad: 'linear-gradient(150deg,#1B2A52,#3E7FE0)', data: '29/09', nota: 74.0 },
  { id: 'm-d3', titulo: 'TRT 2 – Analista Judiciário', banca: 'FCC', area: 'Tribunais', capa: 'TRT 2', capaSub: 'TRIBUNAIS', capaGrad: 'linear-gradient(150deg,#1F2A55,#306AB5)', data: '24/09', nota: 61.0 },
  { id: 'm-d4', titulo: 'Receita Federal – Auditor', banca: 'FGV', area: 'Fiscais', capa: 'RFB', capaSub: 'FISCAIS', capaGrad: 'linear-gradient(150deg,#1B2F6B,#4A7BE0)', data: '19/09', nota: 48.0 },
  { id: 'm-d5', titulo: 'PRF – Policial', banca: 'Cebraspe', area: 'Polícias', capa: 'PRF', capaSub: 'POLÍCIAS', capaGrad: 'linear-gradient(150deg,#121A3A,#2B4A8F)', data: '14/09', nota: 57.0 },
  { id: 'm-d6', titulo: 'TJ/SP – Escrevente', banca: 'Vunesp', area: 'Tribunais', capa: 'TJ/SP', capaSub: 'TRIBUNAIS', capaGrad: 'linear-gradient(150deg,#1F2A55,#306AB5)', data: '09/09', nota: 29.0 },
  { id: 'm-d7', titulo: 'Caixa – Técnico Bancário', banca: 'Cesgranrio', area: 'Bancários', capa: 'Caixa', capaSub: 'BANCÁRIOS', capaGrad: 'linear-gradient(150deg,#1B2F6B,#4A7BE0)', data: '04/09', nota: 66.0 },
  { id: 'm-d8', titulo: 'ICMS/SP – Fiscal', banca: 'FCC', area: 'Fiscais', capa: 'SEFAZ', capaSub: 'FISCAIS', capaGrad: 'linear-gradient(150deg,#1F2A55,#306AB5)', data: '30/08', nota: 71.0 },
  { id: 'm-d9', titulo: 'PC/SP – Investigador', banca: 'Vunesp', area: 'Polícias', capa: 'PC/SP', capaSub: 'POLÍCIAS', capaGrad: 'linear-gradient(150deg,#121A3A,#2B4A8F)', data: '25/08', nota: 53.0 },
  { id: 'm-d10', titulo: 'TRF 3 – Técnico', banca: 'FCC', area: 'Tribunais', capa: 'TRF 3', capaSub: 'TRIBUNAIS', capaGrad: 'linear-gradient(150deg,#1F2A55,#306AB5)', data: '20/08', nota: 62.0 },
]

// ------------------------------------------------------------------ Personalizados (6)
export const PERSONALIZADOS: Personalizado[] = [
  { id: 'p1', nome: 'Reta final – Administrativo', status: 'rascunho', nQuestoes: 40, materias: ['Direito Administrativo', 'Constitucional'] },
  { id: 'p2', nome: 'Português puro', status: 'concluido', nQuestoes: 30, materias: ['Língua Portuguesa'], nota: 76.0 },
  { id: 'p3', nome: 'Tributário FGV', status: 'concluido', nQuestoes: 25, materias: ['Tributário'], nota: 58.0 },
  { id: 'p4', nome: 'Misto bancas 2024', status: 'rascunho', nQuestoes: 50, materias: ['Civil', 'Penal', 'Processo Civil'] },
  { id: 'p5', nome: 'Constitucional avançado', status: 'concluido', nQuestoes: 35, materias: ['Constitucional'], nota: 44.0 },
  { id: 'p6', nome: 'Trabalho + Processo', status: 'concluido', nQuestoes: 40, materias: ['Trabalho', 'Processo do Trabalho'], nota: 69.0 },
]

// Chips de passos do criador (Rev/VND)
export const CRIAR_CHIPS = ['Matérias', 'Banca', 'Nº de questões']
export const VND_PASSOS: [string, string][] = [
  ['Matérias', 'Escolha as disciplinas'],
  ['Banca', 'Filtre pelo estilo da prova'],
  ['Questões', 'Defina a quantidade'],
]

export const PRIVACY = 'Só você vê este histórico. Nenhum dado pessoal é exibido.'

// ------------------------------------------------------------------ dados reais shape (RealizadosData)
// Preview/sem backend → mock. Hrefs placeholder (/aluno/simulados/mock) e criar (/aluno/simulados/personalizados/novo).
const MOCK_HREF = '/aluno/simulados/mock'
const CRIAR_HREF = '/aluno/simulados/personalizados/novo'

export function realizadosMock(): RealizadosData {
  return {
    stats: { feitos: 23, concluidos: 20, mediaGeral: 58.1, melhorNota: 82, novosNoMes: 3, pctConcluidos: 87, melhorNotaOrigem: 'Banco do Brasil' },
    emAndamento: EM_ANDAMENTO_MEQ.map((it) => ({
      id: it.id,
      titulo: it.titulo,
      capa: { rotulo: it.capa, sub: it.capaSub, cor: it.capaGrad },
      banca: it.banca,
      area: it.area,
      questaoAtual: it.questaoAtual,
      total: it.total,
      pct: it.pct,
      continuarHref: MOCK_HREF,
    })),
    concluidos: CONCLUIDOS_MEQ.map((it) => ({
      id: it.id,
      titulo: it.titulo,
      capa: { rotulo: it.capa, sub: it.capaSub, cor: it.capaGrad },
      banca: it.banca,
      area: it.area,
      data: it.data,
      nota: it.nota,
      notaLiberada: true,
      href: MOCK_HREF,
      correcaoHref: MOCK_HREF,
      refazerHref: MOCK_HREF,
      baixarHref: MOCK_HREF,
    })),
    personalizados: {
      criarHref: CRIAR_HREF,
      itens: PERSONALIZADOS.map((it) => ({
        id: it.id,
        nome: it.nome,
        status: it.status,
        nota: it.nota ?? null,
        nQuestoes: it.nQuestoes,
        materias: it.materias.join(', '),
        href: MOCK_HREF,
        refazerHref: MOCK_HREF,
        editarHref: MOCK_HREF,
        baixarHref: MOCK_HREF,
      })),
    },
  }
}
