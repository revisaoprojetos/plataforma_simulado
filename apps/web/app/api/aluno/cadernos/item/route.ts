import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import {
  MSG_MIGRACAO, tabelaAusente, uuid, normalizarItem, resolverCaderno, desfazerCadernoNovo, gravarItens, cadernoComTotal,
  type ItemNormalizado,
} from '@/lib/aluno/caderno-itens-server'

// Itens de caderno que não são questão: tipo 'grifo' | 'anotacao' | 'comentario' (trecho do material).
// POST   — adiciona item(ns) a um caderno existente { caderno_id, ...item } OU { caderno_id, itens: [...] } (lote, máx. 100)
//          OU cria o caderno e vincula na MESMA chamada { novo_caderno: { nome }, ...item }.
//          Idempotente: dedupe por grifo_ref no caderno (sem ref, chave determinística pelo trecho/posição).
// GET    — ?documento_id= → o que deste material já está salvo (para marcar no leitor).
// DELETE — remove item (?caderno_id=&item_id=).
// Endpoint dinamico (sessao/dados/mutacao) — nunca cachear estaticamente.
export const dynamic = 'force-dynamic'

const MAX_LOTE = 100

export async function POST(request: NextRequest) {
  const sessao = await getSessaoAluno()
  if (!sessao) return NextResponse.json({ message: 'Não autenticado.' }, { status: 401 })

  let body: any
  try { body = await request.json() } catch { return NextResponse.json({ message: 'Requisição inválida.' }, { status: 400 }) }
  if (!body || typeof body !== 'object') return NextResponse.json({ message: 'Requisição inválida.' }, { status: 400 })

  // Um item (campos na raiz, compatível com o formato antigo) ou um lote em `itens`.
  const brutos: any[] = Array.isArray(body.itens) ? body.itens.slice(0, MAX_LOTE) : [body]
  if (!brutos.length) return NextResponse.json({ message: 'Nada para salvar.' }, { status: 400 })
  const itens: ItemNormalizado[] = []
  for (const b of brutos) {
    const r = normalizarItem(b)
    if ('erro' in r) return NextResponse.json({ message: r.erro }, { status: 400 })
    itens.push(r.item)
  }

  const svc = createAdminClient()
  const rc = await resolverCaderno(svc, sessao, body)
  if ('status' in rc) return NextResponse.json({ message: rc.message }, { status: rc.status })
  const { caderno, criadoAgora } = rc

  const res = await gravarItens(svc, sessao, caderno, itens)
  if (!res.ok) {
    // Falhou num caderno recém-criado → desfaz o caderno (sem caderno vazio sobrando).
    if (criadoAgora) await desfazerCadernoNovo(svc, sessao, caderno)
    return NextResponse.json({ message: res.message }, { status: res.status })
  }
  return NextResponse.json({
    ok: true,
    atualizado: res.criados === 0 && res.atualizados > 0,
    criados: res.criados,
    atualizados: res.atualizados,
    caderno: await cadernoComTotal(svc, caderno, sessao.tenantId),
    item: res.itens[0] ?? null,
  })
}

export async function GET(request: NextRequest) {
  const sessao = await getSessaoAluno()
  if (!sessao) return NextResponse.json({ message: 'Não autenticado.' }, { status: 401 })
  const documentoId = uuid(new URL(request.url).searchParams.get('documento_id'))
  if (!documentoId) return NextResponse.json({ message: 'Informe o documento.' }, { status: 400 })

  const svc = createAdminClient()
  const { data, error } = await svc
    .from('simulado_aluno_caderno_itens')
    .select('id, caderno_id, tipo, grifo_ref, pagina')
    .eq('tenant_id', sessao.tenantId).eq('estudante_id', sessao.estudanteId).eq('documento_id', documentoId)
    .limit(2000)
  // Migração pendente: o leitor segue sem os indicadores de "já salvo".
  if (error) return NextResponse.json({ itens: [], indisponivel: tabelaAusente(error) })
  return NextResponse.json({ itens: data ?? [] })
}

export async function DELETE(request: NextRequest) {
  const sessao = await getSessaoAluno()
  if (!sessao) return NextResponse.json({ message: 'Não autenticado.' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const cadernoId = uuid(searchParams.get('caderno_id'))
  const itemId = uuid(searchParams.get('item_id'))
  if (!cadernoId || !itemId) return NextResponse.json({ message: 'Dados ausentes.' }, { status: 400 })

  const svc = createAdminClient()
  const { data: dono } = await svc
    .from('simulado_aluno_cadernos').select('id')
    .eq('id', cadernoId).eq('tenant_id', sessao.tenantId).eq('estudante_id', sessao.estudanteId).maybeSingle()
  if (!dono) return NextResponse.json({ message: 'Caderno não encontrado.' }, { status: 403 })

  const { error } = await svc
    .from('simulado_aluno_caderno_itens').delete()
    .eq('id', itemId).eq('caderno_id', cadernoId).eq('tenant_id', sessao.tenantId).eq('estudante_id', sessao.estudanteId)
  if (error) return NextResponse.json({ message: tabelaAusente(error) ? MSG_MIGRACAO : 'Não consegui remover.' }, { status: tabelaAusente(error) ? 503 : 500 })
  return NextResponse.json({ ok: true })
}
