// Construtor de cadernos (área de teste) — "modelo pronto + ajustes".
// Um CADERNO tem VÁRIOS grupos (itens), cada um com sua modalidade + modelo + ajustes e prévia
// própria (como as "modalidades" do editor antigo). Config isolado em
// simulado_cadernos_teste.config.builderV3.

import { DIAG_PADRAO, DIAG_AGU_2023, type DiagConteudo } from './diagnostico'

export type Modalidade = 'folha_respostas' | 'caderno_questoes' | 'diagnostico'

export type BuilderAjustes = {
  titulo: string
  corPrimaria: string
  corSecundaria: string
  mostrarCabecalho: boolean
  mostrarDadosAluno: boolean
  mostrarComentarios: boolean
  mostrarGabarito: boolean
  numAlternativas: number // 4 ou 5
  colunas: number         // colunas da folha de respostas (2..5)
  compacto: boolean       // espaçamento/fonte menores
}

/** Um grupo do caderno: uma modalidade+modelo com seus ajustes (+ conteúdo, no diagnóstico). */
export type ItemCaderno = {
  id: string
  modalidade: Modalidade
  modelo: string
  ajustes: BuilderAjustes
  /** Conteúdo estruturado — usado pela modalidade "diagnostico". */
  conteudo?: DiagConteudo
}

export type { DiagConteudo }

export type BuilderV3 = {
  v: 3
  bancoId: string | null
  itens: ItemCaderno[]
  ativo: string // id do item em edição
}

export type PreviewQuestao = {
  id: string
  numero: number
  enunciado: string
  tipo: string
  alternativas: { letra: string; texto: string; correta: boolean; comentario: string }[]
}

export const AJUSTES_BASE: BuilderAjustes = {
  titulo: 'Simulado',
  corPrimaria: '#6d28d9',
  corSecundaria: '#f59e0b',
  mostrarCabecalho: true,
  mostrarDadosAluno: true,
  mostrarComentarios: false,
  mostrarGabarito: false,
  numAlternativas: 5,
  colunas: 2,
  compacto: false,
}

export type Modelo = { id: string; nome: string; descricao: string; ajustes: Partial<BuilderAjustes>; conteudo?: DiagConteudo }
export type ModalidadeMeta = { id: Modalidade; nome: string; descricao: string; modelos: Modelo[] }

export const MODALIDADES: ModalidadeMeta[] = [
  {
    id: 'caderno_questoes', nome: 'Caderno de Questões', descricao: 'Enunciados e alternativas para o aluno resolver.',
    modelos: [
      { id: 'classico', nome: 'Clássico', descricao: 'Questões com alternativas, espaçado.', ajustes: { mostrarGabarito: false, mostrarComentarios: false, compacto: false } },
      { id: 'com_gabarito', nome: 'Com gabarito', descricao: 'Destaca a correta e mostra o comentário.', ajustes: { mostrarGabarito: true, mostrarComentarios: true, compacto: false } },
      { id: 'compacto', nome: 'Compacto', descricao: 'Fonte e espaços menores (mais por página).', ajustes: { mostrarGabarito: false, mostrarComentarios: false, compacto: true } },
    ],
  },
  {
    id: 'folha_respostas', nome: 'Folha de Respostas', descricao: 'Grade de bolhas A–E para marcação.',
    modelos: [
      { id: 'classico', nome: 'Clássico', descricao: '2 colunas de questões.', ajustes: { colunas: 2, compacto: false } },
      { id: 'compacto', nome: 'Compacto', descricao: '4 colunas (mais questões por página).', ajustes: { colunas: 4, compacto: true } },
    ],
  },
  {
    id: 'diagnostico', nome: 'Diagnóstico', descricao: 'Relatório de desempenho do aluno (pilares, disciplinas, sugestões).',
    modelos: [
      { id: 'padrao', nome: 'Em branco', descricao: 'Estrutura vazia para preencher.', ajustes: { corPrimaria: '#2d254f', corSecundaria: '#f6b420' }, conteudo: DIAG_PADRAO },
      { id: 'agu_2023', nome: 'Completo (AGU 2023)', descricao: 'Pré-preenchido com o diagnóstico da AGU 2023.', ajustes: { corPrimaria: '#2d254f', corSecundaria: '#f6b420' }, conteudo: DIAG_AGU_2023 },
    ],
  },
]

