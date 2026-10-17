import { NextResponse } from 'next/server'
import PizZip from 'pizzip'
import { lerDoc, docExiste } from '@/lib/teste/store'

// SPIKE — dado o id do .docx e uma lista de candidatos ({tags} e marcadores de laço), devolve quais
// REALMENTE aparecem no documento salvo. O plugin usa isso pra trocar só o que existe (e saber o nº
// exato de trocas → desfaz exatamente isso ao desligar a prévia). Remove as marcações XML antes de
// procurar, pra reencontrar tags que o editor quebrou em runs separados ({no}{me} → {nome}).
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const { id, candidatos } = await request.json().catch(() => ({}))
    if (!id || !docExiste(String(id)) || !Array.isArray(candidatos)) return NextResponse.json({ presentes: [] })
    const buf = await lerDoc(String(id))
    const xml = new PizZip(buf).file('word/document.xml')?.asText() ?? ''
    const texto = xml.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    const presentes = (candidatos as string[]).filter((c) => typeof c === 'string' && texto.includes(c))
    return NextResponse.json({ presentes })
  } catch (e) {
    return NextResponse.json({ presentes: [], error: (e as Error).message }, { status: 200 })
  }
}
