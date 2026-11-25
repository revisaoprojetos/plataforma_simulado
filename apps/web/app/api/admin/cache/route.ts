import { NextRequest, NextResponse } from 'next/server'
import { getCurrentAccess, accessCan, isSuperAdmin } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { rateLimit } from '@/lib/rate-limit'
import { infoRedisCache, listarGruposCache, listarGruposMemoria, limparCache } from '@/lib/cache/limpeza'
import { prefixoValido } from '@/lib/cache/limpeza-puro'
import { remember, chaveRelatorio } from '@/lib/cache/relatorio-cache'
import { diagnosticoBanco } from '@/lib/admin/banco-saude'
import { funcaoPurgaValida } from '@/lib/admin/banco-puro'
import { createAdminClient } from '@/lib/supabase/server'
import { recursoAusente, marcarSeAusente } from '@/lib/db/recurso-ausente'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/** GET /api/admin/cache — resumo do Redis de cache + grupos de chaves do tenant atual (configuracoes:view). */
export async function GET(req: NextRequest) {
  const access = await getCurrentAccess()
  if (!access.userId || !access.tenantId || !accessCan(access, 'configuracoes:view')) return NextResponse.json({ message: 'Sem permissão.' }, { status: 403 })
  if (req.nextUrl.searchParams.get('secao') === 'banco') {
    if (!(await isSuperAdmin())) return NextResponse.json({ message: 'Somente super-admin.' }, { status: 403 })
    const fresco = req.nextUrl.searchParams.get('fresh') === '1'
    const dados = fresco ? await diagnosticoBanco() : await remember(chaveRelatorio(null, 'banco-saude'), 30, () => diagnosticoBanco())
    return NextResponse.json(dados)
  }
  const [redis, lista] = await Promise.all([infoRedisCache(), listarGruposCache(access.tenantId)])
  return NextResponse.json({ redis, grupos: lista.grupos, varridas: lista.varridas, truncado: lista.truncado, disponivel: redis.disponivel, memoria: listarGruposMemoria(access.tenantId) })
}

/** POST /api/admin/cache — { prefixo?, escopo:'tenant'|'todos', dryRun? }. Tenant: configuracoes:manage. Todos: só super-admin. */
export async function POST(req: NextRequest) {
  const access = await getCurrentAccess()
  if (!access.userId || !access.tenantId || !accessCan(access, 'configuracoes:manage')) return NextResponse.json({ message: 'Sem permissão.' }, { status: 403 })
  const body = await req.json().catch(() => ({})) as { prefixo?: string; escopo?: string; dryRun?: boolean; origem?: string; acao?: string; funcao?: string }
  if (body.acao === 'purgar') {
    if (!(await isSuperAdmin())) return NextResponse.json({ message: 'Somente super-admin.' }, { status: 403 })
    if (!funcaoPurgaValida(body.funcao)) return NextResponse.json({ message: 'Função inválida.' }, { status: 400 })
    const fn = body.funcao
    if (recursoAusente('rpc:' + fn)) return NextResponse.json({ message: 'Função não instalada, aplique a migração 20261204000100.' }, { status: 409 })
    const rl = await rateLimit('banco-purgar:' + access.userId, 1, 30_000)
    if (!rl.ok) return NextResponse.json({ message: 'Aguarde ' + rl.retryAfter + 's para novo lote.' }, { status: 429 })
    const { data, error } = await createAdminClient().rpc(fn, { p_lote: 2000 })
    if (error) {
      if (marcarSeAusente('rpc:' + fn, error.message)) return NextResponse.json({ message: 'Função não instalada, aplique a migração 20261204000100.' }, { status: 409 })
      return NextResponse.json({ message: error.message }, { status: 500 })
    }
    const removidas = Number(data ?? 0)
    await registrarAudit({ operacao: 'DELETE', entidade: 'banco_retencao', entidadeId: null, metodo: 'POST', depois: { funcao: fn, lote: 2000, removidas } }).catch(() => {})
    return NextResponse.json({ ok: true, funcao: fn, removidas })
  }
  const escopo = body.escopo === 'todos' ? 'todos' : 'tenant'
  const prefixo = typeof body.prefixo === 'string' && body.prefixo.trim() ? body.prefixo.trim() : null
  const dryRun = body.dryRun === true
  const origem = body.origem === 'memoria' ? 'memoria' : 'redis'
  if (!prefixoValido(prefixo)) return NextResponse.json({ message: 'Prefixo inválido.' }, { status: 400 })
  if (escopo === 'todos' && !(await isSuperAdmin())) return NextResponse.json({ message: 'Somente super-admin pode limpar o cache de todos os tenants.' }, { status: 403 })

  if (!dryRun) {
    const rl = await rateLimit(`cache-limpar:${access.userId}`, 1, 30_000)
    if (!rl.ok) return NextResponse.json({ message: `Aguarde ${rl.retryAfter}s para nova limpeza.` }, { status: 429 })
  }

  const r = await limparCache({ tenantId: escopo === 'todos' ? 'todos' : access.tenantId, prefixo, dryRun, origem })
  if (!r.disponivel) return NextResponse.json({ message: 'Redis de cache indisponível.' }, { status: 503 })
  if (!dryRun) {
    await registrarAudit({
      operacao: 'DELETE', entidade: 'cache_redis', entidadeId: null, metodo: 'POST',
      depois: { origem, escopo, prefixo, removidas: r.removidas, varridas: r.varridas },
    }).catch(() => {})
  }
  return NextResponse.json({ ok: true, dryRun, escopo, prefixo, removidas: r.removidas, varridas: r.varridas, origem })
}
