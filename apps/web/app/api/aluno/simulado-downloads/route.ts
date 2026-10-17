import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { resolverDownloadsSimulados } from '@/lib/aluno/downloads-simulado'

// Lista de cadernos baixáveis de UM simulado (pop-up "Baixar" do card) — carregada SOB DEMANDA quando o
// aluno clica em Baixar. Lazy de propósito: não computa os cadernos de todos os cards da home no load.
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const sessao = await getSessaoAluno()
  if (!sessao) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  const simuladoId = new URL(request.url).searchParams.get('simulado')
  if (!simuladoId) return NextResponse.json({ error: 'Simulado ausente.' }, { status: 400 })

  const svc = createAdminClient()
  const { data: sim } = await svc.from('simulado_simulados')
    .select('id, titulo, embed_token, regras, status, data_fim')
    .eq('id', simuladoId).eq('tenant_id', sessao.tenantId).is('owner_estudante_id', null).maybeSingle()
  if (!sim) return NextResponse.json({ error: 'Simulado não encontrado.' }, { status: 404 })

  const s = sim as any
  const map = await resolverDownloadsSimulados(svc, [{ id: s.id, regras: s.regras, embed_token: s.embed_token, status: s.status, data_fim: s.data_fim }])
  return NextResponse.json({ titulo: s.titulo, downloads: map.get(s.id) ?? [] })
}
