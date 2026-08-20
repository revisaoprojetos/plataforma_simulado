import 'server-only'

// Fase 3 — proposta de correção discursiva pela IA (Claude visão), via API HTTP da Anthropic
// (sem SDK). Modelada pelo CONTRATO AURÉA (PROMPT_TRANSCRICAO_VISUAL.md): a IA é o "olho"
// que transcreve fielmente o manuscrito, LOCALIZA cada trecho (página/linhas) e devolve as
// CAIXAS de destaque em % da página (0–100). A IA PROPÕE; o corretor humano DECIDE.

export interface CompParaIA { id: string; nome: string; pontos: number; conceitos: { nome: string; pontos: number }[]; descricao?: string }
export interface ImagemIA { media_type: string; base64: string }
/** Caixa de destaque em PERCENTUAL da página (0–100), origem no canto superior esquerdo. */
export interface RegiaoIA { page: number; leftPct: number; topPct: number; widthPct: number; heightPct: number }
export interface QuesitoIA {
  competencia_id: string; nota: number; conceito?: string; excerpt?: string
  recognized?: string[]; missing?: string[]; rationale?: string
  status?: string; lines?: string; page?: number; mirror_excerpt?: string
  needs_review?: boolean; review_note?: string; regions?: RegiaoIA[]
}
export interface PropostaIA { transcricao: string; quesitos: QuesitoIA[] }

const MODELO = process.env.IA_CORRECAO_MODELO || 'claude-opus-4-8'
const MAX_REGioes = 6

const TOOL = {
  name: 'registrar_correcao',
  description: 'Registra a transcrição fiel + a proposta de correção da resposta discursiva do aluno, quesito a quesito, no padrão AURÉA.',
  input_schema: {
    type: 'object',
    properties: {
      transcricao: { type: 'string', description: 'Transcrição FIEL e literal de TODA a resposta manuscrita do aluno (imagens), preservando erros. Use [ilegível] e [?palpite] quando não conseguir ler; nunca invente.' },
      quesitos: {
        type: 'array',
        description: 'Um item por quesito (competência), na ordem fornecida.',
        items: {
          type: 'object',
          properties: {
            competencia_id: { type: 'string', description: 'ID da competência avaliada (use EXATAMENTE os IDs fornecidos).' },
            nota: { type: 'number', description: 'Pontuação sugerida, entre 0 e os pontos do quesito. DEVE ser exatamente a pontuação do conceito escolhido.' },
            conceito: { type: 'string', description: 'Nome EXATO de um dos conceitos do quesito (se houver gradação).' },
            status: { type: 'string', enum: ['integral', 'parcial', 'omitido', 'equivocado', 'revisar'], description: 'integral→nota=máx; parcial→0<nota<máx; omitido→nota=0 e excerpt vazio; equivocado→geralmente 0; revisar→marque needs_review.' },
            excerpt: { type: 'string', description: 'Transcrição LITERAL do trecho do aluno que fundamenta ESTE quesito (fronteira de sentido). Vazio se status=omitido. NUNCA repita o mesmo trecho entre quesitos nem copie do espelho.' },
            lines: { type: 'string', description: 'Faixa de linhas conforme a numeração impressa (ex.: "12–18"). Vazio se a folha não tiver numeração.' },
            page: { type: 'integer', description: 'Página da prova (a partir de 1) onde está o trecho.' },
            regions: {
              type: 'array',
              description: 'Caixas de destaque sobre o trecho, em % da página (0–100). Precisas, não englobando a folha inteira. Uma por página quando o trecho vira a página.',
              items: {
                type: 'object',
                properties: {
                  page: { type: 'integer', description: 'Página (≥1).' },
                  leftPct: { type: 'number', description: '% da largura até a borda esquerda da caixa (0–100).' },
                  topPct: { type: 'number', description: '% da altura até o topo da caixa (0–100). Fórmula: T + ((linhaInicial−1)/N)×A.' },
                  widthPct: { type: 'number', description: '% da largura (1–100).' },
                  heightPct: { type: 'number', description: '% da altura (1–100). Fórmula: ((linhaFinal−linhaInicial+1)/N)×A.' },
                },
                required: ['page', 'leftPct', 'topPct', 'widthPct', 'heightPct'],
              },
            },
            mirror_excerpt: { type: 'string', description: 'Trecho EXATO do espelho/gabarito que fundamenta a avaliação deste quesito.' },
            recognized: { type: 'array', items: { type: 'string' }, description: 'Elementos do espelho que o aluno ALCANÇOU.' },
            missing: { type: 'array', items: { type: 'string' }, description: 'Elementos AUSENTES ou equivocados.' },
            rationale: { type: 'string', description: 'Fundamentação técnica curta, vinculando trecho e espelho (privada ao corretor).' },
            needs_review: { type: 'boolean', description: 'true quando há dúvida CONCRETA (leitura ambígua no trecho decisivo, trecho que serve a >1 quesito, correspondência discutível).' },
            review_note: { type: 'string', description: 'Descrição objetiva da dúvida (obrigatória se needs_review=true).' },
          },
          required: ['competencia_id', 'nota', 'status', 'excerpt', 'mirror_excerpt', 'recognized', 'missing', 'rationale', 'needs_review'],
        },
      },
    },
    required: ['transcricao', 'quesitos'],
  },
} as const

