import 'server-only'

// Fase 3 — proposta de correção discursiva pela IA (Claude visão), via API HTTP da Anthropic
// (sem SDK). A IA PROPÕE; o corretor humano DECIDE (nota nunca é automática).

export interface CompParaIA { id: string; nome: string; pontos: number; conceitos: { nome: string; pontos: number }[]; descricao?: string }
export interface ImagemIA { media_type: string; base64: string }
export interface QuesitoIA { competencia_id: string; nota: number; conceito?: string; excerpt?: string; recognized?: string[]; missing?: string[]; rationale?: string }
export interface PropostaIA { transcricao: string; quesitos: QuesitoIA[] }

const MODELO = process.env.IA_CORRECAO_MODELO || 'claude-opus-4-8'

const TOOL = {
  name: 'registrar_correcao',
  description: 'Registra a proposta de correção da resposta discursiva do aluno, quesito a quesito.',
  input_schema: {
    type: 'object',
    properties: {
      transcricao: { type: 'string', description: 'Transcrição FIEL de toda a resposta manuscrita do aluno (nas imagens).' },
      quesitos: {
        type: 'array',
        description: 'Um item por quesito (competência) informado.',
        items: {
          type: 'object',
          properties: {
            competencia_id: { type: 'string', description: 'ID da competência avaliada (use exatamente os IDs fornecidos).' },
            nota: { type: 'number', description: 'Pontuação sugerida, entre 0 e os pontos do quesito.' },
            conceito: { type: 'string', description: 'Nome do conceito escolhido, da lista de conceitos do quesito (se houver).' },
            excerpt: { type: 'string', description: 'Trecho da resposta do aluno referente a este quesito.' },
            recognized: { type: 'array', items: { type: 'string' }, description: 'O que o aluno ALCANÇOU neste quesito.' },
            missing: { type: 'array', items: { type: 'string' }, description: 'O que FALTOU ou está equivocado.' },
            rationale: { type: 'string', description: 'Fundamentação técnica curta do desconto (privada ao corretor).' },
          },
          required: ['competencia_id', 'nota'],
        },
      },
    },
    required: ['transcricao', 'quesitos'],
  },
} as const

const SISTEMA = [
  'Você é um assistente de correção de provas discursivas de concurso jurídico brasileiro.',
  'Sua correção é uma PROPOSTA: o corretor humano decide a nota final. Nunca afirme que a nota é definitiva.',
  'Regras:',
  '1) Transcreva FIELMENTE a resposta manuscrita do aluno (imagens) — sem corrigir nem completar.',
  '2) Avalie cada quesito (competência) SOMENTE contra o espelho/gabarito fornecido. Não invente critérios além do espelho.',
  '3) Para cada quesito: sugira uma nota entre 0 e os pontos do quesito; escolha um conceito da lista (se houver); extraia o trecho do aluno; liste o ALCANÇADO e o que FALTOU/equivocado; escreva uma fundamentação técnica curta.',
  '4) Seja rigoroso, imparcial e conservador. Na dúvida, sinalize no rationale.',
  'Responda EXCLUSIVAMENTE chamando a ferramenta registrar_correcao.',
].join('\n')

/** Monta o prompt (fotos do aluno + PDF do espelho + competências) e chama Claude visão. */
export async function proporCorrecaoIA(input: { imagens: ImagemIA[]; gabaritoPdf?: string | null; enunciado: string; competencias: CompParaIA[] }): Promise<PropostaIA> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) throw new Error('IA não configurada: defina ANTHROPIC_API_KEY no ambiente.')
  if (!input.imagens.length) throw new Error('O aluno não enviou foto(s) desta questão — nada para a IA analisar.')

  const compsTxt = input.competencias.map((c) => {
    const conc = c.conceitos?.length ? ` | conceitos: ${c.conceitos.map((x) => `${x.nome}=${x.pontos}`).join(', ')}` : ''
    const desc = c.descricao?.trim() ? ` | espelho: ${c.descricao.trim()}` : ''
    return `- id=${c.id} · "${c.nome}" · máx ${c.pontos} ponto(s)${conc}${desc}`
  }).join('\n')

  const content: any[] = []
  content.push({ type: 'text', text: `ENUNCIADO DA QUESTÃO:\n${(input.enunciado || '—').replace(/<[^>]+>/g, ' ')}` })
  if (input.gabaritoPdf) content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: input.gabaritoPdf } })
  content.push({ type: 'text', text: `QUESITOS A AVALIAR (use exatamente estes competencia_id):\n${compsTxt}` })
  content.push({ type: 'text', text: 'RESPOSTA MANUSCRITA DO ALUNO (imagens a seguir). Transcreva e avalie:' })
  for (const img of input.imagens) content.push({ type: 'image', source: { type: 'base64', media_type: img.media_type, data: img.base64 } })

  const body = {
    model: MODELO,
    max_tokens: 4096,
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
  return {
    transcricao: String(p.transcricao ?? ''),
    quesitos: (p.quesitos ?? []).map((q) => ({
      competencia_id: String(q.competencia_id ?? ''),
      nota: Number(q.nota ?? 0) || 0,
      conceito: q.conceito ? String(q.conceito) : undefined,
      excerpt: q.excerpt ? String(q.excerpt) : undefined,
      recognized: arr(q.recognized),
      missing: arr(q.missing),
      rationale: q.rationale ? String(q.rationale) : undefined,
    })).filter((q) => q.competencia_id),
  }
}
