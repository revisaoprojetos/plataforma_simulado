/**
 * Vínculo META (cronograma Revisão/legado) -> DOCUMENTO da Biblioteca. Módulo PURO (sem I/O).
 *
 * Mesmo critério do Cronograma Adaptativo (lib/cronograma/adaptativo/conteudo-banco.ts):
 *   · o documento vive numa subpasta da disciplina cujo TIPO DE MATERIAL (herdado pelo pai_id) decide o papel:
 *     PDFull (ou sem tipo = compat) -> aula; PDFlash -> revisão; LegProc -> lei seca;
 *   · aula = nº "Aula NN" do título (ou a aula equivalente do catálogo do modelo, aulaHTML; ou a ordem natural na
 *     disciplina, como o adaptativo faz com o que o modelo não reconhece); disciplina = nome canônico (chaveDisciplina);
 *   · LegProc casa a lei pelo nº/alias (docDaLei).
 * Texto da meta: caixa/acentos/pontuação são normalizados; "CONTINUAÇÃO AULA 02 DIREITO DO TRABALHO" resolve a aula 2 da
 * disciplina que aparece no texto. Precedência: VÍNCULO EXPLÍCITO do admin > automático > nenhum.
 */

import { aulaHTML, chaveDisciplina, docDaLei, numeroAula } from './adaptativo/catalogo-html'
import { reencaixarPorChave } from './chave-meta'

export type TipoMaterial = 'pdfull' | 'pdfight' | 'pdflash' | 'legproc' | 'jurisclub' | 'questoes'

/** Documento publicado da Biblioteca já com a disciplina e o tipo de material (herdado) da sua pasta. */
export type DocBiblioteca = { id: string; titulo: string; disc: string; tipo: TipoMaterial | null }

export type MetaParaConteudo = {
  id: string
  /** slug do tipo_meta (pdfull, flash, legproc, quest, juris…). */
  tipo: string
  /** Rótulos candidatos da disciplina (nome do cadastro e/ou rótulo da meta). */
  disciplinas: string[]
  aula: string | null
  conteudo: string | null
  /** Título/complemento exibidos (ex.: "CONTINUAÇÃO AULA 02 DIREITO DO TRABALHO"): fonte extra para nº da aula e disciplina. */
  textos?: (string | null | undefined)[]
}

export type VinculoExplicito = { meta_id: string; chave_meta?: string | null; documento_id: string; pagina_ini?: number | null }

export type ConteudoResolvido = { docId: string; origem: 'explicito' | 'auto'; pagina: number | null }

const semAcento = (s: string) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
/** Texto comparável: sem acento, minúsculo, só letras/dígitos separados por 1 espaço. */
export const normTexto = (s: string | null | undefined): string => semAcento(String(s ?? '')).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/** Chave da disciplina tolerante a variações: "Direito do Trabalho" = "Direito Trabalho" = "Trabalho". */
export function chaveDisc(nome: string | null | undefined): string {
  const k = chaveDisciplina(String(nome ?? '')).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
  return k.replace(/^(do|da|de|dos|das)\s+/, '')
}

/** Papel do material que a meta consome. null = o tipo não tem documento automático (questões, juris, simulado…). */
export function materialDaMeta(slug: string): 'pdfull' | 'pdflash' | 'legproc' | null {
  const s = normTexto(slug).replace(/ /g, '')
  if (!s || s.includes('quest') || s.includes('pdfight') || s.includes('simulad') || s.includes('juris')) return null
  if (s.includes('flash') || s.includes('revis')) return 'pdflash'
  if (s.includes('legproc') || s === 'lei' || s.includes('leiseca')) return 'legproc'
  if (s.includes('pdfull') || s === 'pdf' || s.includes('aula') || s.includes('continuacao')) return 'pdfull'
  return null
}

const col = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' })

/** Papel efetivo do doc: tipo da pasta; sem tipo, PDFIGHT/PDFLASH no título não são aula (igual ao adaptativo). */
function papelDoDoc(d: DocBiblioteca): 'pdfull' | 'pdflash' | 'legproc' | null {
  if (d.tipo === 'legproc') return 'legproc'
  if (d.tipo === 'pdflash') return 'pdflash'
  if (d.tipo === 'pdfight' || d.tipo === 'jurisclub' || d.tipo === 'questoes') return null
  if (/\bPDFLASH\b/i.test(d.titulo)) return 'pdflash'
  if (/\bPDFIGHT\b/i.test(d.titulo)) return null
  return 'pdfull'
}