const SISTEMA = [
  'Você é o OLHO de um sistema de correção de provas discursivas de concurso jurídico brasileiro (padrão AURÉA). A plataforma não lê a prova: ela apenas desenha, sobre a página, as caixas que você informar e mostra o texto que você transcrever. Sua correção é uma PROPOSTA — o corretor humano decide a nota final.',
  '',
  'PRIORIDADES, nesta ordem: (1) FIDELIDADE da transcrição; (2) PRECISÃO ESPACIAL das caixas; (3) COERÊNCIA interna (conceito, nota e status contando a mesma história); (4) HONESTIDADE sobre a dúvida.',
  '',
  'TRANSCRIÇÃO (escriba, não revisor): transcreva o que ESTÁ escrito, não o que deveria estar. NÃO corrija ortografia/acentuação/concordância, não complete frases, não troque termo leigo por técnico, não normalize pontuação. Trecho ilegível → [ilegível]; palpite razoável → [?palavra]; rasura legível → [rasurado: x]. Um chute errado pode custar ponto ao aluno: na dúvida, marque em vez de adivinhar. Nunca transcreva o espelho como se fosse do aluno.',
  '',
  'SISTEMA DE COORDENADAS (regions): retângulos em PERCENTUAL da página (0–100), origem no canto superior esquerdo, eixo vertical crescendo para BAIXO. Em folha com linhas numeradas use a numeração como régua: topPct = T + ((linhaInicial−1)/N)×A e heightPct = ((linhaFinal−linhaInicial+1)/N)×A, onde T=topo da área de texto (%), A=altura da área de texto (%), N=total de linhas. Sem numeração, estime por faixas e arredonde com folga. Regras: topPct<100 e leftPct<100 (senão a caixa é descartada); leftPct+widthPct≤100 e topPct+heightPct≤100; largura/altura≥1. A caixa deve cair SOBRE o trecho, não englobar a folha inteira. Um quesito pode ter várias caixas (inclusive em páginas diferentes).',
  '',
  'AVALIAÇÃO: avalie cada quesito SOMENTE contra o espelho fornecido; não invente critérios. Escolha um conceito da lista (quando houver) e a nota DEVE ser exatamente a pontuação desse conceito. status: integral→nota=máx; parcial→0<nota<máx; omitido→nota=0 e excerpt vazio; equivocado→tratou incorretamente (geralmente 0); revisar→não conseguiu enquadrar com segurança (marque needs_review). NUNCA reuse o mesmo excerpt em quesitos diferentes.',
  '',
  'NÃO escreva a mensagem final ao aluno — isso é fase posterior, feita após aprovação humana. Responda EXCLUSIVAMENTE chamando a ferramenta registrar_correcao.',
].join('\n')

const clampPct = (v: any, lo = 0, hi = 100) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : 0 }

/** Normaliza uma caixa em % garantindo as regras de validade do contrato (§2.6). */
function normRegiao(r: any): RegiaoIA | null {
  if (!r) return null
  const page = Math.max(1, Math.round(Number(r.page) || 1))
  let leftPct = clampPct(r.leftPct), topPct = clampPct(r.topPct)
  let widthPct = clampPct(r.widthPct, 1, 100), heightPct = clampPct(r.heightPct, 1, 100)
  if (leftPct >= 100) leftPct = 0
  if (topPct >= 100) topPct = 0
  if (leftPct + widthPct > 100) widthPct = 100 - leftPct
  if (topPct + heightPct > 100) heightPct = 100 - topPct
  if (widthPct < 1 || heightPct < 1) return null
  return { page, leftPct, topPct, widthPct, heightPct }
}

