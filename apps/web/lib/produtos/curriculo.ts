// Tipos do CURRÍCULO leve por referência do produto (Estúdio de Conteúdo).
// Cada "aula" (item) APONTA a um recurso que já existe — não hospeda conteúdo.
// Ver docs/estudio-conteudo-implementacao.md (Etapa 5-currículo) e a migração
// 20261031030000_estudio_produtos_curriculo.sql.
//
// Este módulo é client-safe (só tipos/const) — pode ser importado no front.

// ── Referência do item (o que a aula aponta) ──
export type TipoRef = 'documento_biblioteca' | 'video_url' | 'simulado' | 'quiz' | 'link' | 'cronograma'

export const TIPO_REF_LABEL: Record<TipoRef, string> = {
  documento_biblioteca: 'Documento da Biblioteca',
  video_url: 'Vídeo (link)',
  simulado: 'Simulado',
  quiz: 'Quiz',
  link: 'Link externo',
  cronograma: 'Cronograma',
}

// ── Disponibilidade (nomes do designer, decisão 31/10) ──
export type DisponibilidadeTipo =
  | 'na_matricula'              // Sempre disponível — libera junto com a matrícula
  | 'data'                      // Em uma data específica — todos recebem na mesma data
  | 'intervalo'                 // Intervalo após matrícula — libera X dias depois de cada matrícula
  | 'data_e_intervalo'          // Data específica E intervalo após matrícula — o que vier por último
  | 'dia_semana_e_intervalo'    // Dia da semana + intervalo após matrícula
  | 'cronograma'                // Pelo cronograma do aluno (planilha × meta do plano) — só em regras por segmento

export const DISPONIBILIDADE_OPCOES: { v: DisponibilidadeTipo; titulo: string; descricao: string }[] = [
  { v: 'na_matricula', titulo: 'Sempre disponível', descricao: 'Libera junto com a matrícula.' },
  { v: 'data', titulo: 'Em uma data específica', descricao: 'Todos os alunos recebem na mesma data.' },
  { v: 'intervalo', titulo: 'Intervalo após matrícula', descricao: 'Libera X dias depois que cada aluno se matricula.' },
  { v: 'data_e_intervalo', titulo: 'Data específica e intervalo após matrícula', descricao: 'O que vier por último.' },
  { v: 'dia_semana_e_intervalo', titulo: 'Dia da semana + intervalo após matrícula', descricao: 'Ex.: toda segunda-feira, a partir da 2ª semana.' },
]

export const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'] as const

/** "Antes de liberar, o aluno vê". */
export type DisponibilidadeAntes = 'bloqueado_cadeado' | 'oculto'
export const DISPONIBILIDADE_ANTES: { v: DisponibilidadeAntes; label: string }[] = [
  { v: 'bloqueado_cadeado', label: 'Bloqueado com cadeado' },
  { v: 'oculto', label: 'Oculto até liberar' },
]

/** Config de disponibilidade guardada em jsonb. Campos extras conforme o tipo. */
export interface Disponibilidade {
  tipo: DisponibilidadeTipo
  data?: string | null            // ISO (tipos 'data' e 'data_e_intervalo')
  dias?: number | null            // dias após a matrícula (tipos 'intervalo' / 'data_e_intervalo' / 'dia_semana_e_intervalo')
  diaSemana?: number | null       // 0..6 (tipo 'dia_semana_e_intervalo')
  antes?: DisponibilidadeAntes    // o que o aluno vê antes de liberar
  // tipo 'cronograma':
  sem_plano?: CronogramaSemPlano  // aluno SEM cronograma fixado
  com_plano?: CronogramaComPlano  // aluno COM cronograma fixado
  dias_antes?: number | null      // 0..365 (modos 'plano' / 'mais_cedo')
}

