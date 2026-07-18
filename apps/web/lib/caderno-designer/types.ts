// Núcleo do editor de cadernos por blocos (estilo Gutenberg) — adaptado p/ Next.js.
// Documento serializado em JSON (igual ao Gutenberg): a árvore de blocos é salva
// em simulado_cadernos_designer.config (jsonb), não em tabelas normalizadas.

export const MM_TO_PX = 3.7795
export const MM_TO_PT = 2.8346
// Geometria fiel A4 (preview ~96dpi).
export const SHEET_W = 794 // 210mm
export const SHEET_H = 1123 // 297mm
export const PAD_H = 64 // ~48pt
export const PAD_V = 48 // ~36pt

export type BlockCategory = 'conteudo' | 'avaliacao' | 'identificacao' | 'estrutura'

export type Block<A = Record<string, unknown>> = {
  id: string
  type: string
  attributes: A
  innerBlocks?: Block[]
}

export type PageKind = 'capa' | 'conteudo' | 'gabarito' | 'branca' | 'contracapa'

export type Page = {
  id: string
  kind: PageKind
  titulo?: string
  blocks: Block[]
  /** Alinhamento vertical do conteúdo na folha. Padrão: 'top'. */
  valign?: 'top' | 'center' | 'bottom'
}

/** Cabeçalho/rodapé correntes (repetidos nas páginas). */
export type FaixaPaginas = 'todas' | 'exceto_capa' | 'exceto_primeira' | 'somente_primeira'
export type RunningConfig = {
  cabecalhoAtivo: boolean
  rodapeAtivo: boolean
  mostrarNumeroPagina: boolean
  /** Altura reservada (px) da faixa; 0 = automática (altura do conteúdo). */
  cabecalhoAltura?: number
  rodapeAltura?: number
  /** Em quais páginas a faixa aparece. */
  cabecalhoPaginas?: FaixaPaginas
  rodapePaginas?: FaixaPaginas
}
export const RUNNING_PADRAO: RunningConfig = { cabecalhoAtivo: false, rodapeAtivo: false, mostrarNumeroPagina: true, cabecalhoAltura: 0, rodapeAltura: 0, cabecalhoPaginas: 'todas', rodapePaginas: 'todas' }

/** Decide se a faixa (cabeçalho/rodapé) aparece na página `idx` (kind = tipo da página). */
export function faixaNaPagina(modo: FaixaPaginas | undefined, idx: number, kind: string): boolean {
  switch (modo) {
    case 'exceto_capa': return kind !== 'capa'
    case 'exceto_primeira': return idx !== 0
    case 'somente_primeira': return idx === 0
    default: return true
  }
}

export type CadernoDoc = {
  versao: 1
  pages: Page[]
  cabecalho?: Block[]
  rodape?: Block[]
  running?: RunningConfig
}

/** "Modalidade" = um caderno dentro do conjunto (cada um com seu documento). */
export type Modalidade = { id: string; nome: string }

export const MODALIDADES_PADRAO: Modalidade[] = [
  { id: 'gabarito_objetivo', nome: 'Folha de Respostas' },
  { id: 'gabarito_discursivo', nome: 'Caderno Discursivo' },
  { id: 'caderno_completo', nome: 'Caderno Completo' },
  { id: 'caderno_perguntas', nome: 'Caderno de Perguntas' },
  { id: 'diagnostico', nome: 'Diagnóstico' },
]

/** Renomeações de modalidades legadas → nome atual (aplicado ao carregar). */
export const MODALIDADE_RENOMEAR: Record<string, string> = {
  'Gabarito Objetivo': 'Folha de Respostas',
  'Caderno Objetivo': 'Folha de Respostas',
  'Gabarito Discursivo': 'Caderno Discursivo',
}

