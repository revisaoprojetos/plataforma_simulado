import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, accessCan } from '@/lib/auth/permissions'
import { getStorage } from '@/lib/storage'
import { carregarEntregaBanco } from '@/lib/caderno-teste/entrega-aluno'
import { proporCorrecaoIA, type CompParaIA, type ImagemIA } from '@/lib/ia/correcao-ia'
import { carregarConfigIA } from '@/lib/ia/config'
import { extrairTextoPdf } from '@/lib/ia/pdf-texto'
import { registrarAudit } from '@/lib/audit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const b64 = (buf: ArrayBuffer) => Buffer.from(buf).toString('base64')

/** POST { respostaId } → proposta de correção da IA (Claude visão) para uma resposta discursiva. */
export async function POST(req: NextRequest) {
  const access = await getCurrentAccess()
  if (!access.tenantId || !(access.isAdmin || accessCan(access, 'correcao:corrigir') || accessCan(access, 'questoes:update'))) {
    return NextResponse.json({ ok: false, error: 'Sem permissão para corrigir.' }, { status: 403 })
  }
  let respostaId = ''
  try { respostaId = String((await req.json())?.respostaId ?? '') } catch { /* corpo inválido */ }
  if (!respostaId) return NextResponse.json({ ok: false, error: 'Resposta ausente.' }, { status: 400 })

  const svc = createAdminClient()
  const tenantId = access.tenantId

  // Provedor: config do TENANT (chave própria, multi-provedor) → fallback env ANTHROPIC_API_KEY.
  const config = await carregarConfigIA(svc, tenantId)
  if (!config && !process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ ok: false, error: 'IA não configurada: cadastre uma chave em Configurações → Transcrição (IA).' }, { status: 400 })
  }

  const { data: r } = await svc.from('simulado_respostas_discursivas').select('id, sessao_id, questao_id').eq('id', respostaId).eq('tenant_id', tenantId).maybeSingle()
  if (!r) return NextResponse.json({ ok: false, error: 'Resposta não encontrada.' }, { status: 404 })

  // Questão + competências + sessão(→simulado→banco→gabarito PDF) em paralelo.
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

  // Fotos da resposta → base64.
  const imagens: ImagemIA[] = []
  try {
    const { data: js } = await svc.from('simulado_resposta_arquivos').select('arquivo_id, ordem').eq('resposta_id', respostaId).order('ordem')
    const ids = (js ?? []).map((j: any) => j.arquivo_id)
    if (ids.length) {
      const { data: arqs } = await svc.from('simulado_arquivos').select('id, bucket, path, tipo_mime').in('id', ids)
      const arqMap = new Map((arqs ?? []).map((a: any) => [a.id, a]))
      const storage = getStorage()
      for (const j of (js ?? []) as any[]) {
        const a = arqMap.get(j.arquivo_id); if (!a) continue
        try {
          const url = await storage.getSignedUrl(a.bucket, a.path, 600)
          const resp = await fetch(url)
          if (!resp.ok) continue
          const mt = a.tipo_mime && /^image\//.test(a.tipo_mime) ? a.tipo_mime : 'image/jpeg'
          imagens.push({ media_type: mt, base64: b64(await resp.arrayBuffer()) })
        } catch { /* pula a foto */ }
      }
    }
  } catch { /* junção não migrada */ }
  if (!imagens.length) return NextResponse.json({ ok: false, error: 'O aluno não enviou foto(s) desta questão.' }, { status: 400 })

  // Gabarito/espelho (PDF do banco) → base64 + TEXTO extraído (opcional). O texto serve
  // p/ provedores que não recebem PDF direto (OpenAI); Anthropic/Gemini recebem o PDF.
  let gabaritoPdf: string | null = null, gabaritoTexto: string | null = null
  try {
    const { data: sim } = sessao ? await svc.from('simulado_simulados').select('regras').eq('id', (sessao as any).simulado_id).maybeSingle() : { data: null }
    const bancoId = (sim as any)?.regras?.banco_base_id as string | undefined
    const entrega = bancoId ? await carregarEntregaBanco(svc, tenantId, bancoId) : null
    const pdfUrl = (entrega?.gabarito?.pdfUrl as string | undefined) ?? null
    if (pdfUrl) {
      const resp = await fetch(pdfUrl)
      if (resp.ok) { const buf = Buffer.from(await resp.arrayBuffer()); gabaritoPdf = buf.toString('base64'); try { gabaritoTexto = await extrairTextoPdf(buf) } catch { /* sem texto */ } }
    }
  } catch { /* sem gabarito */ }

  // Chama a IA (provedor da config do tenant ou env).
  let proposta
  try {
    proposta = await proporCorrecaoIA({ imagens, gabaritoPdf, gabaritoTexto, enunciado: questao?.enunciado ?? '', competencias, config })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Falha na IA.' }, { status: 502 })
  }

  // Guarda a proposta crua (auditoria/Δ). Tolerante à coluna ausente.
  try { await svc.from('simulado_respostas_discursivas').update({ ia_payload: proposta, ia_em: new Date().toISOString() }).eq('id', respostaId).eq('tenant_id', tenantId) } catch { /* coluna não migrada */ }
  try { await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_respostas_discursivas', entidadeId: respostaId, depois: { ia_correcao: true, quesitos: proposta.quesitos.length } }) } catch { /* audit tolerante */ }

  return NextResponse.json({ ok: true, proposta })
}
