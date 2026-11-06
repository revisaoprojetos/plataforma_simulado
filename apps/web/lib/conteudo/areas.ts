// ÁREAS DE VISIBILIDADE e BLOCOS EXPANSÍVEIS dentro de documentos (.docx) da Biblioteca.
//
// Dois plugins do OnlyOffice marcam o documento com parágrafos de corpo:
//   Visibilidade → `[[AREA:<id8>|<Nome>]]` … `[[/AREA:<id8>]]`   (quem vê: regras por produto/grupo/segmento/aluno)
//   Expansor     → `[[EXP:<id8>|<Título>]]`  … `[[/EXP:<id8>]]`    (bloco recolhível no modo texto)
// O servidor (1) sincroniza as marcações ao salvar, (2) avalia as REGRAS para o aluno que abre o documento e
// (3) REMOVE do texto (HTML) e do PDF (docx filtrado → ConvertService) o que ele não pode ver. Os parágrafos-marcador
// somem SEMPRE para o aluno. Nunca é CSS: o conteúdo oculto não sai do servidor. Blocos expansíveis só mudam o HTML
// (no PDF aparecem normais). Título e estilo do bloco: do documento, editáveis no admin (padrão do tenant + override).
//
// Tolerante à migração 20261106020000 pendente: sem as tabelas, nenhum documento tem área e nada muda.
import 'server-only'
import PizZip from 'pizzip'
import { createHash } from 'crypto'
import { remember, esquecer } from '@/lib/cache/relatorio-cache'
import { ESTILO_EXP_PADRAO, PRESETS_EXP, presetExp, separarTituloPreset, type EstiloExp, type PresetExp } from './areas-presets'

export const T_AREAS = 'simulado_conteudo_areas'
export const T_AREA_REGRAS = 'simulado_conteudo_area_regras'

// ───────────────────────── estilo do bloco expansível ─────────────────────────
export { ESTILO_EXP_PADRAO, PRESETS_EXP, presetExp }
export type { EstiloExp, PresetExp }

export type AreaDoc = {
  key: string; nome: string; ordem: number; presente: boolean
  tipo: 'area' | 'exp'
  expansiva?: boolean           // área de visibilidade que TAMBÉM é recolhível
  titulo?: string | null        // título editado no admin (null = nome do documento)
  preset?: string | null        // preset de cores do marcador [[EXP:id|Título|preset]] (null = padrão do tenant)
  estilo?: Partial<EstiloExp> | null
}
export type RegraArea = {
  id: string; area_key: string; efeito: 'mostrar' | 'ocultar'; produto_id: string | null
  publico_tipo: 'todos' | 'segmento' | 'grupo' | 'aluno'; publico_id: string | null; ativo: boolean; ordem: number
}

const COR_HEX = /^#[0-9a-fA-F]{6}$/
/** Sanea um estilo (parcial ou não); campo inválido/ausente cai no `base`. */
export function sanearEstiloExp(raw: unknown, base: EstiloExp = ESTILO_EXP_PADRAO): EstiloExp {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const cor = (v: unknown, d: string) => (typeof v === 'string' && COR_HEX.test(v.trim()) ? v.trim().toUpperCase() : d)
  const num = (v: unknown, d: number, mn: number, mx: number) => (typeof v === 'number' && isFinite(v) ? Math.min(mx, Math.max(mn, Math.round(v))) : d)
  return {
    cor: cor(r.cor, base.cor), borda: cor(r.borda, base.borda), fundo: cor(r.fundo, base.fundo),
    raio: num(r.raio, base.raio, 0, 28), tamanho: num(r.tamanho, base.tamanho, 12, 22),
    icone: r.icone === 'mais' ? 'mais' : r.icone === 'seta' ? 'seta' : base.icone,
    iniciaAberta: typeof r.iniciaAberta === 'boolean' ? r.iniciaAberta : base.iniciaAberta,
    variante: r.variante === 'caixa' ? 'caixa' : r.variante === 'cartao' ? 'cartao' : base.variante,
  }
}

