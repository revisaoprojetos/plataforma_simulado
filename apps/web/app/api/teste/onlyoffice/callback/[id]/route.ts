import { NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { salvarDoc } from '@/lib/teste/store'
import { exigirAcessoOO } from '@/lib/seguranca/guarda-onlyoffice'

// OnlyOffice · callback — o Document Server avisa quando o doc deve ser salvo (status 2/6) e manda a URL
// do .docx editado; a gente baixa e grava de volta no store. Responder { error: 0 } sempre.
// SEGURANÇA: exige access_token (escopo escrever, do docId) na URL do callback. Se ONLYOFFICE_JWT_SECRET
// estiver definido, exige TAMBÉM o JWT do Document Server (header Authorization ou body.token).
export const dynamic = 'force-dynamic'

async function jwtDsOk(request: Request, body: any): Promise<boolean> {
  const secret = process.env.ONLYOFFICE_JWT_SECRET
  if (!secret) return true // JWT do DS desligado: a barreira é o access_token da URL
  const tk = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || (typeof body?.token === 'string' ? body.token : '')
  if (!tk) return false
  try { await jwtVerify(tk, new TextEncoder().encode(secret)); return true } catch { return false }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const negado = await exigirAcessoOO(request, { docId: id, escopo: 'escrever' })
  if (negado) return negado
  const body = await request.json().catch(() => ({} as any))
  if (!(await jwtDsOk(request, body))) return new NextResponse(null, { status: 401 })
  // 2 = pronto p/ salvar; 6 = force-save (ex.: Ctrl+S). Nos dois casos baixamos e gravamos.
  if ((body?.status === 2 || body?.status === 6) && typeof body?.url === 'string' && /^https?:\/\//i.test(body.url)) {
    try {
      const r = await fetch(body.url)
      if (!r.ok) throw new Error(`download ${r.status}`) // nunca gravar página de erro por cima do doc
      const ab = await r.arrayBuffer()
      if (ab.byteLength < 100) throw new Error('arquivo vazio')
      await salvarDoc(id, Buffer.from(ab))
    } catch (e) {
      console.error('[teste/onlyoffice] falha ao salvar:', (e as Error).message)
      return NextResponse.json({ error: 1 })
    }
  }
  return NextResponse.json({ error: 0 })
}

// Verificação do callback pelo OnlyOffice: GET sem efeito colateral.
export async function GET() { return NextResponse.json({ error: 0 }) }
