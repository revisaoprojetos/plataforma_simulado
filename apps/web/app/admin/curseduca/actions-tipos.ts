import type { DestinoImport, ResultadoImportCurseduca } from '@/lib/curseduca/tipos'

export type GrupoCurseducaDTO = { id: number; nome: string; criadoEm: string | null }
export type GrupoSistema = { id: string; nome: string; cor: string | null; pai_id: string | null; is_mestre: boolean; membros: number }

export type CurseducaConfigDTO = {
  base_url: string; usuario: string; ativo: boolean; temApiKey: boolean; temSenha: boolean
  usandoEnv: boolean; existe: boolean; criptografado: boolean; criptografiaAtiva: boolean; ilegivel: boolean
}

export type MembroPreview = {
  id: number; nome: string; email: string | null; cpf: string | null; telefone: string | null
  situacao: string | null; criadoEm: string | null; ultimoAcesso: string | null; cidade: string | null; uf: string | null
  entrouEm: string | null
  expiraEm: string | null
  temMatricula: boolean
  temAcesso: boolean | null
}

export type ResultadoPorCanal = ResultadoImportCurseduca & { canais?: number; gruposCriados?: number; gruposReusados?: number }

export type RegraSyncDTO = {
  id: string; grupos: number[]; destino: DestinoImport; sincronizar: boolean; intervalo_min: number
  ativo: boolean; ultima_execucao: string | null; ultimo_resultado: ResultadoImportCurseduca | null; grupoDestinoNome: string | null
  agruparPorNome: boolean; descobrirCanais: boolean
}

export interface AutoVinculoDTO {
  ativo: boolean
  modo: 'horario' | 'intervalo'
  horario: number
  intervalo_min: number
  termos_incluir: string[]
  termos_excluir: string[]
  ultimaExecucao: string | null
  ultimoResultado: any | null
}