const CHAVE_TEMA = 'expansor_estilo'
/** Estilo PADRÃO dos blocos expansíveis do tenant (tema.expansor_estilo; sem config → ESTILO_EXP_PADRAO). */
export async function estiloExpPadraoDoTenant(svc: any, tenantId: string): Promise<EstiloExp> {
  return remember<EstiloExp>(`expansor-estilo:${tenantId}`, 60, async () => {
    try {
      const { data } = await svc.from('simulado_tenants').select('tema').eq('id', tenantId).maybeSingle()
      return sanearEstiloExp(((data as any)?.tema ?? {})[CHAVE_TEMA])
    } catch { return ESTILO_EXP_PADRAO }
  })
}
export async function salvarEstiloExpPadraoDoTenant(svc: any, tenantId: string, estilo: unknown): Promise<{ ok: boolean; error?: string }> {
  const { data, error: e1 } = await svc.from('simulado_tenants').select('tema').eq('id', tenantId).maybeSingle()
  if (e1) return { ok: false, error: e1.message }
  const tema = { ...(((data as any)?.tema) ?? {}) }
  tema[CHAVE_TEMA] = sanearEstiloExp(estilo)
  const { error } = await svc.from('simulado_tenants').update({ tema }).eq('id', tenantId)
  if (error) return { ok: false, error: error.message }
  await esquecer(`expansor-estilo:${tenantId}`).catch(() => {})
  return { ok: true }
}

// ───────────────────────── marcadores ─────────────────────────
const RE_MARC_TXT = /^\s*\[\[(\/?)(AREA|EXP):([a-z0-9]{4,16})(?:\|([^\]]*))?\]\]\s*$/i
const RE_MARC_HTML = /<p\b[^>]*>(?:\s*<[^/!][^>]*>)*\s*\[\[(\/?)(AREA|EXP):([a-z0-9]{4,16})(?:\|([^\]]*))?\]\]\s*(?:<\/[^>]+>\s*)*<\/p>/gi
const RE_PARA = /<w:p[ >][\s\S]*?<\/w:p>/g

function decodificar(s: string): string {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
}
function textoDoParagrafo(par: string): string {
  let t = ''
  for (const m of par.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)) t += m[1]
  return decodificar(t)
}

type Marcador = { fim: boolean; tipo: 'area' | 'exp'; key: string; nome: string; preset: string | null; ini: number; fimIdx: number }
function marcadoresDoXml(xml: string): Marcador[] {
  const out: Marcador[] = []
  for (const m of xml.matchAll(RE_PARA)) {
    const txt = textoDoParagrafo(m[0])
    if (!txt.includes('[[')) continue
    const r = RE_MARC_TXT.exec(txt)
    if (!r) continue
    const tipo = r[2].toUpperCase() === 'EXP' ? 'exp' : 'area'
    const np = tipo === 'exp' ? separarTituloPreset(r[4] ?? '') : { titulo: (r[4] ?? '').trim(), preset: null }
    out.push({
      fim: r[1] === '/', tipo, key: r[3].toLowerCase(), nome: np.titulo, preset: np.preset,
      ini: m.index ?? 0, fimIdx: (m.index ?? 0) + m[0].length,
    })
  }
  return out
}

/** Áreas de visibilidade E blocos expansíveis (início) encontrados no .docx, na ordem do documento. */
export function extrairAreasDeDocx(docx: Buffer): AreaDoc[] {
  try {
    const f = new PizZip(docx).file('word/document.xml')
    if (!f) return []
    const vistos = new Set<string>()
    const out: AreaDoc[] = []
    for (const mk of marcadoresDoXml(f.asText())) {
      if (mk.fim || vistos.has(mk.key)) continue
      vistos.add(mk.key)
      out.push({ key: mk.key, nome: mk.nome || (mk.tipo === 'exp' ? `Bloco ${out.length + 1}` : `Área ${out.length + 1}`), ordem: out.length, presente: true, tipo: mk.tipo, preset: mk.preset })
    }
    return out
  } catch { return [] }
}

/** Conjunto de áreas ocultas vira um "hash de variante" (cache do PDF/docx filtrado). */
export function hashVariante(ocultas: Iterable<string>): string {
  const lista = [...ocultas].sort().join(',')
  return createHash('sha1').update(`areas:${lista}`).digest('hex').slice(0, 8)
}

