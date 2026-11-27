// PARTES de documento da Biblioteca (Fase 4) — lógica PURA (sem I/O; roda no servidor e em teste).
// Uma parte guarda só a FAIXA [trecho_ini_uid .. trecho_fim_uid] + nome/ordem. Como o uid pode mudar numa nova
// versão (reconciliação), a faixa é re-resolvida na versão atual: uid direto; se sumiu, por RÓTULO ("Art. 5º").
// Nada de tempo/regra aqui: `medirParte` só devolve a medida bruta (artigos/palavras/caracteres) que o servidor
// usa como insumo do cálculo de tempo.

export interface TrechoParte {
  uid: string
  tipo: string | null
  rotulo: string | null
  texto: string | null
}

export interface FaixaParte {
  iniUid: string
  fimUid: string
  rotuloIni?: string | null
  rotuloFim?: string | null
}

export type MotivoResolucao =
  | 'uid'            // ambos os uids existem na versão atual
  | 'rotulo'         // ao menos uma ponta foi recuperada por rótulo
  | 'ini_ausente'    // início não encontrado por uid nem por rótulo
  | 'fim_ausente'    // fim não encontrado por uid nem por rótulo
  | 'faixa_invertida'// fim antes do início
  | 'sem_trechos'

export interface ResolucaoFaixa {
  ok: boolean
  /** trecho inicial/final resolvidos (null quando não resolveu). */
  ini: TrechoParte | null
  fim: TrechoParte | null
  /** [indiceIni, indiceFim] (inclusivos) na lista de trechos; null quando não resolveu. */
  indices: [number, number] | null
  motivo: MotivoResolucao
  /** pontas recuperadas por rótulo (uid antigo sumiu) → o servidor pode regravar os uids. */
  recuperadoPorRotulo: { ini: boolean; fim: boolean }
}

