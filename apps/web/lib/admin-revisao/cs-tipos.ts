// Tipos/constantes das telas CS da "Plataforma Revisão" (Membros · Grupos · Calendário · Campanhas · Avisos).
// SEM 'server-only'/'use server' — importável por client components e por actions-tipos.

export type MembrosFiltro = 'todos' | 'ativos' | 'risco' | 'bloq'
export const MEMBROS_FILTROS: MembrosFiltro[] = ['todos', 'ativos', 'risco', 'bloq']

export type MembroLinha = {
  id: string
  nome: string
  email: string | null
  bloqueado: boolean
  ultimoAcesso: string | null // ISO
  ultimoTxt: string // "hoje" | "ontem" | "há N dias" | "nunca"
  grupos: number
  risco: boolean // não bloqueado e sem acesso há 7+ dias
  avatar: string | null // foto de perfil (simulado_estudantes.avatar)
  avatarCor: string | null // cor de fundo do avatar (perfil_avatar_cor)
  perfilCapa: string | null // imagem/cor de fundo do perfil (perfil_capa) — a mesma do perfil do aluno
  nivel: number | null // nível da gamificação (null = aluno sem registro)
  cargo: string | null // título/cargo do nível, conforme a config de gamificação do tenant
  cargoIcone: string | null // chave do ícone do cargo (CARGO_ICONES)
}

export type MembrosContagens = {
  migrado: boolean // false = migração 20261112040000 ainda não aplicada (sem bloqueio/último acesso)
  total: number
  ativos: number
  risco: number
  bloqueados: number
  semana: number // entraram nos últimos 7 dias
}

export type OrigemGrupo = 'guru' | 'curseduca' | 'manual'

export type GrupoOpcao = { id: string; nome: string; pasta: string | null }

export type MembroGrupoVinculo = {
  grupoId: string
  nome: string
  validade: string // texto pronto ("12 meses após a compra", "até 31/12/2026", "Vitalício")
  origem: OrigemGrupo
}

export type MembroDetalhe = {
  id: string
  nome: string
  email: string | null
  bloqueado: boolean
  ultimoAcesso: string | null
  ultimoTxt: string
  risco: boolean
  grupos: MembroGrupoVinculo[]
  liberaveis: GrupoOpcao[] // grupos que ele ainda NÃO está (exclui pastas e "Encerrados")
  metricas: { planoPct: number | null; metasSemana: number | null; mediaEstrelas: number | null }
}

export type GrupoLinha = {
  id: string
  nome: string
  pasta: string | null
  pastaId: string | null
  origem: OrigemGrupo
  membros: number
  vencendo30: number
  validade: string
  validadeTipo: string | null
  validadeMeses: number | null
  validadeAte: string | null
  codigoGuru: string | null
  cursos: { id: string; nome: string }[]
}

export type GruposKpis = { grupos: number; vinculos: number; vencendo: number; semCurso: number }
export type PastaGrupo = { id: string | null; nome: string; total: number }
export type CursoOpcao = { id: string; nome: string }

// ── Calendário ──
export const EVENTO_TIPOS = [
  { k: 'live', rotulo: 'Live' },
  { k: 'aula', rotulo: 'Aula ao vivo' },
  { k: 'sim', rotulo: 'Simulado' },
  { k: 'mentoria', rotulo: 'Mentoria' },
  { k: 'prazo', rotulo: 'Prazo' },
] as const
export type EventoTipo = (typeof EVENTO_TIPOS)[number]['k']

export type EventoCal = {
  id: string
  titulo: string
  tipo: EventoTipo
  data: string // AAAA-MM-DD
  hora: string // HH:MM
  grupoId: string | null
  grupoNome: string | null
  link: string | null
  lembrete: boolean
}

// ── Campanhas ──
export type PublicoItem = { tipo: 'todos' | 'sem_acesso_7d' | 'grupo' | 'membro'; id?: string; nome: string }

export type CampanhaResumo = {
  id: string
  canal: 'email' | 'api'
  titulo: string
  criadoEm: string
  publicoTxt: string
  estimativa: number
  status: string
  agendadoPara: string | null
  p1: number | null // e-mail: abriram | API: entregues
  p2: number | null // e-mail: clicaram | API: lidas
  p3: number | null // API: cliques
}

export type ApiConfig = { provedor: string; numero: string; conectada: boolean }
export const API_PROVEDORES = ['WhatsApp Business (API oficial da Meta)', 'Z-API', 'Twilio', 'Outro serviço por webhook'] as const

// Modelos (idênticos ao protótipo)
export const MODELOS_EMAIL: Record<string, [string, string, string]> = {
  'Novo material': ['Material novo no ar: {curso}', 'Olá, {nome}!\n\nAcabamos de publicar um material novo no seu curso. Ele já está no seu cronograma desta semana.\n\nBons estudos,\nEquipe Revisão', 'Abrir a plataforma'],
  'Lembrete de simulado': ['Sábado tem simulado', 'Olá, {nome}!\n\nO próximo simulado abre no sábado às 9h. Reserve o tempo de prova e faça como se fosse o dia do concurso.\n\nEquipe Revisão', 'Ver o simulado'],
  'Aluno sem acesso': ['Seu cronograma está esperando você', 'Olá, {nome}!\n\nFaz alguns dias que você não entra na plataforma. Seu cronograma se ajusta: é só abrir e continuar de onde parou.\n\nEquipe Revisão', 'Continuar estudando'],
  'Boas-vindas': ['Bem-vindo ao Revisão', 'Olá, {nome}!\n\nSeu acesso está liberado. Comece montando seu Cronograma Adaptativo: são 3 perguntas e ele organiza suas metas.\n\nEquipe Revisão', 'Montar meu cronograma'],
}
export const MODELOS_API: Record<string, string> = {
  'Lembrete de simulado': '{nome}, sábado tem simulado às 9h. Reserve o tempo de prova e faça como no dia do concurso: {link}',
  'Material novo': '{nome}, publicamos material novo no seu curso. Ele já está no seu cronograma desta semana: {link}',
  'Aluno sem acesso': 'Oi, {nome}! Faz alguns dias que você não entra na plataforma. Seu cronograma se ajusta: é só abrir e continuar de onde parou. {link}',
  'Boas-vindas': 'Olá, {nome}! Seu acesso ao Revisão está liberado. Comece montando o seu Cronograma Adaptativo: {link}',
}

// ── Avisos ──
export const AVISO_LOCAIS = [
  { k: 'faixa', rotulo: 'Faixa de avisos', tipo: 'banner' },
  { k: 'banner', rotulo: 'Banner do Início', tipo: 'hero' },
  { k: 'destaques', rotulo: 'Destaques da semana', tipo: 'hero' },
  { k: 'popup', rotulo: 'Pop-up ao entrar', tipo: 'popup' },
] as const
export type AvisoLocal = (typeof AVISO_LOCAIS)[number]['k']

export type AvisoLinha = {
  id: string
  titulo: string
  local: AvisoLocal
  grupoNome: string | null
  ate: string | null // ISO
  ativo: boolean
  tem_imagem: boolean
}

export type GrupoForm = {
  id?: string | null
  nome: string
  pastaId?: string | null
  validadeTipo: 'meses_apos_compra' | 'ate_data' | 'vitalicio' | ''
  validadeMeses?: number | null
  validadeAte?: string | null // AAAA-MM-DD
  codigoGuru?: string | null
  cursoIds: string[]
  copiarDeId?: string | null
}
