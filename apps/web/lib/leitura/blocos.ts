// Blocos de destaque configuráveis (ENTENDIMENTO STF/STJ, Já cobrado, Atenção, e os que o admin criar).
// Cada bloco tem: rótulo (só p/ a UI), PALAVRAS-chave (o que casa no título/início) e COR. A detecção
// (caixas.ts) casa o título de uma TABELA-com-fundo OU o início de um PARÁGRAFO contra as palavras e
// transforma no bloco daquele tipo, com a cor configurada. Editável por documento (quiz_config.blocos).

export interface BlocoDef {
  id: string        // slug estável (vai no data-caixa)
  rotulo: string    // nome exibido na config
  palavras: string  // palavras-chave separadas por vírgula (case/acento-insensível)
  cor: string       // cor base do bloco (fundo); a borda é derivada
  corTitulo: string // cor do TEXTO do título do bloco
  previa: boolean   // mostrar a prévia (descrição recolhida) DESTE bloco
}

export const DEFAULT_BLOCOS: BlocoDef[] = [
  { id: 'stf', rotulo: 'Entendimento STF', palavras: 'STF', cor: '#bdd6ee', corTitulo: '#1f3d63', previa: true },
  { id: 'stj', rotulo: 'Entendimento STJ', palavras: 'STJ', cor: '#fff2cc', corTitulo: '#7a5a00', previa: true },
  { id: 'atencao', rotulo: 'Atenção', palavras: 'ATENÇÃO, NÃO ESQUEÇA, IMPORTANTE, CUIDADO', cor: '#fde9d9', corTitulo: '#a34400', previa: true },
  { id: 'cobrado', rotulo: 'Já cobrado em prova', palavras: 'Já cobrado em prova', cor: '#efeafc', corTitulo: '#5a4bbd', previa: true },
  { id: 'destaque', rotulo: 'Destaque', palavras: 'ENTENDIMENTO, SÚMULA, NATUREZA, DIFERENCIA, CONCEITO, REQUISITO, CLASSIFICA, PRECEDENTE, JURISPRUD, INFORMATIVO, OBSERVA, DICA, TESE, DISTIN, CARACTER', cor: '#eef1f4', corTitulo: '#111111', previa: true },
]

let _uid = 0
const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || `bloco-${++_uid}`
const hex6 = (v: unknown, def: string): string => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v.trim()) ? v.trim().toLowerCase() : def)

export function resolverBlocos(raw: unknown): BlocoDef[] {
  if (!Array.isArray(raw)) return DEFAULT_BLOCOS.map((b) => ({ ...b }))
  const out: BlocoDef[] = []
  const usados = new Set<string>()
  for (const r of raw as any[]) {
    if (!r || typeof r !== 'object') continue
    const rotulo = typeof r.rotulo === 'string' ? r.rotulo.slice(0, 60) : ''
    const palavras = typeof r.palavras === 'string' ? r.palavras.slice(0, 300) : ''
    if (!rotulo && !palavras) continue
    let id = typeof r.id === 'string' && r.id ? r.id : slug(rotulo || palavras)
    while (usados.has(id)) id = `${id}-${++_uid}`
    usados.add(id)
    out.push({ id, rotulo: rotulo || palavras, palavras, cor: hex6(r.cor, '#eef1f4'), corTitulo: hex6(r.corTitulo, '#111111'), previa: r.previa !== false })
  }
  return out.length ? out : DEFAULT_BLOCOS.map((b) => ({ ...b }))
}

const norm = (s: string) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
const palavrasDe = (b: BlocoDef) => b.palavras.split(',').map((p) => norm(p)).filter(Boolean)

/** Bloco cujo alguma palavra-chave está CONTIDA no título (usado nos cabeçalhos de tabela). */
export function acharBlocoPorTitulo(titulo: string, blocos: BlocoDef[]): BlocoDef | null {
  const t = norm(titulo)
  if (!t) return null
  for (const b of blocos) for (const p of palavrasDe(b)) if (t.includes(p)) return b
  return null
}
/** Bloco cujo alguma palavra-chave INICIA o texto (usado em parágrafos, ex.: "📌 Já cobrado em prova:").
 *  Ignora emojis/pontuação/espaços no começo. */
export function acharBlocoPorInicio(texto: string, blocos: BlocoDef[]): { bloco: BlocoDef; tam: number } | null {
  const bruto = (texto || '').replace(/^[\s\p{P}\p{S}]+/u, '') // tira emoji/pontuação inicial
  const t = norm(bruto)
  if (!t) return null
  for (const b of blocos) for (const p of palavrasDe(b)) if (p && t.startsWith(p)) {
    // tamanho do rótulo no texto ORIGINAL (para dividir título|corpo preservando a espinha)
    const idx = texto.search(/[\p{L}\p{N}]/u)
    return { bloco: b, tam: (idx < 0 ? 0 : idx) + p.length }
  }
  return null
}

/** Estilo inline do bloco a partir da cor base (fundo claro + borda derivada). */
export function estiloBloco(cor: string): { background: string; borderColor: string } {
  return { background: cor, borderColor: `color-mix(in srgb, ${cor} 62%, #555)` }
}
