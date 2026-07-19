import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

// GET /api/sessoes/tempo?st={sessao_id}
// Endpoint LEVE: devolve o tempo limite ATUAL do simulado da sessão (em minutos).
// Usado pelo runner para pegar mudanças de tempo feitas durante a prova, sem recarregar.
export async function GET(request: NextRequest) {
  const st = new URL(request.url).searchParams.get('st')
  if (!st) return NextResponse.json({ message: 'Sessão ausente.' }, { status: 400 })

  const svc = await createServiceClient()
  const { data: sess } = await svc
    .from('simulado_sessoes_prova')
    .select('simulado_id, status')
    .eq('id', st)
    .maybeSingle()
  if (!sess) return NextResponse.json({ message: 'Sessão não encontrada.' }, { status: 404 })

  const { data: sim } = await svc
    .from('simulado_simulados')
    .select('tempo_limite_min')
    .eq('id', sess.simulado_id)
    .maybeSingle()

  return NextResponse.json({ tempo_limite_min: sim?.tempo_limite_min ?? null, status: sess.status })
}
