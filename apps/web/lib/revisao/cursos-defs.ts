// Definições compartilhadas (servidor + cliente) de Montagem de curso › Cursos.
// Fonte: protótipo admin-plataforma-revisao (app.js: MODELOS_C, POP_*, MSG_AUTO, MAIL_AUTO, etSteps).
// Sem 'server-only' de propósito: as telas de cliente usam estas constantes. Sem acesso a banco aqui.

export const TIPOS_CURSO = ['Extensivo', 'Curso', 'Sprint', 'Reta final', 'Prova oral', 'Discursiva', 'Turma'] as const
/** Tipos oferecidos ao CRIAR (o Extensivo tem modelo próprio e não entra em "Criar curso"). */
export const TIPOS_NOVO = ['Curso', 'Sprint', 'Reta final', 'Prova oral', 'Discursiva', 'Turma'] as const

export type ModeloId = 'trilha' | 'materia' | 'contagem' | 'semana' | 'temas' | 'material' | 'agenda'

export interface ModeloDef { id: ModeloId; nome: string; bom: string; desc: string }
export const MODELOS: ModeloDef[] = [
  { id: 'trilha', nome: 'Trilha', bom: 'Sprint e reta final curta', desc: 'Etapas em sequência. O aluno vê onde está e qual é a próxima.' },
  { id: 'materia', nome: 'Por matéria', bom: 'Reta final com muitas disciplinas', desc: 'Uma capa por disciplina, com o progresso de cada uma.' },
  { id: 'contagem', nome: 'Contagem até a prova', bom: 'Reta final com data de prova', desc: 'Mostra quantos dias faltam e as metas de cada dia até a prova.' },
  { id: 'semana', nome: 'Por semana', bom: 'Turmas com aulas semanais', desc: 'Semana 1, 2, 3… Cada semana abre com o conteúdo daquela semana.' },
  { id: 'temas', nome: 'Temas mais cobrados', bom: 'Revisão final por banca', desc: 'Temas em ordem de quanto caem na banca. O aluno marca o que já revisou.' },
  { id: 'material', nome: 'Por tipo de material', bom: 'Pacotes de material e questões', desc: 'Abas por tipo: PDFs, vídeos, questões, simulados e lei seca.' },
  { id: 'agenda', nome: 'Agenda de encontros', bom: 'Prova oral e cursos ao vivo', desc: 'Encontros com data e hora, link para entrar e a gravação depois.' },
]
export const nomeModelo = (id: string | null | undefined) => MODELOS.find((m) => m.id === id)?.nome ?? ''

/** Modelo padrão por tipo quando o curso é criado sem escolha. */
export const MODELO_PADRAO_TIPO: Record<string, ModeloId> = {
  Sprint: 'trilha', 'Reta final': 'contagem', 'Prova oral': 'agenda', Turma: 'materia', Curso: 'trilha', Discursiva: 'trilha',
}

export type LibTrilha = 'tudo' | 'concluir' | 'data'
export interface CursoCfg {
  lib: LibTrilha
  prova: string // yyyy-mm-dd
  inicio: string // yyyy-mm-dd (modelo por semana)
  semanas: number
  banca: string
  abas: string[]
  progresso: boolean // modelo por matéria: progresso em cada capa
  semana_a_semana: boolean // modelo por semana: liberar uma semana por vez
  gravacao: boolean // modelo agenda
  lembrete: boolean // modelo agenda
}
export const CFG_PADRAO: CursoCfg = {
  lib: 'concluir', prova: '', inicio: '', semanas: 6, banca: 'Cebraspe',
  abas: ['PDFs', 'Vídeos', 'Questões', 'Simulados', 'Lei seca'],
  progresso: true, semana_a_semana: true, gravacao: true, lembrete: true,
}
export const BANCAS = ['Cebraspe', 'FCC', 'FGV', 'Vunesp', 'Própria do órgão']
export const ABAS_MATERIAL = ['PDFs', 'Vídeos', 'Questões', 'Simulados', 'Lei seca', 'JurisClub']
export const LIB_OPCOES: { v: LibTrilha; l: string }[] = [
  { v: 'tudo', l: 'Tudo aberto desde o início' },
  { v: 'concluir', l: 'Próxima abre ao concluir a anterior' },
  { v: 'data', l: 'Uma por dia, a partir da matrícula' },
]
export const BLOCOS_EXTRAS = ['Contagem até a prova', 'Próximo encontro', 'Avisos do professor', 'Simulados do curso', 'Temas mais cobrados', 'Meu desempenho']
export const BLK_PADRAO = ['Avisos do professor', 'Simulados do curso']

