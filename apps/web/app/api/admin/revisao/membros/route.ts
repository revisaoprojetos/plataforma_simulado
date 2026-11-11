import { NextRequest, NextResponse } from 'next/server'
import { getCurrentAccess, accessCan } from '@/lib/auth/permissions'
import { membrosContagens, membrosLista, NADA } from '@/lib/admin-revisao/cs'
import { MEMBROS_FILTROS, type MembrosFiltro } from '@/lib/admin-revisao/cs-tipos'
import { adicionarMembroAction, importarListaAction } from '@/app/admin/revisao/membros/actions'

export const dynamic = 'force-dynamic'
const PP = [5, 10, 14, 25, 50]

// CS › Membros — LISTA por rota de API (paginação/abas/busca sem navegação completa; server actions podem ser
// rejeitadas em domínio custom). GET = leitura (estudantes:view). POST = adicionar/importar (checkPermission nas actions).
export async function GET(req: NextRequest) {
  const access = await getCurrentAccess()
  if (!accessCan(access, 'estudantes:view')) return NextResponse.json({ error: 'sem_permissao' }, { status: 403 })
  const tenantId = access.tenantId ?? NADA
  const sp = new URL(req.url).searchParams
  const f = (MEMBROS_FILTROS as string[]).includes(sp.get('f') ?? '') ? (sp.get('f') as MembrosFiltro) : 'todos'
  const pp = PP.includes(Number(sp.get('pp'))) ? Number(sp.get('pp')) : 14
  const page = Math.max(1, Number(sp.get('page')) || 1)
  const contagens = await membrosContagens(tenantId) // em cache (120 s)
  const hint = contagens.migrado ? ({ todos: contagens.total + contagens.bloqueados, ativos: contagens.ativos, risco: contagens.risco, bloq: contagens.bloqueados } as Record<MembrosFiltro, number>)[f] : undefined
  const lista = await membrosLista(tenantId, { f, q: (sp.get('q') ?? '').trim(), sort: sp.get('sort') ?? '', dir: sp.get('dir') === 'asc' ? 'asc' : 'desc', page, pp, totalHint: hint })
  return NextResponse.json({ rows: lista.rows, total: lista.total, migrado: lista.migrado, contagens, page, pp, f })
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}))
  if (b?.acao === 'adicionar') return NextResponse.json(await adicionarMembroAction({ nome: b.nome, email: b.email, grupoId: b.grupoId || null }))
  if (b?.acao === 'importar') return NextResponse.json(await importarListaAction({ texto: b.texto, grupoId: b.grupoId }))
  return NextResponse.json({ ok: false, error: 'Ação inválida.' }, { status: 400 })
}
