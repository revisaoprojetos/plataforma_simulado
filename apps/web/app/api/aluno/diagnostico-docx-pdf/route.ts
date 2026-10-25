import { NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/server'
import { baixarOriginal, urlAssinadaOriginal, resolverBucketConteudo } from '@/lib/conteudo/ingestao'
import { renderPreviaDocx } from '@/lib/conteudo/previa-docx'
import { emitirVarsAgrupamento, nomeDoSlug } from '@/lib/conteudo/previa-compute'
import { carregarTextosDesempenho } from '@/lib/conteudo/textos-desempenho'
import { slugVar } from '@/lib/teste/simulado-dados'
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
  const docId = searchParams.get('docId')
  const versaoIdParam = searchParams.get('versaoId') // compat: links antigos
  const sessaoId = searchParams.get('sessao')
  const nome = (searchParams.get('download') || 'diagnostico').replace(/[\\/:*?"<>|]+/g, '').replace(/\.pdf$/i, '').slice(0, 120) || 'diagnostico'
  if ((!docId && !versaoIdParam) || !sessaoId) return NextResponse.json({ message: 'Parâmetros ausentes.' }, { status: 400 })

  const svc = createAdminClient()
  // Sessão = credencial do aluno + escopo do tenant.
  const { data: sess } = await svc.from('simulado_sessoes_prova').select('id, tenant_id, simulado_id, estudante_id').eq('id', sessaoId).maybeSingle()
  if (!sess) return NextResponse.json({ message: 'Sessão não encontrada.' }, { status: 404 })
  const tenantId = (sess as any).tenant_id as string

  // Resolve a versão MAIS NOVA do documento (o template JÁ EDITADO fica num rascunho mais novo que a
  // versão publicada/importada). Editar um publicado cria nova versão → `versao_atual_id` fica na antiga,
  // por isso NÃO uso ele aqui: pego a última por `numero`. Fallback: versaoId direto (links antigos).
  const campos = 'id, arquivo_key, hash_arquivo'
  let ver: any = null
  if (docId) {
    const { data: doc } = await svc.from('simulado_conteudo_documentos').select('id').eq('id', docId).eq('tenant_id', tenantId).eq('deletado', false).maybeSingle()
    if (doc) ver = (await svc.from('simulado_conteudo_versoes').select(campos).eq('tenant_id', tenantId).eq('documento_id', docId).order('numero', { ascending: false }).limit(1).maybeSingle()).data
  }
  if (!ver && versaoIdParam) ver = (await svc.from('simulado_conteudo_versoes').select(campos).eq('id', versaoIdParam).eq('tenant_id', tenantId).maybeSingle()).data
  if (!ver?.arquivo_key) return NextResponse.json({ message: 'Documento não encontrado.' }, { status: 404 })
  const versaoId = ver.id as string
  const h8 = String((ver as any).hash_arquivo || '').slice(0, 8)

  // Cache do PDF por sessão + versão/hash. Sufixo `_vN` = marca da LÓGICA (dados + render); bump p/ invalidar
  // PDFs antigos. `_v4` = auto-heal que FECHA laço órfão no limite da célula. `_v5` = contrato ÚNICO de
  // variáveis por slug (pilares/sub-pilares/disciplinas) p/ cards do botão "＋ Card" não saírem em branco.
  const bucket = await resolverBucketConteudo()
  const pdfPath = `conteudo-diag-aluno/${tenantId}/${sessaoId}_${versaoId}_${h8}_v5.pdf`
  const cachedUrl = await urlAssinadaOriginal(pdfPath, 600)
  if (cachedUrl) { try { const r = await fetch(cachedUrl); if (r.ok) return pdfResp(new Uint8Array(await r.arrayBuffer()), nome) } catch { /* gera abaixo */ } }

  // banco_base_id do simulado → valores REAIS do aluno (por sessão).
  const { data: sim } = await svc.from('simulado_simulados').select('titulo, regras').eq('id', (sess as any).simulado_id).eq('tenant_id', tenantId).maybeSingle()
  const bancoId = (((sim as any)?.regras as any)?.banco_base_id as string | undefined) || null
  if (!bancoId) return NextResponse.json({ message: 'Banco não configurado para este simulado.' }, { status: 404 })

  // IMPORTANTE: passar o ALUNO (estudante_id da sessão) + achar o registro certo. Sem `aluno`, o merge
  // carrega TODOS os alunos ordenados por nome e registros[0] vira o primeiro alfabético ("Alice…"), não o
  // dono da sessão → vinha nome errado e 0 acertos.
  const estudanteId = (sess as any).estudante_id as string
  const { registros, disciplinas } = await carregarDadosBancoCore(svc, tenantId, bancoId, { sessao: sessaoId, aluno: estudanteId })
  const reg = registros.find((r) => r.id === estudanteId) ?? registros[0]
  const vars = (reg?.vars ?? {}) as Record<string, string>
  // Dict docxtemplater: base de exemplo + vars REAIS do aluno + laço {#disciplinas}.
  const dados: Record<string, unknown> = {
    ...DADOS_PREVIA,
    ...vars,
    simulado: (sim as any)?.titulo || vars.simulado || (DADOS_PREVIA as any).simulado,
    tempo_usado: vars.tempo_total || (DADOS_PREVIA as any).tempo_usado, // merge dá tempo_total; template usa tempo_usado
    disciplinas: disciplinas.map((d) => ({
      nome: d.nome,
      acertos: vars[`acerto_${d.chave}`] ?? '0',
      total: vars[`total_${d.chave}`] ?? '0',
      pct: vars[`pct_${d.chave}`] ?? '0%',
      assuntos: vars[`assuntos_${d.chave}`] ?? '',
    })),
  }
  // CONTRATO ÚNICO de variáveis (MESMO emissor da prévia — fim da divergência "prévia certa × relatório real
  // em branco"): p/ TODO pilar/sub-pilar presente em `vars` + TODA disciplina + geral, gera por SLUG
  // <slug>_pct/_acertos/_total + faixas <slug>_f1/_f2/_f3 + <slug>_faixa/_nivel, a partir dos valores REAIS do
  // aluno. Gerado DEPOIS do spread de `vars` (essas chaves por-sufixo não existem em vars). ls/jur/dout = compat.
  const textos = await carregarTextosDesempenho(tenantId)
  const CURTAS_PILAR: Record<string, string> = { lei_seca: 'ls', jurisprudencia: 'jur', doutrina: 'dout' }
  for (const k of Object.keys(vars)) {
    const m = /^acerto_pilar_(.+)$/.exec(k); if (!m) continue
    const slug = m[1]
    const a = Number(vars[`acerto_pilar_${slug}`] || 0), t = Number(vars[`total_pilar_${slug}`] || 0)
    emitirVarsAgrupamento(dados, slug, a, t, { nome: nomeDoSlug(slug), textos })
    if (CURTAS_PILAR[slug]) emitirVarsAgrupamento(dados, CURTAS_PILAR[slug], a, t, { nome: nomeDoSlug(slug), textos })
  }
  for (const d of disciplinas) {
    const a = Number(vars[`acerto_${d.chave}`] || 0), t = Number(vars[`total_${d.chave}`] || 0)
    emitirVarsAgrupamento(dados, d.chave, a, t, { nome: d.nome, textos })
    const s = slugVar(d.nome); if (s && s !== d.chave) emitirVarsAgrupamento(dados, s, a, t, { nome: d.nome, textos })
  }
  { const gA = Number(vars.acertos || 0), gT = Number(vars.total_questoes || 0); if (gT) emitirVarsAgrupamento(dados, 'geral', gA, gT, { nome: 'desempenho geral', textos }) }

  // .docx original → preenchido → PDF via OnlyOffice (ConvertService precisa de URL pública/assinada).
  const buf = await baixarOriginal((ver as any).arquivo_key)
  if (!buf) return NextResponse.json({ message: 'Falha ao abrir o documento.' }, { status: 502 })
  const filled = await renderPreviaDocx(buf, dados)
  // Hash do CONTEÚDO PREENCHIDO = identidade do PDF p/ este aluno/dados. Entra no path do tmp E no `key` do
  // ConvertService — senão o OnlyOffice cacheia por key constante e devolve o PDF da 1ª conversão (bug Alice).
  const contentHash = createHash('sha1').update(filled).digest('hex').slice(0, 16)
  const tmpPath = `conteudo-diag-tmp/${tenantId}/${sessaoId}_${contentHash}.docx`
  try { await uploadArquivo({ tenantId, bucket, path: tmpPath, data: Buffer.from(filled), contentType: DOCX, nome: 'diag.docx', publico: false, criadoPor: null }) } catch { /* mesmo conteúdo já existe → segue p/ a URL assinada */ }
  const tmpUrl = await urlAssinadaOriginal(tmpPath, 600)
  if (!tmpUrl) return NextResponse.json({ message: 'Falha ao preparar o documento.' }, { status: 502 })
  const pdf = await converterDocxParaPdf(tmpUrl, `diag_${contentHash}`)
  if (!pdf) return NextResponse.json({ message: 'OnlyOffice indisponível para gerar o PDF.' }, { status: 502 })
  try { await uploadArquivo({ tenantId, bucket, path: pdfPath, data: pdf, contentType: PDF, nome: 'diagnostico.pdf', publico: false, criadoPor: null }) } catch { /* cache best-effort */ }
  return pdfResp(new Uint8Array(pdf), nome)
}