// ───────────────────────── filtro (docx) ─────────────────────────
/** docx SEM os marcadores e SEM o conteúdo das áreas em `ocultas`. Sem marcadores → devolve o mesmo buffer. */
export function filtrarDocxPorAreas(docx: Buffer, ocultas: Set<string>): Buffer {
  try {
    const zip = new PizZip(docx)
    const f = zip.file('word/document.xml')
    if (!f) return docx
    const xml = f.asText()
    const marc = marcadoresDoXml(xml)
    if (!marc.length) return docx
    let out = ''
    let cursor = 0
    let ocultoDepth = 0
    const pilha: string[] = []
    for (const e of marc) {
      if (ocultoDepth === 0) out += xml.slice(cursor, e.ini) // conteúdo visível até o marcador
      cursor = e.fimIdx // o parágrafo-marcador nunca vai para o aluno
      if (!e.fim) { pilha.push(e.key); if (ocultas.has(e.key)) ocultoDepth++ }
      else {
        const i = pilha.lastIndexOf(e.key)
        if (i >= 0) { pilha.splice(i, 1); if (ocultas.has(e.key) && ocultoDepth > 0) ocultoDepth-- }
      }
    }
    if (ocultoDepth === 0) out += xml.slice(cursor)
    else { // área oculta sem fecho: corta até o fim do corpo, preservando o último sectPr
      const sect = xml.lastIndexOf('<w:sectPr')
      const fimBody = xml.lastIndexOf('</w:body>')
      if (sect > cursor && fimBody > sect) out += xml.slice(sect)
      else if (fimBody > cursor) out += xml.slice(fimBody)
    }
    zip.file('word/document.xml', out)
    return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }) as Buffer
  } catch { return docx }
}

// ───────────────────────── filtro (HTML) + bloco expansível ─────────────────────────
function escaparHtml(t: string): string { return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }

export type BlocoExp = { titulo: string; estilo: EstiloExp }

const CSS_EXP = '<style>.area-exp>summary{list-style:none;cursor:pointer}.area-exp>summary::-webkit-details-marker{display:none}'
  + '.area-exp .exp-i{flex:0 0 auto;transition:transform .2s ease}.area-exp[open]>summary .exp-i{transform:rotate(180deg)}'
  + '.area-exp .exp-i-mais{display:none}.area-exp[data-icone="mais"] .exp-i-seta{display:none}.area-exp[data-icone="mais"] .exp-i-mais{display:inline}'
  + '.area-exp[data-icone="mais"][open]>summary .exp-i{transform:none}.area-exp[data-icone="mais"][open] .exp-i-mais path:first-child{display:none}'
  + '.area-exp[open]>summary .exp-prev{display:none}'
  + '.area-exp>summary:focus-visible{outline:2px solid currentColor;outline-offset:2px}@media (prefers-reduced-motion:reduce){.area-exp .exp-i{transition:none}}</style>'

const PREV_MARCA = (n: number) => `\u0001P${n}\u0001`

/** Abre o bloco expansível. 'cartao' = cartão branco/borda lilás/título roxo + seta · 'caixa' = caixa colorida (STF, STJ, Atenção…) com prévia. */
function abrirBloco(b: BlocoExp, ph: number): string {
  const e = b.estilo
  const seta = `<svg class="exp-i exp-i-seta" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${e.cor}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>`
  const mais = `<svg class="exp-i exp-i-mais" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${e.cor}" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14"/><path d="M5 12h14"/></svg>`
  const aberto = e.iniciaAberta ? ' open' : ''
  if (e.variante === 'caixa') {
    const t = b.titulo.trim()
    const titulo = /[:.!?]$/.test(t) ? t : `${t}:`
    return `<details class="area-exp area-exp-caixa" data-icone="${e.icone}"${aberto} style="margin:10px 0;border:1px solid ${e.borda};border-radius:${e.raio}px;background:${e.fundo};padding:0 14px">`
      + `<summary style="display:flex;align-items:center;gap:8px;padding:10px 0;font-size:${e.tamanho}px;line-height:1.35">`
      + `<span style="font-weight:800;color:${e.cor};flex:0 0 auto">${escaparHtml(titulo)}</span>`
      + `<span class="exp-prev" style="flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#6b7280;font-size:.88em">${PREV_MARCA(ph)}</span>`
      + `<span style="flex:1 1 auto"></span>${seta}${mais}</summary><div style="padding:0 0 12px">`
  }
  return `<details class="area-exp" data-icone="${e.icone}"${aberto} style="margin:12px 0;border:1px solid ${e.borda};border-radius:${e.raio}px;background:${e.fundo};padding:0 18px">`
    + `<summary style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 0;font-weight:700;font-size:${e.tamanho}px;color:${e.cor};line-height:1.3">`
    + `<span>${escaparHtml(b.titulo)}</span>${seta}${mais}</summary><div style="padding:0 0 12px">`
}
const FECHAR_BLOCO = '</div></details>'