export type CronogramaSemPlano = 'planilha' | 'liberado' | 'atual'
export type CronogramaComPlano = 'concluir_meta' | 'plano' | 'mais_cedo'
export const CRONOGRAMA_SEM_PLANO: { v: CronogramaSemPlano; titulo: string; descricao: string }[] = [
  { v: 'planilha', titulo: 'Pela data da planilha', descricao: 'Abre na data de liberação da aula na planilha do produto.' },
  { v: 'liberado', titulo: 'Tudo liberado', descricao: 'Sem cronograma, a aula fica aberta desde o início.' },
  { v: 'atual', titulo: 'Manter liberação atual', descricao: 'Segue a disponibilidade padrão do módulo/aula.' },
]
export const CRONOGRAMA_COM_PLANO: { v: CronogramaComPlano; titulo: string; descricao: string }[] = [
  { v: 'concluir_meta', titulo: 'Só ao concluir a meta da aula no plano', descricao: 'A aula abre quando o aluno conclui a meta correspondente (padrão).' },
  { v: 'plano', titulo: 'Quando a meta entra no plano', descricao: 'Abre na data da meta no plano, menos os dias de antecedência.' },
  { v: 'mais_cedo', titulo: 'O que vier primeiro: planilha ou plano', descricao: 'Vale a data que chegar antes (menos os dias de antecedência no plano).' },
]

export const DISPONIBILIDADE_PADRAO: Disponibilidade = { tipo: 'na_matricula', antes: 'bloqueado_cadeado' }

/** Resumo curto de uma disponibilidade (para a lista de aulas: "disponível sempre"). */
export function resumoDisponibilidade(d: Disponibilidade | null | undefined): string {
  if (!d || d.tipo === 'na_matricula') return 'disponível sempre'
  if (d.tipo === 'data') return d.data ? `a partir de ${new Date(d.data).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}` : 'em uma data'
  if (d.tipo === 'intervalo') return `${d.dias ?? 0} dia(s) após a matrícula`
  if (d.tipo === 'data_e_intervalo') return 'data + intervalo'
  if (d.tipo === 'dia_semana_e_intervalo') return `${DIAS_SEMANA[d.diaSemana ?? 1]} + intervalo`
  if (d.tipo === 'cronograma') {
    const sem = d.sem_plano === 'liberado' ? 'tudo liberado' : d.sem_plano === 'atual' ? 'liberação atual' : 'data da planilha'
    const dias = d.dias_antes ? ` (${d.dias_antes} dia(s) antes)` : ''
    const com = d.com_plano === 'plano' ? `quando a meta entra no plano${dias}` : d.com_plano === 'mais_cedo' ? `o que vier primeiro: planilha ou plano${dias}` : 'ao concluir a meta'
    return `Pelo cronograma: sem plano → ${sem} · com plano → ${com}`
  }
  return 'disponível sempre'
}

// ── Tipos de conteúdo que o "Novo conteúdo" oferece (espelha o designer) ──
export type SubtipoConteudo =
  | 'pdfull' | 'pdflash' | 'pdfight' | 'videoaula' | 'slide' | 'legproc' | 'jurisclub'
  | 'video' | 'documento' | 'quiz' | 'incorporacao' | 'audio' | 'texto'
  | 'simulado' | 'webinar' | 'entrega' | 'galeria' | 'flashcards' | 'scorm' | 'formulario' | 'cronograma'

/** Catálogo de subtipos do "Novo conteúdo" → o tipo_ref base de cada um. */
export interface SubtipoDef {
  v: SubtipoConteudo
  nome: string
  descricao: string
  grupo: 'revisao' | 'plataforma'
  /** Como o item aponta ao recurso por padrão. */
  tipoRef: TipoRef
}