/** Monta o prompt (fotos do aluno + PDF do espelho + competências) e chama Claude visão. */
export async function proporCorrecaoIA(input: { imagens: ImagemIA[]; gabaritoPdf?: string | null; enunciado: string; competencias: CompParaIA[] }): Promise<PropostaIA> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) throw new Error('IA não configurada: defina ANTHROPIC_API_KEY no ambiente.')
  if (!input.imagens.length) throw new Error('O aluno não enviou foto(s) desta questão — nada para a IA analisar.')

  const compsTxt = input.competencias.map((c) => {
    const conc = c.conceitos?.length ? ` | conceitos: ${c.conceitos.map((x) => `${x.nome}=${x.pontos}`).join(', ')}` : ''
    const desc = c.descricao?.trim() ? ` | espelho: ${c.descricao.trim()}` : ''
    return `- competencia_id=${c.id} · "${c.nome}" · máx ${c.pontos} ponto(s)${conc}${desc}`
  }).join('\n')

  const content: any[] = []
  content.push({ type: 'text', text: `ENUNCIADO DA QUESTÃO:\n${(input.enunciado || '—').replace(/<[^>]+>/g, ' ')}` })
  if (input.gabaritoPdf) content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: input.gabaritoPdf } })
  content.push({ type: 'text', text: `QUESITOS A AVALIAR (use exatamente estes competencia_id, na ordem):\n${compsTxt}` })
  content.push({ type: 'text', text: 'RESPOSTA MANUSCRITA DO ALUNO (imagens a seguir, na ordem = páginas 1..N). Transcreva fielmente, localize cada trecho e devolva as caixas de destaque:' })
  for (const img of input.imagens) content.push({ type: 'image', source: { type: 'base64', media_type: img.media_type, data: img.base64 } })

  const body = {
    model: MODELO,
    max_tokens: 8192,
    system: SISTEMA,
    tools: [TOOL],
    tool_choice: { type: 'tool', name: 'registrar_correcao' },
    messages: [{ role: 'user', content }],
  }

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await resp.json().catch(() => ({}))
  if (!resp.ok) throw new Error((data as any)?.error?.message || `IA retornou ${resp.status}.`)
  const toolUse = ((data as any).content || []).find((c: any) => c.type === 'tool_use')
  if (!toolUse?.input) throw new Error('A IA não retornou uma proposta estruturada.')

  const p = toolUse.input as PropostaIA
  const arr = (v: any): string[] => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [])
  const maxDe = new Map(input.competencias.map((c) => [c.id, c.pontos]))
  return {
    transcricao: String(p.transcricao ?? ''),
    quesitos: (p.quesitos ?? []).map((q) => {
      const id = String(q.competencia_id ?? '')
      const max = maxDe.get(id)
      let nota = Number(q.nota ?? 0) || 0
      if (typeof max === 'number') nota = Math.min(max, Math.max(0, nota)) // clamp preservando a proposta
      const regions = Array.isArray(q.regions) ? q.regions.map(normRegiao).filter((x): x is RegiaoIA => !!x).slice(0, MAX_REGioes) : []
      return {
        competencia_id: id,
        nota,
        conceito: q.conceito ? String(q.conceito) : undefined,
        status: q.status ? String(q.status) : undefined,
        excerpt: q.excerpt ? String(q.excerpt) : undefined,
        lines: q.lines ? String(q.lines) : undefined,
        page: q.page != null ? Math.max(1, Math.round(Number(q.page) || 1)) : undefined,
        mirror_excerpt: q.mirror_excerpt ? String(q.mirror_excerpt) : undefined,
        recognized: arr(q.recognized),
        missing: arr(q.missing),
        rationale: q.rationale ? String(q.rationale) : undefined,
        needs_review: !!q.needs_review,
        review_note: q.review_note ? String(q.review_note) : undefined,
        regions,
      }
    }).filter((q) => q.competencia_id),
  }
}
