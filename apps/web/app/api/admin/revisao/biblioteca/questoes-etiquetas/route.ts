import { NextRequest, NextResponse } from 'next/server'
import { getCurrentAccess, accessCan } from '@/lib/auth/permissions'
import { createAdminClient } from '@/lib/supabase/server'
import { limparCacheQuestoes } from '@/lib/admin-revisao/biblioteca-questoes'
import {
  candidatasSemEtiqueta, detalheEtiqueta, limparCacheEtiquetas, listarEtiquetasQ, massaEtiqueta, mesclarVarias, nomeEmUso, previaExcluir, previaMesclar,
} from '@/lib/admin-revisao/questoes-etiquetas'
import type { FiltroEtiquetas, OrdemEtiquetas } from '@/lib/admin-revisao/questoes-etiquetas-tipos'
import { atualizarEtiqueta, criarEtiqueta, excluirEtiqueta } from '@/app/admin/etiquetas/actions'

export const dynamic = 'force-dynamic'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_ORIGENS = 20
const MAX_MASSA = 200
const csv = (v: string | null) => (v ?? '').split(',').map((x) => x.trim()).filter((x) => UUID.test(x))
const num = (v: string | null, d: number) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.floor(n) : d }
const FILTROS = ['', 'sem_uso', 'mais_usadas', 'duplicadas', 'funcao']
const ORDENS = ['nome', 'questoes', 'simulados', 'ultimo', 'criada']

// BIBLIOTECA > QUESTOES > ETIQUETAS. Leituras e ações por ROTA DE API (server actions podem ser rejeitadas em domínio custom).
// GET = questoes:view; POST = questoes:update. Criar/renomear/excluir REUSAM as actions de /admin/etiquetas (permissão + auditoria lá);
// mesclar e aplicar/remover em massa auditam aqui. Toda mutação limpa os caches (servidor e o do Banco).
export async function GET(req: NextRequest) {
  const access = await getCurrentAccess()
  if (!accessCan(access, 'questoes:view') || !access.tenantId) return NextResponse.json({ ok: false, error: 'sem_permissao' }, { status: 403 })
  const tenantId = access.tenantId
  const sp = new URL(req.url).searchParams
  const svc = createAdminClient()
  const fresh = sp.get('fresh') === '1'
  try {
    const s = sp.get('s') ?? 'lista'
    if (s === 'lista') {
      const filtro = (FILTROS.includes(sp.get('filtro') ?? '') ? sp.get('filtro') : '') as FiltroEtiquetas
      const sort = ORDENS.includes(sp.get('sort') ?? '') ? (sp.get('sort') as OrdemEtiquetas) : undefined
      return NextResponse.json({ ok: true, ...(await listarEtiquetasQ(svc, tenantId, { q: sp.get('q') ?? '', filtro, sort, dir: sp.get('dir') === 'asc' ? 'asc' : sp.get('dir') === 'desc' ? 'desc' : undefined, page: num(sp.get('page'), 1), pp: num(sp.get('pp'), 14), fresh })) })
    }
    const id = sp.get('id') ?? ''
    if (s === 'detalhe') {
      if (!UUID.test(id)) return NextResponse.json({ ok: false, error: 'Etiqueta inválida.' }, { status: 400 })
      return NextResponse.json({ ok: true, ...(await detalheEtiqueta(svc, tenantId, id, fresh)) })
    }
    if (s === 'candidatas') {
      if (!UUID.test(id)) return NextResponse.json({ ok: false, error: 'Etiqueta inválida.' }, { status: 400 })
      const r = await candidatasSemEtiqueta(svc, tenantId, id, { daEtiqueta: sp.get('mesma') === '1', q: sp.get('q') ?? '' })
      return r ? NextResponse.json({ ok: true, ...r }) : NextResponse.json({ ok: false, error: 'Consulta indisponível.' }, { status: 503 })
    }
    if (s === 'previa_excluir') {
      if (!UUID.test(id)) return NextResponse.json({ ok: false, error: 'Etiqueta inválida.' }, { status: 400 })
      const p = await previaExcluir(svc, tenantId, id)
      return p ? NextResponse.json({ ok: true, ...p }) : NextResponse.json({ ok: false, error: 'Etiqueta não encontrada.' }, { status: 404 })
    }
    if (s === 'previa_mesclar') {
      const origens = csv(sp.get('origens')), destino = sp.get('destino') ?? ''
      if (!origens.length || !UUID.test(destino) || origens.includes(destino)) return NextResponse.json({ ok: false, error: 'Escolha o destino entre as selecionadas.' }, { status: 400 })
      const p = await previaMesclar(svc, tenantId, origens, destino)
      return p ? NextResponse.json({ ok: true, ...p }) : NextResponse.json({ ok: false, error: 'Não foi possível calcular a prévia.' }, { status: 503 })
    }
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'Falha ao carregar.' }, { status: 500 })
  }
  return NextResponse.json({ ok: false, error: 'Seção inválida.' }, { status: 400 })
}

