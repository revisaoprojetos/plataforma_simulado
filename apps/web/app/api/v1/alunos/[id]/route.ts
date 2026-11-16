import { createAdminClient } from '@/lib/supabase/server'
import { handler, ok, erro, ehUuid } from '@/lib/api-v1'
import { COLS_ALUNO, mapAluno } from '@/lib/api-v1/aluno'

export const dynamic = 'force-dynamic'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return handler(req, 'alunos:read', async ({ auth }) => {
    if (!ehUuid(id)) return erro(400, 'id inválido.')
    const { data, error } = await createAdminClient()
      .from('simulado_estudantes').select(COLS_ALUNO)
      .eq('tenant_id', auth.tenantId).eq('id', id).maybeSingle()
    if (error) throw error
    if (!data) return erro(404, 'Aluno não encontrado.')
    return ok(mapAluno(data))
  })
}