/** Garante que uma modalidade-padrão exista, inserindo-a antes do "Diagnóstico" (ou no fim). */
function garantirMod(norm: Modalidade[], id: string) {
  if (norm.some((m) => m.id === id)) return
  const padrao = MODALIDADES_PADRAO.find((m) => m.id === id)
  if (!padrao) return
  const idxDiag = norm.findIndex((m) => m.id === 'diagnostico')
  if (idxDiag >= 0) norm.splice(idxDiag, 0, padrao)
  else norm.push(padrao)
}

/**
 * Aplica renomeações e garante as modalidades "Caderno Completo" e "Caderno de Perguntas"
 * em cadernos existentes (entregas padrão liberadas ao aluno).
 */
export function mesclarModalidades(saved?: Modalidade[]): Modalidade[] {
  const base = saved?.length ? saved : MODALIDADES_PADRAO
  const norm = base.map((m) => ({ ...m, nome: MODALIDADE_RENOMEAR[m.nome] ?? m.nome }))
  garantirMod(norm, 'caderno_completo')
  garantirMod(norm, 'caderno_perguntas')
  return norm
}

/** Páginas do simulado que podem ter cores próprias. */
export type HudPagina = 'loading' | 'login' | 'entrada' | 'prova' | 'encerrada'
/** Cores próprias por página (override sobre a base). */
export type HudPorPagina = Partial<Record<HudPagina, Partial<HudCores>>>

/** Cores do HUD do simulado (interface que o aluno vê ao fazer a prova). */
export type HudCores = {
  fundo: string        // fundo da tela
  topbar: string       // barra superior (header) — cor própria, distinta do fundo
  topbarTexto: string  // texto/ícones da barra superior (título, contador)
  timer: string        // número/texto do cronômetro (tempo normal)
  timerFundo: string   // fundo da pílula do cronômetro (normal) — independente do fundo da tela
  primaria: string     // botões, questão atual
  finalizar: string    // botão Finalizar
  selecionada: string  // alternativa marcada (borda + fundo + letra) — independente do fundo
  respondida: string   // indicador de questão respondida (marcada) no navegador
  revisar: string      // marcar p/ revisar (botão Revisar + flag no navegador)
  card: string         // fundo do card da questão / alternativas
  texto: string        // cor do texto
  alerta: string       // timer acabando / erro (destructive)
  aviso: string        // atenção (âmbar): pop-up "não liberado", faixa de gabarito
  borda: string        // bordas
  anulada: string      // questão anulada (só aparece no navegador se houver)
  altTrocada: string   // questão com alternativa/gabarito trocado (só aparece se houver)
  altFundo: string     // fundo das alternativas (estado normal)
  altHover: string     // fundo da alternativa ao passar o mouse
  // Resultados (prova encerrada) — uma cor por estado; o fundo é derivado (versão clara).
  // A mesma cor vale para os cards, o navegador e as questões, sem divergência.
  acerto: string; erro: string; branco: string; media: string
  // Específicos por página (auto-personalizados, mas ajustáveis)
  loadingCor: string   // cor do círculo de carregamento
  loadingTipo: string  // estilo da animação de carregamento (circulo/spinner/barra/pulsar/pontos)
  loginInputBg: string // fundo das caixas de texto do login
  tituloTexto: string  // cor do texto do título do simulado (login/entrada)
  loginDestaque: string // cor do destaque "plataforma do {tenant}" no login
  loginBotao: string   // botão "Iniciar simulado" da página de login
  entradaBotao: string // botão do pop-up de entrada
  entradaTempo: string // valor "Tempo restante" no pop-up de entrada
  // Selo de situação (login) — uma cor por situação
  sitNaoIniciado: string // não iniciado
  sitAndamento: string   // em andamento
  sitEncerrado: string   // encerrado
  sitDisponivel: string  // disponível
  cadernoBtn: string      // botões de caderno — texto/borda (prova encerrada)
  cadernoBtnFundo: string // botões de caderno — fundo
  voltarBtn: string       // botão "Meus simulados" — texto
  voltarBtnFundo: string  // botão "Meus simulados" — fundo
  inicioBtn: string       // botão "Voltar ao início do simulado" — texto/borda
  inicioBtnFundo: string  // botão "Voltar ao início do simulado" — fundo
  // Estados ATIVO (hover) dos botões da prova encerrada — texto e fundo quando o mouse passa por cima.
  cadernoBtnAtivo: string       // caderno — texto no hover
  cadernoBtnFundoAtivo: string  // caderno — fundo no hover
  voltarBtnAtivo: string        // "Meus simulados" — texto no hover
  voltarBtnFundoAtivo: string   // "Meus simulados" — fundo no hover
  inicioBtnAtivo: string        // "Voltar ao início" — texto no hover
  inicioBtnFundoAtivo: string   // "Voltar ao início" — fundo no hover
  // Fita (barra de gradiente no topo dos cards principais)
  fita1: string
  fita2: string
  fita3: string
}
export const HUD_CORES_PADRAO: HudCores = {
  fundo: '#ffffff', topbar: '#f6f6f9', topbarTexto: '#1a1d24', timer: '#1a1d24', primaria: '#6d28d9',
  timerFundo: '#eef1f5', selecionada: '#6d28d9', finalizar: '#6d28d9',
  respondida: '#6d28d9', revisar: '#f59e0b', card: '#ffffff', texto: '#1a1d24',
  alerta: '#dc2626', aviso: '#f59e0b', borda: '#e5e7eb', anulada: '#6b7280', altTrocada: '#0891b2',
  altFundo: '#ffffff', altHover: '#f4f4f5',
  acerto: '#16a34a', erro: '#dc2626', branco: '#6b7280', media: '#6d28d9',
  loadingCor: '#6d28d9', loadingTipo: 'circulo', loginInputBg: '#ffffff', tituloTexto: '#6d28d9', loginDestaque: '#6d28d9',
  loginBotao: '#6d28d9', entradaBotao: '#6d28d9', entradaTempo: '#6d28d9',
  sitNaoIniciado: '#2563eb', sitAndamento: '#e6b83c', sitEncerrado: '#dc2626', sitDisponivel: '#6d28d9',
  cadernoBtn: '#6d28d9', cadernoBtnFundo: '#ffffff', voltarBtn: '#ffffff', voltarBtnFundo: '#6d28d9',
  inicioBtn: '#6d28d9', inicioBtnFundo: '#ffffff',
  cadernoBtnAtivo: '#ffffff', cadernoBtnFundoAtivo: '#6d28d9',
  voltarBtnAtivo: '#ffffff', voltarBtnFundoAtivo: '#5b21b6',
  inicioBtnAtivo: '#ffffff', inicioBtnFundoAtivo: '#6d28d9',
  fita1: '#2563eb', fita2: '#f59e0b', fita3: '#8b5cf6',
}

