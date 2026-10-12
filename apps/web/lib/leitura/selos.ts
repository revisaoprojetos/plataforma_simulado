// Converte TAGS de selo no HTML da leitura (ex.: <rg>, <essencial>) na IMAGEM oficial do selo
// (PNGs do JurisClub em /public/leitura/selos). Reusa o pipeline dos dois leitores (Lei Seca +
// Jurisprudência) + prévia do admin. O dimensionamento do <img.sl-img> fica no CSS (globals.css).
//
// Cada selo tem um SLUG canônico e aceita APELIDOS (tags curtas), tudo case-insensitive. Para
// adicionar/renomear tags, edite SELOS_APELIDO. Evite tags que colidam com HTML real (sup, sub, b, i…).

// Ícones (lucide-style, 24x24 stroke, currentColor) — o `fill` do <svg> é none; só a estrela usa fill.
const IC = {
  landmark: '<polygon points="12 2 20 7 4 7"/><line x1="4" x2="4" y1="10" y2="18"/><line x1="9" x2="9" y1="10" y2="18"/><line x1="15" x2="15" y1="10" y2="18"/><line x1="20" x2="20" y1="10" y2="18"/><line x1="3" x2="21" y1="21" y2="21"/>',
  repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
  shieldCheck: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>',
  checkCheck: '<path d="M18 6 7 17l-5-5"/><path d="m22 10-7.5 7.5L13 16"/>',
  arrowUpCircle: '<circle cx="12" cy="12" r="10"/><path d="m16 12-4-4-4 4"/><path d="M12 16V8"/>',
  sliders: '<line x1="4" x2="4" y1="21" y2="14"/><line x1="4" x2="4" y1="10" y2="3"/><line x1="12" x2="12" y1="21" y2="12"/><line x1="12" x2="12" y1="8" y2="3"/><line x1="20" x2="20" y1="21" y2="16"/><line x1="20" x2="20" y1="12" y2="3"/><line x1="2" x2="6" y1="14" y2="14"/><line x1="10" x2="14" y1="8" y2="8"/><line x1="18" x2="22" y1="16" y2="16"/>',
  alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  split: '<line x1="6" x2="6" y1="3" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>',
  thumbsUp: '<path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"/>',
  thumbsDown: '<path d="M17 14V2"/><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z"/>',
  star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  clipboardCheck: '<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>',
} as const

type SeloDef = { kind: string; nome: string; icon: string }

// slug canônico -> definição (kind = classe de cor do CSS, nome = rótulo, icon = SVG inner).
export const SELOS: Record<string, SeloDef> = {
  'repercussao-geral': { kind: 'k-rg', nome: 'Repercussão Geral', icon: IC.landmark },
  'recurso-repetitivo': { kind: 'k-rep', nome: 'Recurso Repetitivo', icon: IC.repeat },
  'entendimento-consolidado': { kind: 'k-cons', nome: 'Entendimento Consolidado', icon: IC.shieldCheck },
  'reafirmacao-de-entendimento': { kind: 'k-reaf', nome: 'Reafirmação de Entendimento', icon: IC.checkCheck },
  'superacao-de-entendimento': { kind: 'k-sup', nome: 'Superação de Entendimento', icon: IC.arrowUpCircle },
  'modulacao-de-efeitos': { kind: 'k-mod', nome: 'Modulação de Efeitos', icon: IC.sliders },
  'entendimento-controvertido': { kind: 'k-contr', nome: 'Entendimento Controvertido', icon: IC.alert },
  'divergencia-stf-e-stj': { kind: 'k-div', nome: 'Divergência STF e STJ', icon: IC.split },
  'favoravel-a-fazenda-publica': { kind: 'k-fav', nome: 'Favorável à Fazenda Pública', icon: IC.thumbsUp },
  'desfavoravel-a-fazenda-publica': { kind: 'k-desf', nome: 'Desfavorável à Fazenda Pública', icon: IC.thumbsDown },
  essencial: { kind: 'k-ess', nome: 'Essencial', icon: IC.star },
  'tema-novo': { kind: 'k-novo', nome: 'Tema Novo', icon: IC.flag },
  'julgamento-nao-concluido': { kind: 'k-pend', nome: 'Julgamento Não Concluído', icon: IC.clock },
  'ja-cobrado-em-prova': { kind: 'k-prova', nome: 'Já Cobrado em Prova', icon: IC.clipboardCheck },
}