export const SUBTIPOS: SubtipoDef[] = [
  // Materiais do Revisão
  { v: 'pdfull', nome: 'PDFULL', descricao: 'PDF completo com leitor, grifos e marca d’água', grupo: 'revisao', tipoRef: 'documento_biblioteca' },
  { v: 'pdflash', nome: 'PDFLASH', descricao: 'Resumo para revisão rápida', grupo: 'revisao', tipoRef: 'documento_biblioteca' },
  { v: 'pdfight', nome: 'PDFIGHT', descricao: 'Fixação e prática do conteúdo', grupo: 'revisao', tipoRef: 'documento_biblioteca' },
  { v: 'videoaula', nome: 'Videoaula', descricao: 'Waid Player ou outro provedor, por bloco', grupo: 'revisao', tipoRef: 'video_url' },
  { v: 'slide', nome: 'Slide', descricao: 'Apresentação da videoaula', grupo: 'revisao', tipoRef: 'documento_biblioteca' },
  { v: 'legproc', nome: 'LegProc', descricao: 'Lei seca ligada ao assunto', grupo: 'revisao', tipoRef: 'documento_biblioteca' },
  { v: 'jurisclub', nome: 'JurisClub', descricao: 'Julgado do mês com teste', grupo: 'revisao', tipoRef: 'documento_biblioteca' },
  // Tipos da plataforma
  { v: 'video', nome: 'Vídeo', descricao: 'Upload ou provedor externo', grupo: 'plataforma', tipoRef: 'video_url' },
  { v: 'documento', nome: 'Documento', descricao: 'PDF ou arquivo para leitura', grupo: 'plataforma', tipoRef: 'documento_biblioteca' },
  { v: 'quiz', nome: 'Quiz', descricao: 'Perguntas de um banco de questões', grupo: 'plataforma', tipoRef: 'quiz' },
  { v: 'simulado', nome: 'Simulado', descricao: 'Um simulado da plataforma', grupo: 'plataforma', tipoRef: 'simulado' },
  { v: 'cronograma', nome: 'Cronograma', descricao: 'Plano de estudo do aluno (resumo + atalho)', grupo: 'plataforma', tipoRef: 'cronograma' },
  { v: 'incorporacao', nome: 'Incorporação', descricao: 'Código ou link de outro site', grupo: 'plataforma', tipoRef: 'link' },
  { v: 'audio', nome: 'Áudio', descricao: 'Arquivo de áudio', grupo: 'plataforma', tipoRef: 'documento_biblioteca' },
  { v: 'texto', nome: 'Texto', descricao: 'Texto com editor', grupo: 'plataforma', tipoRef: 'link' },
  { v: 'webinar', nome: 'Webinar', descricao: 'Aula ao vivo com data', grupo: 'plataforma', tipoRef: 'link' },
  { v: 'entrega', nome: 'Entrega de conteúdo', descricao: 'Aluno envia um trabalho', grupo: 'plataforma', tipoRef: 'link' },
  { v: 'galeria', nome: 'Galeria de mídia', descricao: 'Imagens e vídeos', grupo: 'plataforma', tipoRef: 'link' },
  { v: 'flashcards', nome: 'Flashcards', descricao: 'Um baralho da plataforma', grupo: 'plataforma', tipoRef: 'link' },
  { v: 'scorm', nome: 'SCORM', descricao: 'Pacote SCORM', grupo: 'plataforma', tipoRef: 'link' },
  { v: 'formulario', nome: 'Formulário', descricao: 'Perguntas abertas ao aluno', grupo: 'plataforma', tipoRef: 'link' },
]

export const SUBTIPO_LABEL: Record<string, string> = Object.fromEntries(SUBTIPOS.map((s) => [s.v, s.nome]))

export function subtipoDef(v: string | null | undefined): SubtipoDef | null {
  return SUBTIPOS.find((s) => s.v === v) ?? null
}

// ── Formatos serializados do servidor (o que as telas consomem) ──
export interface ModuloRow {
  id: string
  produto_id: string
  pai_id: string | null
  titulo: string
  imagem_url: string | null
  ocultar_titulo?: boolean   // oculta o título sobreposto na capa (imagem já traz o texto)
  descricao: string | null
  ordem: number
  exibicao: 'aberto' | 'recolhido'
  disponibilidade: Disponibilidade
}