/** Cores efetivas de uma página = padrão + base do caderno + override da página. */
export function efetivarHud(base: Partial<HudCores> | undefined, porPagina: HudPorPagina | undefined, pagina: HudPagina): HudCores {
  return { ...HUD_CORES_PADRAO, ...(base ?? {}), ...(porPagina?.[pagina] ?? {}) }
}

export const PAGE_KINDS: { id: PageKind; nome: string }[] = [
  { id: 'capa', nome: 'Capa' },
  { id: 'conteudo', nome: 'Conteúdo' },
  { id: 'gabarito', nome: 'Gabarito' },
  { id: 'branca', nome: 'Branca' },
  { id: 'contracapa', nome: 'Contracapa' },
]

export function genId(type: string): string {
  try { return `${type}_${crypto.randomUUID().slice(0, 8)}` }
  catch { return `${type}_${Date.now().toString(36)}${Math.round(Math.random() * 1e4)}` }
}

export function novoDoc(): CadernoDoc {
  return {
    versao: 1,
    pages: [{ id: genId('page'), kind: 'conteudo', titulo: 'Página 1', blocks: [] }],
    cabecalho: [], rodape: [], running: { ...RUNNING_PADRAO },
  }
}

/**
 * Doc-semente do "Caderno Completo": entrega o caderno com as informações do aluno
 * + todas as questões e as alternativas que ele marcou (via repetidor).
 */
