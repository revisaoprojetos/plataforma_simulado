// Construtor de cadernos (área de teste) — "modelo pronto + ajustes".
// Um CADERNO tem VÁRIOS grupos (itens), cada um com sua modalidade + modelo + ajustes e prévia
// própria (como as "modalidades" do editor antigo). Config isolado em
// simulado_cadernos_teste.config.builderV3.

import { DIAG_PADRAO, DIAG_AGU_2023, DIAG_PGE_RS, DIAG_BASE_4, DIAG_SEMANA_6EM7, DIAG_VAZIO, type DiagConteudo } from './diagnostico'
import type { CadernoDoc } from '@/lib/caderno-designer/types'
import { FOLHA_RESPOSTAS_DOC, CADERNO_PERGUNTAS_DOC } from '@/lib/caderno-designer/preset-cadernos-doc'

/** Variante do doc da folha AGU mostrando SÓ um dos gabaritos (marcado ou oficial). */
function folhaVariante(origem: 'marcado' | 'oficial'): CadernoDoc {
  const doc: any = (() => { try { return structuredClone(FOLHA_RESPOSTAS_DOC) } catch { return JSON.parse(JSON.stringify(FOLHA_RESPOSTAS_DOC)) } })()
  const cont = (doc.pages ?? []).find((p: any) => p.kind === 'conteudo')
  if (cont) {
    const novo: any[] = []
    for (const b of (cont.blocks ?? [])) {
      if (b.type === 'gabarito-grid' && b.attributes?.origem !== origem) {
        // remove o grid do outro gabarito + o espaçador de 40 imediatamente anterior
        if (novo.length && novo[novo.length - 1]?.type === 'espacador' && novo[novo.length - 1]?.attributes?.altura === 40) novo.pop()
        continue
      }
      novo.push(b)
    }
    cont.blocks = novo
  }
  return doc as CadernoDoc
}

/** Variante do doc da folha AGU com UMA tabela só: marcada + oficial (origem 'ambos').
 *  orientacao 'vertical' = 1 questão por linha (tabelas lado a lado);
 *  orientacao 'horizontal' = questões em colunas (Nº/Marcada/Gabarito nas linhas). */
function folhaCombinada(orientacao: 'vertical' | 'horizontal' = 'vertical'): CadernoDoc {
  const doc: any = (() => { try { return structuredClone(FOLHA_RESPOSTAS_DOC) } catch { return JSON.parse(JSON.stringify(FOLHA_RESPOSTAS_DOC)) } })()
  const cont = (doc.pages ?? []).find((p: any) => p.kind === 'conteudo')
  if (cont) {
    const novo: any[] = []; let inseriu = false
    for (const b of (cont.blocks ?? [])) {
      if (b.type === 'gabarito-grid') {
        if (!inseriu) { novo.push({ ...b, attributes: { ...b.attributes, origem: 'ambos', orientacao, porLinha: orientacao === 'horizontal' ? 10 : 5, titulo: '' } }); inseriu = true }
        else if (novo.length && novo[novo.length - 1]?.type === 'espacador' && novo[novo.length - 1]?.attributes?.altura === 40) novo.pop()
        continue
      }
      novo.push(b)
    }
    cont.blocks = novo
  }
  return doc as CadernoDoc
}

/** Variante do doc do caderno de ENUNCIADO (perguntas): mantém DADOS DO ESTUDANTE
 *  (nome/e-mail/data/tempo), mas SEM o desempenho (acertos/erros/média) — prova em
 *  branco não mostra nota; o tempo vem "-" antes de fazer e o valor real depois. */
function enunciadoSemDesempenho(): CadernoDoc {
  const doc: any = (() => { try { return structuredClone(CADERNO_PERGUNTAS_DOC) } catch { return JSON.parse(JSON.stringify(CADERNO_PERGUNTAS_DOC)) } })()
  const cont = (doc.pages ?? []).find((p: any) => p.kind === 'conteudo')
  if (cont) for (const b of (cont.blocks ?? [])) {
    if (b.type === 'identificacao') { b.attributes = { ...b.attributes, mostrarDesempenho: false, desempenho: [] } }
  }
  return doc as CadernoDoc
}