/** Normaliza rótulo: "Art. 5º-A" / "artigo 5° - A" → "art 5-a". */
export function normalizarRotulo(r: string | null | undefined): string {
  if (!r) return ''
  return r
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[º°ª]/g, '')
    .replace(/\bartigo\b/g, 'art')
    .replace(/[.,;:]/g, ' ')
    .replace(/\s*-\s*/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

const RE_ART_TEXTO = /^\s*Art(?:igo)?\.?\s*\d+(?:\.\d+)*\s*[º°o]?\s*(?:-\s*[A-Z]{1,3}\b)?/i

/** Rótulo efetivo do trecho (campo `rotulo` ou, para artigo, o começo do texto). */
export function rotuloDoTrecho(t: TrechoParte): string | null {
  if (t.rotulo && t.rotulo.trim()) return t.rotulo.trim()
  if (t.tipo === 'artigo') {
    const m = RE_ART_TEXTO.exec(t.texto ?? '')
    if (m) return m[0].trim().replace(/\s+/g, ' ')
  }
  return null
}

const ehMarcoEstrutural = (t: TrechoParte) => t.tipo === 'artigo' || t.tipo === 'titulo' || t.tipo === 'capitulo'

function acharPorRotulo(trechos: TrechoParte[], rotulo: string | null | undefined, desde: number): number {
  const alvo = normalizarRotulo(rotulo)
  if (!alvo) return -1
  let primeiroQualquer = -1
  for (let i = Math.max(0, desde); i < trechos.length; i++) {
    const t = trechos[i]
    if (normalizarRotulo(rotuloDoTrecho(t)) !== alvo) continue
    // Prefere o dispositivo "de verdade" (artigo); citações/incisos com o mesmo rótulo só entram como último recurso.
    if (t.tipo === 'artigo' || t.tipo === 'titulo' || t.tipo === 'capitulo') return i
    if (primeiroQualquer < 0) primeiroQualquer = i
  }
  return primeiroQualquer
}

/**
 * Re-resolve a faixa na versão ATUAL.
 *  - início: uid direto; senão primeiro trecho com o rótulo (`rotuloIni`).
 *  - fim: uid direto; senão primeiro trecho com `rotuloFim` a partir do início, ESTENDIDO até o último bloco antes do
 *    próximo artigo/título/capítulo (o rótulo aponta o "Art. 10", mas a parte inclui os §§/incisos dele).
 */
export function resolverFaixa(trechos: TrechoParte[], faixa: FaixaParte): ResolucaoFaixa {
  const vazio = (motivo: MotivoResolucao): ResolucaoFaixa => ({ ok: false, ini: null, fim: null, indices: null, motivo, recuperadoPorRotulo: { ini: false, fim: false } })
  if (!trechos.length) return vazio('sem_trechos')

  const porUid = new Map<string, number>()
  for (let i = 0; i < trechos.length; i++) if (!porUid.has(trechos[i].uid)) porUid.set(trechos[i].uid, i)

  let iIni = porUid.get(faixa.iniUid) ?? -1
  let viaRotuloIni = false
  if (iIni < 0) { iIni = acharPorRotulo(trechos, faixa.rotuloIni, 0); viaRotuloIni = iIni >= 0 }
  if (iIni < 0) return vazio('ini_ausente')

  let iFim = porUid.get(faixa.fimUid) ?? -1
  let viaRotuloFim = false
  if (iFim < 0) {
    const achado = acharPorRotulo(trechos, faixa.rotuloFim, iIni)
    if (achado >= 0) {
      let j = achado
      while (j + 1 < trechos.length && !ehMarcoEstrutural(trechos[j + 1])) j++
      iFim = j; viaRotuloFim = true
    }
  }
  if (iFim < 0) return { ...vazio('fim_ausente'), ini: trechos[iIni], indices: null, recuperadoPorRotulo: { ini: viaRotuloIni, fim: false } }
  if (iFim < iIni) return { ...vazio('faixa_invertida'), ini: trechos[iIni], fim: trechos[iFim], recuperadoPorRotulo: { ini: viaRotuloIni, fim: viaRotuloFim } }

  return {
    ok: true, ini: trechos[iIni], fim: trechos[iFim], indices: [iIni, iFim],
    motivo: viaRotuloIni || viaRotuloFim ? 'rotulo' : 'uid',
    recuperadoPorRotulo: { ini: viaRotuloIni, fim: viaRotuloFim },
  }
}

// ── Medida da parte (insumo do tempo; o cálculo em si fica no servidor) ──────────────────────────────────────────────

export interface MedidaParte { artigos: number; palavras: number; caracteres: number }

export function medirParte(trechosDaFaixa: TrechoParte[]): MedidaParte {
  let artigos = 0, palavras = 0, caracteres = 0
  for (const t of trechosDaFaixa) {
    if (t.tipo === 'artigo') artigos++
    const txt = (t.texto ?? '').trim()
    if (!txt) continue
    caracteres += txt.length
    palavras += txt.split(/\s+/).length
  }
  return { artigos, palavras, caracteres }
}

// ── Sugestão automática ──────────────────────────────────────────────────────────────────────────────────────────────

export type ModoSugestao = 'titulo' | 'capitulo' | 'cada_n_artigos'
export interface OpcoesSugestao { modo: ModoSugestao; n?: number }

export interface ParteSugerida {
  nome: string
  iniUid: string
  fimUid: string
  rotuloIni: string | null
  rotuloFim: string | null
  indices: [number, number]
  medida: MedidaParte
}

const MAX_NOME = 120
const limparNome = (s: string): string => s.replace(/\s+/g, ' ').trim().slice(0, 80)

/** Garante nomes únicos (sem acento/caixa) acrescentando " (2)", " (3)"… */
function nomesUnicos(partes: ParteSugerida[]): ParteSugerida[] {
  const usados = new Map<string, number>()
  return partes.map((p) => {
    const k = normalizarRotulo(p.nome) || 'parte'
    const n = (usados.get(k) ?? 0) + 1
    usados.set(k, n)
    return n === 1 ? p : { ...p, nome: `${p.nome} (${n})`.slice(0, MAX_NOME) }
  })
}

function montar(trechos: TrechoParte[], a: number, b: number, nome: string): ParteSugerida {
  const faixa = trechos.slice(a, b + 1)
  const arts = faixa.filter((t) => t.tipo === 'artigo')
  const rIni = arts.length ? rotuloDoTrecho(arts[0]) : rotuloDoTrecho(trechos[a])
  const rFim = arts.length ? rotuloDoTrecho(arts[arts.length - 1]) : rotuloDoTrecho(trechos[b])
  return { nome, iniUid: trechos[a].uid, fimUid: trechos[b].uid, rotuloIni: rIni, rotuloFim: rFim, indices: [a, b], medida: medirParte(faixa) }
}

/** Corta nos índices de início dado; o preâmbulo (antes do 1º corte) é anexado à 1ª parte. */
function cortarEm(trechos: TrechoParte[], inicios: number[], nomear: (a: number, b: number, k: number) => string): ParteSugerida[] {
  if (!inicios.length) return []
  const out: ParteSugerida[] = []
  for (let k = 0; k < inicios.length; k++) {
    const a = k === 0 ? 0 : inicios[k]
    const b = k + 1 < inicios.length ? inicios[k + 1] - 1 : trechos.length - 1
    out.push(montar(trechos, a, b, nomear(inicios[k], b, k)))
  }
  return nomesUnicos(out)
}

export function sugerirPartes(trechos: TrechoParte[], opc: OpcoesSugestao): ParteSugerida[] {
  if (!trechos.length) return []
  if (opc.modo === 'titulo' || opc.modo === 'capitulo') {
    const marca = (t: TrechoParte) => (opc.modo === 'titulo' ? t.tipo === 'titulo' : t.tipo === 'capitulo' || t.tipo === 'titulo')
    const inicios: number[] = []
    trechos.forEach((t, i) => { if (marca(t) && (t.texto ?? '').trim()) inicios.push(i) })
    return cortarEm(trechos, inicios, (a, _b, k) => limparNome(trechos[a].texto ?? '') || `Parte ${k + 1}`)
  }
  // cada_n_artigos
  const n = Math.min(500, Math.max(1, Math.floor(Number(opc.n) || 10)))
  const idxArt: number[] = []
  trechos.forEach((t, i) => { if (t.tipo === 'artigo') idxArt.push(i) })
  if (!idxArt.length) return []
  const inicios: number[] = []
  for (let k = 0; k < idxArt.length; k += n) inicios.push(idxArt[k])
  return cortarEm(trechos, inicios, (a, b) => {
    const arts = trechos.slice(a, b + 1).filter((t) => t.tipo === 'artigo')
    const ri = rotuloDoTrecho(arts[0]) ?? 'Art.'
    const rf = rotuloDoTrecho(arts[arts.length - 1]) ?? ri
    return arts.length > 1 && ri !== rf ? `${ri} a ${rf}` : ri
  })
}

// ── Validação ────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface ParteParaValidar {
  id?: string
  nome: string
  /** faixa JÁ resolvida em índices inclusivos (use `resolverFaixa(...).indices`). */
  ini: number
  fim: number
  arquivada?: boolean
}

