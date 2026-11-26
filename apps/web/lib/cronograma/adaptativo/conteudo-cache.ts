import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { remember } from '@/lib/cache/relatorio-cache'
import { carregarConteudoBanco, carregarConteudoBancoBase, type ConteudoBanco } from './conteudo-banco'

// Leitura CACHEADA do catálogo de conteúdo (Biblioteca + overlay do admin) para as TELAS ADMIN de leitura do Cronograma.
// `montarConteudo` faz ~15-25 idas ao banco (pastas, documentos .in(80), versões, páginas iniciais…); cada aba do admin
// refazia tudo. A chave `crono-conteudo:<tenant>` é a MESMA do GET do aluno (app/api/aluno/cronograma/adaptativo) e do
// remap-as-server — invalidada por `invalidarCachesPaginas` e, no admin, ao salvar o Catálogo de metas.
// NÃO usar em caminhos que gravam/sincronizam (esses precisam do valor real): lá continue com `carregarConteudoBanco`.
export const TTL_CONTEUDO_S = 120
export const chaveConteudo = (tenantId: string) => `crono-conteudo:${tenantId}`
export const chaveConteudoBase = (tenantId: string) => `crono-conteudo-base:${tenantId}`

export const conteudoBancoCache = (svc: SupabaseClient, tenantId: string): Promise<ConteudoBanco> =>
  remember<ConteudoBanco>(chaveConteudo(tenantId), TTL_CONTEUDO_S, () => carregarConteudoBanco(svc, tenantId))

/** Catálogo-BASE (sem overlay) — usado pelo editor do Catálogo de metas e pela divergência de páginas. */
export const conteudoBancoBaseCache = (svc: SupabaseClient, tenantId: string): Promise<ConteudoBanco> =>
  remember<ConteudoBanco>(chaveConteudoBase(tenantId), TTL_CONTEUDO_S, () => carregarConteudoBancoBase(svc, tenantId))
