import { LEITURA_ATIVA, JURISPRUDENCIA_ATIVA } from '@/lib/flags'

/**
 * Áreas de DESAFIO — motor único (Leitura/LegProc) servindo N áreas via um discriminador `area`,
 * que é o `folder_area` das pastas (`simulado_pastas`). Cada área tem sua biblioteca, trilha, ranking
 * e análise próprios; o XP/nível/liga é GLOBAL (compartilhado). Sem tabelas novas — a atividade
 * (respostas/progresso/XP) é por documento e a área deriva do módulo.
 *
 * ⚠️ Default sempre 'leitura' nas funções do motor → o Desafio de Lei Seca atual fica intacto.
 * Este módulo é client-safe (só lê flags NEXT_PUBLIC_*) — pode ser usado na sidebar.
 */
export type AreaDesafioKey = 'leitura' | 'jurisprudencia'

export interface AreaDesafio {
  /** Chave = `folder_area` das pastas desta área. */
  key: AreaDesafioKey
  /** Nome exibido (substitui o "Desafio de Lei Seca" hardcoded). */
  nome: string
  /** `origem` dos eventos de XP desta área (o pool de nível/liga continua global). */
  origem: string
  basePathAdmin: string
  basePathAluno: string
  /** true = tem leitor de documento (Lei Seca); false = SÓ quiz interativo (Jurisprudência). */
  temLeitura: boolean
  /** Flag de liberação (menu + rotas). */
  ativa: boolean
}

export const AREAS_DESAFIO: Record<AreaDesafioKey, AreaDesafio> = {
  leitura: {
    key: 'leitura',
    nome: 'Desafio de Lei Seca',
    origem: 'leitura',
    basePathAdmin: '/admin/leitura',
    basePathAluno: '/aluno/leitura',
    temLeitura: true,
    ativa: LEITURA_ATIVA,
  },
  jurisprudencia: {
    key: 'jurisprudencia',
    nome: 'Desafio de Jurisprudência',
    origem: 'jurisprudencia',
    basePathAdmin: '/admin/jurisprudencia',
    basePathAluno: '/aluno/jurisprudencia',
    temLeitura: false, // SÓ quiz — sem leitor
    ativa: JURISPRUDENCIA_ATIVA,
  },
}

export const AREA_PADRAO: AreaDesafioKey = 'leitura'

/** Resolve uma área por chave; cai no padrão (Lei Seca) se desconhecida — back-compat. */
export function areaDe(key?: string | null): AreaDesafio {
  return AREAS_DESAFIO[(key as AreaDesafioKey)] ?? AREAS_DESAFIO[AREA_PADRAO]
}

/** Áreas atualmente ligadas (para sidebar/listagens). */
export function areasAtivas(): AreaDesafio[] {
  return Object.values(AREAS_DESAFIO).filter((a) => a.ativa)
}
