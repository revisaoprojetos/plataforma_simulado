import type { createAdminClient } from '@/lib/supabase/server'
import type { QS } from '../../../_comp/lista'
import type { BaseProduto } from './dados-alunos'

export interface PropsVisao {
  svc: ReturnType<typeof createAdminClient>
  tenantId: string
  produtoId: string
  base: BaseProduto
  qs: QS
  pathname: string
  podeEditar: boolean
}
export const PRESERVAR = ['aba', 'sub', 'produto', 'vis']
export const CAMPO = 'h-9 rounded-lg border bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'
