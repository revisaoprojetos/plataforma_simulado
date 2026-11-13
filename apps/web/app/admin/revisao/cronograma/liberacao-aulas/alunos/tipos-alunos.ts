// Tipos/constantes puros (client-safe) da aba Alunos/Exceções/Log. Sem 'use server', sem server-only.

export interface AlunoOpcao { id: string; nome: string; email: string }
export interface GrupoOpcao { id: string; nome: string }
export interface ModuloOpcao { id: string; titulo: string }
export interface AulaOpt { id: string; titulo: string; disciplina: string }

export interface ExcecaoLinha {
  id: string
  alvoTipo: 'aula' | 'modulo'
  alvoId: string
  alvoTitulo: string
  estudanteId: string | null
  grupoId: string | null
  destinoNome: string
  destinoSub: string
  acao: 'liberar' | 'bloquear'
  motivo: string | null
  expiraEm: string | null
  ativo: boolean
  vigente: boolean
  criadoPor: string
  criadoEm: string
}

export interface NovaExcecao {
  alvos: Array<{ tipo: 'aula' | 'modulo'; id: string }>
  alunoIds: string[]
  grupoIds: string[]
  acao: 'liberar' | 'bloquear'
  motivo: string
  /** AAAA-MM-DD (fim do dia em Brasília) ou vazio = sem validade */
  validade: string
}

export interface EditarExcecao { acao: 'liberar' | 'bloquear'; motivo: string; validade: string; ativo: boolean }

export const AVISO_MIGRACAO = 'Aplique as migrações 20261117010000 e 20261118020000 para usar esta aba.'
export const PPS_ALUNOS = 25
export const PPS_LISTAS = 25

export const ORIGENS_LOG = [{ v: 'manual', l: 'Manual' }, { v: 'automatico', l: 'Automático' }, { v: 'importacao', l: 'Importação' }]

export const dataHoraBr = (iso: string | null | undefined) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(+d) ? '—' : d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
export const dataBrIso = (iso: string | null | undefined) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—')
