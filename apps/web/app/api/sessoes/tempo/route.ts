import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { sessaoNoTenantDoRequisitante } from '@/lib/simulado/sessao-guard'
import { remember } from '@/lib/cache/relatorio-cache'

// GET /api/sessoes/tempo?st={sessao_id}
// Endpoint LEVE: devolve o tempo limite ATUAL do simulado da sessão (em minutos).
// Usado pelo runner para pegar mudanças de tempo feitas durante a prova, sem recarregar.
// Endpoint dinamico (sessao/dados/mutacao) — nunca cachear estaticamente.
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const st = new URL(request.url).searchParams.get('st')
  if (!st) return NextResponse.json({ message: 'Sessão ausente.' }, { status: 400 })

  const svc = createAdminClient()
  const { data: sess } = await svc
    .from('simulado_sessoes_prova')
    .select('simulado_id, status, tenant_id')
    .eq('id', st)
    .maybeSingle()
  if (!sess) return NextResponse.json({ message: 'Sessão não encontrada.' }, { status: 404 })
  if (!(await sessaoNoTenantDoRequisitante(sess))) return NextResponse.json({ message: 'Sessão não encontrada.' }, { status: 404 })

  // tempo_limite_min/regras são IGUAIS p/ todos os alunos do simulado → cacheados (TTL 60s) p/ não
  // bater no banco a cada poll de 1500 alunos. Extensão de tempo pelo admin reflete em ≤60s (o runner
  // ainda revalida antes de auto-finalizar). Degrada com elegância se o Redis estiver fora.
  const sim = await remember(`sim-prova:tempo:${sess.simulado_id}`, 60, async () => {
    const { data } = await svc
      .from('simulado_simulados')
      .select('tempo_limite_min, regras')
      .eq('id', sess.simulado_id)
      .maybeSingle()
    return data
  })

  return NextResponse.json({
    tempo_limite_min: sim?.tempo_limite_min ?? null,
    status: sess.status,
    // Regra "continuar após o tempo, sem punição": o runner não auto-finaliza ao zerar o cronômetro.
    permitir_continuar_apos_tempo: (sim?.regras as any)?.permitir_continuar_apos_tempo === true,
  })
}
