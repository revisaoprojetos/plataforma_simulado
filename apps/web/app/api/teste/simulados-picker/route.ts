import { NextResponse } from 'next/server'
import { carregarPicker } from '@/lib/teste/simulado-dados'

// Lista de simulados + pastas pro PICKER do plugin (aba de variáveis, dentro do iframe do OnlyOffice).
export const dynamic = 'force-dynamic'
const CORS = { 'Access-Control-Allow-Origin': '*' }

export async function GET() {
  try {
    const d = await carregarPicker()
    return NextResponse.json(d, { headers: CORS })
  } catch (e) {
    return NextResponse.json({ pastas: [], simulados: [], erro: String((e as any)?.message || e) }, { headers: CORS })
  }
}
