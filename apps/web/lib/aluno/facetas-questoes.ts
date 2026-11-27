import 'server-only'

// Facetas do Banco do ALUNO: escopo fixo (publicadas, não anuladas, objetivas, fora as "fora de jogo") sobre o NÚCLEO compartilhado
// (lib/filtros/facetas-core.ts) — o mesmo que o admin usa, só muda o `base`. Sem cálculo no cliente (backend-first).

import { calcularFacetasCore } from '@/lib/filtros/facetas-core'
import type { NoAssunto } from '@/lib/aluno/filtros-multi'

export type DimFaceta = 'disciplina' | 'assunto' | 'detalhe' | 'banca' | 'orgao' | 'cargo' | 'ano' | 'dificuldade'
export type FiltrosFaceta = Partial<Record<DimFaceta | 'busca' | 'comentadas', string>>
export type Facetas = { total: number; contagens: Record<DimFaceta, Record<string, number>> }

const DIMS: DimFaceta[] = ['disciplina', 'assunto', 'detalhe', 'banca', 'orgao', 'cargo', 'ano', 'dificuldade']

// `_assuntos` fica na assinatura por compatibilidade: a expansão assunto → sub-assuntos agora é feita no SQL (CTE por pai_id).
export async function calcularFacetas(tenantId: string, f: FiltrosFaceta, _assuntos: NoAssunto[], foraDeJogo: string[]): Promise<Facetas | null> {
  const params: unknown[] = [tenantId]
  const add = (v: unknown) => { params.push(v); return `$${params.length}` }
  const w = [`q.tenant_id = $1`, `q.status = 'publicada'`, `q.deletado = false`, `q.anulada = false`, `q.tipo <> 'discursiva'`]
  if (foraDeJogo.length) w.push(`not (q.id = any(${add(foraDeJogo)}::uuid[]))`)
  const busca = (f.busca ?? '').trim().slice(0, 80)
  if (busca) w.push(`q.enunciado ilike ${add('%' + busca.replace(/[\\%_]/g, (c) => '\\' + c) + '%')}`)
  if (f.comentadas) w.push(`q.comentario_professor is not null`)
  return calcularFacetasCore({ sql: w.join(' and '), params }, f, DIMS)
}