type Grupo = { pdfull: DocBiblioteca[]; pdflash: DocBiblioteca[] }
export type IndiceBib = { aulas: Map<string, Map<number, Grupo>>; legproc: Map<string, DocBiblioteca[]>; discs: Set<string> }

/** Nº "Aula NN" em vários formatos: Aula 1, Aula 01, AULA 02, aula nº 3, "Continuação Aula 2". */
export function numeroAulaTexto(texto: string | null | undefined): number | null {
  const m = /\baula\s*(?:n\s*[o°º]?\s*)?0*(\d{1,3})\b/.exec(normTexto(texto))
  return m ? Number(m[1]) : null
}

export function indexarBiblioteca(docs: DocBiblioteca[]): IndiceBib {
  const aulas: IndiceBib['aulas'] = new Map()
  const legproc: IndiceBib['legproc'] = new Map()
  const discs = new Set<string>()
  type Entrada = { d: DocBiblioteca; papel: 'pdfull' | 'pdflash'; n: number | null }
  const porDisc = new Map<string, Entrada[]>()
  for (const d of docs) {
    const papel = papelDoDoc(d)
    if (!papel) continue
    const k = chaveDisc(d.disc)
    discs.add(k)
    if (papel === 'legproc') { legproc.set(k, [...(legproc.get(k) ?? []), d]); continue }
    const real = numeroAulaTexto(d.titulo) ?? numeroAula(d.titulo)
    const mod = real == null ? aulaHTML(d.disc, d.titulo) : null // aula equivalente do catálogo do modelo (por tema)
    porDisc.set(k, [...(porDisc.get(k) ?? []), { d, papel, n: real ?? (mod ? Number(mod.numero) || null : null) }])
  }
  // Ordem natural na disciplina: o que ainda não tem nº ganha a posição (k+1) — o mesmo que o adaptativo faz
  // com as aulas da Biblioteca que o modelo não reconhece. Nº explícito sempre tem precedência na colisão.
  const ord = (a: Entrada, b: Entrada) => (a.d.tipo ? 0 : 1) - (b.d.tipo ? 0 : 1) || col.compare(a.d.titulo, b.d.titulo)
  for (const [k, lista] of porDisc) {
    const porAula = new Map<number, Grupo>()
    const colocar = (e: Entrada, n: number) => {
      const g = porAula.get(n) ?? { pdfull: [], pdflash: [] }
      g[e.papel].push(e.d); porAula.set(n, g)
    }
    const fulls = lista.filter((e) => e.papel === 'pdfull').sort((a, b) => col.compare(a.d.titulo, b.d.titulo))
    lista.filter((e) => e.n != null).sort(ord).forEach((e) => colocar(e, e.n as number))
    let livre = 1 // sem nº em lugar nenhum: ocupa o menor nº de aula ainda livre, na ordem natural dos títulos
    for (const e of fulls) {
      if (e.n != null) continue
      while (porAula.get(livre)?.pdfull.length) livre++
      colocar(e, livre)
    }
    aulas.set(k, porAula)
  }
  for (const l of legproc.values()) l.sort((a, b) => col.compare(a.titulo, b.titulo))
  return { aulas, legproc, discs }
}

/** Nº da aula da meta: "03" / "3" / "Aula 3". Aula composta ("1.1") ou vazia = sem número. */
export function numeroDaAulaMeta(aula: string | null | undefined): number | null {
  const t = String(aula ?? '').trim()
  if (/^\d+$/.test(t)) return Number(t)
  return numeroAulaTexto(t)
}

type Contexto = { numero: number | null; chaves: string[]; fonteNumero: 'aula' | 'texto' | null }

/** Nº da aula (campo aula; senão "Aula NN" dos textos) e chaves de disciplina (rótulo; senão a que aparece no texto). */
function contextoDaMeta(meta: MetaParaConteudo, indice: IndiceBib): Contexto {
  const textos = [meta.conteudo, ...(meta.textos ?? [])].filter(Boolean) as string[]
  let numero = numeroDaAulaMeta(meta.aula), fonteNumero: Contexto['fonteNumero'] = numero != null ? 'aula' : null
  if (numero == null) for (const t of textos) { const n = numeroAulaTexto(t); if (n != null) { numero = n; fonteNumero = 'texto'; break } }
  const chaves = [...new Set(meta.disciplinas.map(chaveDisc).filter(Boolean))].filter((k) => indice.discs.has(k))
  // Disciplina escrita no texto (caixa alta etc.): a mais específica (maior chave) entre as da Biblioteca.
  const alvo = ` ${textos.map(normTexto).join(' ')} `
  const achadas = [...indice.discs].filter((k) => k.length >= 4 && alvo.includes(` ${k} `)).sort((a, b) => b.length - a.length)
  for (const k of achadas) if (!chaves.includes(k)) chaves.push(k)
  return { numero, chaves, fonteNumero }
}