/** Doc explícito e limpo do caderno DISCURSIVO: capa + 1 header "CADERNO DE QUESTÕES
 *  DISCURSIVA" + DADOS DO ESTUDANTE (sem desempenho), SEM as questões objetivas.
 *  Determinístico (não depende da resolução do preset) — evita render mesclado. */
function discursivoLimpo(): CadernoDoc {
  const doc: any = (() => { try { return structuredClone(CADERNO_PERGUNTAS_DOC) } catch { return JSON.parse(JSON.stringify(CADERNO_PERGUNTAS_DOC)) } })()
  const capa = (doc.pages ?? []).find((p: any) => p.kind === 'capa')
  if (capa) { const t = (capa.blocks ?? []).find((b: any) => b.type === 'texto-livre'); if (t) t.attributes = { ...t.attributes, texto: 'CADERNO DE \nQUESTÕES DISCURSIVA' } }
  const cont = (doc.pages ?? []).find((p: any) => p.kind === 'conteudo')
  if (cont) {
    cont.blocks = (cont.blocks ?? []).filter((b: any) => b.type !== 'repeticao') // sem questões objetivas
    for (const b of cont.blocks) {
      if (b.type === 'card') {
        const tx = (b.innerBlocks ?? []).filter((x: any) => x.type === 'texto-livre')
        if (tx[0]) tx[0].attributes = { ...tx[0].attributes, texto: 'CADERNO DE QUESTÕES DISCURSIVA\n' }
        if (tx[1]) tx[1].attributes = { ...tx[1].attributes, texto: 'Concurso Simulado AGU\n' }
      }
      if (b.type === 'identificacao') b.attributes = { ...b.attributes, mostrarDesempenho: false, desempenho: [] }
    }
  }
  return doc as CadernoDoc
}

export type Modalidade = 'folha_respostas' | 'caderno_questoes' | 'caderno_completo' | 'diagnostico'

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
  ultimaUrl: string       // imagem da ÚLTIMA folha (capa de fundo / contracapa A4 inteira, no fim)
  folhaUrl: string        // imagem de fundo da folha (papel timbrado, por página)
  cabecalhoUrl: string    // imagem do cabeçalho (faixa no topo de cada página)
  rodapeUrl: string       // imagem do rodapé (faixa na base de cada página)
  /** Reserva de espaço no TOPO de cada página (px) — até onde o conteúdo desce, p/ não invadir o
   *  cabeçalho/imagem de fundo. 0 = automático (deduz do cabeçalho/folha). Mantém A4. */
  margemTopo: number
  /** Reserva de espaço na BASE de cada página (px) — até onde o conteúdo sobe, p/ não invadir o
   *  rodapé/imagem de fundo. 0 = automático (deduz do rodapé/folha). Mantém A4. */
  margemBase: number
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
  /** Cor de FUNDO por PARTE (parte → hex) — para cards com fundo editável (disciplina/sugestão individual). */
  coresFundoParte: Record<string, string>
  /** Estilo (negrito/itálico/sublinhado) por PARTE — aplica ao bloco inteiro. */
  estiloParte: Record<string, { b?: boolean; i?: boolean; u?: boolean }>
  /** Fonte por PARTE (parte → id de FONTES_CADERNO). Herdada pelos textos do bloco. */
  fonteParte: Record<string, string>
  /** Tamanho do texto por PARTE (parte → multiplicador, ex.: 1.15). Aplica ao bloco inteiro (texto e filhos). */
  tamanhoParte: Record<string, number>
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
  ultimaUrl: '',
  folhaUrl: '',
  cabecalhoUrl: '',
  rodapeUrl: '',
  margemTopo: 0,
  margemBase: 0,
  coresPilar: { ...CORES_PILAR_PADRAO },
  coresDisc: {},
  coresParte: {},
  alinhamentoParte: {},
  coresTextoParte: {},
  coresFundoParte: {},
  estiloParte: {},
  fonteParte: {},
  tamanhoParte: {},
}

export type Modelo = {
  id: string; nome: string; descricao: string; ajustes: Partial<BuilderAjustes>; conteudo?: DiagConteudo
  /** Modelo PRONTO renderizado pelo motor de blocos do v1 (id do preset em caderno-designer/presets.ts).
   * Quando presente, a prévia usa PreviaBlocos (idêntico ao v1) em vez do render simples. */
  docPreset?: string
  /** Doc pronto (variante) aplicado ao criar o item — sobrescreve o preset (ex.: folha AGU só com um gabarito). */
  doc?: CadernoDoc
}
export type ModalidadeMeta = { id: Modalidade; nome: string; descricao: string; modelos: Modelo[] }

