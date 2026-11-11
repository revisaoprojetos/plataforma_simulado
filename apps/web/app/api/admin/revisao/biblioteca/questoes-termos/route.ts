import { NextRequest, NextResponse } from 'next/server'
import { getCurrentAccess, accessCan } from '@/lib/auth/permissions'
import { createAdminClient } from '@/lib/supabase/server'
import { ehTipoTermo } from '@/lib/admin-revisao/questoes-termos-tipos'
import {
  aplicarNormalizacao, desfazerMescla, exemplosDoTermo, historico, ignorarGrupo, limparCacheTermos, listarAnos, listarGrupos, mesclarTermos, previaMescla, propostasNormalizacao, resumosTodosTipos,
} from '@/lib/admin-revisao/questoes-termos'

export const dynamic = 'force-dynamic'
const HEX16 = /^[0-9a-f]{16}$/
const num = (v: string | null, d: number) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.floor(n) : d }

// BIBLIOTECA › QUESTÕES › UNIFICAR › TERMOS DA TAXONOMIA — leitura e mutações por ROTA DE API (server actions podem ser rejeitadas em domínio custom).
// GET  = questoes:view. s = resumos | grupos | anos | exemplos | norm | historico. `fresh=1` ignora o cache de 5 min.
// POST = previa (questoes:view, não grava) · mesclar · ignorar · normalizar · desfazer (questoes:update). Toda mutação audita e invalida caches.
export async function GET(req: NextRequest) {
  const access = await getCurrentAccess()
  if (!access.tenantId || !accessCan(access, 'questoes:view')) return NextResponse.json({ ok: false, error: 'sem_permissao' }, { status: 403 })
  const tenantId = access.tenantId
  const sp = new URL(req.url).searchParams
  const svc = createAdminClient()
  const fresh = sp.get('fresh') === '1'
  if (fresh) limparCacheTermos(tenantId)
  const s = sp.get('s') ?? ''
  const tipo = sp.get('tipo')
  const ign = (sp.get('ign') ?? '').split(',').map((x) => x.trim()).filter((x) => HEX16.test(x)).slice(0, 400)
  const limiar = Number(sp.get('limiar')) || 0.85
  try {
    if (s === 'resumos') {
      const m: Record<string, string[]> = {}
      for (const par of (sp.get('ignt') ?? '').split(',')) { const [t, k] = par.split(':'); if (t && HEX16.test(k ?? '')) (m[t] ??= []).push(k) }
      return NextResponse.json(await resumosTodosTipos(svc, tenantId, limiar, m, fresh))
    }
    if (s === 'historico') return NextResponse.json(await historico(svc, tenantId))
    if (!ehTipoTermo(tipo)) return NextResponse.json({ ok: false, error: 'Tipo inválido.' }, { status: 400 })
    if (s === 'grupos') {
      return NextResponse.json(await listarGrupos(svc, tenantId, tipo, {
        limiar, confianca: ['alta', 'media', 'baixa'].includes(sp.get('confianca') ?? '') ? sp.get('confianca')! : undefined, q: sp.get('q') ?? '',
        sort: sp.get('sort') ?? undefined, dir: sp.get('dir') === 'asc' ? 'asc' : 'desc', page: num(sp.get('page'), 1), pp: num(sp.get('pp'), 20), verIgnorados: sp.get('ignorados') === '1', ign, fresh,
      }))
    }
    if (s === 'anos') return NextResponse.json(await listarAnos(tenantId))
    if (s === 'exemplos') return NextResponse.json({ ok: true, exemplos: await exemplosDoTermo(svc, tenantId, tipo, sp.get('id') ?? '', 3) })
    if (s === 'norm') return NextResponse.json(await propostasNormalizacao(svc, tenantId, tipo, { q: sp.get('q') ?? '', page: num(sp.get('page'), 1), pp: num(sp.get('pp'), 20), fresh }))
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
  const tipo = b.tipo
  if (acao !== 'desfazer' && !ehTipoTermo(tipo)) return NextResponse.json({ ok: false, error: 'Tipo inválido.' }, { status: 400 })
  try {
    if (acao === 'previa') {
      if (!accessCan(access, 'questoes:view')) return NextResponse.json({ ok: false, error: 'Sem permissão.' }, { status: 403 })
      return NextResponse.json(await previaMescla(svc, tenantId, tipo, String(b.canonicaId ?? ''), b.dupIds, b.nomeFinal))
    }
    if (!accessCan(access, 'questoes:update')) return NextResponse.json({ ok: false, error: 'Você não tem permissão para editar questões.' }, { status: 403 })
    let r: { ok: boolean; error?: string; [k: string]: any }
    switch (acao) {
      case 'mesclar': r = await mesclarTermos(svc, ator, tipo, String(b.canonicaId ?? ''), b.dupIds, b.nomeFinal); break
      case 'ignorar': r = await ignorarGrupo(svc, ator, tipo, String(b.grupoId ?? ''), Array.isArray(b.nomes) ? b.nomes.map(String) : [], b.desfazer === true); break
      case 'normalizar': r = await aplicarNormalizacao(svc, ator, tipo, b.valores); break
      case 'desfazer': r = await desfazerMescla(svc, ator, String(b.id ?? '')); break
      default: return NextResponse.json({ ok: false, error: 'Ação inválida.' }, { status: 400 })
    }
    return NextResponse.json(r, { status: r.ok || r.semTabela ? 200 : 400 })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'Falha ao executar.' }, { status: 500 })
  }
}
