import { Job } from 'bullmq'
import { createClient } from '@supabase/supabase-js'
import puppeteer from 'puppeteer-core'
import chromium from '@sparticuz/chromium'
import { createHash } from 'crypto'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// ─── HTML template helpers ────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function buildPdfHtml(data: {
  simuladoTitulo: string
  estudanteNome: string
  nota: number | null
  totalQuestoes: number
  acertos: number
  erros: number
  emBranco: number
  posicaoRanking: number | null
  questoes: Array<{
    ordem: number
    enunciado: string
    alternativas: Array<{ texto: string; correta: boolean; ordem: number }>
    respostaAluno: string | null   // alternativa_id marcada
    gabarito: string | null        // alternativa_id correta
    acertou: boolean | null
    anulada: boolean
  }>
}): string {
  const correta = '#16a34a'
  const errada = '#dc2626'
  const neutra = '#6b7280'

  const linhasQuestoes = data.questoes.map((q) => {
    const letraAluno = q.respostaAluno
      ? String.fromCharCode(65 + (q.alternativas.findIndex(a => a.texto === q.respostaAluno || a.ordem === q.alternativas.findIndex(b => b.texto === q.respostaAluno)) ))
      : '—'

    const altsHtml = q.alternativas
      .sort((a, b) => a.ordem - b.ordem)
      .map((alt, i) => {
        const letra = String.fromCharCode(65 + i)
        const isGabarito = alt.correta
        const isAluno = q.respostaAluno === String(alt.ordem) || q.respostaAluno === alt.texto
        const cor = isGabarito ? correta : (isAluno && !isGabarito ? errada : neutra)
        const bold = (isGabarito || isAluno) ? 'font-weight:bold;' : ''
        return `<div style="margin:2px 0;color:${cor};${bold}">${letra}) ${escapeHtml(alt.texto ?? '')}</div>`
      }).join('')

    const status = q.anulada ? '🚫 Anulada' : (q.acertou === null ? '—' : (q.acertou ? '✅' : '❌'))

    return `
      <div style="page-break-inside:avoid;margin-bottom:24px;padding:16px;border:1px solid #e5e7eb;border-radius:8px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
          <strong>Questão ${q.ordem}</strong>
          <span>${status}</span>
        </div>
        <p style="margin:0 0 12px;font-size:13px;line-height:1.5">${escapeHtml(q.enunciado ?? '')}</p>
        <div style="font-size:12px;line-height:1.6">${altsHtml}</div>
      </div>`
  }).join('')

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 14px; color: #111827; padding: 32px; }
  h1 { font-size: 22px; margin-bottom: 4px; }
  h2 { font-size: 16px; color: #374151; margin: 24px 0 12px; border-bottom: 2px solid #e5e7eb; padding-bottom: 6px; }
  .meta { color: #6b7280; font-size: 13px; margin-bottom: 24px; }
  .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 32px; }
  .stat { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; text-align: center; }
  .stat .val { font-size: 28px; font-weight: bold; }
  .stat .lbl { font-size: 11px; color: #6b7280; margin-top: 4px; }
  .nota-val { color: ${data.nota !== null && data.nota >= 6 ? '#16a34a' : '#dc2626'}; }
</style>
</head>
<body>
  <h1>${escapeHtml(data.simuladoTitulo)}</h1>
  <p class="meta">Aluno: ${escapeHtml(data.estudanteNome)} | Gerado em ${new Date().toLocaleDateString('pt-BR', { dateStyle: 'long' })}</p>

  <h2>Resultado</h2>
  <div class="stats">
    <div class="stat"><div class="val nota-val">${data.nota !== null ? data.nota.toFixed(1) : '—'}</div><div class="lbl">Nota Final</div></div>
    <div class="stat"><div class="val" style="color:#16a34a">${data.acertos}</div><div class="lbl">Acertos</div></div>
    <div class="stat"><div class="val" style="color:#dc2626">${data.erros}</div><div class="lbl">Erros</div></div>
    <div class="stat"><div class="val" style="color:#6b7280">${data.emBranco}</div><div class="lbl">Em Branco</div></div>
  </div>
  ${data.posicaoRanking ? `<p style="margin-bottom:32px;color:#6b7280">Posição no ranking: <strong>${data.posicaoRanking}º</strong></p>` : ''}

  <h2>Caderno de Questões</h2>
  ${linhasQuestoes}
</body>
</html>`
}

// ─── Processor ───────────────────────────────────────────────────────────────

export async function pdfRelatorioProcessor(job: Job) {
  const { sessao_id } = job.data as { sessao_id: string }
  console.log(`[pdf-relatorio] Gerando PDF para sessão ${sessao_id}`)

  // 1. Load session + simulado + student
  const { data: sessao, error: sessaoErr } = await supabase
    .from('sessoes_prova')
    .select('*, simulado:simulados(titulo), estudante:estudantes(nome, email)')
    .eq('id', sessao_id)
    .single()

  if (sessaoErr || !sessao) throw new Error(`Sessão ${sessao_id} não encontrada`)

  // 2. Load questions in session order
  const { data: sqRows } = await supabase
    .from('simulado_questoes')
    .select('questao_id, ordem, anulada, questoes(enunciado, alternativas(id, texto, correta, ordem))')
    .eq('simulado_id', sessao.simulado_id)
    .order('ordem')

  // 3. Load student answers
  const { data: respostas } = await supabase
    .from('respostas_objetivas')
    .select('questao_id, alternativa_id, correta')
    .eq('sessao_id', sessao_id)

  const respostaMap: Record<string, { alternativa_id: string; correta: boolean }> = {}
  for (const r of respostas ?? []) respostaMap[r.questao_id] = r

  // 4. Build questoes data
  const questoes = (sqRows ?? []).map((sq, i) => {
    const q = (sq.questoes as unknown) as { enunciado: string; alternativas: Array<{ id: string; texto: string; correta: boolean; ordem: number }> } | null
    const resp = respostaMap[sq.questao_id]
    const alternativas = (q?.alternativas ?? []).sort((a, b) => a.ordem - b.ordem)
    const gabaritoAlt = alternativas.find(a => a.correta)

    return {
      ordem: i + 1,
      enunciado: q?.enunciado ?? '',
      alternativas: alternativas.map(a => ({ texto: a.texto, correta: a.correta, ordem: a.ordem })),
      respostaAluno: resp?.alternativa_id ?? null,
      gabarito: gabaritoAlt?.id ?? null,
      acertou: resp ? resp.correta : null,
      anulada: Boolean(sq.anulada),
    }
  })

  const totalQuestoes = questoes.length
  const acertos = questoes.filter(q => q.acertou === true).length
  const erros = questoes.filter(q => q.acertou === false).length
  const emBranco = questoes.filter(q => q.acertou === null && !q.anulada).length

  const simulado = sessao.simulado as { titulo: string } | null
  const estudante = sessao.estudante as { nome: string; email: string } | null

  // 5. Build HTML
  const html = buildPdfHtml({
    simuladoTitulo: simulado?.titulo ?? 'Simulado',
    estudanteNome: estudante?.nome ?? estudante?.email ?? 'Aluno',
    nota: sessao.nota ?? null,
    totalQuestoes,
    acertos,
    erros,
    emBranco,
    posicaoRanking: sessao.posicao_ranking ?? null,
    questoes,
  })

  // 6. Launch Puppeteer and generate PDF
  const browser = await puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: true,
  })

  let pdfBuffer: Buffer
  try {
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'load' })
    const rawPdf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' } })
    pdfBuffer = Buffer.from(rawPdf)
  } finally {
    await browser.close()
  }

  // 7. Upload to Supabase Storage
  const fileName = `relatorios/${sessao_id}_${createHash('sha256').update(sessao_id).digest('hex').slice(0, 8)}.pdf`
  const { error: uploadErr } = await supabase.storage
    .from('arquivos')
    .upload(fileName, pdfBuffer, { contentType: 'application/pdf', upsert: true })

  if (uploadErr) {
    console.error('[pdf-relatorio] Upload falhou:', uploadErr.message)
    // Fall through — still return partial result
  }

  const { data: { publicUrl } } = supabase.storage.from('arquivos').getPublicUrl(fileName)

  // 8. Save notification
  await supabase.from('notificacoes').insert({
    estudante_id: sessao.estudante_id,
    tipo: 'pdf_relatorio',
    titulo: 'Seu relatório está pronto',
    mensagem: `O PDF do simulado "${simulado?.titulo}" foi gerado. Clique para baixar.`,
    dados: { pdf_url: publicUrl, sessao_id },
  }).select()

  console.log(`[pdf-relatorio] PDF gerado: ${publicUrl}`)
  return { sessao_id, pdf_url: publicUrl }
}
