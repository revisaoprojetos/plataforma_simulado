import 'server-only'

// A implementação vive no pacote compartilhado `data` (usado também pela API dedicada, apps/api).
// Este arquivo é só um re-export para manter os imports `@/lib/data/sql` do app funcionando.
export { sqlQuery, sqlDisponivel } from 'data'