/** Texto puro (≈120 caracteres) do conteúdo de um bloco — a "prévia" mostrada na caixa recolhida. */
function previaDe(htmlBloco: string): string {
  const t = htmlBloco.replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/\u0001P\d+\u0001/g, ' ').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim()
  return t.length > 130 ? `${t.slice(0, 130).trimEnd()}…` : t
}

/**
 * HTML sem marcadores e sem o conteúdo das áreas ocultas; blocos expansíveis (`blocos`: chave → título/estilo) viram
 * <details>. Roda DEPOIS dos uids (data-uid) estarem no HTML (a numeração dos trechos não muda); devolve os uids
 * removidos para filtrar também a lista de trechos. `estiloPadrao`: usado em [[EXP]] ainda não sincronizado.
 */
export function filtrarHtmlPorAreas(html: string, ocultas: Set<string>, blocos?: Map<string, BlocoExp>, estiloPadrao: EstiloExp = ESTILO_EXP_PADRAO): { html: string; uidsRemovidos: Set<string> } {
  const removidos = new Set<string>()
  if (!html || !/\[\[\/?(AREA|EXP):/.test(html)) return { html, uidsRemovidos: removidos }
  const marc = [...html.matchAll(RE_MARC_HTML)].map((m) => ({
    fim: m[1] === '/', tipo: m[2].toUpperCase() === 'EXP' ? 'exp' : 'area', key: m[3].toLowerCase(), nome: m[4] ?? '', ini: m.index ?? 0, fimIdx: (m.index ?? 0) + m[0].length,
  }))
  if (!marc.length) return { html, uidsRemovidos: removidos }
  const coletar = (trecho: string) => { for (const u of trecho.matchAll(/data-uid="([^"]+)"/g)) removidos.add(u[1]) }
  let out = ''
  let cursor = 0
  let ocultoDepth = 0
  let usouCss = false
  const pilha: string[] = []
  const abertos = new Map<string, { ph: number; ini: number; caixa: boolean }>() // blocos efetivamente abertos (p/ fechar só o que abriu)
  const previas = new Map<number, string>()
  let nPh = 0
  for (const e of marc) {
    if (ocultoDepth === 0) out += html.slice(cursor, e.ini)
    else coletar(html.slice(cursor, e.ini))
    coletar(html.slice(e.ini, e.fimIdx)) // o próprio marcador também sai (uid dele)
    cursor = e.fimIdx
    // bloco expansível: [[EXP]] sempre; [[AREA]] só quando marcada como expansiva
    let bloco = blocos?.get(e.key)
    if (!bloco && e.tipo === 'exp') { // [[EXP]] ainda não sincronizado: título/preset vêm do próprio marcador
      const np = separarTituloPreset(decodificarHtml(e.nome))
      bloco = { titulo: np.titulo || 'Detalhes', estilo: presetExp(np.preset)?.estilo ?? estiloPadrao }
    }
    if (!e.fim) {
      pilha.push(e.key)
      if (ocultas.has(e.key)) ocultoDepth++
      else if (ocultoDepth === 0 && bloco) {
        if (!usouCss) { out += CSS_EXP; usouCss = true }
        const ph = nPh++
        out += abrirBloco(bloco, ph); abertos.set(e.key, { ph, ini: out.length, caixa: bloco.estilo.variante === 'caixa' })
      }
    } else {
      const i = pilha.lastIndexOf(e.key)
      if (i >= 0) {
        pilha.splice(i, 1)
        if (ocultas.has(e.key)) { if (ocultoDepth > 0) ocultoDepth-- }
        else { const ab = abertos.get(e.key); if (ab) { if (ab.caixa) previas.set(ab.ph, previaDe(out.slice(ab.ini))); abertos.delete(e.key); out += FECHAR_BLOCO } }
      }
    }
  }
  if (ocultoDepth === 0) out += html.slice(cursor)
  else coletar(html.slice(cursor))
  for (const [, ab] of abertos) { if (ab.caixa) previas.set(ab.ph, previaDe(out.slice(ab.ini))); out += FECHAR_BLOCO } // bloco sem fecho no documento: fecha ao fim
  if (previas.size) out = out.replace(/\u0001P(\d+)\u0001/g, (_m, n) => escaparHtml(previas.get(+n) ?? ''))
  return { html: out, uidsRemovidos: removidos }
}
function decodificarHtml(s: string): string { return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"') }

// ───────────────────────── sincronização e leitura ─────────────────────────
export async function sincronizarAreas(svc: any, tenantId: string, documentoId: string, docx: Buffer): Promise<void> {
  try {
    const areas = extrairAreasDeDocx(docx)
    const { data: atuais, error } = await svc.from(T_AREAS).select('area_key').eq('tenant_id', tenantId).eq('documento_id', documentoId)
    if (error) return // tabela ausente (migração pendente)
    const nosDocs = new Set(areas.map((a) => a.key))
    const agora = new Date().toISOString()
    if (areas.length) {
      // `titulo`/`estilo`/`expansiva` editados no admin NÃO entram no upsert (preservados); só nome/ordem/tipo/presença.
      await svc.from(T_AREAS).upsert(
        areas.map((a) => ({ tenant_id: tenantId, documento_id: documentoId, area_key: a.key, nome: a.nome, ordem: a.ordem, tipo: a.tipo, preset: a.preset ?? null, presente: true, atualizado_em: agora })),
        { onConflict: 'documento_id,area_key' },
      )
    }
    const sumiram = ((atuais ?? []) as any[]).map((r) => r.area_key as string).filter((k) => !nosDocs.has(k))
    if (sumiram.length) await svc.from(T_AREAS).update({ presente: false, atualizado_em: agora }).eq('tenant_id', tenantId).eq('documento_id', documentoId).in('area_key', sumiram)
  } catch { /* best-effort */ }
  await esquecer(`areas-doc:${tenantId}:${documentoId}`).catch(() => {})
}

/** Áreas/blocos do documento (cache curto). Vazio = documento sem marcações (ou migração pendente). */
export async function areasDoDocumento(svc: any, tenantId: string, documentoId: string): Promise<AreaDoc[]> {
  return remember<AreaDoc[]>(`areas-doc:${tenantId}:${documentoId}`, 60, async () => {
    try {
      const { data, error } = await svc.from(T_AREAS).select('area_key, nome, ordem, presente, expansiva, tipo, titulo, estilo, preset').eq('tenant_id', tenantId).eq('documento_id', documentoId).order('ordem', { ascending: true })
      if (error) return []
      return ((data ?? []) as any[]).map((r) => ({
        key: r.area_key, nome: r.nome ?? '', ordem: r.ordem ?? 0, presente: r.presente !== false, expansiva: r.expansiva === true,
        tipo: (r.tipo === 'exp' ? 'exp' : 'area') as 'area' | 'exp', titulo: r.titulo ?? null, preset: r.preset ?? null, estilo: r.estilo && typeof r.estilo === 'object' ? r.estilo : null,
      }))
    } catch { return [] }
  })
}

export async function regrasDoDocumento(svc: any, tenantId: string, documentoId: string): Promise<RegraArea[]> {
  try {
    const { data, error } = await svc.from(T_AREA_REGRAS).select('id, area_key, efeito, produto_id, publico_tipo, publico_id, ativo, ordem')
      .eq('tenant_id', tenantId).eq('documento_id', documentoId).order('ordem', { ascending: true }).limit(2000)
    if (error) return []
    return ((data ?? []) as any[]).map((r) => ({
      id: r.id, area_key: r.area_key, efeito: r.efeito === 'mostrar' ? 'mostrar' : 'ocultar', produto_id: r.produto_id ?? null,
      publico_tipo: (['todos', 'segmento', 'grupo', 'aluno'].includes(r.publico_tipo) ? r.publico_tipo : 'todos') as RegraArea['publico_tipo'],
      publico_id: r.publico_id ?? null, ativo: r.ativo !== false, ordem: r.ordem ?? 0,
    }))
  } catch { return [] }
}

export type ResolucaoAreas = {
  temAreas: boolean
  ocultas: Set<string>
  /** Sufixo estável p/ chaves de cache do PDF/docx filtrado ('' = documento sem marcações). */
  variante: string
  /** Blocos expansíveis VISÍVEIS (chave → título/estilo): no modo texto viram blocos recolhíveis. */
  blocos: Map<string, BlocoExp>
  estiloPadrao: EstiloExp
}
export const SEM_AREAS: ResolucaoAreas = { temAreas: false, ocultas: new Set(), variante: '', blocos: new Map(), estiloPadrao: ESTILO_EXP_PADRAO }

/**
 * Resolve, para UM aluno (e opcionalmente o PRODUTO por onde abriu), quais áreas ficam ocultas.
 *  - regra com `produto_id` só vale quando o aluno abriu por aquele produto; sem produto → só regras globais;
 *  - "mostrar": só quem se encaixa em alguma regra mostrar vê; "ocultar": quem se encaixa não vê (ocultar vence);
 *  - `verTudo` (testador/pré-visualização): nenhuma área oculta, mas os marcadores continuam saindo.
 */
export async function resolverAreas(
  svc: any, tenantId: string, estudanteId: string, documentoId: string,
  opts: { produtoId?: string | null; verTudo?: boolean } = {},
): Promise<ResolucaoAreas> {
  const areas = await areasDoDocumento(svc, tenantId, documentoId)
  if (!areas.length) return SEM_AREAS
  const ocultas = new Set<string>()
  if (!opts.verTudo) {
    const regras = (await regrasDoDocumento(svc, tenantId, documentoId)).filter((r) => r.ativo && (r.produto_id === null || r.produto_id === (opts.produtoId ?? null)))
    if (regras.length) {
      const { ContextoAluno, avaliarSegmentos } = await import('@/lib/segmentos/avaliar')
      const ctx = new ContextoAluno(svc, tenantId, estudanteId)
      const segIds = [...new Set(regras.filter((r) => r.publico_tipo === 'segmento' && r.publico_id).map((r) => r.publico_id as string))]
      const seg = segIds.length ? await avaliarSegmentos(ctx, segIds).catch(() => new Map<string, boolean>()) : new Map<string, boolean>()
      const grupos = regras.some((r) => r.publico_tipo === 'grupo') ? await ctx.grupos().catch(() => new Map()) : new Map()
      const agora = Date.now()
      const casa = (r: RegraArea): boolean => {
        if (r.publico_tipo === 'todos') return true
        if (!r.publico_id) return false
        if (r.publico_tipo === 'aluno') return r.publico_id === estudanteId
        if (r.publico_tipo === 'segmento') return seg.get(r.publico_id) === true
        const m = grupos.get(r.publico_id) as { expira_em: string | null } | undefined
        return !!m && (!m.expira_em || Date.parse(m.expira_em) > agora)
      }
      for (const a of areas) {
        if (a.tipo === 'exp') continue
        const rs = regras.filter((r) => r.area_key === a.key)
        if (!rs.length) continue
        const mostrar = rs.filter((r) => r.efeito === 'mostrar')
        if (rs.some((r) => r.efeito === 'ocultar' && casa(r)) || (mostrar.length > 0 && !mostrar.some(casa))) ocultas.add(a.key)
      }
    }
  }
  // blocos expansíveis: [[EXP]] sempre; [[AREA]] só se marcada como expansiva. Título editado > nome do documento;
  // estilo = padrão do tenant sobreposto pelo override do bloco.
  const estiloPadrao = await estiloExpPadraoDoTenant(svc, tenantId)
  const blocos = new Map<string, BlocoExp>()
  for (const a of areas) {
    if (ocultas.has(a.key) || !(a.tipo === 'exp' || a.expansiva)) continue
    const base = (a.tipo === 'exp' ? presetExp(a.preset)?.estilo : null) ?? estiloPadrao
    blocos.set(a.key, { titulo: (a.titulo ?? '').trim() || a.nome || 'Detalhes', estilo: sanearEstiloExp(a.estilo ?? {}, base) })
  }
  return { temAreas: true, ocultas, variante: hashVariante(ocultas), blocos, estiloPadrao }
}

/** O produto informado na URL só vale se o aluno realmente tem acesso a ele (senão ignora → regras globais). */
export async function produtoValidoDoAluno(tenantId: string, estudanteId: string, produtoId: string | null | undefined): Promise<string | null> {
  if (!produtoId || !/^[0-9a-f-]{36}$/i.test(produtoId)) return null
  try {
    const ids = await remember<string[]>(`areas-prod:${tenantId}:${estudanteId}`, 60, async () => {
      const { produtosDoAluno } = await import('@/lib/produtos/aluno')
      return (await produtosDoAluno(tenantId, estudanteId)).map((p) => p.id)
    })
    return ids.includes(produtoId) ? produtoId : null
  } catch { return null }
}

/** Invalida o cache de áreas do documento (após salvar regras/estilo). */
export async function invalidarAreas(tenantId: string, documentoId: string): Promise<void> {
  await esquecer(`areas-doc:${tenantId}:${documentoId}`).catch(() => {})
}
