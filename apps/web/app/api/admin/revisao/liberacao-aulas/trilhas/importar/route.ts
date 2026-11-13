import { NextRequest, NextResponse } from 'next/server'
import { DESCONTO_PADRAO, LIMITE_PLANILHA_TRILHAS } from '@/lib/produtos/liberacao-trilhas-import'
import { guardTrilhas } from '@/app/admin/revisao/cronograma/liberacao-aulas/guard-trilhas'
import { gravarTrilhas, prepararTrilhas, previaDoPlano } from '@/app/admin/revisao/cronograma/liberacao-aulas/cronogramas/importar-server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Importar a 2ª aba ("Data em cada cronograma") da planilha de liberação. Multipart; rota de API por causa dos domínios custom.
// modo=previa só lê/casa e devolve o resumo; modo=gravar repete o casamento e grava (upsert por trilha+aula; data_manual preservada).
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null)
  const arquivo = form?.get('arquivo')
  const produtoId = String(form?.get('produtoId') ?? '')
  const modo = form?.get('modo') === 'gravar' ? 'gravar' : 'previa'
  const bruto = Number(form?.get('desconto') ?? DESCONTO_PADRAO)
  const desconto = Math.min(365, Math.max(0, Math.trunc(Number.isFinite(bruto) ? bruto : DESCONTO_PADRAO)))
  const g = await guardTrilhas('cronogramas:update', produtoId)
  if (!g.ok) return NextResponse.json({ ok: false, error: g.error }, { status: g.error === 'Sem permissão.' ? 403 : 400 })
  if (!(arquivo instanceof File)) return NextResponse.json({ ok: false, error: 'Envie o arquivo .xlsx.' }, { status: 400 })
  if (!/\.xlsx$/i.test(arquivo.name)) return NextResponse.json({ ok: false, error: 'O arquivo precisa ser .xlsx.' }, { status: 400 })
  if (arquivo.size > LIMITE_PLANILHA_TRILHAS) return NextResponse.json({ ok: false, error: 'Arquivo grande demais (máx. 8 MB).' }, { status: 400 })
  const buf = await arquivo.arrayBuffer()
  const magia = new Uint8Array(buf.slice(0, 4))
  if (!(magia[0] === 0x50 && magia[1] === 0x4b)) return NextResponse.json({ ok: false, error: 'O arquivo não parece um .xlsx válido.' }, { status: 400 })

  let prep
  try { prep = await prepararTrilhas(g, produtoId, buf, desconto) }
  catch { return NextResponse.json({ ok: false, error: 'Não consegui ler a planilha. Confira se é o arquivo de liberação de aulas (.xlsx).' }, { status: 400 }) }
  if (!prep.ok) return NextResponse.json({ ok: false, error: prep.error }, { status: 409 })
  if (modo === 'previa') return NextResponse.json({ ok: true, previa: previaDoPlano(prep.p) })
  const r = await gravarTrilhas(g, produtoId, prep.p, arquivo.name)
  return NextResponse.json(r, { status: r.ok ? 200 : 500 })
}