export const MODALIDADES: ModalidadeMeta[] = [
  {
    id: 'folha_respostas', nome: 'Folha de Respostas', descricao: 'Layout AGU: capa + dados do estudante + gabaritos.',
    modelos: [
      { id: 'agu_folha', nome: 'AGU · Completa (marcada × oficial)', descricao: 'Modelo AGU (idêntico ao v1): capa + dados + gabarito das alternativas MARCADAS e gabarito OFICIAL. Reenvie a capa/fundo.', ajustes: {}, docPreset: 'caderno-objetivo' },
      { id: 'agu_marcada', nome: 'AGU · Gabarito das alternativas (marcada)', descricao: 'Mesmo layout AGU, mostrando só a grade das alternativas marcadas pelo aluno.', ajustes: {}, docPreset: 'caderno-objetivo', doc: folhaVariante('marcado') },
      { id: 'agu_oficial', nome: 'AGU · Gabarito oficial', descricao: 'Mesmo layout AGU, mostrando só o gabarito oficial.', ajustes: {}, docPreset: 'caderno-objetivo', doc: folhaVariante('oficial') },
      { id: 'agu_combinado', nome: 'AGU · Gabarito único — vertical', descricao: 'Uma tabela por coluna, 1 questão por linha (Nº · Alternativa marcada · Gabarito), com acerto (verde) / erro (vermelho) destacado.', ajustes: {}, docPreset: 'caderno-objetivo', doc: folhaCombinada('vertical') },
      { id: 'agu_combinado_h', nome: 'AGU · Gabarito único — horizontal', descricao: 'Questões em colunas: linhas Nº · Alternativa marcada · Gabarito, com acerto (verde) / erro (vermelho) destacado.', ajustes: {}, docPreset: 'caderno-objetivo', doc: folhaCombinada('horizontal') },
    ],
  },
  {
    id: 'caderno_questoes', nome: 'Caderno de Enunciado', descricao: 'Só os enunciados e alternativas para o aluno resolver (sem gabarito).',
    modelos: [
      { id: 'classico', nome: 'Clássico', descricao: 'Questões com alternativas, espaçado.', ajustes: { mostrarGabarito: false, mostrarComentarios: false, compacto: false } },
      { id: 'compacto', nome: 'Compacto', descricao: 'Fonte e espaços menores (mais por página).', ajustes: { mostrarGabarito: false, mostrarComentarios: false, compacto: true } },
      { id: 'agu_perguntas', nome: 'AGU · Caderno de enunciado', descricao: 'Modelo pronto (idêntico ao v1): capa + DADOS DO ESTUDANTE (nome/e-mail/data/tempo) + enunciados e alternativas. Sem desempenho (nota) — prova em branco. Reenvie a capa/fundo.', ajustes: {}, docPreset: 'caderno-perguntas', doc: enunciadoSemDesempenho() },
      { id: 'agu_discursivo', nome: 'AGU · Caderno discursivo', descricao: 'Modelo pronto (v1): capa + DADOS DO ESTUDANTE (sem desempenho) para caderno de questões discursivas. Reenvie a capa/fundo.', ajustes: {}, docPreset: 'caderno-discursivo', doc: discursivoLimpo() },
    ],
  },
  {
    id: 'caderno_completo', nome: 'Caderno completo', descricao: 'Enunciados + gabarito e comentário (questões e respostas comentadas).',
    modelos: [
      { id: 'com_gabarito', nome: 'Clássico (com gabarito)', descricao: 'Destaca a correta e mostra o comentário.', ajustes: { mostrarGabarito: true, mostrarComentarios: true, compacto: false } },
      { id: 'agu_completo', nome: 'AGU · Caderno completo', descricao: 'Modelo pronto (v1): + resposta marcada, correção (marcada × correta) e comentário.', ajustes: {}, docPreset: 'caderno-completo' },
    ],
  },
  {
    id: 'diagnostico', nome: 'Diagnóstico', descricao: 'Relatório de desempenho do aluno (pilares, disciplinas, sugestões).',
    modelos: [
      { id: 'padrao', nome: 'Em branco', descricao: 'Estrutura vazia para preencher.', ajustes: { corPrimaria: '#2d254f', corSecundaria: '#f6b420' }, conteudo: DIAG_PADRAO },
      { id: 'base_4', nome: 'Diagnóstico - 4 disciplinas', descricao: 'Estrutura completa pronta (intro, pilar separado, 3 pilares, 4 disciplinas, sugestões e gabarito) com textos genéricos.', ajustes: { corPrimaria: '#2d254f', corSecundaria: '#f6b420' }, conteudo: DIAG_BASE_4 },
      { id: 'semana_6em7', nome: 'Diagnóstico - 1 disciplina', descricao: 'Diagnóstico enxuto por disciplina (lei seca/jurisprudência/doutrina) + bloco de jurisprudência prioritária — base dos cadernos "Semana de atualização (6 meses em 7 dias)". Ajuste a disciplina e os temas.', ajustes: { corPrimaria: '#2d254f', corSecundaria: '#f6b420', colunas: 2, coresPilar: { doutrina: '#e8850c', lei_seca: '#c9a227', jurisprudencia: '#3b5bdb', lingua_portuguesa: '#1a7a4a' } }, conteudo: DIAG_SEMANA_6EM7 },
      { id: 'agu_2023', nome: 'Diagnóstico - Padrão', descricao: 'Pré-preenchido com o diagnóstico da AGU 2023.', ajustes: { corPrimaria: '#2d254f', corSecundaria: '#f6b420' }, conteudo: DIAG_AGU_2023 },
      { id: 'pge_rs', nome: 'Completo (PGE/RS)', descricao: 'Estrutura base para o diagnóstico da PGE/RS — ajuste os textos/disciplinas.', ajustes: { corPrimaria: '#2d254f', corSecundaria: '#f6b420' }, conteudo: DIAG_PGE_RS },
      // 'agu_diagnostico' (v1 doc-backed, blocos antigos) REMOVIDO — usava o render legado (PreviaBlocos)
      // em vez do atual (conteudo/Previa com os fixes). 0 cadernos usavam. Use 'agu_2023' (mesmo AGU, atual).
    ],
  },
]

