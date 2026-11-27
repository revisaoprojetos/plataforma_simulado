import { NextRequest, NextResponse } from 'next/server'
import { checkPermission } from '@/lib/auth/permissions'
import { getCurrentTenantId } from '@/lib/tenant'
import { createAdminClient } from '@/lib/supabase/server'
import { carregarTrechosVersaoAtual, listarPartes } from '@/lib/conteudo/partes-server'
import { sugerirPartes, validarPartes, type ModoSugestao } from '@/lib/conteudo/partes'

// Sugestão automática de partes (somente leitura; não grava nada).
//   POST {documentoId, modo:'titulo'|'capitulo'|'cada_n_artigos', n?}
// Cada sugestão vem com a medida (artigos/palavras/caracteres) e `conflitaComExistente` (sobrepõe parte ativa).
export const dynamic = 'force-dynamic'
const NO_STORE = { 'Cache-Control': 'no-store' }
const json = (status: number, body: unknown) => NextResponse.json(body, { status, headers: NO_STORE })
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MODOS: ModoSugestao[] = ['titulo', 'capitulo', 'cada_n_artigos']

export async function POST(req: NextRequest) {
  if (!(await checkPermission('configuracoes:view'))) return json(403, { ok: false, error: 'Sem permissão.' })
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return json(400, { ok: false, error: 'Tenant não resolvido.' })
  const b = (await req.json().catch(() => null)) as { documentoId?: unknown; modo?: unknown; n?: unknown; page?: unknown; pp?: unknown; todas?: unknown } | null
  const documentoId = typeof b?.documentoId === 'string' ? b.documentoId : ''
  const modo = MODOS.find((m) => m === b?.modo)
  if (!UUID.test(documentoId) || !modo) return json(400, { ok: false, error: 'Informe documentoId e modo (titulo | capitulo | cada_n_artigos).' })

  const ctx = await carregarTrechosVersaoAtual(createAdminClient(), tenantId, documentoId)
  if (!ctx) return json(404, { ok: false, error: 'Documento não encontrado, excluído ou sem versão atual.' })
  if (!ctx.trechos.length) return json(200, { ok: true, sugestoes: [], aviso: 'O documento não tem trechos (ex.: PDF) — sem sugestão por estrutura.' })

  const sugestoes = sugerirPartes(ctx.trechos, { modo, n: typeof b?.n === 'number' ? b.n : undefined })

  // Conflito com partes ativas já existentes (índices resolvidos na versão atual). Tabela ausente → sem conflito.
  const atuais = await listarPartes(tenantId, documentoId, { comStatus: true })
  const existentes = atuais.ok
    ? atuais.partes.filter((p) => p.resolucao?.indices).map((p) => ({ id: p.id, nome: p.nome, ini: p.resolucao!.indices![0], fim: p.resolucao!.indices![1] }))
    : []
  const saida = sugestoes.map((s) => {
    const v = validarPartes([...existentes, { nome: s.nome, ini: s.indices[0], fim: s.indices[1] }])
    return { ...s, conflitaComExistente: v.erros.some((e) => e.codigo === 'sobreposicao' && e.nomes.includes(s.nome)) }
  })
  const criaveis = saida.filter((s) => !s.conflitaComExistente)
  const aviso = atuais.ok ? {} : { aviso: atuais.error }
  // `todas:true` → só as criáveis (sem conflito), p/ o aceite em lote; a prévia da tela vem SEMPRE paginada.
  if (b?.todas === true) return json(200, { ok: true, versaoId: ctx.versaoId, sugestoes: criaveis, totalCriaveis: criaveis.length, ...aviso })
  const pp = [10, 15, 25].includes(Number(b?.pp)) ? Number(b?.pp) : 10
  const totalPaginas = Math.max(1, Math.ceil(saida.length / pp))
  const page = Math.min(Math.max(1, Number(b?.page) || 1), totalPaginas)
  return json(200, {
    ok: true, versaoId: ctx.versaoId, totalTrechos: ctx.trechos.length,
    sugestoes: saida.slice((page - 1) * pp, page * pp), total: saida.length, totalCriaveis: criaveis.length, page, pp, totalPaginas, ...aviso,
  })
}
