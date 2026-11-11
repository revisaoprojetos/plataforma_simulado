// Tipos PUROS (cliente + servidor) do carregamento inicial (SSR) da sub-aba Classificação.
import type { RespostaTaxG, ResumoClassif, TipoTaxG } from './biblioteca-questoes-gestao-tipos'

export interface DistribuicaoQ { total: number; dificuldade: { k: string; n: number }[]; tipo: { k: string; n: number }[]; status: { k: string; n: number }[]; degradado?: boolean }

/** Tudo que o painel precisa para renderizar SEM chamada de API: qualidade, pendências por campo, distribuição e a 1ª página de cada lista da taxonomia. */
export interface InicialClassificacao {
  resumo: ResumoClassif
  distribuicao: DistribuicaoQ | null
  /** 1ª página (pp 14, ordenação padrão) de cada lista da taxonomia — chaves iguais às do cache cliente. */
  taxonomia: Partial<Record<TipoTaxG, RespostaTaxG>>
  geradoEm: number
}

/** Parâmetros da 1ª página de cada lista (contrato entre SSR, cache cliente e a rota). */
export const PARAMS_TAX_PADRAO = (tipo: TipoTaxG) => ({ s: 'taxonomia', tipo, sort: tipo === 'ano' ? 'nome' : 'questoes', dir: tipo === 'ano' ? 'asc' : 'desc', page: 1, pp: 14 })
