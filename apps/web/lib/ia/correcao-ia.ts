import 'server-only'
import type { ConfigIA, Provedor } from './config'

// Proposta de correção discursiva pela IA de VISÃO — MULTI-PROVEDOR (Anthropic/OpenAI/
// Google), modelada pelo CONTRATO AURÉA (PROMPT_TRANSCRICAO_VISUAL.md). A IA é o "olho":
// transcreve fiel, LOCALIZA cada trecho (página/linhas) e devolve as CAIXAS de destaque
// em % da página (0–100). A IA PROPÕE; o corretor humano DECIDE.

export interface CompParaIA { id: string; nome: string; pontos: number; conceitos: { nome: string; pontos: number }[]; descricao?: string }
export interface ImagemIA { media_type: string; base64: string }
export interface RegiaoIA { page: number; leftPct: number; topPct: number; widthPct: number; heightPct: number }
export interface QuesitoIA {
  competencia_id: string; nota: number; conceito?: string; excerpt?: string
  recognized?: string[]; missing?: string[]; rationale?: string
  status?: string; lines?: string; page?: number; mirror_excerpt?: string
  needs_review?: boolean; review_note?: string; regions?: RegiaoIA[]
}
export interface PropostaIA { transcricao: string; quesitos: QuesitoIA[] }
export interface EntradaIA {
  imagens: ImagemIA[]; gabaritoPdf?: string | null; gabaritoTexto?: string | null
  enunciado: string; competencias: CompParaIA[]; config?: ConfigIA | null
}

const MAX_REGioes = 6

// Esquema (JSON Schema) usado pela tool-use da Anthropic.
const SCHEMA_QUESITO = {
  type: 'object',
  properties: {
    competencia_id: { type: 'string', description: 'ID da competência avaliada (use EXATAMENTE os IDs fornecidos).' },
    nota: { type: 'number', description: 'Pontuação entre 0 e os pontos do quesito. DEVE ser a pontuação do conceito escolhido.' },
    conceito: { type: 'string', description: 'Nome EXATO de um dos conceitos do quesito (se houver gradação).' },
    status: { type: 'string', enum: ['integral', 'parcial', 'omitido', 'equivocado', 'revisar'] },
    excerpt: { type: 'string', description: 'Transcrição LITERAL do trecho do aluno para ESTE quesito. Vazio se omitido. Nunca reciclar entre quesitos nem copiar do espelho.' },
    lines: { type: 'string', description: 'Faixa de linhas conforme a numeração impressa (ex.: "12–18"). Vazio se sem numeração.' },
    page: { type: 'integer', description: 'Página da prova (≥1).' },
    regions: {
      type: 'array',
      items: { type: 'object', properties: { page: { type: 'integer' }, leftPct: { type: 'number' }, topPct: { type: 'number' }, widthPct: { type: 'number' }, heightPct: { type: 'number' } }, required: ['page', 'leftPct', 'topPct', 'widthPct', 'heightPct'] },
      description: 'Caixas de destaque sobre o trecho, em % da página (0–100). Precisas, não a folha inteira.',
    },
    mirror_excerpt: { type: 'string', description: 'Trecho EXATO do espelho que fundamenta a avaliação.' },
    recognized: { type: 'array', items: { type: 'string' } },
    missing: { type: 'array', items: { type: 'string' } },
    rationale: { type: 'string', description: 'Fundamentação técnica curta (privada ao corretor).' },
    needs_review: { type: 'boolean' },
    review_note: { type: 'string' },
  },
  required: ['competencia_id', 'nota', 'status', 'excerpt', 'mirror_excerpt', 'recognized', 'missing', 'rationale', 'needs_review'],
} as const

const TOOL = {
  name: 'registrar_correcao',
  description: 'Registra a transcrição fiel + a proposta de correção, quesito a quesito, no padrão AURÉA.',
  input_schema: {
    type: 'object',
    properties: {
      transcricao: { type: 'string', description: 'Transcrição FIEL e literal de TODA a resposta manuscrita (imagens), preservando erros. Use [ilegível]/[?palpite] quando não conseguir ler; nunca invente.' },
      quesitos: { type: 'array', description: 'Um item por quesito, na ordem fornecida.', items: SCHEMA_QUESITO },
    },
    required: ['transcricao', 'quesitos'],
  },
} as const

