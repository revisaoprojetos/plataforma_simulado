// Tipos exportados por cadernos/actions.ts — fora do 'use server' para não quebrar o next build.

export interface CadernoBloco {
  id: string
  tipo: 'texto' | 'questao'
  conteudo?: string
  questao_id?: string
}
export interface CadernoConfig {
  cabecalho?: string
  instrucoes?: string
  blocos: CadernoBloco[]
}
export type CadernoRow = { id: string; nome: string; blocos: number; cor: string | null; icone: string | null; capa: string | null }
export type TabelaCaderno = 'simulado_cadernos_designer' | 'simulado_cadernos_teste'
