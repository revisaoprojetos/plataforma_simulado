// Novo construtor de cadernos (área de teste) — modelo "modelo pronto + ajustes".
// Bem mais simples que o editor de blocos: escolhe MODALIDADE + MODELO e ajusta opções/cores;
// a prévia A4 (direita) reflete tudo ao vivo. Config isolado em simulado_cadernos_teste.config.builderV3.

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

export type BuilderV3 = {
  v: 3
  modalidade: Modalidade
  modelo: string
  bancoId: string | null
  ajustes: BuilderAjustes
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

export type Modelo = { id: string; nome: string; descricao: string; ajustes: Partial<BuilderAjustes> }
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
    id: 'diagnostico', nome: 'Diagnóstico', descricao: 'Relatório de desempenho do aluno.',
    modelos: [
      { id: 'padrao', nome: 'Padrão', descricao: 'Nota + desempenho por matéria.', ajustes: { mostrarGabarito: true } },
    ],
  },
]

export function metaDaModalidade(id: Modalidade): ModalidadeMeta {
  return MODALIDADES.find((m) => m.id === id) ?? MODALIDADES[0]
}

/** Ajustes de um modelo aplicados sobre uma base (preserva título/cores/banco do usuário). */
export function aplicarModelo(atual: BuilderAjustes, modelo: Modelo): BuilderAjustes {
  return { ...atual, ...modelo.ajustes }
}

/** Builder de uma modalidade+modelo específicos (para o seletor e a mini-prévia). */
export function builderDeModelo(modalidade: Modalidade, modeloId: string, bancoId: string | null = null): BuilderV3 {
  const meta = metaDaModalidade(modalidade)
  const modelo = meta.modelos.find((m) => m.id === modeloId) ?? meta.modelos[0]
  return { v: 3, modalidade, modelo: modelo.id, bancoId, ajustes: { ...AJUSTES_BASE, ...modelo.ajustes } }
}

/** Builder padrão para uma modalidade (1º modelo). */
export function builderPadrao(modalidade: Modalidade = 'caderno_questoes', bancoId: string | null = null): BuilderV3 {
  return builderDeModelo(modalidade, metaDaModalidade(modalidade).modelos[0].id, bancoId)
}

/** Lê o builder do config (tolerante) ou devolve o padrão. */
export function normalizarBuilder(config: unknown, nome?: string): BuilderV3 {
  const b = (config as any)?.builderV3
  const bancoId = ((config as any)?.bancoId ?? null) as string | null
  if (!b || typeof b !== 'object') { const d = builderPadrao('caderno_questoes', bancoId); if (nome) d.ajustes.titulo = nome; return d }
  const modalidade: Modalidade = ['folha_respostas', 'caderno_questoes', 'diagnostico'].includes(b.modalidade) ? b.modalidade : 'caderno_questoes'
  const meta = metaDaModalidade(modalidade)
  const modelo = meta.modelos.some((m) => m.id === b.modelo) ? b.modelo : meta.modelos[0].id
  return { v: 3, modalidade, modelo, bancoId: b.bancoId ?? bancoId ?? null, ajustes: { ...AJUSTES_BASE, ...(b.ajustes ?? {}) } }
}