export interface ItemRow {
  id: string
  produto_id: string
  modulo_id: string
  ordem: number
  tipo_ref: TipoRef
  subtipo: string | null
  ref_id: string | null
  ref_url: string | null
  titulo: string
  visibilidade: 'privado' | 'publico'
  situacao: 'ativo' | 'rascunho'
  meta: Record<string, unknown>
  disponibilidade: Disponibilidade
}

// ── Tipo de MATERIAL (agrupamento da página do módulo do aluno) ──
// Derivado de `subtipo` (quando conhecido), senão de `tipo_ref` e, para documentos sem subtipo, do prefixo do título.
export type MaterialChave = 'pdfull' | 'pdflash' | 'pdfight' | 'legproc' | 'juris' | 'questoes' | 'video' | 'outros'
export const MATERIAIS: { v: MaterialChave; label: string; curto: string }[] = [
  { v: 'pdfull', label: 'PDFull', curto: 'Material completo' },
  { v: 'pdflash', label: 'PDFlash', curto: 'Revisão rápida' },
  { v: 'pdfight', label: 'PDFight', curto: 'Fixação e prática' },
  { v: 'legproc', label: 'LegProc', curto: 'Lei seca por assunto' },
  { v: 'juris', label: 'Juris', curto: 'Jurisprudência' },
  { v: 'questoes', label: 'Questões', curto: 'Simulados e quizzes' },
  { v: 'video', label: 'Vídeos', curto: 'Videoaulas e slides' },
  { v: 'outros', label: 'Outros', curto: 'Demais materiais' },
]

export function materialDoItem(subtipo: string | null | undefined, tipoRef: TipoRef, titulo: string): MaterialChave {
  switch ((subtipo ?? '').toLowerCase()) {
    case 'pdfull': return 'pdfull'
    case 'pdflash': return 'pdflash'
    case 'pdfight': return 'pdfight'
    case 'legproc': return 'legproc'
    case 'jurisclub': case 'juris': return 'juris'
    case 'quiz': case 'simulado': case 'questoes': return 'questoes'
    case 'videoaula': case 'video': case 'slide': case 'webinar': return 'video'
  }
  if (tipoRef === 'simulado' || tipoRef === 'quiz') return 'questoes'
  if (tipoRef === 'video_url') return 'video'
  if (tipoRef === 'documento_biblioteca') {
    const t = titulo.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    const m = /^\s*(pdfull|pdflash|pdfight|legproc)\b/.exec(t)
    if (m) return m[1] as MaterialChave
    if (/^\s*(juris|stf|stj)\b/.test(t)) return 'juris'
  }
  return 'outros'
}

// ── Visão em CARDS do módulo (agregados calculados NO SERVIDOR; o cliente nunca recebe as aulas para montar os cards) ──
export interface ModuloCard {
  id: string
  pai_id: string | null
  titulo: string
  imagem_url: string | null
  ocultar_titulo: boolean
  descricao: string | null
  ordem: number
  /** aulas diretas + as dos submódulos (rollup) */
  aulas: number
  /** aulas só deste módulo */
  aulasDiretas: number
  submodulos: number
  materiais: Partial<Record<MaterialChave, number>>
  /** aulas com liberação programada (não "sempre disponível") */
  programadas: number
  /** menor data futura entre as aulas com liberação por data (ISO) */
  proxData: string | null
  rascunhos: number
}

export type OrdemModulos = 'ordem' | 'nome' | 'nome_desc' | 'aulas' | 'aulas_asc' | 'sub' | 'sub_asc' | 'rascunhos' | 'rascunhos_asc'
export type FiltroModulos = 'todos' | 'com_sub' | 'programadas' | 'rascunho'
