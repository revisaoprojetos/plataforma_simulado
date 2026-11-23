// Caderno (beta) — Onda 2a: lógica PURA de texto rico (validação de cor/fonte/tamanho, arquivos do caderno, resumo de marcas).
// Usada pela sanitização do doc (notebook-server.ts), pelo upload (rota /arquivos) e pelo painel "Resumo de marcas".
import { EXT_ANEXO, EXT_IMAGEM, IMAGEM_LARGURA, LIMITES, MARCAS_PARAGRAFO, ROTA_ARQUIVOS_NOTEBOOK, TAMANHO_FONTE } from './notebook-tipos'

const HEX_RE = /^#[0-9a-fA-F]{6}$/
const TOKEN_RE = /^[a-z0-9_-]{1,20}$/
const VAR_RE = /^var\(--[a-z0-9-]{1,40}\)$/
const FAMILIA_RE = /^[\p{L}\p{N} ,'"_-]{1,80}$/u
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'

/** Cor aceita: #rrggbb, chave de paleta (token) ou var(--token). Nunca rgb()/url()/expression. */
export function corValida(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  return HEX_RE.test(s) || TOKEN_RE.test(s) || VAR_RE.test(s) ? s : null
}

/** Família de fonte: só letras/números/espaço/vírgula/aspas; sem `;`, `(`, `:` (impede injeção de CSS). */
export function familiaValida(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  return FAMILIA_RE.test(s) ? s : null
}

/** Tamanho de fonte "16px" (6..200). Devolve a string normalizada. */
export function tamanhoFonteValido(v: unknown): string | null {
  if (typeof v === 'number' && Number.isFinite(v)) v = `${v}px`
  if (typeof v !== 'string') return null
  const m = /^(\d{1,3}(?:\.\d)?)px$/.exec(v.trim())
  if (!m) return null
  const n = Number(m[1])
  return n >= TAMANHO_FONTE.min && n <= TAMANHO_FONTE.max ? `${n}px` : null
}

export function larguraImagemValida(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= IMAGEM_LARGURA.min && v <= IMAGEM_LARGURA.max ? Math.round(v) : null
}

// ---------------------------------------------------------------- arquivos do caderno (imagem/anexo)
const SRC_IMG_RE = new RegExp(`^${ROTA_ARQUIVOS_NOTEBOOK}/(${UUID})\\.(${EXT_IMAGEM.join('|')})$`, 'i')
const ARQ_ANEXO_RE = new RegExp(`^(${UUID})\\.(${EXT_ANEXO.join('|')})$`, 'i')
const ARQ_QUALQUER_RE = new RegExp(`^(${UUID})\\.(${[...EXT_IMAGEM, ...EXT_ANEXO].join('|')})$`, 'i')

/** `src` de imagem só vale se apontar para a rota autenticada de arquivos do caderno. */
export function srcImagemValido(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const m = SRC_IMG_RE.exec(v)
  return m ? `${ROTA_ARQUIVOS_NOTEBOOK}/${m[1].toLowerCase()}.${m[2].toLowerCase()}` : null
}
/** Identificador do anexo: `<uuid>.<ext>` com ext na lista de anexos. */
export function arquivoAnexoValido(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const m = ARQ_ANEXO_RE.exec(v)
  return m ? `${m[1].toLowerCase()}.${m[2].toLowerCase()}` : null
}
/** Parse do segmento da URL do GET/rota: devolve {id, ext, imagem} ou null. */
export function parseArquivoId(v: string): { id: string; ext: string; imagem: boolean } | null {
  const m = ARQ_QUALQUER_RE.exec(v)
  if (!m) return null
  const ext = m[2].toLowerCase()
  return { id: m[1].toLowerCase(), ext, imagem: (EXT_IMAGEM as readonly string[]).includes(ext) }
}

/**
 * Nomes de arquivo do caderno (`<uuid>.<ext>`) referenciados por docs TipTap (image.src / anexo.arquivo). Aceita vários docs
 * (ex.: o doc da página + o doc de cada caixa da folha). Percurso iterativo com teto de nós (doc hostil não trava).
 */
export function extrairArquivosNotebook(docs: unknown[], max = 200): string[] {
  const out = new Set<string>()
  let visitados = 0
  const pilha: unknown[] = docs.filter((d) => d && typeof d === 'object')
  while (pilha.length && out.size < max && visitados < 50_000) {
    const n = pilha.pop() as { type?: string; attrs?: Record<string, unknown>; content?: unknown[]; caixas?: { doc?: unknown }[] }
    visitados++
    if (!n || typeof n !== 'object') continue
    if (n.type === 'image') { const m = SRC_IMG_RE.exec(String(n.attrs?.src ?? '')); if (m) out.add(`${m[1].toLowerCase()}.${m[2].toLowerCase()}`) }
    else if (n.type === 'anexo') { const a = arquivoAnexoValido(n.attrs?.arquivo); if (a) out.add(a) }
    if (Array.isArray(n.content)) for (const c of n.content) pilha.push(c)
    if (Array.isArray(n.caixas)) for (const c of n.caixas) if (c?.doc) pilha.push(c.doc)
  }
  return [...out]
}

/**
 * Decisão pura do bucket. FALHA FECHADO em produção: sem STORAGE_CADERNO_BUCKET não há bucket (o de conteúdo pode ser público e
 * os arquivos do aluno nunca podem cair nele). Em desenvolvimento/teste o fallback para o bucket de conteúdo continua permitido.
 */
export function decidirBucketCaderno(env: string | undefined, nodeEnv: string | undefined): { bucket: string } | { fallback: true } | { erro: 'bucket_ausente' } {
  const b = env?.trim()
  if (b) return { bucket: b }
  return nodeEnv === 'production' ? { erro: 'bucket_ausente' } : { fallback: true }
}

/** Cota de storage por aluno: `usados` = arquivos já guardados. Pura (a rota alimenta com a listagem da tabela). */
export function avaliarCota(usados: { bytes: number }[], novoBytes: number): { ok: true } | { ok: false; motivo: 'qtd' | 'bytes' } {
  if (usados.length >= LIMITES.cotaArquivosQtd) return { ok: false, motivo: 'qtd' }
  const total = usados.reduce((s, u) => s + (Number.isFinite(u.bytes) ? u.bytes : 0), 0)
  if (total + novoBytes > LIMITES.cotaArquivosBytes) return { ok: false, motivo: 'bytes' }
  return { ok: true }
}

export const MIME_POR_EXT: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', pdf: 'application/pdf', txt: 'text/plain; charset=utf-8',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
}
const EXT_POR_MIME_IMAGEM: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }

