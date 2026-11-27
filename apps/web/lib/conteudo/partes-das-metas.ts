// PARTES a partir das METAS (puro, sem I/O) — gera a lista de partes de um documento replicando FIELMENTE o recorte que
// as metas do cronograma já usam hoje. NÃO inventa segmentação nova.
//
//  · LegProc, corte AUTOMÁTICO (disciplinas fora do modelo 2.8): mesma conta de lib/cronograma/adaptativo/lp-catalogo.ts
//    › segmentarLei — unidades = artigo (+ incisos/§/títulos que o seguem; o preâmbulo vai junto do 1º artigo), empacotadas
//    em metas de ~CHARS_META (12.000 car. ≈ 30 min): fecha a meta quando já tem >= 60% da cota E o próximo artigo estouraria.
//    Teste de equivalência (partes-das-metas.test.ts) compara com a função original.
//  · LegProc, MODELO 2.8 (disciplinas cobertas por catalogo-html.json › legprocs): a faixa vem TEXTUAL por meta
//    ("Art. 1º ao art. 6º, XXIII", "Art. 40 até o final", "Preâmbulo ao art. 5º, IV", "Leitura completa", "Art. 3º; art. 7º ao art. 9º").
//    Aqui o texto é ancorado nos artigos do documento (mesmo rótulo). Parte = faixa de trechos; corte DENTRO de um artigo
//    (inciso/§) não é representável (os incisos não têm rótulo próprio nos trechos) → o artigo inteiro fica com a meta anterior
//    e o aviso `corte_dentro_de_artigo` sinaliza.
//  · PDFlash / PDFight: as metas NÃO dividem o documento (1 meta = o material inteiro da aula; o vínculo é por nº da aula —
//    conteudo-meta.ts › resolverDocumentoMeta). Não há faixa a replicar → nenhuma parte é proposta (aviso `sem_divisao_nas_metas`).

import { medirParte, normalizarRotulo, rotuloDoTrecho, type MedidaParte, type TrechoParte } from './partes'

/** Mesma calibragem de lp-catalogo.ts (12.000 caracteres ≈ 30 min). Mantida em teste de equivalência com o original. */
export const CHARS_META_PARTES = 12000

export type TipoMetaPartes = 'legproc' | 'pdflash' | 'pdfight'
export type FontePartes = 'legproc_auto' | 'legproc_modelo' | 'nenhuma'

export type CodigoAviso =
  | 'sem_trechos'                // documento sem trechos (ex.: PDF) → não há como definir faixa
  | 'sem_divisao_nas_metas'      // PDFlash/PDFight: a meta usa o documento inteiro
  | 'doc_inteiro'                // doc sem texto/artigos → 1 parte = leitura inteira (como a meta)
  | 'sem_artigos'                // sem trechos "artigo": o corte automático gera 1 única parte (igual à meta)
  | 'legproc_fora_do_modelo'     // disciplina coberta pelo modelo, mas nenhuma lei do modelo casa com este documento → sem metas hoje
  | 'artigo_nao_encontrado'      // o artigo citado pela meta não existe no documento
  | 'corte_dentro_de_artigo'     // meta corta no meio de um artigo (inciso/§): aproximado ao artigo inteiro
  | 'meta_fundida'               // a meta cairia inteira dentro do artigo da anterior → sem parte própria
  | 'meta_com_varias_faixas'     // "Art. 3º; art. 7º ao art. 9º" → uma parte por faixa
  | 'faixa_nao_interpretada'     // texto da meta fora do formato conhecido
  | 'artigos_sem_meta'           // artigos do documento que nenhuma meta do modelo cobre
  | 'nome_repetido'              // nomes iguais → sufixo (n)

export interface AvisoPartes { codigo: CodigoAviso; mensagem: string }

export interface ParteProposta {
  nome: string
  ordem: number
  rotuloIni: string | null
  rotuloFim: string | null
  iniUid: string
  fimUid: string
  /** índices inclusivos na lista de trechos recebida. */
  indices: [number, number]
  medida: MedidaParte
  /** texto da meta que originou a parte (modelo) / faixa da meta (auto). */
  metaTexto: string
}

export interface ResultadoPartesMetas {
  tipo: TipoMetaPartes
  fonte: FontePartes
  partes: ParteProposta[]
  avisos: AvisoPartes[]
}

const MAX_NOME = 120
const aviso = (codigo: CodigoAviso, mensagem: string): AvisoPartes => ({ codigo, mensagem })

// ── Corte automático (cópia fiel de lp-catalogo.ts › rotArtigo/segmentarLei, com índices) ─────────────────────────

