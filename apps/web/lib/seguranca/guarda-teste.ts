import { NextResponse } from 'next/server'
import { isSuperAdmin } from '@/lib/auth/permissions'

/**
 * Trava das rotas /api/teste/* que são só de laboratório/seed.
 * Em produção: 404, a menos que TESTE_API_ATIVA==='1' (ou o legado HABILITAR_ROTAS_TESTE==='1') E o chamador seja super-admin autenticado.
 * Fora de produção: liberado (dev local).
 * Uso: const bloqueio = await guardaTeste(); if (bloqueio) return bloqueio
 */
export async function guardaTeste(): Promise<NextResponse | null> {
  if (process.env.NODE_ENV !== 'production') return null
  const nao = () => new NextResponse(null, { status: 404 })
  if (process.env.TESTE_API_ATIVA !== '1' && process.env.HABILITAR_ROTAS_TESTE !== '1') return nao()
  if (!(await isSuperAdmin())) return nao()
  return null
}