const SISTEMA = [
  'Você é o OLHO de um sistema de correção de provas discursivas de concurso jurídico brasileiro (padrão AURÉA). A plataforma não lê a prova: ela apenas desenha, sobre a página, as caixas que você informar e mostra o texto que você transcrever. Sua correção é uma PROPOSTA — o corretor humano decide a nota final.',
  '',
  'PRIORIDADES: (1) FIDELIDADE da transcrição; (2) PRECISÃO ESPACIAL das caixas; (3) COERÊNCIA interna (conceito, nota e status contando a mesma história); (4) HONESTIDADE sobre a dúvida.',
  '',
  'TRANSCRIÇÃO (escriba, não revisor): transcreva o que ESTÁ escrito, não o que deveria estar. NÃO corrija ortografia/acentuação/concordância, não complete frases, não troque termo leigo por técnico. Trecho ilegível → [ilegível]; palpite → [?palavra]; rasura legível → [rasurado: x]. Na dúvida, marque em vez de adivinhar. Nunca transcreva o espelho como se fosse do aluno. Escreva em TEXTO CORRIDO (não quebre a cada linha da folha; una as linhas da mesma frase; junte palavra partida por hífen no fim da linha; separe apenas parágrafos reais) e em grafia NORMAL de maiúsculas/minúsculas — NÃO escreva tudo em CAIXA ALTA.',
  '',
  'COORDENADAS (regions): retângulos em PERCENTUAL da página (0–100), origem no canto superior esquerdo, eixo vertical crescendo para BAIXO. Com linhas numeradas: topPct = T + ((linhaInicial−1)/N)×A e heightPct = ((linhaFinal−linhaInicial+1)/N)×A (T=topo da área de texto %, A=altura da área %, N=total de linhas). Regras: topPct<100 e leftPct<100; leftPct+widthPct≤100 e topPct+heightPct≤100; largura/altura≥1. A caixa cai SOBRE o trecho, não engloba a folha inteira. Um quesito pode ter várias caixas.',
  '',
  'AVALIAÇÃO: avalie cada quesito SOMENTE contra o espelho; não invente critérios. A nota DEVE ser exatamente a pontuação do conceito escolhido. status: integral→nota=máx; parcial→0<nota<máx; omitido→nota=0 e excerpt vazio; equivocado→incorreto (geralmente 0); revisar→marque needs_review. NUNCA reuse o mesmo excerpt em quesitos diferentes.',
  '',
  'NÃO escreva a mensagem final ao aluno.',
].join('\n')

const FORMA_JSON = [
  'Responda com APENAS um JSON válido (sem cercas de código, sem texto fora do JSON), no formato:',
  '{"transcricao": "texto fiel de toda a resposta", "quesitos": [{',
  '  "competencia_id": "<id exato>", "nota": <número>, "conceito": "<nome do conceito|>",',
  '  "status": "integral|parcial|omitido|equivocado|revisar", "excerpt": "<trecho literal do aluno>",',
  '  "lines": "12–18", "page": 1, "regions": [{"page":1,"leftPct":10,"topPct":41.3,"widthPct":80,"heightPct":18.7}],',
  '  "mirror_excerpt": "<trecho do espelho>", "recognized": ["…"], "missing": ["…"], "rationale": "<privado>",',
  '  "needs_review": false, "review_note": ""',
  '}]}',
].join('\n')

const clampPct = (v: any, lo = 0, hi = 100) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : 0 }
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

/** Texto do prompt do usuário (enunciado + espelho[texto] + quesitos + instrução). */
function montarTexto(input: EntradaIA): string {
  const compsTxt = input.competencias.map((c) => {
    const conc = c.conceitos?.length ? ` | conceitos: ${c.conceitos.map((x) => `${x.nome}=${x.pontos}`).join(', ')}` : ''
    const desc = c.descricao?.trim() ? ` | espelho: ${c.descricao.trim()}` : ''
    return `- competencia_id=${c.id} · "${c.nome}" · máx ${c.pontos} ponto(s)${conc}${desc}`
  }).join('\n')
  const partes = [`ENUNCIADO DA QUESTÃO:\n${(input.enunciado || '—').replace(/<[^>]+>/g, ' ')}`]
  if (input.gabaritoTexto?.trim()) partes.push(`ESPELHO / GABARITO (texto):\n${input.gabaritoTexto.trim().slice(0, 12000)}`)
  partes.push(`QUESITOS A AVALIAR (use exatamente estes competencia_id, na ordem):\n${compsTxt}`)
  partes.push('RESPOSTA MANUSCRITA DO ALUNO (imagens a seguir = páginas 1..N). Transcreva fielmente, localize cada trecho e devolva as caixas de destaque.')
  return partes.join('\n\n')
}