/** Rótulo do artigo a partir do texto do trecho ("Art. 1º-A. O servidor…" → "1º-A"). IGUAL ao de lp-catalogo.ts. */
export function rotuloArtigoMeta(texto: string, rotulo: string | null): string | null {
  const m = /^\s*Art\.?\s*(\d+(?:\.\d+)*)\s*([º°o]?)\s*(-\s*[A-Z]{1,3})?/i.exec(texto || '')
  if (m) return `${m[1]}${m[2] ? 'º' : (/^\d$/.test(m[1]) ? 'º' : '')}${m[3] ? m[3].replace(/\s+/g, '') : ''}`
  const r = /(\d+[A-Z-]*)/.exec(rotulo || '')
  return r ? r[1] : null
}

interface UnidadeAuto { art: string | null; chars: number; ini: number; fim: number }
interface MetaAuto { de: string | null; ate: string | null; chars: number; ini: number; fim: number }

function medidaDaFaixa(trechos: TrechoParte[], a: number, b: number): MedidaParte { return medirParte(trechos.slice(a, b + 1)) }

function rotulosDaFaixa(trechos: TrechoParte[], a: number, b: number): { ini: string | null; fim: string | null } {
  const arts = trechos.slice(a, b + 1).filter((t) => t.tipo === 'artigo')
  return arts.length
    ? { ini: rotuloDoTrecho(arts[0]), fim: rotuloDoTrecho(arts[arts.length - 1]) }
    : { ini: rotuloDoTrecho(trechos[a]), fim: rotuloDoTrecho(trechos[b]) }
}

function montarParte(trechos: TrechoParte[], a: number, b: number, nome: string, ordem: number, metaTexto: string): ParteProposta {
  const r = rotulosDaFaixa(trechos, a, b)
  return {
    nome: nome.replace(/\s+/g, ' ').trim().slice(0, MAX_NOME), ordem, rotuloIni: r.ini, rotuloFim: r.fim,
    iniUid: trechos[a].uid, fimUid: trechos[b].uid, indices: [a, b], medida: medidaDaFaixa(trechos, a, b), metaTexto,
  }
}

const maiuscula1 = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s)

/** Nomes únicos (sem acento/caixa): repetidos ganham " (2)", " (3)"… */
function nomesUnicos(partes: ParteProposta[], avisos: AvisoPartes[]): ParteProposta[] {
  const usados = new Map<string, number>()
  let repetiu = false
  const out = partes.map((p) => {
    const k = normalizarRotulo(p.nome) || 'parte'
    const n = (usados.get(k) ?? 0) + 1
    usados.set(k, n)
    if (n === 1) return p
    repetiu = true
    return { ...p, nome: `${p.nome} (${n})`.slice(0, MAX_NOME) }
  })
  if (repetiu) avisos.push(aviso('nome_repetido', 'Havia faixas com o mesmo nome; as repetidas receberam um sufixo (2), (3)…'))
  return out
}

/** Corte automático por ~CHARS_META — MESMA conta de segmentarLei. `chars` configurável só para teste. */
export function partesLegProcAuto(trechos: TrechoParte[], charsMeta: number = CHARS_META_PARTES): ResultadoPartesMetas {
  const avisos: AvisoPartes[] = []
  const vazio = (): ResultadoPartesMetas => ({ tipo: 'legproc', fonte: 'legproc_auto', partes: [], avisos })
  if (!trechos.length) { avisos.push(aviso('sem_trechos', 'O documento não tem trechos (ex.: PDF): a meta usa o documento inteiro.')); return vazio() }
  const total = trechos.reduce((s, t) => s + (t.texto || '').length, 0)
  if (!total) { avisos.push(aviso('doc_inteiro', 'Documento sem texto: a meta é “leitura” do documento inteiro.')); return vazio() }

  const unidades: UnidadeAuto[] = []
  let atual = null as UnidadeAuto | null
  const temArtigo = trechos.some((t) => t.tipo === 'artigo')
  for (let i = 0; i < trechos.length; i++) {
    const t = trechos[i]
    const n = (t.texto || '').length
    if (temArtigo && t.tipo === 'artigo') {
      const art = rotuloArtigoMeta(t.texto || '', t.rotulo)
      if (!atual) atual = { art, chars: n, ini: 0, fim: i }                              // 1º artigo
      else if (!atual.art) { atual.art = art; atual.chars += n; atual.fim = i }          // preâmbulo absorvido pelo 1º artigo
      else { unidades.push(atual); atual = { art, chars: n, ini: i, fim: i } }           // novo artigo = nova unidade
    } else {
      if (!atual) atual = { art: null, chars: 0, ini: i, fim: i }
      atual.chars += n; atual.fim = i
    }
  }
  if (atual) unidades.push(atual)

  const metas: MetaAuto[] = []
  let m = null as MetaAuto | null
  for (const u of unidades) {
    if (m && m.chars >= charsMeta * 0.6 && m.chars + u.chars > charsMeta) { metas.push(m); m = null }
    if (!m) m = { de: u.art, ate: u.art, chars: 0, ini: u.ini, fim: u.fim }
    m.chars += u.chars; m.fim = u.fim
    if (u.art) { m.ate = u.art; if (!m.de) m.de = u.art }
  }
  if (m) metas.push(m)

  if (!temArtigo) avisos.push(aviso('sem_artigos', 'Documento sem artigos: o corte automático gera uma única parte (igual à meta, “parte 1 de 1”).'))
  const N = metas.length
  const partes = metas.map((x, k) => {
    const faixa = temArtigo && x.de ? (x.de === x.ate ? `art. ${x.de}` : `arts. ${x.de} a ${x.ate}`) : `parte ${k + 1} de ${N}`
    return montarParte(trechos, x.ini, x.fim, maiuscula1(faixa), k, faixa)
  })
  return { tipo: 'legproc', fonte: 'legproc_auto', partes: nomesUnicos(partes, avisos), avisos }
}

