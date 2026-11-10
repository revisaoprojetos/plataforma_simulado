// Tipos de actions.ts — sem 'use server' para não quebrar o next build

export type SolicitacaoLgpd = {
  id: string; estudante_id: string; estudante_nome: string; estudante_email: string | null
  tipo: string; status: string; canal: string; motivo: string | null; criado_em: string; processado_em: string | null
}
