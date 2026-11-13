import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import {
  uuid, txt, htmlParaTexto, normalizarItem, resolverCaderno, desfazerCadernoNovo, gravarItens, cadernoComTotal,
} from '@/lib/aluno/caderno-itens-server'

// POST /api/aluno/cadernos/folha — salva a FOLHA DE ANOTAÇÕES do leitor (hoje só em localStorage) num caderno,
// como item tipo 'anotacao' por documento+tema. UPSERT: salvar de novo a mesma folha atualiza o item
// (chave = grifo_ref 'folha:<documento>:<tema>'), nunca duplica.
// Body: { caderno_id | novo_caderno:{nome}, documento_id, titulo_documento?, sec, titulo_sec?, html }
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const sessao = await getSessaoAluno()
  if (!sessao) return NextResponse.json({ message: 'Não autenticado.' }, { status: 401 })

  let body: any
  try { body = await request.json() } catch { return NextResponse.json({ message: 'Requisição inválida.' }, { status: 400 }) }
  const documentoId = uuid(body?.documento_id)
  const sec = txt(body?.sec, 30)
  const html = typeof body?.html === 'string' ? body.html.slice(0, 100000) : ''
  if (!documentoId || !sec) return NextResponse.json({ message: 'Dados ausentes.' }, { status: 400 })
  const texto = htmlParaTexto(html).slice(0, 5000)
  if (!texto) return NextResponse.json({ message: 'A folha está vazia. Escreva algo antes de salvar no caderno.' }, { status: 400 })

  const r = normalizarItem({
    tipo: 'anotacao', documento_id: documentoId, titulo_documento: body.titulo_documento,
    trecho: txt(body.titulo_sec, 300), comentario: texto, html,
    grifo_ref: `folha:${documentoId}:${sec}`, ref_tabela: 'folha_local',
  })
  if ('erro' in r) return NextResponse.json({ message: r.erro }, { status: 400 })

  const svc = createAdminClient()
  const rc = await resolverCaderno(svc, sessao, body)
  if ('status' in rc) return NextResponse.json({ message: rc.message }, { status: rc.status })

  const res = await gravarItens(svc, sessao, rc.caderno, [r.item])
  if (!res.ok) {
    if (rc.criadoAgora) await desfazerCadernoNovo(svc, sessao, rc.caderno)
    return NextResponse.json({ message: res.message }, { status: res.status })
  }
  return NextResponse.json({
    ok: true, atualizado: res.criados === 0, caderno: await cadernoComTotal(svc, rc.caderno, sessao.tenantId), item: res.itens[0] ?? null,
  })
}
