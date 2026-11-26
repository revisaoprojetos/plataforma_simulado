import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getCurrentAccess, accessCan } from '@/lib/auth/permissions'
import { createAdminClient } from '@/lib/supabase/server'
import { lerSessaoImpersonation } from '@/lib/impersonation/session'
import { editarMarcacaoAdmin } from '@/lib/simulado/editar-marcacao'

// POST /api/admin/simulados/editar-marcacao — o ADMIN altera (ou restaura) a alternativa marcada por um aluno
// numa tentativa finalizada. Rota de API (server actions são rejeitadas em domínio custom). A marcação original
// do aluno é preservada; nota/ranking/caches são recalculados pela regra canônica (lib/simulado/editar-marcacao.ts).
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: Request) {
  // Visualização como aluno (impersonação) não conta: nunca edita nada.
  if (await lerSessaoImpersonation().catch(() => null)) {
    return NextResponse.json({ error: 'Indisponível durante a visualização como aluno.' }, { status: 403 })
  }
  const access = await getCurrentAccess()
  if (!access.tenantId || !access.userId || !(access.isAdmin || accessCan(access, 'simulados:update'))) {
    return NextResponse.json({ error: 'Você não tem permissão.' }, { status: 403 })
  }

  let b: { sessaoId?: string; questaoId?: string; alternativaId?: string | null; restaurar?: boolean; motivo?: string }
  try { b = await req.json() } catch { return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 }) }
  if (!b.sessaoId || !UUID.test(b.sessaoId) || !b.questaoId || !UUID.test(b.questaoId)) {
    return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 })
  }
  const alt = b.alternativaId ?? null
  if (alt !== null && !UUID.test(alt)) return NextResponse.json({ error: 'Alternativa inválida.' }, { status: 400 })

  const svc = createAdminClient()
  const r = await editarMarcacaoAdmin(svc, {
    tenantId: access.tenantId, sessaoId: b.sessaoId, questaoId: b.questaoId,
    novaAlternativaId: alt, restaurar: b.restaurar === true, motivo: b.motivo ?? null, atorId: access.userId,
  })
  if (!r.ok) {
    // Sessão de outro tenant → 404 (sem vazar existência); migração pendente → 503 com aviso.
    const status = r.migracaoPendente ? 503 : /não encontrada|não pertence/i.test(r.error ?? '') ? 404 : 400
    return NextResponse.json({ error: r.error, migracaoPendente: r.migracaoPendente }, { status })
  }
  revalidatePath('/admin/relatorios/simulados')
  revalidatePath('/admin/estudantes/[id]/simulado/[simuladoId]', 'page')
  return NextResponse.json(r)
}
