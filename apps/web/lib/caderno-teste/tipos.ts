// Construtor de cadernos (área de teste) — "modelo pronto + ajustes".
// Um CADERNO tem VÁRIOS grupos (itens), cada um com sua modalidade + modelo + ajustes e prévia
// própria (como as "modalidades" do editor antigo). Config isolado em
// simulado_cadernos_teste.config.builderV3.

import { DIAG_PADRAO, DIAG_AGU_2023, DIAG_PGE_RS, DIAG_BASE_4, type DiagConteudo } from './diagnostico'
import type { CadernoDoc } from '@/lib/caderno-designer/types'

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
  capaUrl: string         // imagem de capa (página A4 inteira, no início)
  folhaUrl: string        // imagem de fundo da folha (papel timbrado, por página)
  cabecalhoUrl: string    // imagem do cabeçalho (faixa no topo de cada página)
  rodapeUrl: string       // imagem do rodapé (faixa na base de cada página)
  /** Cor por pilar (slug → hex) — cor PADRÃO da linha das disciplinas daquele pilar. */
  coresPilar: Record<string, string>
  /** Cor individual por disciplina (chave/slug → hex) — sobrepõe a cor do pilar quando definida. */
  coresDisc: Record<string, string>
  /** Cor individual por PARTE do preview (chave da parte → hex) — clique em qualquer bloco na prévia. */
  coresParte: Record<string, string>
  /** Alinhamento do texto por PARTE (parte → left/center/right/justify). */
  alinhamentoParte: Record<string, string>
  /** Cor do TEXTO por PARTE (parte → hex) — para blocos com fundo colorido (nota, cabeçalho…). */
  coresTextoParte: Record<string, string>
  /** Estilo (negrito/itálico/sublinhado) por PARTE — aplica ao bloco inteiro. */
  estiloParte: Record<string, { b?: boolean; i?: boolean; u?: boolean }>
  /** Fonte por PARTE (parte → id de FONTES_CADERNO). Herdada pelos textos do bloco. */
  fonteParte: Record<string, string>
}

/** Cores padrão por pilar (adaptável: pilares novos herdam a cor secundária até serem configurados). */
export const CORES_PILAR_PADRAO: Record<string, string> = {
  lei_seca: '#c9a227',
  jurisprudencia: '#3b5bdb',
  doutrina: '#e8850c',
  lingua_portuguesa: '#1a7a4a',
}

/** Título sobreposto à imagem de capa (modelos prontos): texto, estilo e posição livre. */
export type CapaConfig = {
  titulo: string
  cor: string
  tamanho: number
  /** Id da fonte (FONTES_CADERNO); vazio = fonte do tema. */
  fonte: string
  negrito: boolean
  italico: boolean
  sublinhado: boolean
  alinhamento: 'left' | 'center' | 'right'
  /** Posição vertical do título na capa: 0 (topo) … 100 (base). */
  posV: number
  /** Posição horizontal do título na capa: 0 (esquerda) … 100 (direita). */
  posH: number
}
export const CAPA_PADRAO: CapaConfig = { titulo: 'CADERNO DE QUESTÕES', cor: '#ffffff', tamanho: 44, fonte: 'montserrat', negrito: true, italico: false, sublinhado: false, alinhamento: 'center', posV: 68, posH: 50 }

/** Um grupo do caderno: uma modalidade+modelo com seus ajustes (+ conteúdo, no diagnóstico). */
export type ItemCaderno = {
  id: string
  modalidade: Modalidade
  modelo: string
  ajustes: BuilderAjustes
  /** Conteúdo estruturado — usado pela modalidade "diagnostico". */
  conteudo?: DiagConteudo
  /** Título da capa (modelos prontos doc-backed) — sobreposto à imagem de capa. */
  capa?: CapaConfig
  /** Doc editado do modelo pronto (edição por bloco). Quando ausente, usa o preset original. */
  docEdit?: CadernoDoc
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
  capaUrl: '',
  folhaUrl: '',
  cabecalhoUrl: '',
  rodapeUrl: '',
  coresPilar: { ...CORES_PILAR_PADRAO },
  coresDisc: {},
  coresParte: {},
  alinhamentoParte: {},
  coresTextoParte: {},
  estiloParte: {},
  fonteParte: {},
}

export type Modelo = {
  id: string; nome: string; descricao: string; ajustes: Partial<BuilderAjustes>; conteudo?: DiagConteudo
  /** Modelo PRONTO renderizado pelo motor de blocos do v1 (id do preset em caderno-designer/presets.ts).
   * Quando presente, a prévia usa PreviaBlocos (idêntico ao v1) em vez do render simples. */
  docPreset?: string
}
export type ModalidadeMeta = { id: Modalidade; nome: string; descricao: string; modelos: Modelo[] }

