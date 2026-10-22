import { NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/server'
import { baixarOriginal, urlAssinadaOriginal, resolverBucketConteudo } from '@/lib/conteudo/ingestao'
import { renderPreviaDocx } from '@/lib/conteudo/previa-docx'
import { converterDocxParaPdf } from '@/lib/conteudo/thumb'
import { carregarDadosBancoCore } from '@/lib/caderno-teste/dados-banco'
import { uploadArquivo } from '@/lib/storage'
import { DADOS_PREVIA } from '@/lib/teste/previa-dados'

// Diagnóstico do EDITOR BETA (OnlyOffice) PARA O ALUNO: pega o .docx da versão, preenche com os VALORES
// REAIS do aluno (vars da sessão) via docxtemplater e converte em PDF no OnlyOffice. Cacheado por
// sessão+versão (os dados do aluno são fixos pós-finalização). Autorizado pelo id da sessão (mesmo padrão
// de /api/aluno/caderno-teste-pdf). Só .docx; precisa do OnlyOffice de pé (senão 502).
export const runtime = 'nodejs'
export const maxDuration = 60
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
const PDF = 'application/pdf'
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

function pdfResp(bytes: Uint8Array, nome: string) {
  // cast: o Next aceita Uint8Array/Buffer como body em runtime; o atrito é só de tipo (TS 5.7 generic).
  return new NextResponse(bytes as unknown as BodyInit, { headers: { 'content-type': PDF, 'content-disposition': `inline; filename="${nome}.pdf"`, 'cache-control': 'no-store' } })
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const versaoId = searchParams.get('versaoId')
  const sessaoId = searchParams.get('sessao')
  const nome = (searchParams.get('download') || 'diagnostico').replace(/[\\/:*?"<>|]+/g, '').replace(/\.pdf$/i, '').slice(0, 120) || 'diagnostico'
  if (!versaoId || !sessaoId) return NextResponse.json({ message: 'Parâmetros ausentes.' }, { status: 400 })

  const svc = createAdminClient()
  // Sessão = credencial do aluno + escopo do tenant.
  const { data: sess } = await svc.from('simulado_sessoes_prova').select('id, tenant_id, simulado_id, estudante_id').eq('id', sessaoId).maybeSingle()
  if (!sess) return NextResponse.json({ message: 'Sessão não encontrada.' }, { status: 404 })
  const tenantId = (sess as any).tenant_id as string

  // Versão do .docx (diagnóstico do editor), escopada ao tenant da sessão.
  const { data: ver } = await svc.from('simulado_conteudo_versoes').select('id, arquivo_key, hash_arquivo').eq('id', versaoId).eq('tenant_id', tenantId).maybeSingle()
  if (!ver?.arquivo_key) return NextResponse.json({ message: 'Documento não encontrado.' }, { status: 404 })
  const h8 = String((ver as any).hash_arquivo || '').slice(0, 8)

  // Cache do PDF por sessão + versão/hash.
  const bucket = await resolverBucketConteudo()
  const pdfPath = `conteudo-diag-aluno/${tenantId}/${sessaoId}_${versaoId}_${h8}.pdf`
  const cachedUrl = await urlAssinadaOriginal(pdfPath, 600)
  if (cachedUrl) { try { const r = await fetch(cachedUrl); if (r.ok) return pdfResp(new Uint8Array(await r.arrayBuffer()), nome) } catch { /* gera abaixo */ } }

  // banco_base_id do simulado → valores REAIS do aluno (por sessão).
  const { data: sim } = await svc.from('simulado_simulados').select('titulo, regras').eq('id', (sess as any).simulado_id).eq('tenant_id', tenantId).maybeSingle()
  const bancoId = (((sim as any)?.regras as any)?.banco_base_id as string | undefined) || null
  if (!bancoId) return NextResponse.json({ message: 'Banco não configurado para este simulado.' }, { status: 404 })

  const { registros, disciplinas } = await carregarDadosBancoCore(svc, tenantId, bancoId, { sessao: sessaoId })
  const vars = (registros[0]?.vars ?? {}) as Record<string, string>
  // Dict docxtemplater: base de exemplo (campos estáticos) + vars REAIS do aluno + laço {#disciplinas}.
  const dados: Record<string, unknown> = {
    ...DADOS_PREVIA,
    ...vars,
    simulado: (sim as any)?.titulo || vars.simulado || (DADOS_PREVIA as any).simulado,
    disciplinas: disciplinas.map((d) => ({
      nome: d.nome,
      acertos: vars[`acerto_${d.chave}`] ?? '0',
      total: vars[`total_${d.chave}`] ?? '0',
      pct: vars[`pct_${d.chave}`] ?? '0%',
      assuntos: vars[`assuntos_${d.chave}`] ?? '',
    })),
  }

  // .docx original → preenchido → PDF via OnlyOffice (ConvertService precisa de URL pública/assinada).
  const buf = await baixarOriginal((ver as any).arquivo_key)
  if (!buf) return NextResponse.json({ message: 'Falha ao abrir o documento.' }, { status: 502 })
  const filled = await renderPreviaDocx(buf, dados)
  const tmpPath = `conteudo-diag-tmp/${tenantId}/${sessaoId}_${versaoId}_${h8}.docx`
  try { await uploadArquivo({ tenantId, bucket, path: tmpPath, data: Buffer.from(filled), contentType: DOCX, nome: 'diag.docx', publico: false, criadoPor: null }) } catch { return NextResponse.json({ message: 'Falha ao preparar o documento.' }, { status: 502 }) }
  const tmpUrl = await urlAssinadaOriginal(tmpPath, 600)
  if (!tmpUrl) return NextResponse.json({ message: 'Falha ao preparar o documento.' }, { status: 502 })
  const key = createHash('sha1').update(`${sessaoId}:${versaoId}:${h8}`).digest('hex').slice(0, 16)
  const pdf = await converterDocxParaPdf(tmpUrl, `diag_${key}`)
  if (!pdf) return NextResponse.json({ message: 'OnlyOffice indisponível para gerar o PDF.' }, { status: 502 })
  try { await uploadArquivo({ tenantId, bucket, path: pdfPath, data: pdf, contentType: PDF, nome: 'diagnostico.pdf', publico: false, criadoPor: null }) } catch { /* cache best-effort */ }
  return pdfResp(new Uint8Array(pdf), nome)
}
