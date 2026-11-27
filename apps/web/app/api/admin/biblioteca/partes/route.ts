import { NextRequest, NextResponse } from 'next/server'
import { checkPermission } from '@/lib/auth/permissions'
import { getCurrentTenantId } from '@/lib/tenant'
import { resolverAtorAudit } from '@/lib/audit'
import { listarPartes, criarParte, atualizarParte, arquivarParte, type Falha, type PatchParte } from '@/lib/conteudo/partes-server'

// Partes de documento da Biblioteca. API de rota (NÃO server action — rejeitadas em domínio custom).
//   GET    ?documentoId=…[&arquivadas=1][&status=0]     lista (com status de resolução + medida + metas em uso)
//   POST   {documentoId, nome, iniUid, fimUid, rotuloIni?, rotuloFim?, ordem?}
//   PATCH  {id, nome?, ordem?, iniUid?, fimUid?, rotuloIni?, rotuloFim?, arquivada?}
//   DELETE ?id=… (ou body {id})                         ARQUIVA (nunca apaga); devolve metasEmUso p/ o aviso
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }
const json = (status: number, body: unknown) => NextResponse.json(body, { status, headers: NO_STORE })
const STATUS: Record<Falha['codigo'], number> = { tabela_ausente: 503, nao_encontrado: 404, invalido: 400, conflito: 409, erro: 500 }
const falha = (f: Falha) => json(STATUS[f.codigo], { ok: false, error: f.error, codigo: f.codigo, ...(f.erros ? { erros: f.erros } : {}) })
const str = (v: unknown) => (typeof v === 'string' ? v : undefined)

async function ctx(perm: 'configuracoes:view' | 'configuracoes:update') {
  if (!(await checkPermission(perm))) return { erro: json(403, { ok: false, error: 'Sem permissão.' }) }
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return { erro: json(400, { ok: false, error: 'Tenant não resolvido.' }) }
  return { tenantId }
}

export async function GET(req: NextRequest) {
  const c = await ctx('configuracoes:view'); if ('erro' in c) return c.erro
  const sp = req.nextUrl.searchParams
  const r = await listarPartes(c.tenantId, sp.get('documentoId') ?? '', { incluirArquivadas: sp.get('arquivadas') === '1', comStatus: sp.get('status') !== '0' })
  if (!r.ok) return falha(r)
  // Sem `page`: resposta completa (compatível com consumidores antigos). Com `page`: busca + ordenação + paginação NO SERVIDOR.
  if (!sp.has('page')) return json(200, r)

  const ativas = r.partes.filter((p) => !p.arquivada)
  const posicao = new Map(ativas.map((p, i) => [p.id, i]))
  const norm = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const q = norm((sp.get('q') ?? '').trim())
  let lista = r.partes
  if (q) lista = lista.filter((p) => norm(`${p.nome} ${p.rotulo_ini ?? ''} ${p.rotulo_fim ?? ''}`).includes(q))

  const sort = sp.get('sort') ?? 'ordem'
  const dir = sp.get('dir') === 'desc' ? -1 : 1
  const chave: Record<string, (p: (typeof lista)[number]) => number | string> = {
    ordem: (p) => (p.arquivada ? 1e9 : 0) + p.ordem,
    nome: (p) => norm(p.nome),
    medida: (p) => p.medida?.palavras ?? -1,
    uso: (p) => p.metasEmUso,
  }
  const f = chave[sort] ?? chave.ordem
  lista = [...lista].sort((a, b) => { const x = f(a), y = f(b); return (x < y ? -1 : x > y ? 1 : 0) * dir })

  const pp = [10, 15, 25].includes(Number(sp.get('pp'))) ? Number(sp.get('pp')) : 10
  const totalPaginas = Math.max(1, Math.ceil(lista.length / pp))
  const page = Math.min(Math.max(1, Number(sp.get('page')) || 1), totalPaginas)
  const fatia = lista.slice((page - 1) * pp, page * pp).map((p) => {
    const i = posicao.get(p.id)
    return { ...p, vizinhoAnteriorId: i != null && i > 0 ? ativas[i - 1].id : null, vizinhoProximoId: i != null && i < ativas.length - 1 ? ativas[i + 1].id : null, posicao: i ?? null }
  })
  return json(200, { ok: true, partes: fatia, total: lista.length, totalGeral: r.partes.length, ativas: ativas.length, page, pp, totalPaginas, versaoId: r.versaoId, totalTrechos: r.totalTrechos })
}

export async function POST(req: NextRequest) {
  const c = await ctx('configuracoes:update'); if ('erro' in c) return c.erro
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!b) return json(400, { ok: false, error: 'Corpo inválido.' })
  const ator = await resolverAtorAudit()
  const r = await criarParte(c.tenantId, ator, str(b.documentoId) ?? '', {
    nome: str(b.nome) ?? '', iniUid: str(b.iniUid) ?? '', fimUid: str(b.fimUid) ?? '',
    rotuloIni: str(b.rotuloIni) ?? null, rotuloFim: str(b.rotuloFim) ?? null,
    ordem: Number.isInteger(b.ordem) ? (b.ordem as number) : undefined,
  })
  return r.ok ? json(201, r) : falha(r)
}

export async function PATCH(req: NextRequest) {
  const c = await ctx('configuracoes:update'); if ('erro' in c) return c.erro
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!b) return json(400, { ok: false, error: 'Corpo inválido.' })
  const patch: PatchParte = {}
  if ('nome' in b) patch.nome = str(b.nome) ?? ''
  if ('ordem' in b) patch.ordem = b.ordem as number
  if ('iniUid' in b) patch.iniUid = str(b.iniUid) ?? ''
  if ('fimUid' in b) patch.fimUid = str(b.fimUid) ?? ''
  if ('rotuloIni' in b) patch.rotuloIni = str(b.rotuloIni) ?? null
  if ('rotuloFim' in b) patch.rotuloFim = str(b.rotuloFim) ?? null
  if (typeof b.arquivada === 'boolean') patch.arquivada = b.arquivada
  const r = await atualizarParte(c.tenantId, await resolverAtorAudit(), str(b.id) ?? '', patch)
  return r.ok ? json(200, r) : falha(r)
}

export async function DELETE(req: NextRequest) {
  const c = await ctx('configuracoes:update'); if ('erro' in c) return c.erro
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const id = req.nextUrl.searchParams.get('id') ?? str(b?.id) ?? ''
  const r = await arquivarParte(c.tenantId, await resolverAtorAudit(), id)
  return r.ok ? json(200, { ...r, arquivada: true }) : falha(r)
}
