import 'server-only'
import { NextResponse } from 'next/server'
import { getCurrentAccess, isSuperAdmin } from '@/lib/auth/permissions'
import { getCurrentTenantId } from '@/lib/tenant'
import { tokenDaRequest, validarTokenOO, type EscopoOO } from './token-onlyoffice'

const negar = () => new NextResponse(null, { status: 404 })

/**
 * Guarda das rotas /api/teste/* usadas pelo OnlyOffice/Collabora/plugin.
 * Passa se: (a) token HMAC válido para o docId (e escopo) — chamadas servidor-a-servidor/iframe sem cookie;
 * ou (b) sessão admin (cookie) — chamadas feitas pelo painel. Senão 404 genérico.
 * Sem `docId` (rotas do plugin) o token vale por tenant: exige que o tenant do token == tenant do host.
 */
export async function exigirAcessoOO(req: Request, opts: { docId?: string; escopo: EscopoOO }): Promise<NextResponse | null> {
  const p = validarTokenOO(tokenDaRequest(req), { docId: opts.docId, escopo: opts.escopo })
  if (p) {
    if (opts.docId !== undefined || !p.tenantId) return null
    const t = await getCurrentTenantId().catch(() => null)
    if (t && t === p.tenantId) return null
    return negar()
  }
  try {
    const a = await getCurrentAccess()
    // rotas por docId (.teste-docs é global, sem tenant) => só super-admin; rotas do plugin => admin do tenant
    if (await isSuperAdmin()) return null
    if (opts.docId === undefined && a.isAdmin) return null
  } catch { /* sem sessão */ }
  return negar()
}