export type EntradaUpload = { nome: string; mimeDeclarado: string; bytes: Uint8Array; tipo: 'imagem' | 'arquivo' }
export type SaidaUpload = { ok: true; ext: string; contentType: string; nomeSeguro: string } | { ok: false; erro: string; status: 413 | 415 | 400 }

const nomeLimpo = (n: string) => n.replace(/[\u0000-\u001f\u007f\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, LIMITES.anexoNomeMax) || 'arquivo'
const extDoNome = (n: string) => (/\.([a-z0-9]{1,5})$/i.exec(n)?.[1] ?? '').toLowerCase()

/**
 * Valida o upload: tamanho (5 MB imagem / 10 MB arquivo), MIME declarado, EXTENSÃO e MAGIC BYTES.
 * `sniff` = detector de assinatura (sniffMime de lib/storage/validate), injetado para o teste ficar puro.
 * Imagem: png/jpeg/webp/gif — a extensão vem da ASSINATURA, nunca do nome. Arquivo: pdf/docx/xlsx/pptx/txt.
 */
export function validarUploadNotebook(e: EntradaUpload, sniff: (b: Uint8Array) => string | null): SaidaUpload {
  const tam = e.bytes.byteLength
  if (tam === 0) return { ok: false, erro: 'Arquivo vazio.', status: 400 }
  const detectado = sniff(e.bytes)
  const nomeSeguro = nomeLimpo(e.nome)
  if (e.tipo === 'imagem') {
    if (tam > LIMITES.imagemBytesMax) return { ok: false, erro: 'Imagem acima de 5 MB.', status: 413 }
    const ext = detectado ? EXT_POR_MIME_IMAGEM[detectado] : undefined
    if (!ext) return { ok: false, erro: 'Use PNG, JPG, WEBP ou GIF.', status: 415 }
    const decl = e.mimeDeclarado.toLowerCase().replace('image/jpg', 'image/jpeg')
    if (decl && decl !== detectado) return { ok: false, erro: 'O conteúdo do arquivo não corresponde ao tipo informado.', status: 415 }
    return { ok: true, ext, contentType: MIME_POR_EXT[ext], nomeSeguro }
  }
  if (tam > LIMITES.anexoBytesMax) return { ok: false, erro: 'Arquivo acima de 10 MB.', status: 413 }
  const ext = extDoNome(e.nome)
  if (!(EXT_ANEXO as readonly string[]).includes(ext)) return { ok: false, erro: 'Tipo de arquivo não permitido. Use PDF, DOCX, XLSX, PPTX ou TXT.', status: 415 }
  if (ext === 'pdf') {
    if (detectado !== 'application/pdf') return { ok: false, erro: 'O conteúdo não é um PDF.', status: 415 }
  } else if (ext === 'txt') {
    if (detectado) return { ok: false, erro: 'O conteúdo não é texto.', status: 415 }
    const amostra = e.bytes.subarray(0, 4096)
    for (let i = 0; i < amostra.length; i++) if (amostra[i] === 0) return { ok: false, erro: 'O conteúdo não é texto.', status: 415 }
  } else if (detectado !== 'application/zip') { // docx/xlsx/pptx = ZIP (PK..)
    return { ok: false, erro: 'O conteúdo do arquivo não corresponde ao tipo informado.', status: 415 }
  }
  return { ok: true, ext, contentType: MIME_POR_EXT[ext], nomeSeguro }
}

// ---------------------------------------------------------------- resumo de marcas
export type TipoMarca = 'a_fazer' | 'importante' | 'pergunta' | 'lembrar' | 'definicao'
export const ROTULO_MARCA: Record<TipoMarca, string> = {
  a_fazer: 'A Fazer', importante: 'Importante', pergunta: 'Pergunta', lembrar: 'Lembrar-se', definicao: 'Definição',
}
export const ORDEM_MARCAS: TipoMarca[] = ['a_fazer', 'importante', 'pergunta', 'lembrar', 'definicao']
export type ItemMarca = { tipo: TipoMarca; texto: string; pos: number; feito?: boolean }

function textoDe(n: any): string {
  if (!n || typeof n !== 'object') return ''
  if (n.type === 'text') return typeof n.text === 'string' ? n.text : ''
  if (n.type === 'hardBreak') return ' '
  return Array.isArray(n.content) ? n.content.map(textoDe).join('') : ''
}

/**
 * Lista as marcas de um doc TipTap: parágrafos/títulos com `attrs.marca` e itens de tarefa (taskItem = A Fazer).
 * `pos` = posição ProseMirror do nó (para rolar até ele). Contagem de posição segue o tamanho do schema do TipTap:
 * texto = length; nó com conteúdo = 2 + filhos; átomo = 1.
 */
const ATOMOS = new Set(['hardBreak', 'horizontalRule', 'image', 'anexo', 'questaoRef', 'grifoSnapshot', 'anotacaoRef'])

export function extrairMarcas(doc: any, max = 500): ItemMarca[] {
  const out: ItemMarca[] = []
  const tam = (n: any): number => {
    if (!n || typeof n !== 'object') return 0
    if (n.type === 'text') return typeof n.text === 'string' ? n.text.length : 0
    if (ATOMOS.has(n.type)) return 1
    return 2 + (Array.isArray(n.content) ? n.content.reduce((a: number, c: any) => a + tam(c), 0) : 0)
  }
  const visita = (n: any, pos: number, prof: number) => {
    if (!n || typeof n !== 'object' || prof > 30 || out.length >= max) return
    if (n.type === 'taskItem') out.push({ tipo: 'a_fazer', texto: textoDe(n).trim().slice(0, 200), pos, feito: n.attrs?.checked === true })
    else if ((n.type === 'paragraph' || n.type === 'heading') && (MARCAS_PARAGRAFO as readonly string[]).includes(n.attrs?.marca)) {
      out.push({ tipo: n.attrs.marca, texto: textoDe(n).trim().slice(0, 200), pos })
    }
    if (Array.isArray(n.content)) {
      let p = pos + 1
      for (const c of n.content) { visita(c, p, prof + 1); p += tam(c) }
    }
  }
  if (doc && Array.isArray(doc.content)) {
    let p = 0
    for (const c of doc.content) { visita(c, p, 0); p += tam(c) }
  }
  return out
}

export function agruparMarcas(itens: ItemMarca[]): { tipo: TipoMarca; itens: ItemMarca[] }[] {
  return ORDEM_MARCAS.map((tipo) => ({ tipo, itens: itens.filter((i) => i.tipo === tipo) })).filter((g) => g.itens.length > 0)
}

// ---------------------------------------------------------------- helpers de UI testáveis
export function formatarTamanho(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

const SEM_LINK = /^(https?:|mailto:)/i
/** Normaliza o texto digitado para um href seguro (https/http/mailto/relativo /aluno). Devolve null se inválido. */
export function normalizarLink(entrada: string): string | null {
  const s = entrada.trim()
  if (!s || /[\u0000-\u001f\u007f\s]/.test(s) || s.length > 2048) return null
  if (s.startsWith('/aluno/')) return s
  if (SEM_LINK.test(s)) { try { new URL(s); return s } catch { return null } }
  if (/^[^\s@:/]+@[^\s@:/]+\.[^\s@:/]+$/.test(s)) return `mailto:${s}`
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return null // javascript:, data:, etc.
  if (/^[^\s/]+\.[^\s/]{2,}/.test(s)) { try { new URL(`https://${s}`); return `https://${s}` } catch { return null } }
  return null
}

/** Validador ÚNICO de URL do editor (links do TipTap + cartões): só https/http/mailto/`/aluno/` e que `normalizarLink` aceite. */
export const urlOk = (u: string): boolean => /^(https?:|mailto:|\/aluno\/)/i.test(u.trim()) && normalizarLink(u) !== null

/** Href seguro de um valor desconhecido (cartões de grifo): https/http/mailto ou `/aluno/...`; senão null. */
export function linkSeguro(l: unknown): string | null {
  if (typeof l !== 'string') return null
  const s = l.trim()
  return urlOk(s) ? s : null
}
