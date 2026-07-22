import 'server-only'

/**
 * Repositório SQL dos relatórios. A implementação vive no pacote compartilhado `data` (usado
 * também pela API dedicada, apps/api). Este arquivo é só um re-export para manter os imports
 * `@/lib/data/relatorios.repo` do app funcionando.
 */
export * from 'data'