export function mesclarCfg(raw: unknown): CursoCfg {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<CursoCfg>
  return { ...CFG_PADRAO, ...r, abas: Array.isArray(r.abas) ? r.abas : CFG_PADRAO.abas }
}

// ───────── Passo a passo (6 etapas) ─────────
export interface EtapasData {
  prodOk?: boolean
  pad?: { capa?: boolean; coment?: boolean; cert?: boolean; marca?: boolean }
  sprint?: boolean
  pastaPass?: boolean
  gOk?: boolean
  vitrine?: string
  sem1?: boolean
  guia?: boolean
  wa?: string
  pub?: boolean
}
export const ETAPAS_PAD_PADRAO = { capa: true, coment: false, cert: false, marca: true }
export const VITRINES_OPCOES = (tipo: string) => [`Área de membros · ${tipo}`, 'Área de membros · Cursos', 'Área de membros · Passaporte']
export const BRIEFING_URL = 'https://docs.google.com/document/d/1KT3NzTSuOGp0WlrmBvansmoBPWeCBxMXRi4Lc5Y2gag/edit?tab=t.iho57svtmk1t'

/** As 6 etapas (mesma regra do etSteps do protótipo). Calculado NO SERVIDOR (loader), a tela só lê o resultado. */
export function etapasFeitas(c: { nome: string; etapas: EtapasData }, nProdutos: number, nGrupos: number): boolean[] {
  const E = c.etapas
  return [
    !!c.nome,
    nProdutos > 0 && !!E.prodOk,
    (nGrupos > 0 || !!E.sprint || !!E.pastaPass) && !!E.gOk,
    !!E.vitrine,
    !!E.sem1 && !!E.guia && !!E.wa,
    !!E.pub,
  ]
}

// ───────── Passaporte e edital ─────────
export interface EditalData {
  pass: boolean
  orgao: string
  pub: string
  prova: string
  modos: ('conciliar' | 'seguir' | 'curso')[]
  peso: number
  min: number
  max: number
  final: boolean
  volta: boolean
}
export const EDITAL_PADRAO: EditalData = {
  pass: true, orgao: '', pub: '', prova: '', modos: ['conciliar', 'seguir', 'curso'], peso: 50, min: 30, max: 80, final: true, volta: true,
}
export const mesclarEdital = (raw: unknown): EditalData => ({ ...EDITAL_PADRAO, ...((raw && typeof raw === 'object' ? raw : {}) as Partial<EditalData>) })
export const EDITAL_MODOS: Record<string, [string, string]> = {
  conciliar: ['Conciliar com o cronograma', 'As metas do edital entram no Cronograma Adaptativo do Extensivo até a prova.'],
  seguir: ['Seguir o cronograma do edital', 'O Extensivo pausa até a prova, com o progresso guardado, e volta depois.'],
  curso: ['Só o curso', 'O cronograma do aluno não muda. O curso fica em Meus cursos.'],
}

// ───────── Pop-ups ─────────
export const POP_QUANDO = ['No primeiro acesso ao curso', 'Toda vez que entrar no curso', 'Ao concluir uma aula', 'Numa data e hora']
export const POP_FREQ = ['Uma vez por aluno', 'Uma vez por dia', 'Sempre que acontecer']