export function docCadernoCompleto(): CadernoDoc {
  const b = (type: string, attributes: Record<string, unknown>, innerBlocks?: Block[]): Block => ({ id: genId('b'), type, attributes, innerBlocks })
  return {
    versao: 1,
    pages: [{
      id: genId('page'), kind: 'conteudo', titulo: 'Página 1',
      blocks: [
        b('titulo-secao', { texto: '{simulado}', nivel: 1, align: 'left', cor: '', mostrarLinha: true, fonte: '', italico: false, sublinhado: false, espacamento: 6 }),
        b('texto-livre', { texto: 'Aluno(a): {nome}', align: 'left', size: 13, bold: true, italico: false, sublinhado: false, color: '', fonte: '', lineHeight: 1.5, espacamento: 2 }),
        b('identificacao', { titulo: 'Informações do aluno', campos: ['Nome completo', 'CPF', 'Turma', 'Data'] }),
        b('separador', { espessura: 1, estilo: 'solido', cor: '' }),
        b('repeticao', { quantidade: null, gap: 18 }, [
          b('titulo-secao', { texto: 'Questão {q_num}', nivel: 2, align: 'left', cor: '', mostrarLinha: false, fonte: '', italico: false, sublinhado: false, espacamento: 0 }),
          b('texto-livre', { texto: '{q_enunciado}', align: 'left', size: 12, bold: false, italico: false, sublinhado: false, color: '', fonte: '', lineHeight: 1.5, espacamento: 4 }),
          b('alternativas', { mostrarGabarito: false }),
        ]),
      ],
    }],
    cabecalho: [], rodape: [], running: { ...RUNNING_PADRAO },
  }
}

/**
 * Doc-semente do "Caderno de Perguntas": só o enunciado e as alternativas de cada questão
 * (sem dados do aluno, sem resposta marcada, sem gabarito). Um caderno de prova "limpo".
 */
export function docCadernoPerguntas(): CadernoDoc {
  const b = (type: string, attributes: Record<string, unknown>, innerBlocks?: Block[]): Block => ({ id: genId('b'), type, attributes, innerBlocks })
  return {
    versao: 1,
    pages: [{
      id: genId('page'), kind: 'conteudo', titulo: 'Página 1',
      blocks: [
        b('titulo-secao', { texto: '{simulado}', nivel: 1, align: 'left', cor: '', mostrarLinha: true, fonte: '', italico: false, sublinhado: false, espacamento: 6 }),
        b('repeticao', { quantidade: null, gap: 18 }, [
          b('titulo-secao', { texto: 'Questão {q_num}', nivel: 2, align: 'left', cor: '', mostrarLinha: false, fonte: '', italico: false, sublinhado: false, espacamento: 0 }),
          b('texto-livre', { texto: '{q_enunciado}', align: 'left', size: 12, bold: false, italico: false, sublinhado: false, color: '', fonte: '', lineHeight: 1.5, espacamento: 4 }),
          b('alternativas', { mostrarGabarito: false }),
        ]),
      ],
    }],
    cabecalho: [], rodape: [], running: { ...RUNNING_PADRAO },
  }
}

export type QuestaoData = { id: string; numero: number; enunciado: string; tipo: string; disciplina?: string; comentario?: string; alternativas: { letra: string; texto: string; correta: boolean }[] }

/** Dados reais (ou de exemplo) que os blocos `dynamic` consomem. */
export type CadernoData = {
  questoes: QuestaoData[]
  numQuestoes: number
  numAlternativas: number
  vars: Record<string, string>
  /** Questão corrente dentro de um bloco de repetição (preenchido a cada iteração). */
  questaoAtual?: QuestaoData
  /** Letra marcada pelo aluno corrente em cada questão (mala direta): questaoId → "A"/"B"… */
  respostas?: Record<string, string>
  /** Gabarito liberado? Controla a exibição da correção (marcada × correta). */
  gabaritoLiberado?: boolean
}