// ── Modelo 2.8: faixa textual por meta ─────────────────────────────────────────────────────────────────────────────

export interface RefArtigo { artigo: string; rotuloNorm: string; detalhe: string | null }
export interface FaixaModelo {
  texto: string
  /** início: 'preambulo' = começa no 1º trecho; 'doc' = leitura completa. */
  de: RefArtigo | 'preambulo' | 'doc'
  /** fim: 'final' = até o último trecho; null quando é "doc". */
  ate: RefArtigo | 'final' | 'doc'
}

const RE_REF = /^\s*(?:art(?:igo)?s?\.?\s*)?(\d+(?:\.\d+)*)\s*([º°o]?)\s*(-\s*[A-Z]{1,3})?(?![\p{L}\d])\s*(?:,\s*)?(.*)$/iu

/** "Art. 6º, XXIII" → {artigo:'6º', detalhe:'XXIII'}; "art.7º-A" → {artigo:'7º-A'}; inválido → null. */
export function parsearRefArtigo(s: string): RefArtigo | null {
  const m = RE_REF.exec((s || '').trim())
  if (!m) return null
  const artigo = `${m[1]}${m[2] ? 'º' : ''}${m[3] ? m[3].replace(/\s+/g, '') : ''}`
  const detalhe = (m[4] || '').trim().replace(/[.;]+$/, '') || null
  return { artigo, rotuloNorm: normalizarRotulo(`Art. ${artigo}`), detalhe }
}

/** Texto da meta do modelo → faixas (1 por trecho separado por ";"). Formato fora do conhecido → null. */
export function parsearFaixaModelo(texto: string): FaixaModelo[] | null {
  const t = (texto || '').trim()
  if (!t) return null
  if (/^leitura\s+completa$/i.test(t)) return [{ texto: t, de: 'doc', ate: 'doc' }]
  const out: FaixaModelo[] = []
  for (const seg0 of t.split(';')) {
    const seg = seg0.trim(); if (!seg) continue
    const mFinal = /^(.+?)\s+at[ée]\s+(?:o\s+)?final$/i.exec(seg)
    const mAte = /^(.+?)\s+(?:ao|at[ée]\s+o|at[ée])\s+(.+)$/i.exec(seg)
    const ini = (s: string): RefArtigo | 'preambulo' | null => (/^pre[âa]mbulo$/i.test(s.trim()) ? 'preambulo' : parsearRefArtigo(s))
    if (mFinal) {
      const de = ini(mFinal[1]); if (!de) return null
      out.push({ texto: seg, de, ate: 'final' }); continue
    }
    if (mAte) {
      const de = ini(mAte[1]); const ate = parsearRefArtigo(mAte[2]); if (!de || !ate) return null
      out.push({ texto: seg, de, ate }); continue
    }
    const unico = parsearRefArtigo(seg); if (!unico) return null
    out.push({ texto: seg, de: unico, ate: unico })
  }
  return out.length ? out : null
}

function indicesDeArtigos(trechos: TrechoParte[]): { idx: number[]; porRotulo: Map<string, number[]> } {
  const idx: number[] = []
  const porRotulo = new Map<string, number[]>()
  trechos.forEach((t, i) => {
    if (t.tipo !== 'artigo') return
    idx.push(i)
    const k = normalizarRotulo(rotuloDoTrecho(t))
    if (k) porRotulo.set(k, [...(porRotulo.get(k) ?? []), i])
  })
  return { idx, porRotulo }
}

