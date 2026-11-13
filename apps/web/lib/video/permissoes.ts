import 'server-only'
import { NextResponse } from 'next/server'
import { getCurrentAccess, accessCan } from '@/lib/auth/permissions'
import { cronAutorizado as cronAutorizadoUnico } from '@/lib/seguranca/cron-auth'
import { PERM_VIDEO_MANAGE, PERM_VIDEO_VIEW } from './tipos'

export { PERM_VIDEO_MANAGE, PERM_VIDEO_VIEW }

/**
 * Gate das rotas ADMIN do vídeo. NÃO basta `tenantId` (vem do host mesmo sem login — ver memória
 * authz-server-actions-audit): exige `userId` + permissão. `video:manage` implica `video:view`.
 * Admin/super-admin passam por `accessCan` (isAdmin/'*').
 */
export async function guardAdminVideo(
  nivel: 'view' | 'manage',
): Promise<{ ok: true; tenantId: string; userId: string } | { ok: false; res: NextResponse }> {
  const access = await getCurrentAccess()
  if (!access.userId) return { ok: false, res: NextResponse.json({ message: 'Não autenticado.' }, { status: 401 }) }
  if (!access.tenantId) return { ok: false, res: NextResponse.json({ message: 'Plataforma não identificada.' }, { status: 400 }) }
  const permitido =
    accessCan(access, PERM_VIDEO_MANAGE) || (nivel === 'view' && accessCan(access, PERM_VIDEO_VIEW))
  if (!permitido) return { ok: false, res: NextResponse.json({ message: 'Sem permissão.' }, { status: 403 }) }
  return { ok: true, tenantId: access.tenantId, userId: access.userId }
}

/** Segredo de cron/worker (mesmo padrão de /api/cron/*). */
export function cronAutorizado(req: Request): boolean {
  return cronAutorizadoUnico(req)
}
