import { NextRequest, NextResponse } from 'next/server'
import { getCurrentAccess, accessCan } from '@/lib/auth/permissions'
import { createAdminClient } from '@/lib/supabase/server'
import { desfazerPU, historicoPU, ignorarPU, limparCachePU, listarGruposPU, listarPastasPU, mesclarPU, previaPU } from '@/lib/admin-revisao/biblioteca-pastas-unificar'

export const dynamic = 'force-dynamic'
const HEX16 = /^[0-9a-f]{16}$/
const num = (v: string | null, d: number) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.floor(n) : d }
const cat = (v: unknown) => (v === 'jurisclub' ? 'jurisclub' : 'conteudo') as 'conteudo' | 'jurisclub'

// BIBLIOTECA › CONTEÚDOS › UNIFICAR DISCIPLINAS (pastas-disciplina) — leitura e mutações por ROTA DE API (server actions podem ser rejeitadas em domínio custom).
// GET  = configuracoes:view. s = grupos | pastas | historico. `fresh=1` ignora o cache de 2 min.
// POST = previa (configuracoes:view, não grava) · mesclar · ignorar · desfazer (configuracoes:update). Unificar também a disciplina da taxonomia exige questoes:update.
// Toda mutação audita (registrarAudit, com o estado anterior) e invalida a árvore da Biblioteca.
export async function GET(req: NextRequest) {
  const access = await getCurrentAccess()
  if (!access.tenantId || !accessCan(access, 'configuracoes:view')) return NextResponse.json({ ok: false, error: 'sem_permissao' }, { status: 403 })
  const tenantId = access.tenantId
  const sp = new URL(req.url).searchParams
  const svc = createAdminClient()
  const fresh = sp.get('fresh') === '1'
  if (fresh) limparCachePU(tenantId)
  const s = sp.get('s') ?? ''
  const categoria = cat(sp.get('categoria'))
  try {
    if (s === 'grupos') {
      const ign = (sp.get('ign') ?? '').split(',').map((x) => x.trim()).filter((x) => HEX16.test(x)).slice(0, 400)
      return NextResponse.json(await listarGruposPU(svc, tenantId, {
        categoria, limiar: Number(sp.get('limiar')) || 0.85, confianca: ['alta', 'media', 'baixa'].includes(sp.get('confianca') ?? '') ? sp.get('confianca')! : undefined, q: sp.get('q') ?? '',
        sort: sp.get('sort') ?? undefined, dir: sp.get('dir') === 'asc' ? 'asc' : 'desc', page: num(sp.get('page'), 1), pp: num(sp.get('pp'), 20), verIgnorados: sp.get('ignorados') === '1', ign, fresh,
      }))
    }
    if (s === 'pastas') return NextResponse.json(await listarPastasPU(svc, tenantId, { categoria, q: sp.get('q') ?? '', page: num(sp.get('page'), 1), pp: num(sp.get('pp'), 30), fresh }))
    if (s === 'historico') return NextResponse.json(await historicoPU(svc, tenantId))
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'Falha ao carregar.' }, { status: 500 })
  }
  return NextResponse.json({ ok: false, error: 'Seção inválida.' }, { status: 400 })
}

export async function POST(req: NextRequest) {
  const access = await getCurrentAccess()
  if (!access.tenantId) return NextResponse.json({ ok: false, error: 'Tenant não resolvido.' }, { status: 400 })
  const tenantId = access.tenantId
  const b = await req.json().catch(() => ({}))
  const acao = String(b?.acao ?? '')
  const svc = createAdminClient()
  const ator = { tenantId, userId: access.userId ?? null }
  const podeTaxonomia = accessCan(access, 'questoes:update')
  try {
    if (acao === 'previa') {
      if (!accessCan(access, 'configuracoes:view')) return NextResponse.json({ ok: false, error: 'Sem permissão.' }, { status: 403 })
      return NextResponse.json(await previaPU(svc, tenantId, b, podeTaxonomia))
    }
    if (!accessCan(access, 'configuracoes:update')) return NextResponse.json({ ok: false, error: 'Você não tem permissão para editar a Biblioteca.' }, { status: 403 })
    let r: { ok: boolean; error?: string; [k: string]: any }
    switch (acao) {
      case 'mesclar': r = await mesclarPU(svc, ator, b, podeTaxonomia); break
      case 'ignorar': r = await ignorarPU(svc, ator, String(b.grupoId ?? ''), Array.isArray(b.nomes) ? b.nomes.map(String) : [], b.desfazer === true); break
      case 'desfazer': r = await desfazerPU(svc, ator, String(b.id ?? '')); break
      default: return NextResponse.json({ ok: false, error: 'Ação inválida.' }, { status: 400 })
    }
    return NextResponse.json(r, { status: r.ok || r.semTabela ? 200 : 400 })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'Falha ao executar.' }, { status: 500 })
  }
}