export type CodigoErroParte = 'nome_vazio' | 'nome_longo' | 'faixa_invalida' | 'faixa_invertida' | 'nome_duplicado' | 'sobreposicao'
export interface ErroParte { codigo: CodigoErroParte; mensagem: string; nomes: string[]; ids: string[] }
export interface ResultadoValidacao { ok: boolean; erros: ErroParte[] }

/** Sem sobreposição, ini<=fim, nomes únicos entre as ATIVAS (arquivadas só passam pelas checagens individuais). */
export function validarPartes(partes: ParteParaValidar[]): ResultadoValidacao {
  const erros: ErroParte[] = []
  const e = (codigo: CodigoErroParte, mensagem: string, ps: ParteParaValidar[]) =>
    erros.push({ codigo, mensagem, nomes: ps.map((p) => p.nome), ids: ps.map((p) => p.id).filter((x): x is string => !!x) })

  for (const p of partes) {
    const nome = (p.nome ?? '').trim()
    if (!nome) e('nome_vazio', 'A parte precisa de um nome.', [p])
    else if (nome.length > MAX_NOME) e('nome_longo', `O nome “${nome.slice(0, 20)}…” passa de ${MAX_NOME} caracteres.`, [p])
    if (!Number.isInteger(p.ini) || !Number.isInteger(p.fim) || p.ini < 0 || p.fim < 0) e('faixa_invalida', `A faixa da parte “${nome}” é inválida.`, [p])
    else if (p.ini > p.fim) e('faixa_invertida', `Na parte “${nome}” o início vem depois do fim.`, [p])
  }

  const ativas = partes.filter((p) => !p.arquivada)
  const porNome = new Map<string, ParteParaValidar[]>()
  for (const p of ativas) {
    const k = normalizarRotulo(p.nome)
    if (!k) continue
    porNome.set(k, [...(porNome.get(k) ?? []), p])
  }
  for (const grupo of porNome.values()) if (grupo.length > 1) e('nome_duplicado', `Já existe outra parte ativa chamada “${grupo[0].nome.trim()}”.`, grupo)

  const validas = ativas.filter((p) => Number.isInteger(p.ini) && Number.isInteger(p.fim) && p.ini >= 0 && p.ini <= p.fim)
    .sort((a, b) => a.ini - b.ini || a.fim - b.fim)
  for (let i = 1; i < validas.length; i++) {
    const ant = validas[i - 1], cur = validas[i]
    if (cur.ini <= ant.fim) e('sobreposicao', `As partes “${ant.nome.trim()}” e “${cur.nome.trim()}” se sobrepõem.`, [ant, cur])
  }
  return { ok: erros.length === 0, erros }
}

/** Utilitário p/ o servidor: resolve várias partes de uma vez (mesma lista de trechos). */
export function resolverPartes<T extends FaixaParte>(trechos: TrechoParte[], partes: T[]): Array<{ parte: T; resolucao: ResolucaoFaixa; medida: MedidaParte | null }> {
  return partes.map((parte) => {
    const resolucao = resolverFaixa(trechos, parte)
    const medida = resolucao.ok && resolucao.indices ? medirParte(trechos.slice(resolucao.indices[0], resolucao.indices[1] + 1)) : null
    return { parte, resolucao, medida }
  })
}