// ───────── Mensagens (WhatsApp) ─────────
export const MSG_PROVEDORES = ['WhatsApp Business (API oficial da Meta)', 'Z-API', 'Twilio', 'Outro serviço por webhook']
/** [chave, rótulo, texto padrão, ligada por padrão] */
export const MSG_AUTO: [string, string, string, boolean][] = [
  ['boas', 'Boas-vindas ao entrar no curso', 'Olá, {nome}! Seu acesso ao {curso} está liberado. Comece pela aula 1 e monte seu cronograma: {link}', true],
  ['meta', 'Metas atrasadas há 2 dias', 'Oi, {nome}! Você tem metas atrasadas no {curso}. O cronograma se ajusta: é só abrir e recalcular. {link}', true],
  ['sim', 'Simulado no dia seguinte', '{nome}, amanhã tem simulado no {curso}. Reserve o tempo de prova. {link}', true],
  ['mat', 'Material novo no curso', 'Material novo no {curso}. Ele já está no seu cronograma desta semana. {link}', false],
  ['venc', 'Acesso vence em 7 dias', '{nome}, seu acesso ao {curso} vence em 7 dias. Fale com a gente para renovar. {link}', true],
]
export interface MsgCfg { prov: string; num: string; con: boolean }
export const MSG_CFG_PADRAO: MsgCfg = { prov: MSG_PROVEDORES[0], num: '', con: false }

// ───────── E-mails automáticos ─────────
/** [chave, rótulo, assunto padrão, texto padrão, ligado por padrão] */
export const MAIL_AUTO: [string, string, string, string, boolean][] = [
  ['boas', 'Boas-vindas', 'Bem-vindo ao {curso}', 'Olá, {nome}!\n\nSeu acesso ao {curso} está liberado. Comece montando o seu cronograma.\n\nEquipe Revisão', true],
  ['mat', 'Material novo', 'Material novo no {curso}', 'Olá, {nome}!\n\nPublicamos um material novo no {curso}. Ele já está no seu cronograma.\n\nEquipe Revisão', true],
  ['ev', 'Lembrete de encontro (1 dia antes)', 'Amanhã tem encontro no {curso}', 'Olá, {nome}!\n\nAmanhã tem encontro ao vivo no {curso}. O link aparece no seu calendário.\n\nEquipe Revisão', true],
  ['sem', 'Sem acesso há 7 dias', 'Seu cronograma está esperando você', 'Olá, {nome}!\n\nFaz 7 dias que você não entra no {curso}. O cronograma se ajusta: é só abrir e continuar.\n\nEquipe Revisão', true],
  ['venc', 'Acesso vence em 7 dias', 'Seu acesso ao {curso} vence em 7 dias', 'Olá, {nome}!\n\nSeu acesso ao {curso} vence em 7 dias.\n\nEquipe Revisão', true],
  ['fim', 'Conclusão do curso', 'Você concluiu o {curso}', 'Olá, {nome}!\n\nParabéns por concluir o {curso}.\n\nEquipe Revisão', false],
]

export interface AutomacaoRow { canal: 'whatsapp' | 'email'; chave: string; ativo: boolean | null; assunto: string | null; texto: string | null }

// ───────── Aulas e materiais (derivado do currículo do produto principal) ─────────
export interface AulaResumo { id: string; titulo: string; pdf: boolean; video: boolean; legproc: boolean; questoes: boolean }
export interface ModuloResumo { id: string; titulo: string; aulas: AulaResumo[] }

/** Normaliza subtipo/tipo_ref do currículo real → as 4 etiquetas do protótipo (PDF, Vídeo, LegProc, Questões). */
export function flagsDoItem(subtipo: string | null, tipoRef: string | null): { pdf?: true; video?: true; legproc?: true; questoes?: true } {
  const s = (subtipo ?? '').toLowerCase()
  if (s === 'legproc') return { legproc: true }
  if (['pdfull', 'pdflash', 'documento', 'slide'].includes(s)) return { pdf: true }
  if (['videoaula', 'video', 'webinar'].includes(s) || tipoRef === 'video_url') return { video: true }
  if (['quiz', 'flashcards'].includes(s) || tipoRef === 'quiz' || tipoRef === 'simulado') return { questoes: true }
  if (tipoRef === 'documento_biblioteca') return { pdf: true }
  return {}
}

export function iniciais(nome: string) { return nome.trim().slice(0, 2).toUpperCase() }