export async function POST(req: NextRequest) {
  const access = await getCurrentAccess()
  if (!access.tenantId) return NextResponse.json({ ok: false, error: 'Tenant não resolvido.' }, { status: 400 })
  if (!accessCan(access, 'questoes:update')) return NextResponse.json({ ok: false, error: 'Você não tem permissão para editar questões.' }, { status: 403 })
  const tenantId = access.tenantId
  const b = await req.json().catch(() => ({}))
  const svc = createAdminClient()
  const ator = { tenantId, userId: access.userId ?? null }
  const fim = (r: { ok: boolean; error?: string; [k: string]: any }) => {
    limparCacheEtiquetas(tenantId); limparCacheQuestoes(tenantId)
    return NextResponse.json(r, { status: r.ok ? 200 : r.error === 'Sem permissão.' ? 403 : 400 })
  }
  const bad = (error: string) => NextResponse.json({ ok: false, error }, { status: 400 })
  try {
    switch (String(b?.acao ?? '')) {
      case 'criar': {
        const nome = String(b.nome ?? '').trim().slice(0, 60); if (!nome) return bad('Informe um nome.')
        const dup = await nomeEmUso(svc, tenantId, nome); if (dup) return bad(`Já existe a etiqueta “${dup}” (nomes são comparados sem acento e sem diferença de maiúsculas).`)
        return fim(await criarEtiqueta(nome, String(b.cor ?? ''), b.funcao ?? null))
      }
      case 'atualizar': {
        const id = String(b.id ?? ''); if (!UUID.test(id)) return bad('Etiqueta inválida.')
        const nome = String(b.nome ?? '').trim().slice(0, 60); if (!nome) return bad('Informe um nome.')
        const dup = await nomeEmUso(svc, tenantId, nome, id); if (dup) return bad(`Já existe a etiqueta “${dup}” (nomes são comparados sem acento e sem diferença de maiúsculas).`)
        return fim(await atualizarEtiqueta(id, nome, String(b.cor ?? ''), b.funcao ?? null))
      }
      case 'excluir': {
        const id = String(b.id ?? ''); if (!UUID.test(id)) return bad('Etiqueta inválida.')
        return fim(await excluirEtiqueta(id))
      }
      case 'mesclar': {
        const origens: string[] = Array.isArray(b.origemIds) ? b.origemIds.filter((x: unknown): x is string => typeof x === 'string') : []
        if (origens.length > MAX_ORIGENS) return bad(`Máximo de ${MAX_ORIGENS} etiquetas por vez.`)
        return fim(await mesclarVarias(svc, ator, origens, String(b.destinoId ?? '')))
      }
      case 'massa': {
        const ids: string[] = Array.isArray(b.ids) ? b.ids.filter((x: unknown): x is string => typeof x === 'string' && UUID.test(x)) : []
        if (!ids.length) return bad('Selecione ao menos uma questão.')
        if (ids.length > MAX_MASSA) return bad(`Máximo de ${MAX_MASSA} questões por vez.`)
        return fim(await massaEtiqueta(svc, ator, String(b.etiquetaId ?? ''), ids, b.modo === 'remover'))
      }
    }
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'Falha ao executar.' }, { status: 500 })
  }
  return bad('Ação inválida.')
}