/** Partes de uma lei do modelo 2.8: `textos` = texto de cada meta da lei, na ordem do modelo (ordemLP). */
export function partesLegProcModelo(trechos: TrechoParte[], textos: string[]): ResultadoPartesMetas {
  const avisos: AvisoPartes[] = []
  const res = (partes: ParteProposta[]): ResultadoPartesMetas => ({ tipo: 'legproc', fonte: 'legproc_modelo', partes, avisos })
  if (!trechos.length) { avisos.push(aviso('sem_trechos', 'O documento não tem trechos (ex.: PDF): a meta usa o documento inteiro.')); return res([]) }
  const { idx: artIdx, porRotulo } = indicesDeArtigos(trechos)
  const ultimo = trechos.length - 1
  const fimDoArtigo = (i: number): number => { const prox = artIdx.find((x) => x > i); return prox === undefined ? ultimo : prox - 1 }
  const achar = (r: RefArtigo, desde: number): number => {
    const l = porRotulo.get(r.rotuloNorm) ?? []
    return l.find((i) => i >= desde) ?? l[0] ?? -1
  }

  const partes: ParteProposta[] = []
  let prevFim = -1, cursor = 0
  const cobertos = new Set<number>()
  for (const texto of textos) {
    const faixas = parsearFaixaModelo(texto)
    if (!faixas) { avisos.push(aviso('faixa_nao_interpretada', `Meta “${texto}”: formato de faixa não reconhecido — ignorada.`)); continue }
    if (faixas.length > 1) avisos.push(aviso('meta_com_varias_faixas', `Meta “${texto}” tem mais de uma faixa: uma parte por faixa.`))
    faixas.forEach((f, fk) => {
      let a: number, b: number
      if (f.de === 'doc') { a = 0; b = ultimo } else {
        if (f.de === 'preambulo') a = 0
        else { a = achar(f.de, cursor); if (a < 0) { avisos.push(aviso('artigo_nao_encontrado', `Meta “${f.texto}”: o ${f.de.artigo} não existe no documento.`)); return } }
        if (f.ate === 'final') b = ultimo
        else {
          const ate = f.ate as RefArtigo
          const ia = achar(ate, Math.max(a, 0))
          if (ia < 0) { avisos.push(aviso('artigo_nao_encontrado', `Meta “${f.texto}”: o ${ate.artigo} não existe no documento.`)); return }
          b = fimDoArtigo(ia)
        }
        const sub = [f.de, f.ate].some((r) => typeof r === 'object' && r.detalhe)
        if (sub) avisos.push(aviso('corte_dentro_de_artigo', `Meta “${f.texto}” corta dentro de um artigo (inciso/§): a parte vai até o fim do artigo; os incisos/§§ não têm rótulo próprio.`))
      }
      if (a <= prevFim) a = prevFim + 1                            // sem sobreposição: o artigo repartido fica com a meta anterior
      if (a > b) { avisos.push(aviso('meta_fundida', `Meta “${f.texto}” ficou inteira dentro do artigo da meta anterior — sem parte própria.`)); return }
      const nome = faixas.length > 1 ? `${f.texto} (${fk + 1}/${faixas.length})` : f.texto
      partes.push(montarParte(trechos, a, b, nome, partes.length, f.texto))
      for (let i = a; i <= b; i++) if (trechos[i].tipo === 'artigo') cobertos.add(i)
      prevFim = b; cursor = a
    })
  }
  const semMeta = artIdx.filter((i) => !cobertos.has(i)).length
  if (partes.length && semMeta) avisos.push(aviso('artigos_sem_meta', `${semMeta} artigo(s) do documento não são cobertos por nenhuma meta do modelo.`))
  return res(nomesUnicos(partes, avisos))
}

// ── Despacho por tipo ──────────────────────────────────────────────────────────────────────────────────────────────

export interface EntradaPartesMetas {
  tipo: TipoMetaPartes
  trechos: TrechoParte[]
  /** LegProc: textos das metas do modelo 2.8 desta lei (ordem do modelo). `null` = disciplina fora do modelo (corte automático);
   *  `[]` = disciplina coberta pelo modelo mas nenhuma lei casa com o documento. */
  textosModelo?: string[] | null
}

export function partesDasMetas(e: EntradaPartesMetas): ResultadoPartesMetas {
  if (e.tipo === 'pdflash' || e.tipo === 'pdfight') {
    return {
      tipo: e.tipo, fonte: 'nenhuma', partes: [],
      avisos: [aviso('sem_divisao_nas_metas', `${e.tipo === 'pdflash' ? 'PDFlash' : 'PDFight'}: as metas usam o documento inteiro (1 meta por aula, ligada pelo nº da aula) — não há faixa por meta para replicar.`)],
    }
  }
  if (e.textosModelo === undefined || e.textosModelo === null) return partesLegProcAuto(e.trechos)
  if (!e.textosModelo.length) {
    return { tipo: 'legproc', fonte: 'legproc_modelo', partes: [], avisos: [aviso('legproc_fora_do_modelo', 'A disciplina é coberta pelo modelo 2.8, mas nenhuma lei do modelo casa com este documento — hoje ele não gera metas de LegProc.')] }
  }
  return partesLegProcModelo(e.trechos, e.textosModelo)
}
