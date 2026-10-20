import 'server-only'
import type { ConfigIA } from '../config'

// Cliente de IA genérico (multi-provedor) para os agentes — segue o padrão por `fetch` já usado no
// projeto (lib/ia/correcao-ia.ts), mas DEVOLVE o uso de tokens (pra contabilizar custo por nível) e
// aceita override de modelo + saída estruturada (tool/JSON). Anthropic é o alvo; openai/gemini como
// fallback. server-only (a chave nunca vai ao browser).

export type ConteudoUser = string | any[]
export interface ToolIA { name: string; description?: string; input_schema: any }
export interface OpcoesIA {
  system?: string
  user: ConteudoUser
  model?: string
  maxTokens?: number
  temperature?: number
  /** Saída estruturada: no Anthropic vira tool-use; nos demais vira instrução de JSON + parse. */
  tool?: ToolIA
}
export interface UsoTokens { entrada: number; saida: number }
export interface RespostaIA { texto: string; toolInput: any | null; usage: UsoTokens; modelo: string }

function parseJson(txt: string): any {
  const s = String(txt || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()
  try { return JSON.parse(s) } catch { /* tenta extrair o 1º objeto */ }
  const i = s.indexOf('{'), j = s.lastIndexOf('}')
  if (i >= 0 && j > i) { try { return JSON.parse(s.slice(i, j + 1)) } catch { return null } }
  return null
}
const asContent = (u: ConteudoUser): any[] => (typeof u === 'string' ? [{ type: 'text', text: u }] : u)

async function anthropic(cfg: ConfigIA, model: string, o: OpcoesIA): Promise<RespostaIA> {
  const body: any = {
    model, max_tokens: o.maxTokens ?? 2048, temperature: o.temperature ?? 0.2,
    messages: [{ role: 'user', content: asContent(o.user) }],
  }
  if (o.system) body.system = o.system
  if (o.tool) { body.tools = [{ name: o.tool.name, description: o.tool.description, input_schema: o.tool.input_schema }]; body.tool_choice = { type: 'tool', name: o.tool.name } }
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data: any = await resp.json().catch(() => ({}))
  if (!resp.ok) throw new Error(data?.error?.message || `Anthropic retornou ${resp.status}.`)
  const blocks = data.content || []
  const toolUse = blocks.find((c: any) => c.type === 'tool_use')
  const texto = blocks.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('')
  const usage: UsoTokens = { entrada: data.usage?.input_tokens ?? 0, saida: data.usage?.output_tokens ?? 0 }
  return { texto, toolInput: toolUse?.input ?? (o.tool ? parseJson(texto) : null), usage, modelo: model }
}

async function openai(cfg: ConfigIA, model: string, o: OpcoesIA): Promise<RespostaIA> {
  const userText = o.tool ? `${textoDe(o.user)}\n\nResponda SOMENTE um JSON válido no schema:\n${JSON.stringify(o.tool.input_schema)}` : o.user
  const content = typeof userText === 'string' ? userText : userText
  const body: any = {
    model, max_tokens: o.maxTokens ?? 2048, temperature: o.temperature ?? 0.2,
    messages: [...(o.system ? [{ role: 'system', content: o.system }] : []), { role: 'user', content }],
  }
  if (o.tool) body.response_format = { type: 'json_object' }
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST', headers: { authorization: `Bearer ${cfg.apiKey}`, 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
  const data: any = await resp.json().catch(() => ({}))
  if (!resp.ok) throw new Error(data?.error?.message || `OpenAI retornou ${resp.status}.`)
  const texto = String(data?.choices?.[0]?.message?.content ?? '')
  const usage: UsoTokens = { entrada: data.usage?.prompt_tokens ?? 0, saida: data.usage?.completion_tokens ?? 0 }
  return { texto, toolInput: o.tool ? parseJson(texto) : null, usage, modelo: model }
}

async function gemini(cfg: ConfigIA, model: string, o: OpcoesIA): Promise<RespostaIA> {
  const txt = o.tool ? `${textoDe(o.user)}\n\nResponda SOMENTE um JSON válido no schema:\n${JSON.stringify(o.tool.input_schema)}` : textoDe(o.user)
  const body: any = {
    contents: [{ role: 'user', parts: [{ text: txt }] }],
    generationConfig: { temperature: o.temperature ?? 0.2, maxOutputTokens: o.maxTokens ?? 2048, ...(o.tool ? { responseMimeType: 'application/json' } : {}) },
  }
  if (o.system) body.systemInstruction = { parts: [{ text: o.system }] }
  const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
  const data: any = await resp.json().catch(() => ({}))
  if (!resp.ok) throw new Error(data?.error?.message || `Gemini retornou ${resp.status}.`)
  const texto = (data?.candidates?.[0]?.content?.parts ?? []).map((p: any) => p?.text ?? '').join('')
  const usage: UsoTokens = { entrada: data.usageMetadata?.promptTokenCount ?? 0, saida: data.usageMetadata?.candidatesTokenCount ?? 0 }
  return { texto, toolInput: o.tool ? parseJson(texto) : null, usage, modelo: model }
}

function textoDe(u: ConteudoUser): string {
  if (typeof u === 'string') return u
  return u.map((p) => (p?.type === 'text' ? p.text : '')).join('\n')
}

/** Uma chamada de IA (do provedor da config), com uso de tokens e saída estruturada opcional. */
export async function chamarIA(cfg: ConfigIA, o: OpcoesIA): Promise<RespostaIA> {
  const model = o.model || cfg.modelo
  if (cfg.provider === 'anthropic') return anthropic(cfg, model, o)
  if (cfg.provider === 'openai') return openai(cfg, model, o)
  return gemini(cfg, model, o)
}