export function resolverDocumentoMeta(meta: MetaParaConteudo, indice: IndiceBib, vinculo?: VinculoExplicito | null): ConteudoResolvido | null {
  if (vinculo?.documento_id) return { docId: vinculo.documento_id, origem: 'explicito', pagina: vinculo.pagina_ini ?? null }
  const papel = materialDaMeta(meta.tipo)
  if (!papel) return null
  const { numero, chaves } = contextoDaMeta(meta, indice)

  if (papel === 'legproc') {
    for (const k of chaves) {
      const docs = indice.legproc.get(k)
      if (!docs?.length) continue
      const textos = [meta.conteudo, ...(meta.textos ?? [])].filter(Boolean) as string[]
      for (const t of textos) { const d = docDaLei(t, docs); if (d) return { docId: d.id, origem: 'auto', pagina: null } }
      if (docs.length === 1) return { docId: docs[0].id, origem: 'auto', pagina: null } // única lei da disciplina: sem ambiguidade
    }
    return null
  }

  if (numero == null) return null
  for (const k of chaves) {
    const g = indice.aulas.get(k)?.get(numero)
    if (!g) continue
    // Revisão/flash: PDFlash da aula; sem ele, o PDFull da mesma aula (releitura).
    const doc = papel === 'pdflash' ? g.pdflash[0] ?? g.pdfull[0] : g.pdfull[0]
    if (doc) return { docId: doc.id, origem: 'auto', pagina: null }
  }
  return null
}

export type MotivoSemDocumento =
  | 'tipo_sem_documento' // questões/simulado/juris: esperado (seguem pelos links)
  | 'sem_numero_aula' // não há "Aula NN" no campo aula nem nos textos
  | 'disciplina_nao_casa' // nenhuma disciplina da Biblioteca casa com o rótulo/texto
  | 'aula_inexistente' // disciplina existe, mas não há documento dessa aula (ou do papel esperado)
  | 'legproc_sem_documento' // disciplina sem lei LegProc na Biblioteca
  | 'legproc_ambiguo' // várias leis na disciplina e nenhuma casa com o texto

export const ROTULO_MOTIVO: Record<MotivoSemDocumento, string> = {
  tipo_sem_documento: 'Tipo sem documento (questões etc.)',
  sem_numero_aula: 'Sem nº da aula',
  disciplina_nao_casa: 'Disciplina não casa com a Biblioteca',
  aula_inexistente: 'Aula inexistente na Biblioteca',
  legproc_sem_documento: 'Disciplina sem LegProc',
  legproc_ambiguo: 'LegProc ambíguo (várias leis)',
}

/** Por que a meta ficou sem documento (só chamar quando `resolverDocumentoMeta` devolveu null). */
export function explicarSemDocumento(meta: MetaParaConteudo, indice: IndiceBib): MotivoSemDocumento {
  const papel = materialDaMeta(meta.tipo)
  if (!papel) return 'tipo_sem_documento'
  const { numero, chaves } = contextoDaMeta(meta, indice)
  if (!chaves.length) return 'disciplina_nao_casa'
  if (papel === 'legproc') return chaves.some((k) => (indice.legproc.get(k)?.length ?? 0) > 0) ? 'legproc_ambiguo' : 'legproc_sem_documento'
  if (numero == null) return 'sem_numero_aula'
  return 'aula_inexistente'
}

/**
 * Vínculos explícitos por meta ATUAL do cronograma, com reencaixe por chave estável (meta recriada na
 * reimportação mantém o vínculo). Mesmo algoritmo de checks/notas (reencaixarPorChave).
 */
export function vinculosPorMeta<T extends VinculoExplicito>(vinculos: T[], metasAtuais: { id: string; chave: string | null }[]): Map<string, T> {
  const { linhas } = reencaixarPorChave<T>(vinculos, metasAtuais)
  const out = new Map<string, T>()
  for (const l of linhas) out.set(l.meta_id, l)
  return out
}

/** Link do leitor do portal com retorno ao cronograma (mesmo contrato do adaptativo: ?voltar & ?pagina; sem ?meta). */
export function urlLeitorRevisao(docId: string, emissaoId: string, pagina: number | null): string {
  const qs = [`voltar=${encodeURIComponent(`/aluno/cronograma/${emissaoId}`)}`]
  if (pagina && pagina > 1) qs.push(`pagina=${Math.trunc(pagina)}`)
  return `/aluno/biblioteca/${docId}?${qs.join('&')}`
}
