import type { Disponibilidade } from '@/lib/produtos/curriculo'

export interface DispSegAdmin {
  id: string; segmento_id: string; alvo_tipo: 'modulo' | 'aula'; alvo_id: string
  disponibilidade: Disponibilidade; prioridade: number; ativo: boolean
}
export interface CapaSegAdmin {
  id: string; segmento_id: string; alvo_tipo: 'produto' | 'modulo'; alvo_id: string | null
  imagem_url: string | null; titulo: string | null; descricao: string | null; ocultar_titulo: boolean; prioridade: number; ativo: boolean
}
export interface RegrasSegmentoAdmin { disp: DispSegAdmin[]; capas: CapaSegAdmin[] }

/** Estado da planilha de liberação de aulas do produto (bloco informativo do tipo "Pelo cronograma do aluno"). */
export interface PlanilhaLiberacaoInfo { disponivel: boolean; total: number; vinculadas: number; cfgAtiva: boolean | null }