export function metaDaModalidade(id: Modalidade): ModalidadeMeta {
  return MODALIDADES.find((m) => m.id === id) ?? MODALIDADES[0]
}

/** IDs de modelos padrão OCULTOS dos seletores da UI (mantidos no engine p/ compat com cadernos antigos —
 *  ex.: `classico` ainda é o default de `builderPadrao`). Filtram só a exibição nos seletores. */
export const MODELOS_PADRAO_OCULTOS = new Set<string>(['agu_marcada', 'agu_oficial', 'classico', 'compacto', 'com_gabarito'])

/** Modelos de uma modalidade visíveis nos seletores (sem os ocultos). */
export function modelosVisiveis(modalidade: Modalidade): ModalidadeMeta['modelos'] {
  return metaDaModalidade(modalidade).modelos.filter((m) => !MODELOS_PADRAO_OCULTOS.has(m.id))
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
  if (modelo.doc) item.docEdit = clonar(modelo.doc) // variante pronta (ex.: folha AGU só com um gabarito)
  return item
}

/** Item "em branco total": um grupo com conteúdo VAZIO (nada renderiza) — canvas de criação do zero.
 *  Usa o motor do diagnóstico (único com blocos livres), mas nasce sem nenhum bloco: cabeçalho/dados
 *  desligados e todas as seções ocultas. O usuário monta pelo painel de Estrutura ("Adicionar bloco"). */
export function novoItemVazio(): ItemCaderno {
  return {
    id: novoId(),
    modalidade: 'diagnostico',
    modelo: 'padrao',
    ajustes: { ...AJUSTES_BASE, titulo: '', mostrarCabecalho: false, mostrarDadosAluno: false, corPrimaria: '#2d254f', corSecundaria: '#f6b420' },
    conteudo: clonar(DIAG_VAZIO),
  }
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
  const modalidade: Modalidade = ['folha_respostas', 'caderno_questoes', 'caderno_completo', 'diagnostico'].includes(raw?.modalidade) ? raw.modalidade : 'caderno_questoes'
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
