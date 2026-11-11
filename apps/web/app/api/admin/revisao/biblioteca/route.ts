import { NextRequest, NextResponse } from 'next/server'
import { getCurrentAccess, accessCan } from '@/lib/auth/permissions'
import { resumoComBanco, totalBanco } from '@/lib/admin-revisao/biblioteca-questoes'
import { createAdminClient } from '@/lib/supabase/server'
import type { RespostaBib } from '@/lib/admin-revisao/biblioteca-tipos'
import { listarBaralhosAba, listarSimuladosAba } from '@/lib/admin-revisao/biblioteca'
import { arvoreBiblioteca, limparCacheGestao, listarGestao, opcoesFiltros, resumoEmCache, estadoDeParams } from '@/lib/admin-revisao/biblioteca-gestao'

export const dynamic = 'force-dynamic'

// BIBLIOTECA (gestão) — leitura por rota de API: troca de aba/pasta/página/ordem sem navegação completa (server actions podem
// ser rejeitadas em domínio custom). GET = configuracoes:view. `tree=1` inclui a árvore de pastas e as opções dos filtros;
// `fresh=1` limpa os caches de 30 s (usado após criar/mover/renomear/excluir).
export async function GET(req: NextRequest) {
  const access = await getCurrentAccess()
  if (!accessCan(access, 'configuracoes:view') || !access.tenantId) return NextResponse.json({ error: 'sem_permissao' }, { status: 403 })
  const tenantId = access.tenantId
  const sp = new URL(req.url).searchParams
  const e = estadoDeParams(sp)
  const svc = createAdminClient()
  if (sp.get('fresh') === '1') limparCacheGestao(tenantId)
  const ehDoc = !['flashcards', 'simulados'].includes(e.aba)
  const q = { q: e.q, pagina: e.page, porPagina: e.pp }
  const comArvore = ehDoc && sp.get('tree') === '1'
  const [resumoDocs, lista, baralhos, simulados, arvore, opcoes, totalQ] = await Promise.all([
    resumoEmCache(svc, tenantId),
    ehDoc ? listarGestao(svc, tenantId, e) : null,
    e.aba === 'flashcards' ? listarBaralhosAba(svc, tenantId, q) : null,
    e.aba === 'simulados' ? listarSimuladosAba(svc, tenantId, q) : null,
    comArvore ? arvoreBiblioteca(svc, tenantId, e.aba) : undefined,
    comArvore ? opcoesFiltros(svc, tenantId, e.aba) : undefined,
    accessCan(access, 'questoes:view') ? totalBanco(svc, tenantId) : null,
  ])
  const resumo = totalQ !== null ? resumoComBanco(resumoDocs, totalQ) : resumoDocs
  const body: RespostaBib = {
    aba: e.aba, page: e.page, pp: e.pp,
    total: lista?.total ?? baralhos?.total ?? simulados?.total ?? 0,
    rows: lista?.rows ?? [], baralhos: baralhos?.rows ?? null, simulados: simulados?.rows ?? null,
    arvore, opcoes, resumo, aviso: baralhos?.aviso, degradado: lista?.degradado,
  }
  return NextResponse.json(body)
}