export const MODALIDADES: ModalidadeMeta[] = [
  {
    id: 'caderno_questoes', nome: 'Caderno de Questões', descricao: 'Enunciados e alternativas para o aluno resolver.',
    modelos: [
      { id: 'classico', nome: 'Clássico', descricao: 'Questões com alternativas, espaçado.', ajustes: { mostrarGabarito: false, mostrarComentarios: false, compacto: false } },
      { id: 'com_gabarito', nome: 'Com gabarito', descricao: 'Destaca a correta e mostra o comentário.', ajustes: { mostrarGabarito: true, mostrarComentarios: true, compacto: false } },
      { id: 'compacto', nome: 'Compacto', descricao: 'Fonte e espaços menores (mais por página).', ajustes: { mostrarGabarito: false, mostrarComentarios: false, compacto: true } },
      { id: 'agu_perguntas', nome: 'AGU · Caderno de questões', descricao: 'Modelo pronto (idêntico ao v1): capa + dados do estudante + enunciados e alternativas. Reenvie a capa/fundo.', ajustes: {}, docPreset: 'caderno-perguntas' },
      { id: 'agu_completo', nome: 'AGU · Caderno completo', descricao: 'Modelo pronto (v1): + resposta marcada, correção (marcada × correta) e comentário.', ajustes: {}, docPreset: 'caderno-completo' },
    ],
  },
  {
    id: 'folha_respostas', nome: 'Folha de Respostas', descricao: 'Grade de bolhas A–E para marcação.',
    modelos: [
      { id: 'classico', nome: 'Clássico', descricao: '2 colunas de questões.', ajustes: { colunas: 2, compacto: false } },
      { id: 'compacto', nome: 'Compacto', descricao: '4 colunas (mais questões por página).', ajustes: { colunas: 4, compacto: true } },
      { id: 'agu_folha', nome: 'AGU · Folha de respostas', descricao: 'Modelo pronto (idêntico ao v1): capa + dados do estudante + grade azul/dourada (marcado + oficial). Reenvie a capa/fundo.', ajustes: {}, docPreset: 'caderno-objetivo' },
    ],
  },
  {
    id: 'diagnostico', nome: 'Diagnóstico', descricao: 'Relatório de desempenho do aluno (pilares, disciplinas, sugestões).',
    modelos: [
      { id: 'padrao', nome: 'Em branco', descricao: 'Estrutura vazia para preencher.', ajustes: { corPrimaria: '#2d254f', corSecundaria: '#f6b420' }, conteudo: DIAG_PADRAO },
      { id: 'base_4', nome: 'Base — 4 disciplinas', descricao: 'Estrutura completa pronta (intro, pilar separado, 3 pilares, 4 disciplinas, sugestões e gabarito) com textos genéricos.', ajustes: { corPrimaria: '#2d254f', corSecundaria: '#f6b420' }, conteudo: DIAG_BASE_4 },
      { id: 'agu_2023', nome: 'Completo (AGU 2023)', descricao: 'Pré-preenchido com o diagnóstico da AGU 2023.', ajustes: { corPrimaria: '#2d254f', corSecundaria: '#f6b420' }, conteudo: DIAG_AGU_2023 },
      { id: 'pge_rs', nome: 'Completo (PGE/RS)', descricao: 'Estrutura base para o diagnóstico da PGE/RS — ajuste os textos/disciplinas.', ajustes: { corPrimaria: '#2d254f', corSecundaria: '#f6b420' }, conteudo: DIAG_PGE_RS },
    ],
  },
]

export function metaDaModalidade(id: Modalidade): ModalidadeMeta {
  return MODALIDADES.find((m) => m.id === id) ?? MODALIDADES[0]
}

/** Id do preset de blocos (v1) de um modelo, se ele for um "modelo pronto" doc-backed. */
export function presetDoModelo(modalidade: Modalidade, modeloId: string): string | undefined {
  const meta = metaDaModalidade(modalidade)
  return meta.modelos.find((m) => m.id === modeloId)?.docPreset
}

/** Id do preset de blocos (v1) de um item já montado. */
export function presetDoItem(item: ItemCaderno): string | undefined {
  return presetDoModelo(item.modalidade, item.modelo)
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
  if (raw?.capa && typeof raw.capa === 'object') item.capa = { ...CAPA_PADRAO, ...raw.capa }
  if (raw?.docEdit && typeof raw.docEdit === 'object') item.docEdit = raw.docEdit as CadernoDoc
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
