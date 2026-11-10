// Tipos exportados por administradores/actions.ts — fora do 'use server' para não quebrar o next build.

export interface AdminMembro {
  userId: string
  nome: string | null
  email: string | null
  cargo: string
  ativo: boolean
  criadoEm: string | null
  ehVoce: boolean
  /** [console super] plataformas (empresas) a que este admin tem acesso — etiquetas na lista. */
  plataformas?: { id: string; nome: string }[]
}
export interface CargoOpcao { nome: string; descricao: string | null; is_sistema: boolean }
