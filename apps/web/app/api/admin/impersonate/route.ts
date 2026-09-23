import { NextResponse, type NextRequest } from 'next/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { getImpersonationPermission } from '@/lib/impersonation/permissions'
import { criarSessaoImpersonation } from '@/lib/impersonation/session'
import { abrirLogImpersonation } from '@/lib/impersonation/logs'
import { getModoNotificacao, notificarImpersonacaoSeNecessario } from '@/lib/impersonation/notification'
import { checarRateLimit } from '@/lib/impersonation/ratelimit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TTL = Number(process.env.IMPERSONATION_TOKEN_TTL_SECONDS ?? 1800)
const RATE = Number(process.env.IMPERSONATION_RATE_LIMIT_PER_HOUR ?? 20)
const REAUTH_H = Number(process.env.IMPERSONATION_REQUIRE_REAUTH_AFTER_HOURS ?? 4)

// E2/E10 — inicia a visualização do aluno: valida permissão + escopo + reauth + rate limit,
// abre o log (E5), emite o JWT no cookie `aluno_impersonation` (read_only no MVP) e, se o tenant
// exigir, notifica o aluno (E7).
export async function POST(req: NextRequest) {
  const access = await getCurrentAccess()
  if (!access.userId || !access.tenantId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const perm = await getImpersonationPermission(access)
  if (!perm) return NextResponse.json({ error: 'no_permission' }, { status: 403 })

  // Reauth (E10): sessão do admin velha demais → exige novo login (compliance). Best-effort.
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const last = user?.last_sign_in_at ? new Date(user.last_sign_in_at).getTime() : null
    if (last && Date.now() - last > REAUTH_H * 3_600_000) {
      return NextResponse.json({ error: 'reauth_required' }, { status: 401 })
    }
  } catch { /* sem info de login → não bloqueia */ }

  // Rate limit (E10) por admin.
  const rl = checarRateLimit(access.userId, RATE)
  if (!rl.ok) return NextResponse.json({ error: 'rate_limited', retry_after: rl.retryAfter }, { status: 429 })

  const body = await req.json().catch(() => ({}))
  const studentId = String((body as { student_id?: string })?.student_id ?? '')
  if (!studentId) return NextResponse.json({ error: 'student_id_obrigatorio' }, { status: 400 })

  // Tenant com visualização desligada (E7).
  if ((await getModoNotificacao(access.tenantId)) === 'disabled') {
    return NextResponse.json({ error: 'impersonation_disabled' }, { status: 403 })
  }

  // Aluno + verificação de ESCOPO (own_tenant só vê o próprio tenant; all_tenants = super_admin).
  const svc = createAdminClient()
  const { data: est } = await svc.from('simulado_estudantes').select('id, nome, tenant_id').eq('id', studentId).maybeSingle()
  if (!est) return NextResponse.json({ error: 'student_not_found' }, { status: 404 })
  if (perm.scope !== 'all_tenants' && (est as any).tenant_id !== access.tenantId) {
    return NextResponse.json({ error: 'out_of_scope' }, { status: 403 })
  }
  const tenantAlvo = (est as any).tenant_id as string

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? req.headers.get('x-real-ip') ?? null
  const sessionId =
    (await abrirLogImpersonation({ tenantId: tenantAlvo, adminId: access.userId, estudanteId: (est as any).id, scope: perm.scope, actionLevel: perm.action_level, ip }))
    ?? crypto.randomUUID() // log dormente (tabela não aplicada) → ainda gera um id p/ a sessão

  const { expiresAt } = await criarSessaoImpersonation({
    sub: (est as any).id, tenantId: tenantAlvo, nome: (est as any).nome ?? 'Aluno', impersonation: true,
    impersonated_by: access.userId, session_id: sessionId, scope: perm.scope, action_level: perm.action_level,
  }, TTL)

  await notificarImpersonacaoSeNecessario(tenantAlvo, (est as any).id)

  return NextResponse.json({
    session_id: sessionId,
    expires_at: expiresAt,
    student: { id: (est as any).id, name: (est as any).nome },
    action_level: perm.action_level,
  }, { status: 201 })
}
