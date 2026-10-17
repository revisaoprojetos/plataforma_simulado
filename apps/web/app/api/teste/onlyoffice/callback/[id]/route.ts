import { NextResponse } from 'next/server'
import { salvarDoc } from '@/lib/teste/store'

// OnlyOffice · callback — o Document Server avisa quando o doc deve ser salvo (status 2/6) e manda a URL
// do .docx editado; a gente baixa e grava de volta no store. Responder { error: 0 } sempre.
export const dynamic = 'force-dynamic'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await request.json().catch(() => ({} as any))
  // 2 = pronto p/ salvar; 6 = force-save (ex.: Ctrl+S). Nos dois casos baixamos e gravamos.
  if ((body?.status === 2 || body?.status === 6) && typeof body?.url === 'string') {
    try {
      const r = await fetch(body.url)
      const ab = await r.arrayBuffer()
      await salvarDoc(id, Buffer.from(ab))
    } catch (e) {
      console.error('[teste/onlyoffice] falha ao salvar:', (e as Error).message)
      return NextResponse.json({ error: 1 })
    }
  }
  return NextResponse.json({ error: 0 })
}

// O OnlyOffice às vezes faz um GET de verificação no callback — responder ok.
export async function GET() { return NextResponse.json({ error: 0 }) }