// apelido (tag curta, minúsculo) -> slug. O slug também é tag válida por si só.
export const SELOS_APELIDO: Record<string, string> = {
  rg: 'repercussao-geral',
  rr: 'recurso-repetitivo',
  consolidado: 'entendimento-consolidado',
  reafirmacao: 'reafirmacao-de-entendimento',
  superacao: 'superacao-de-entendimento',
  modulacao: 'modulacao-de-efeitos',
  controvertido: 'entendimento-controvertido',
  divergencia: 'divergencia-stf-e-stj',
  ffp: 'favoravel-a-fazenda-publica',
  dfp: 'desfavoravel-a-fazenda-publica',
  inconcluso: 'julgamento-nao-concluido',
  'ja-cobrado': 'ja-cobrado-em-prova',
  cobrado: 'ja-cobrado-em-prova',
}

/** Resolve uma tag (slug OU apelido, case-insensitive) → slug, ou null. */
export function slugDeTag(tag: string): string | null {
  const t = tag.toLowerCase()
  if (SELOS[t]) return t
  if (SELOS_APELIDO[t]) return SELOS_APELIDO[t]
  return null
}

// slug → apelido mais curto (p/ exibir o "código" amigável da tag, ex.: repercussao-geral → rg).
const APELIDO_DE_SLUG: Record<string, string> = (() => {
  const m: Record<string, string> = {}
  for (const [ap, slug] of Object.entries(SELOS_APELIDO)) if (!m[slug] || ap.length < m[slug].length) m[slug] = ap
  return m
})()

/** Código curto preferido de um slug (apelido se houver, senão o próprio slug). Ex.: 'rg'. */
export function codigoCurto(slug: string): string {
  return APELIDO_DE_SLUG[slug] ?? slug
}

/** Código da tag JÁ no padrão com delimitadores `<>` — ex.: `<rg>`. Usado na UI e p/ inserir no HTML. */
export function codigoTag(slug: string): string {
  return `<${codigoCurto(slug)}>`
}

/** Todas as tags reconhecidas (p/ o querySelectorAll). */
export function tagsReconhecidas(): string[] {
  return [...new Set([...Object.keys(SELOS), ...Object.keys(SELOS_APELIDO)])]
}

/**
 * Converte as TAGS CRUAS de selo (<rg>, <essencial>…) em <span data-selo="slug" [data-selo-sm/ic]>.
 * String puro (sem DOM) — roda no SANITIZADOR (server) ANTES do allowlist, p/ o selo SOBREVIVER ao
 * save/import (senão a tag desconhecida é descartada). Variantes: `sm` (menor), `ic` (só ícone).
 */
export function selosParaSpans(html: string): string {
  const tags = tagsReconhecidas()
  if (!tags.length || !html) return html
  const abre = new RegExp(`<(${tags.join('|')})\\b([^>]*?)/?>`, 'gi')
  html = html.replace(abre, (m, tag: string, attrs: string) => {
    const slug = slugDeTag(tag)
    if (!slug) return m
    const sm = /(^|\s)sm(\s|=|$)/i.test(attrs) ? ' data-selo-sm="1"' : ''
    const ic = /(^|\s)ic(\s|=|$)/i.test(attrs) ? ' data-selo-ic="1"' : ''
    return `<span data-selo="${slug}"${sm}${ic}></span>`
  })
  const fecha = new RegExp(`</(${tags.join('|')})\\s*>`, 'gi')
  return html.replace(fecha, '')
}

// Pasta pública dos PNGs oficiais do JurisClub (3 variantes por selo):
//   `<slug>.png`    = badge completo (pasta "1_no_julgado") — padrão, inline no texto do julgado;
//   `<slug>-sm.png` = compacto (pasta "2_em_listas_e_filtros");
//   `<slug>-ic.png` = ícone redondo (pasta "3_icone").
const SELOS_IMG_BASE = '/leitura/selos'

/** Altura (em) padrão do selo conforme a variante — base quando não há tamanho custom (data-selo-h). */
export function alturaBaseSelo(variantes: string[]): number {
  return variantes.includes('ic') ? (variantes.includes('sm') ? 1.4 : 1.7) : variantes.includes('sm') ? 1.5 : 1.7
}

/** Cria o <img> do selo (variante conforme sm/ic + altura em `em` opcional). Público p/ o editor. */
export function criarSeloEl(slug: string, variantes: string[] = [], alturaEm?: number): HTMLElement | null {
  return criarBadge(slug, variantes, alturaEm)
}