function parseJson(txt: string): any {
  const s = String(txt || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()
  try { return JSON.parse(s) } catch { /* tenta extrair o 1º objeto */ }
  const i = s.indexOf('{'), j = s.lastIndexOf('}')
  if (i >= 0 && j > i) { try { return JSON.parse(s.slice(i, j + 1)) } catch { return null } }
  return null
}

// ── Provedores ────────────────────────────────────────────────────────────────
async function chamarAnthropic(cfg: ConfigIA, input: EntradaIA, texto: string): Promise<any> {
  const content: any[] = [{ type: 'text', text: texto }]
  if (input.gabaritoPdf) content.splice(1, 0, { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: input.gabaritoPdf } })
  for (const img of input.imagens) content.push({ type: 'image', source: { type: 'base64', media_type: img.media_type, data: img.base64 } })
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: cfg.modelo, max_tokens: 8192, system: SISTEMA, tools: [TOOL], tool_choice: { type: 'tool', name: 'registrar_correcao' }, messages: [{ role: 'user', content }] }),
  })
  const data = await resp.json().catch(() => ({}))
  if (!resp.ok) throw new Error((data as any)?.error?.message || `Anthropic retornou ${resp.status}.`)
  const toolUse = ((data as any).content || []).find((c: any) => c.type === 'tool_use')
  if (!toolUse?.input) throw new Error('A IA (Anthropic) não retornou uma proposta estruturada.')
  return toolUse.input
}

