import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, accessCan } from '@/lib/auth/permissions'
import { carregarConfigIA } from '@/lib/ia/config'
import { transcreverImagemIA } from '@/lib/ia/correcao-ia'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

/** POST { respostaId, imagemBase64, mediaType } → transcrição por IA de UMA região (recorte). */
export async function POST(req: NextRequest) {
  const access = await getCurrentAccess()
  if (!access.tenantId || !(access.isAdmin || accessCan(access, 'correcao:corrigir') || accessCan(access, 'questoes:update'))) {
    return NextResponse.json({ ok: false, error: 'Sem permissão para corrigir.' }, { status: 403 })
  }
  let body: any = {}
  try { body = await req.json() } catch { /* corpo inválido */ }
  const respostaId = String(body?.respostaId ?? '')
  const imagemBase64 = String(body?.imagemBase64 ?? '')
  const mediaType = String(body?.mediaType ?? 'image/png')
  if (!respostaId || !imagemBase64) return NextResponse.json({ ok: false, error: 'Dados ausentes.' }, { status: 400 })

  const svc = createAdminClient()
  // confere que a resposta é do tenant (defesa)
  const { data: r } = await svc.from('simulado_respostas_discursivas').select('id').eq('id', respostaId).eq('tenant_id', access.tenantId).maybeSingle()
  if (!r) return NextResponse.json({ ok: false, error: 'Resposta não encontrada.' }, { status: 404 })

  let config = await carregarConfigIA(svc, access.tenantId)
  if (!config && process.env.ANTHROPIC_API_KEY) config = { provider: 'anthropic', modelo: process.env.IA_CORRECAO_MODELO || 'claude-opus-4-8', apiKey: process.env.ANTHROPIC_API_KEY, mascara: '' }
  if (!config) return NextResponse.json({ ok: false, error: 'IA não configurada: cadastre uma chave em Chaves de API.' }, { status: 400 })

  try {
    const texto = await transcreverImagemIA(config, imagemBase64, mediaType)
    return NextResponse.json({ ok: true, texto })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Falha na IA.' }, { status: 502 })
  }
}
