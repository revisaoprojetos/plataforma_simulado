// Tipos + config da unificação genérica de taxonomias. Módulo PURO (sem 'use server') para poder ser
// importado tanto pelas server actions quanto por componentes cliente/servidor. Ver taxonomia-actions.ts.

export type TipoTaxonomia = 'disciplina' | 'assunto' | 'banca' | 'orgao' | 'cargo' | 'assunto_detalhe' | 'ano'
export type ItemTax = { id: string; nome: string; questoes: number; extra?: number }

export type CfgEntidade = { kind: 'entidade'; tabela: string; fk: string; extra?: { tabela: string; col: string } }
export type CfgValor = { kind: 'valor'; col: string; numerico?: boolean }

// ENTIDADE = tabela própria + FK em simulado_questoes (mescla = repontar FK + apagar linhas dup).
// VALOR = coluna texto/número em simulado_questoes, sem tabela (mescla = trocar o valor nas questões).
export const CFG_TAX: Record<TipoTaxonomia, CfgEntidade | CfgValor> = {
  disciplina: { kind: 'entidade', tabela: 'simulado_disciplinas', fk: 'disciplina_id', extra: { tabela: 'simulado_assuntos', col: 'disciplina_id' } },
  assunto: { kind: 'entidade', tabela: 'simulado_assuntos', fk: 'assunto_id' },
  banca: { kind: 'entidade', tabela: 'simulado_bancas', fk: 'banca_id' },
  orgao: { kind: 'entidade', tabela: 'simulado_orgaos', fk: 'orgao_id' },
  cargo: { kind: 'valor', col: 'cargo' },
  assunto_detalhe: { kind: 'valor', col: 'assunto_detalhe' },
  ano: { kind: 'valor', col: 'ano', numerico: true },
}

export function ehTipoTaxonomia(t: string | undefined | null): t is TipoTaxonomia {
  return !!t && t in CFG_TAX
}