async function chamarOpenAI(cfg: ConfigIA, input: EntradaIA, texto: string): Promise<any> {
  const userContent: any[] = [{ type: 'text', text: `${texto}\n\n${FORMA_JSON}` }]
  for (const img of input.imagens) userContent.push({ type: 'image_url', image_url: { url: `data:${img.media_type};base64,${img.base64}` } })
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: `Bearer ${cfg.apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: cfg.modelo, max_tokens: 8192, temperature: 0.2, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: SISTEMA }, { role: 'user', content: userContent }] }),
  })
  const data = await resp.json().catch(() => ({}))
  if (!resp.ok) throw new Error((data as any)?.error?.message || `OpenAI retornou ${resp.status}.`)
  const raw = parseJson((data as any)?.choices?.[0]?.message?.content ?? '')
  if (!raw) throw new Error('A IA (OpenAI) não retornou JSON válido.')
  return raw
}

async function chamarGemini(cfg: ConfigIA, input: EntradaIA, texto: string): Promise<any> {
  const parts: any[] = [{ text: `${texto}\n\n${FORMA_JSON}` }]
  if (input.gabaritoPdf) parts.push({ inlineData: { mimeType: 'application/pdf', data: input.gabaritoPdf } })
  for (const img of input.imagens) parts.push({ inlineData: { mimeType: img.media_type, data: img.base64 } })
  const data = await gerarGemini(cfg.apiKey, cfg.modelo, { systemInstruction: { parts: [{ text: SISTEMA }] }, contents: [{ role: 'user', parts }], generationConfig: { responseMimeType: 'application/json', temperature: 0.2, maxOutputTokens: 8192 } })
  const txt = ((data as any)?.candidates?.[0]?.content?.parts ?? []).map((p: any) => p?.text ?? '').join('')
  const raw = parseJson(txt)
  if (!raw) throw new Error('A IA (Gemini) não retornou JSON válido.')
  return raw
}

const CHAMADA: Record<Provedor, (cfg: ConfigIA, input: EntradaIA, texto: string) => Promise<any>> = {
  anthropic: chamarAnthropic, openai: chamarOpenAI, gemini: chamarGemini,
}

/** Normaliza a resposta crua da IA (qualquer provedor) no contrato PropostaIA. */
function normalizar(raw: any, competencias: CompParaIA[]): PropostaIA {
  const arr = (v: any): string[] => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [])
  const maxDe = new Map(competencias.map((c) => [c.id, c.pontos]))
  return {
    transcricao: String(raw?.transcricao ?? ''),
    quesitos: (raw?.quesitos ?? []).map((q: any) => {
      const id = String(q?.competencia_id ?? '')
      const max = maxDe.get(id)
      let nota = Number(q?.nota ?? 0) || 0
      if (typeof max === 'number') nota = Math.min(max, Math.max(0, nota))
      const regions = Array.isArray(q?.regions) ? q.regions.map(normRegiao).filter((x: any): x is RegiaoIA => !!x).slice(0, MAX_REGioes) : []
      return {
        competencia_id: id, nota,
        conceito: q?.conceito ? String(q.conceito) : undefined,
        status: q?.status ? String(q.status) : undefined,
        excerpt: q?.excerpt ? String(q.excerpt) : undefined,
        lines: q?.lines ? String(q.lines) : undefined,
        page: q?.page != null ? Math.max(1, Math.round(Number(q.page) || 1)) : undefined,
        mirror_excerpt: q?.mirror_excerpt ? String(q.mirror_excerpt) : undefined,
        recognized: arr(q?.recognized), missing: arr(q?.missing),
        rationale: q?.rationale ? String(q.rationale) : undefined,
        needs_review: !!q?.needs_review, review_note: q?.review_note ? String(q.review_note) : undefined,
        regions,
      }
    }).filter((q: QuesitoIA) => q.competencia_id),
  }
}

// Chama o Gemini tolerando modelo inválido/retirado: tenta o configurado + nomes atuais;
// se falhar por modelo, DESCOBRE os modelos reais da chave (ListModels) e usa um bom.
const GEMINI_CONHECIDOS = ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-flash-latest', 'gemini-1.5-flash']
const erroDeModelo = (m: string) => /model|not found|unexpected|invalid|404|400|supported/i.test(m)
async function gerarGemini(apiKey: string, modelo: string, body: any): Promise<any> {
  const base = (modelo || '').trim().replace(/^models\//, '')
  let ultimoErro = 'Falha no Gemini.'
  const tentar = async (m: string): Promise<{ ok: true; data: any } | { ok: false; erro: string }> => {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${encodeURIComponent(apiKey)}`
    const resp = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    const data = await resp.json().catch(() => ({}))
    if (resp.ok) return { ok: true, data }
    return { ok: false, erro: (data as any)?.error?.message || `Gemini retornou ${resp.status}.` }
  }
  // 1) nomes conhecidos (configurado primeiro)
  for (const m of [...new Set([base, ...GEMINI_CONHECIDOS])].filter(Boolean)) {
    const r = await tentar(m)
    if (r.ok) return r.data
    ultimoErro = r.erro
    if (!erroDeModelo(ultimoErro)) throw new Error(ultimoErro) // erro real (chave/quota) → não adianta trocar de modelo
  }
  // 2) descobre os modelos REAIS da chave e tenta os que suportam generateContent
  try {
    const lr = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`)
    const ld = await lr.json().catch(() => ({}))
    const disp: string[] = ((ld as any)?.models ?? [])
      .filter((m: any) => (m?.supportedGenerationMethods ?? []).includes('generateContent'))
      .map((m: any) => String(m?.name || '').replace(/^models\//, ''))
    const bons = disp.filter((n) => /gemini/i.test(n) && /flash|pro/i.test(n) && !/embedding|aqa|vision|thinking/i.test(n))
    for (const m of [...bons, ...disp].slice(0, 4)) { const r = await tentar(m); if (r.ok) return r.data; ultimoErro = r.erro }
  } catch { /* ListModels indisponível */ }
  throw new Error(ultimoErro)
}

// ── Transcrição de UMA REGIÃO (recorte) — texto puro, sem correção ─────────────
const PROMPT_REGIAO = [
  'Transcreva o texto manuscrito desta imagem (um trecho de uma prova de concurso).',
  'FORMATO: escreva em TEXTO CORRIDO. NÃO quebre a linha a cada linha da folha — junte as linhas que formam a mesma frase/parágrafo; se uma palavra estiver partida por hífen no fim da linha (ex.: "fi-" e depois "duciário"), junte-a ("fiduciário"). Separe parágrafos apenas com UMA linha em branco.',
  'GRAFIA: use maiúsculas e minúsculas NORMAIS do português (maiúscula só em início de frase, nomes próprios e siglas como IPTU/STJ). NÃO escreva tudo em CAIXA ALTA, mesmo que a letra do aluno pareça em caixa alta.',
  'FIDELIDADE: preserve os erros de ortografia/acentuação/concordância do aluno (não corrija) e não complete nem invente nada. Se algo for ilegível, escreva [ilegível].',
  'Responda SOMENTE com a transcrição, sem comentários.',
].join('\n')

/** Transcreve o texto manuscrito de UMA imagem (recorte da área de destaque). Texto puro. */
export async function transcreverImagemIA(cfg: ConfigIA, imagemBase64: string, mediaType: string): Promise<string> {
  if (cfg.provider === 'anthropic') {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: cfg.modelo, max_tokens: 2000, messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: mediaType, data: imagemBase64 } }, { type: 'text', text: PROMPT_REGIAO }] }] }),
    })
    const data = await resp.json().catch(() => ({}))
    if (!resp.ok) throw new Error((data as any)?.error?.message || `Anthropic retornou ${resp.status}.`)
    return ((data as any)?.content ?? []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('').trim()
  }
  if (cfg.provider === 'openai') {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', headers: { authorization: `Bearer ${cfg.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: cfg.modelo, max_tokens: 2000, temperature: 0, messages: [{ role: 'user', content: [{ type: 'text', text: PROMPT_REGIAO }, { type: 'image_url', image_url: { url: `data:${mediaType};base64,${imagemBase64}` } }] }] }),
    })
    const data = await resp.json().catch(() => ({}))
    if (!resp.ok) throw new Error((data as any)?.error?.message || `OpenAI retornou ${resp.status}.`)
    return String((data as any)?.choices?.[0]?.message?.content ?? '').trim()
  }
  // gemini
  const data = await gerarGemini(cfg.apiKey, cfg.modelo, { contents: [{ role: 'user', parts: [{ text: PROMPT_REGIAO }, { inlineData: { mimeType: mediaType, data: imagemBase64 } }] }], generationConfig: { temperature: 0, maxOutputTokens: 2000 } })
  return ((data as any)?.candidates?.[0]?.content?.parts ?? []).map((p: any) => p?.text ?? '').join('').trim()
}

