import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, accessCan } from '@/lib/auth/permissions'
import { carregarEntregaBanco } from '@/lib/caderno-teste/entrega-aluno'
import { carregarConfigIA } from '@/lib/ia/config'
import { extrairTextoPdf } from '@/lib/ia/pdf-texto'
import { analisarComTextoIA, type CompParaIA } from '@/lib/ia/correcao-ia'
import { registrarAudit } from '@/lib/audit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 180

/** POST { respostaId, texto? } → análise da IA a partir do TEXTO transcrito × espelho (alcançado/faltou/conceito/nota). */
export async function POST(req: NextRequest) {
  const access = await getCurrentAccess()
  if (!access.tenantId || !(access.isAdmin || accessCan(access, 'correcao:corrigir') || accessCan(access, 'questoes:update'))) {
    return NextResponse.json({ ok: false, error: 'Sem permissão para corrigir.' }, { status: 403 })
  }
  let body: any = {}
  try { body = await req.json() } catch { /* corpo inválido */ }
  const respostaId = String(body?.respostaId ?? '')
  let texto = String(body?.texto ?? '').trim()
  if (!respostaId) return NextResponse.json({ ok: false, error: 'Resposta ausente.' }, { status: 400 })

  const svc = createAdminClient()
  const tenantId = access.tenantId

  const { data: r } = await svc.from('simulado_respostas_discursivas').select('id, sessao_id, questao_id, transcricao, ia_payload').eq('id', respostaId).eq('tenant_id', tenantId).maybeSingle()
  if (!r) return NextResponse.json({ ok: false, error: 'Resposta não encontrada.' }, { status: 404 })
  // fallback: transcrição salva (OCR/IA/manual) se o cliente não mandou texto
  if (!texto) texto = String((r as any).transcricao || (r as any).ia_payload?.transcricao || '').trim()
  if (!texto) return NextResponse.json({ ok: false, error: 'Sem texto transcrito — transcreva a resposta antes de analisar.' }, { status: 400 })

  let config = await carregarConfigIA(svc, tenantId)
  if (!config && process.env.ANTHROPIC_API_KEY) config = { provider: 'anthropic', modelo: process.env.IA_CORRECAO_MODELO || 'claude-opus-4-8', apiKey: process.env.ANTHROPIC_API_KEY, mascara: '' }
  if (!config) return NextResponse.json({ ok: false, error: 'IA não configurada: cadastre uma chave em Chaves de API.' }, { status: 400 })

  // Questão (enunciado) + competências + espelho (texto do gabarito do banco).
  const [{ data: questao }, { data: sessao }, comps] = await Promise.all([
    svc.from('simulado_questoes').select('enunciado').eq('id', (r as any).questao_id).maybeSingle(),
    svc.from('simulado_sessoes_prova').select('simulado_id').eq('id', (r as any).sessao_id).maybeSingle(),
    (async () => {
      const full = await svc.from('simulado_competencias').select('id, nome, pontos, conceitos, descricao').eq('questao_id', (r as any).questao_id).order('ordem').then((x) => x, () => null)
      if (full && !full.error) return full.data ?? []
      const basic = await svc.from('simulado_competencias').select('id, nome, pontos').eq('questao_id', (r as any).questao_id).order('ordem')
      return basic.data ?? []
    })(),
  ])
  const competencias: CompParaIA[] = (comps as any[]).map((c) => ({
    id: c.id, nome: c.nome, pontos: Number(c.pontos),
    conceitos: Array.isArray(c.conceitos) ? c.conceitos.map((x: any) => ({ nome: String(x.nome ?? ''), pontos: Number(x.pontos ?? 0) })) : [],
    descricao: c.descricao ?? undefined,
  }))
  if (!competencias.length) return NextResponse.json({ ok: false, error: 'Esta questão não tem quesitos (competências) cadastrados.' }, { status: 400 })

  let espelhoTexto: string | null = null
  try {
    const { data: sim } = sessao ? await svc.from('simulado_simulados').select('regras').eq('id', (sessao as any).simulado_id).maybeSingle() : { data: null }
    const bancoId = (sim as any)?.regras?.banco_base_id as string | undefined
    const entrega = bancoId ? await carregarEntregaBanco(svc, tenantId, bancoId) : null
    const pdfUrl = (entrega?.gabarito?.pdfUrl as string | undefined) ?? null
    if (pdfUrl) { const resp = await fetch(pdfUrl); if (resp.ok) espelhoTexto = await extrairTextoPdf(Buffer.from(await resp.arrayBuffer())) }
  } catch { /* sem espelho */ }

  try {
    const analise = await analisarComTextoIA(config, { textoAluno: texto, enunciado: questao?.enunciado ?? '', espelhoTexto, competencias })
    try { await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_respostas_discursivas', entidadeId: respostaId, depois: { ia_analise: true, quesitos: analise.quesitos.length } }) } catch { /* audit tolerante */ }
    return NextResponse.json({ ok: true, analise })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Falha na IA.' }, { status: 502 })
  }
}
