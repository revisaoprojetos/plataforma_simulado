import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

// Facetas (contagem por opção) do Banco de Questões do ADMIN. Mesmo núcleo do aluno (lib/filtros/facetas-core.ts); o escopo é o do
// admin: TODOS os status (rascunho/arquivada inclusive), questões anuladas e discursivas, + dimensões status/tipo/etiqueta.
// O `base` respeita visão rápida, nó da árvore e busca (montarWhere); os filtros do card entram como multi-seleção por dimensão.

import { calcularFacetasCore } from '@/lib/filtros/facetas-core'
import { DIMS_ADMIN } from '@/lib/filtros/questoes-sql'
import type { EstadoQ } from './biblioteca-questoes-tipos'
import { montarWhere, selDeEstado } from './biblioteca-questoes'
import { idsDuplicadas } from './biblioteca-questoes-duplicadas'

const SEM_CARD = { status: '', dif: '', tipo: '', banca: '', orgao: '', ano: '', disc: '', ass: '', det: '', cargo: '', etq: '' }

export async function facetasQuestoesAdmin(svc: SupabaseClient, tenantId: string, e: EstadoQ) {
  const dupIds = e.vis === 'duplicada' ? await idsDuplicadas(svc, tenantId) : []
  const base = montarWhere(tenantId, { ...e, ...SEM_CARD }, dupIds)
  return calcularFacetasCore({ sql: base.sql, params: base.params }, selDeEstado(e), DIMS_ADMIN)
}