// ── Análise por TEXTO (transcrição × espelho) — alcançado/faltou/conceito/nota ──
export interface QuesitoAnalise { competencia_id: string; nota: number; conceito?: string; recognized: string[]; missing: string[]; rationale?: string }
export interface AnaliseIA { quesitos: QuesitoAnalise[] }

const SISTEMA_ANALISE = [
  'Você é um corretor de provas discursivas de concurso jurídico brasileiro. Recebe o TEXTO TRANSCRITO da resposta do aluno e o ESPELHO/gabarito, e avalia quesito a quesito.',
  'Para CADA quesito: escolha um conceito da lista fornecida (a nota DEVE ser exatamente a pontuação desse conceito); liste, de forma OBJETIVA e curta (itens curtos), os pontos ALCANÇADOS (o que o aluno de fato atendeu do espelho) e os que FALTARAM ou estão equivocados; escreva uma fundamentação técnica curta ligando o texto do aluno ao espelho.',
  'Avalie SOMENTE contra o espelho — não invente critérios além dele. Seja rigoroso, imparcial e conservador. Não reescreva a resposta do aluno. Sua análise é uma PROPOSTA: o corretor humano decide a nota final.',
].join('\n')
const FORMA_ANALISE = 'Responda com APENAS um JSON válido (sem cercas, sem texto fora): {"quesitos":[{"competencia_id":"<id exato>","nota":<número>,"conceito":"<nome do conceito|>","recognized":["ponto alcançado", "..."],"missing":["ponto que faltou/equivocado", "..."],"rationale":"fundamentação curta"}]}'

