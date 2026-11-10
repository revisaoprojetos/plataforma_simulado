// Tipos exportados por biblioteca/actions.ts — fora do 'use server' para não quebrar o next build.

export type Categoria = 'conteudo' | 'modelo_caderno' | 'jurisclub'
export interface PastaConteudo {
  id: string; nome: string; pai_id: string | null; cor: string | null
  disciplina_id?: string | null
  disciplina_classificacao?: string | null
  cronograma_tipo_material?: string | null
  capa_url?: string | null
}
export type EstudanteAcessoLinha = { id: string; nome: string; email: string | null; cpf: string | null; classificacao: string | null; avatar: string | null; perfil_avatar_cor: string | null }
export type GrupoAtribuido = { id: string; nome: string; cor: string | null; atribuido: boolean; is_mestre: boolean; pai_id: string | null }

export type NoAcesso = { id: string; nome: string; tipo: 'pasta' | 'documento'; nivel: number; restrito: boolean }

export type ModoAcessoDTO = 'principal' | 'herdar' | 'propria' | 'bloquear'

export type OrigemDTO = 'avulsa' | 'individual'

export type PermsDTO = { ler: boolean; baixar: boolean; grifar: boolean }

export type DriveNodeDTO = {
  id: string; nome: string; tipo: 'folder' | 'doc'; cor: string | null; herda: boolean
  /** Modo de acesso de 1ª classe (spec 01 §3). Ausente nos dados antigos → o cliente trata como padrão. */
  modo?: ModoAcessoDTO
  /** Visibilidade: oculto do aluno (sem bloquear quem já tem link). */
  oculto?: boolean
  pessoas: { id: string; tipo: 'estudante' | 'grupo'; email: string; nome: string; papel: 'reader' | 'commenter' | 'editor'; avatar?: string | null; corAvatar?: string | null; origem?: OrigemDTO; perms?: PermsDTO }[]
  geral: { modo: 'restrito' | 'todos'; papel: 'reader' | 'commenter' | 'editor' } | null
  filhos: DriveNodeDTO[]
}

export type PermissoesAluno = { pode_ler_plataforma: boolean; pode_baixar: boolean; pode_grifar: boolean; marca_dagua: boolean; pode_imprimir: boolean }

export type VinculoLeitor = { id: string; alvo_tipo: string; alvo_ref_id: string | null; rotulo: string; detalhe: string | null; url: string | null; modo: string; ordem: number }

export type AcessoLinhaSidebar = { id: string; nome: string; papel: string; pode_baixar: boolean; liberado_ate: string | null }

export type EventoHistorico = { tipo: string; titulo: string; detalhe: string | null; em: string }