export function metaDaModalidade(id: Modalidade): ModalidadeMeta {
  return MODALIDADES.find((m) => m.id === id) ?? MODALIDADES[0]
}

function novoId(): string {
  try { return crypto.randomUUID().slice(0, 8) } catch { return Math.random().toString(36).slice(2, 10) }
}

/** Ajustes de um modelo aplicados sobre uma base (preserva título/cores do usuário). */
export function aplicarModelo(atual: BuilderAjustes, modelo: Modelo): BuilderAjustes {
  return { ...atual, ...modelo.ajustes }
}

/** Ajustes de uma modalidade+modelo (base + overrides do modelo). */
export function ajustesDeModelo(modalidade: Modalidade, modeloId: string): BuilderAjustes {
  const meta = metaDaModalidade(modalidade)
  const modelo = meta.modelos.find((m) => m.id === modeloId) ?? meta.modelos[0]
  return { ...AJUSTES_BASE, ...modelo.ajustes }
}

function clonar<T>(v: T): T { try { return structuredClone(v) } catch { return JSON.parse(JSON.stringify(v)) } }

/** Cria um item (grupo) de modalidade+modelo. */
export function novoItem(modalidade: Modalidade, modeloId: string): ItemCaderno {
  const meta = metaDaModalidade(modalidade)
  const modelo = meta.modelos.find((m) => m.id === modeloId) ?? meta.modelos[0]
  const item: ItemCaderno = { id: novoId(), modalidade, modelo: modelo.id, ajustes: ajustesDeModelo(modalidade, modelo.id) }
  if (modalidade === 'diagnostico') item.conteudo = clonar(modelo.conteudo ?? DIAG_PADRAO)
  return item
}

/** Builder padrão: um único grupo (Caderno de Questões / Clássico). */
export function builderPadrao(bancoId: string | null = null): BuilderV3 {
  const item = novoItem('caderno_questoes', 'classico')
  return { v: 3, bancoId, itens: [item], ativo: item.id }
}

/** Item em edição (ou o primeiro). */
export function itemAtivo(builder: BuilderV3): ItemCaderno {
  return builder.itens.find((i) => i.id === builder.ativo) ?? builder.itens[0]
}

function normalizarItem(raw: any): ItemCaderno {
  const modalidade: Modalidade = ['folha_respostas', 'caderno_questoes', 'diagnostico'].includes(raw?.modalidade) ? raw.modalidade : 'caderno_questoes'
  const meta = metaDaModalidade(modalidade)
  const modelo = meta.modelos.some((m) => m.id === raw?.modelo) ? raw.modelo : meta.modelos[0].id
  const item: ItemCaderno = { id: typeof raw?.id === 'string' ? raw.id : novoId(), modalidade, modelo, ajustes: { ...AJUSTES_BASE, ...(raw?.ajustes ?? {}) } }
  if (modalidade === 'diagnostico') item.conteudo = (raw?.conteudo && typeof raw.conteudo === 'object') ? raw.conteudo : clonar(DIAG_PADRAO)
  return item
}

/** Lê o builder do config (tolerante). Migra o formato antigo (1 item por caderno) → itens[]. */
export function normalizarBuilder(config: unknown, nome?: string): BuilderV3 {
  const b = (config as any)?.builderV3
  const bancoId = (b?.bancoId ?? (config as any)?.bancoId ?? null) as string | null
  if (b && Array.isArray(b.itens) && b.itens.length) {
    const itens = b.itens.map(normalizarItem)
    const ativo = itens.some((i: ItemCaderno) => i.id === b.ativo) ? b.ativo : itens[0].id
    return { v: 3, bancoId, itens, ativo }
  }
  if (b && b.modalidade) { // formato antigo (single) → 1 grupo
    const item = normalizarItem(b)
    return { v: 3, bancoId, itens: [item], ativo: item.id }
  }
  const d = builderPadrao(bancoId)
  if (nome) d.itens[0].ajustes.titulo = nome
  return d
}