/** Chamada de TEXTO (sem imagem) que devolve JSON — multi-provedor. */
async function chamarTextoIA(cfg: ConfigIA, system: string, userText: string): Promise<string> {
  if (cfg.provider === 'anthropic') {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: cfg.modelo, max_tokens: 4096, system, messages: [{ role: 'user', content: userText }] }),
    })
    const data = await resp.json().catch(() => ({}))
    if (!resp.ok) throw new Error((data as any)?.error?.message || `Anthropic retornou ${resp.status}.`)
    return ((data as any)?.content ?? []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('')
  }
  if (cfg.provider === 'openai') {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', headers: { authorization: `Bearer ${cfg.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: cfg.modelo, max_tokens: 4096, temperature: 0.2, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: system }, { role: 'user', content: userText }] }),
    })
    const data = await resp.json().catch(() => ({}))
    if (!resp.ok) throw new Error((data as any)?.error?.message || `OpenAI retornou ${resp.status}.`)
    return String((data as any)?.choices?.[0]?.message?.content ?? '')
  }
  const data = await gerarGemini(cfg.apiKey, cfg.modelo, { systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: userText }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.2, maxOutputTokens: 4096 } })
  return ((data as any)?.candidates?.[0]?.content?.parts ?? []).map((p: any) => p?.text ?? '').join('')
}

/** Analisa o TEXTO transcrito contra o espelho e devolve alcançado/faltou/conceito/nota por quesito. */
export async function analisarComTextoIA(cfg: ConfigIA, input: { textoAluno: string; enunciado: string; espelhoTexto?: string | null; competencias: CompParaIA[] }): Promise<AnaliseIA> {
  if (!input.textoAluno?.trim()) throw new Error('Sem texto transcrito para analisar — transcreva a resposta antes.')
  const compsTxt = input.competencias.map((c) => {
    const conc = c.conceitos?.length ? ` | conceitos: ${c.conceitos.map((x) => `${x.nome}=${x.pontos}`).join(', ')}` : ''
    const desc = c.descricao?.trim() ? ` | espelho: ${c.descricao.trim()}` : ''
    return `- competencia_id=${c.id} · "${c.nome}" · máx ${c.pontos} ponto(s)${conc}${desc}`
  }).join('\n')
  const user = [
    `ENUNCIADO DA QUESTÃO:\n${(input.enunciado || '—').replace(/<[^>]+>/g, ' ')}`,
    input.espelhoTexto?.trim() ? `ESPELHO / GABARITO (texto):\n${input.espelhoTexto.trim().slice(0, 14000)}` : '',
    `QUESITOS A AVALIAR (use exatamente estes competencia_id):\n${compsTxt}`,
    `RESPOSTA TRANSCRITA DO ALUNO:\n${input.textoAluno.trim().slice(0, 14000)}`,
    FORMA_ANALISE,
  ].filter(Boolean).join('\n\n')

  const out = await chamarTextoIA(cfg, SISTEMA_ANALISE, user)
  const raw = parseJson(out)
  if (!raw) throw new Error('A IA não retornou uma análise válida.')
  const arr = (v: any): string[] => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()).map((x) => String(x).trim()) : [])
  const maxDe = new Map(input.competencias.map((c) => [c.id, c.pontos]))
  return {
    quesitos: (raw?.quesitos ?? []).map((q: any) => {
      const id = String(q?.competencia_id ?? '')
      const max = maxDe.get(id)
      let nota = Number(q?.nota ?? 0) || 0
      if (typeof max === 'number') nota = Math.min(max, Math.max(0, nota))
      return { competencia_id: id, nota, conceito: q?.conceito ? String(q.conceito) : undefined, recognized: arr(q?.recognized), missing: arr(q?.missing), rationale: q?.rationale ? String(q.rationale) : undefined }
    }).filter((q: QuesitoAnalise) => q.competencia_id),
  }
}

/** Monta o prompt + chama o PROVEDOR da config (fallback: env ANTHROPIC_API_KEY). */
export async function proporCorrecaoIA(input: EntradaIA): Promise<PropostaIA> {
  let cfg = input.config ?? null
  if (!cfg && process.env.ANTHROPIC_API_KEY) cfg = { provider: 'anthropic', modelo: process.env.IA_CORRECAO_MODELO || 'claude-opus-4-8', apiKey: process.env.ANTHROPIC_API_KEY, mascara: '' }
  if (!cfg) throw new Error('IA não configurada: cadastre uma chave em Transcrição (IA) ou defina ANTHROPIC_API_KEY.')
  if (!input.imagens.length) throw new Error('O aluno não enviou foto(s) desta questão — nada para a IA analisar.')
  const texto = montarTexto(input)
  const raw = await CHAMADA[cfg.provider](cfg, input, texto)
  return normalizar(raw, input.competencias)
}
