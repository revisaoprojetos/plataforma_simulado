import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

// GET /api/simulado/info?token={embed_token}
// Informações públicas mínimas do simulado para a tela de acesso do aluno.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const token = searchParams.get('token')
  if (!token) {
    return NextResponse.json({ message: 'Token ausente.' }, { status: 400 })
  }

  const supabase = await createServiceClient()
  const { data } = await supabase
    .from('simulado_simulados')
    .select('titulo, metodo_identificacao, status')
    .eq('embed_token', token)
    .maybeSingle()

  if (!data) {
    return NextResponse.json({ message: 'Simulado não encontrado.' }, { status: 404 })
  }

  return NextResponse.json({
    titulo: data.titulo,
    metodo_identificacao: data.metodo_identificacao ?? 'email',
    status: data.status,
  })
}
