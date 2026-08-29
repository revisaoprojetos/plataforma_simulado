import 'server-only'

/**
 * Repositório SQL do board de simulados. A implementação vive no pacote compartilhado `data`
 * (usado também pela API dedicada, apps/api). Re-export para os imports `@/lib/data/simulados.repo`.
 */
export { simuladosTiposSql, type SimuladoTipoRow } from 'data'