/** Cria o <img> do selo apontando para o PNG oficial (variante conforme sm/ic; altura custom opcional). */
function criarBadge(slug: string, variantes: string[], alturaEm?: number): HTMLElement | null {
  const def = SELOS[slug]
  if (!def) return null
  const sfx = variantes.includes('ic') ? '-ic' : variantes.includes('sm') ? '-sm' : ''
  const img = document.createElement('img')
  img.src = `${SELOS_IMG_BASE}/${slug}${sfx}.png`
  img.alt = def.nome
  img.title = def.nome
  img.className = ['sl-img', ...variantes].join(' ')
  img.setAttribute('data-selo', slug)
  img.setAttribute('draggable', 'false')
  img.setAttribute('loading', 'lazy')
  // Dimensiona INLINE (não depende de CSS): igual no editor e na leitura. Altura custom (se houver) é
  // guardada em data-selo-h p/ sobreviver ao save (o `height` inline é descartado pelo sanitizador).
  const h = alturaEm && alturaEm > 0 ? Math.round(alturaEm * 100) / 100 : alturaBaseSelo(variantes)
  img.style.setProperty('display', 'inline-block')
  img.style.setProperty('height', `${h}em`)
  img.style.setProperty('width', variantes.includes('ic') ? `${h}em` : 'auto')
  img.style.setProperty('vertical-align', '-0.42em')
  if (alturaEm && alturaEm > 0) img.setAttribute('data-selo-h', String(h))
  return img
}

/**
 * Renderiza os selos no DOM (cliente). Trata (1) os <span data-selo> já sanitizados e (2) as tags
 * cruas (<rg>…) — útil na prévia do editor antes de salvar.
 */
export function prepararSelosLeitura(cont: HTMLElement): void {
  // 1) elementos com data-selo: spans sanitizados E imgs (inclusive as "quebradas" sem src, que o
  //    sanitizador deixou ao descartar o src relativo). A variante vem da classe sm/ic OU dos atributos.
  for (const el of Array.from(cont.querySelectorAll<HTMLElement>('[data-selo]'))) {
    if (el.tagName === 'IMG' && (el as HTMLImageElement).getAttribute('src')) continue // img válida (idempotente)
    const slug = slugDeTag(el.getAttribute('data-selo') || '')
    if (!slug) continue
    const variantes = [
      (el.classList.contains('sm') || el.hasAttribute('data-selo-sm')) && 'sm',
      (el.classList.contains('ic') || el.hasAttribute('data-selo-ic')) && 'ic',
    ].filter(Boolean) as string[]
    const alturaEm = parseFloat(el.getAttribute('data-selo-h') || '') || undefined
    const badge = criarBadge(slug, variantes, alturaEm)
    if (badge) el.replaceWith(badge)
  }
  // 2) tags cruas (prévia do editor): <rg>, <essencial>…
  for (const tag of tagsReconhecidas()) {
    let nodes: Element[]
    try { nodes = Array.from(cont.querySelectorAll(tag)) } catch { continue }
    for (const el of nodes) {
      const slug = slugDeTag(el.tagName)
      if (!slug) continue
      const variantes = ['sm', 'ic'].filter((v) => el.hasAttribute(v))
      const badge = criarBadge(slug, variantes)
      if (badge) el.replaceWith(badge)
    }
  }
}

/**
 * Converte os <img.sl-img> de selo de volta para <span data-selo [data-selo-sm/ic]> — usado ANTES de
 * SALVAR o conteúdo do editor. Motivo: o sanitizador descarta `src` relativo (só aceita https://); se
 * salvássemos a <img>, o selo perderia a imagem (viraria só o alt). Guardando o span, o leitor
 * re-renderiza a imagem (src correto) a cada abertura. A variante (sm/ic) vem da classe.
 */
export function selosImgParaSpan(cont: HTMLElement): void {
  for (const img of Array.from(cont.querySelectorAll<HTMLElement>('img[data-selo], .sl-img'))) {
    const slug = slugDeTag(img.getAttribute('data-selo') || '')
    if (!slug) continue
    const span = document.createElement('span')
    span.setAttribute('data-selo', slug)
    if (img.classList.contains('sm')) span.setAttribute('data-selo-sm', '1')
    if (img.classList.contains('ic')) span.setAttribute('data-selo-ic', '1')
    const h = img.getAttribute('data-selo-h'); if (h) span.setAttribute('data-selo-h', h)
    img.replaceWith(span)
  }
}
