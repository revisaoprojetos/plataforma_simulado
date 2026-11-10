// Tipos de actions.ts — sem 'use server' para não quebrar o next build
import type { PontuacaoLeitura } from '@/lib/leitura/pontuacao'
import type { RegulamentoConfig } from '@/lib/leitura/regulamento'
import type { DesafioModulo } from '@/lib/leitura/desafios'
import type { TrilhaAparencia } from '@/lib/leitura/trilha-aparencia'
import type { IntroConfig } from '@/lib/leitura/intro'
export type { PontuacaoLeitura, RegulamentoConfig, DesafioModulo, TrilhaAparencia, IntroConfig }

export type SituacaoEditorial = 'em_preparacao' | 'rascunho' | 'em_revisao' | 'publicada' | 'arquivada' | 'revogada'

export type DocEstado = 'rascunho' | 'visualizavel' | 'publicada'

export type DocPublicacao = { estado: DocEstado; publicarEm: string | null }

export type Documento = {
  id: string
  titulo: string
  descricao: string | null
  cor: string | null
  icone: string | null
  capa_url: string | null
  pasta_id: string | null
  versao: number
  publicado: boolean
  desafio_ativo: boolean
  desafio_exige_fim: boolean
  desafio_tempo_min: number | null
  artigos?: number
  // Metadados de LEI (Fase A / A1) — todos opcionais (documentos genéricos ficam null).
  materia_id?: string | null
  tipo_norma?: string | null
  numero?: string | null
  ano?: number | null
  titulo_oficial?: string | null
  ementa?: string | null
  slug?: string | null
  esfera?: string | null
  fonte_oficial?: string | null
  ultima_verificacao?: string | null
  ordem?: number | null
  situacao_editorial?: SituacaoEditorial | null
  publicacao?: DocPublicacao
}

export type EstudanteRef = { id: string; nome: string; email: string | null }

export type EstudanteLinha = { id: string; nome: string; email: string | null; cpf: string | null }

export type AnotacaoBase = { id: string; inicio: number; fim: number; exact: string; prefix: string; suffix: string; cor: string; nota: string | null; tipoGrifo: string | null }

export type QuestaoDoc = { id: string; questaoId: string; enunciado: string; aposArtigo: number; obrigatoria: boolean }

export type QuestaoBuscaLeitura = { id: string; enunciado: string; codigo: string | null }

export type PublicacaoModulo = { status: 'rascunho' | 'publicado'; publicarEm: string | null; encerrarEm: string | null }

export type ModuloLeitura = { id: string; nome: string; pai_id: string | null; cor: string | null; icone: string | null; capa_url: string | null; capa_card_url: string | null; adesivo_url: string | null; pontuacao: PontuacaoLeitura; desafios: DesafioModulo[]; intro: IntroConfig; regulamento: RegulamentoConfig; trilhaAparencia: TrilhaAparencia; regraSequencial: boolean; quizBloquearRefazer: boolean; ordem: number; subpastas: number; aulas: number; publicacao: PublicacaoModulo }

export type BancoAulas = { ok: boolean; error?: string; pastas?: ModuloLeitura[]; aulas?: (Documento & { questoes?: number; quizQuestoes?: number })[]; breadcrumb?: { id: string; nome: string }[]; modulos?: { id: string; nome: string }[]; moduloAtual?: ModuloLeitura }

export interface DetalheAulaRanking {
  titulo: string; data: string | null; pontos: number
  // Controle detalhado (suporte): momentos de LEITURA (início/fim/duração) e de QUIZ (início/fim).
  leituraInicio: string | null; leituraFim: string | null; leituraTempoSeg: number | null
  quizInicio: string | null; quizFim: string | null
  tentativas: number // nº de tentativas do quiz registradas (>1 = o aluno refez)
  /** Linha alternativa (áreas sem leitura/quiz com horário — ex.: juris: "N teses dominadas"). */
  subtitulo?: string
}

export interface DetalheRankingAluno {
  nome: string; email: string | null
  streakAtual: number; streakMaior: number; ultimoDiaAtivo: string | null
  totalAulas: number; aulasConcluidas: number; pontosTotal: number
  aulas: DetalheAulaRanking[]
  // Calendário de reconfiguração da sequência (suporte):
  tz: string                            // fuso do tenant
  hoje: string                          // 'YYYY-MM-DD' no fuso do tenant
  diasAuto: string[]                    // dias em que o aluno concluiu ao menos uma aula (automático)
  overrides: Record<string, boolean>    // ajustes manuais: dia→conta(true)/desconsidera(false)
  diaAulas: Record<string, string[]>    // dia → títulos das aulas concluídas (tooltip do calendário)
}

export type EstudanteAcessoLinha = { id: string; nome: string; email: string | null; cpf: string | null; classificacao: string | null; avatar: string | null; perfil_avatar_cor: string | null }

export type ControleAcessoLinha = EstudanteAcessoLinha & { grupos: { id: string; nome: string; cor: string | null }[]; individual: boolean }

export type QuizLinha = { id: string; enunciado: string; tipo: string | null; formato: string | null; nivel_dificuldade: string | null; status: string | null; disciplina: string | null; assunto: string | null; assuntoDetalhe: string | null; banca: string | null; orgao: string | null; ano: number | null }

export type QuizConfig = { modo: 'imediato' | 'simulado'; embaralhar: boolean }

export interface RankingOcultosCfg { estudantes: string[]; grupos: string[]; total: boolean }
