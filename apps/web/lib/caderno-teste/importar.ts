import 'server-only'
import { parse, type HTMLElement } from 'node-html-parser'
import { DIAG_PADRAO, slugDiag, type DiagConteudo, type DiagPilar, type DiagDisciplina, type DiagSugestao } from './diagnostico'

/**
 * Mapeia um Diagnóstico (Word→HTML, HTML ou PDF) para a estrutura DiagConteudo. HEURÍSTICO e ADAPTATIVO:
 * detecta seções por sinônimos (acento/maiúsculas indiferentes), preserva a formatação inline
 * (negrito/itálico/sublinhado viram marcação), reconhece faixas em vários formatos, bullets diversos e
 * captura também a seção separada de Língua Portuguesa e os parágrafos de fechamento. O que não
 * reconhece fica com o default (não quebra). Word/HTML mantêm a ordem/estrutura (mapeamento confiável);
 * PDF, por perder colunas, é aproximado.
 */
const RE_FAIXA = /^(\d{1,3})\s*(?:[-–—]|a|at[ée])\s*(\d{1,3})\s*%?$/i
const RE_SCORE = /([xX\d]+\s*\/\s*\d+)/
const UP = (s: string) => s.length > 0 && s === s.toUpperCase() && /[A-ZÀ-Ú]/.test(s)
const lim = (s: string) => s.replace(/ /g, ' ').replace(/\s+/g, ' ').trim()
const norm = (s: string) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Uma linha do documento: texto puro (detecção) + texto com marcação (conteúdo) + se é título/negrito. */
type Linha = { p: string; f: string; h: boolean }

/** Serializa um nó preservando negrito/itálico/sublinhado como marcação inline. */
function md(node: any): string {
  if (!node) return ''
  if (node.nodeType === 3) return node.text ?? node.rawText ?? '' // texto
  const tag = String(node.tagName || '').toLowerCase()
  const inner = (node.childNodes || []).map(md).join('')
  if (tag === 'br') return ' '
  if (!inner.trim()) return inner
  if (tag === 'strong' || tag === 'b') return `**${inner}**`
  if (tag === 'em' || tag === 'i') return `*${inner}*`
  if (tag === 'u' || tag === 'ins') return `<u>${inner}</u>`
  return inner
}

/** Linhas de texto (parágrafos/células/itens/títulos) em ordem de documento, com formatação preservada. */
function extrairLinhas(html: string): Linha[] {
  const root = parse(html)
  const out: Linha[] = []
  for (const el of root.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,td,th') as HTMLElement[]) {
    const tag = String(el.tagName || '').toLowerCase()
    // Evita contagem dupla: célula que contém blocos próprios é ignorada (os filhos já entram).
    if ((tag === 'td' || tag === 'th') && el.querySelector('p,li,h1,h2,h3,h4,h5,h6,div,table')) continue
    const p = lim(el.text)
    if (!p) continue
    const f = lim(md(el)) || p
    const b = el.querySelector('strong,b')
    const h = /^h[1-6]$/.test(tag) || (!!b && lim(b.text) === p) // heading OU linha inteira em negrito
    out.push({ p, f, h })
  }
  return out
}

/**
 * Mapeia o NOME do pilar (como aparece no doc) para o slug canônico das variáveis do banco
 * (`{pct_pilar_<slug>}` etc.). Sem `chave`, a prévia perde a banda adaptativa + o percentual do aluno.
 * Aliases cobrem grafias comuns (LEGISLAÇÃO/LEI SECA → lei_seca, LÍNGUA PORTUGUESA → lingua_portuguesa…).
 */
const PILAR_ALIAS: Record<string, string> = {
  lei_seca: 'lei_seca', legislacao: 'lei_seca', lei: 'lei_seca', texto_de_lei: 'lei_seca',
  jurisprudencia: 'jurisprudencia', juris: 'jurisprudencia', jurisprudencial: 'jurisprudencia', informativos: 'jurisprudencia',
  doutrina: 'doutrina', doutrinario: 'doutrina', doutrinaria: 'doutrina',
  lingua_portuguesa: 'lingua_portuguesa', portugues: 'lingua_portuguesa', lingua: 'lingua_portuguesa', portuguesa: 'lingua_portuguesa',
}
function chaveDoPilar(nome: string): string | undefined {
  const s = slugDiag(nome)
  if (PILAR_ALIAS[s]) return PILAR_ALIAS[s]
  for (const [alias, slug] of Object.entries(PILAR_ALIAS)) if (s.includes(alias)) return slug
  return undefined
}

/** Palavras que NÃO são nome de pilar (rótulos/estruturais). */
const RE_NAO_PILAR = /(texto modulado|desempenho|quest|^pilar$|disciplina|sugest|gabarito|prioridade|introdu)/
/** Candidato a nome de pilar: título/negrito ou tudo-maiúsculas, curto, sem número. */
const ehNomePilar = (t: string, h = false) => (UP(t) || h) && t.length <= 42 && /[A-Za-zÀ-ú]{3,}/.test(t) && !RE_NAO_PILAR.test(norm(t)) && !/\d/.test(t.replace(/%/g, ''))

/** Faixa (0-49/50-80/81-100) tolerante: "0-49", "0 a 49", "0 até 49" e também "abaixo/acima de N". */
function detectarFaixa(t: string): string | null {
  const m = t.match(RE_FAIXA)
  if (m) return `${m[1]}-${m[2]}`
  const s = norm(t)
  if (t.length > 26) return null // frases longas não são rótulo de faixa
  if (/(abaixo|menos|inferior|ate 49|ate 50)/.test(s) && /(49|50)/.test(s)) return '0-49'
  if (/(acima|mais|superior|excelente)/.test(s) && /(80|81)/.test(s)) return '81-100'
  if (/(entre|intermediari|medi)/.test(s) && /(50)/.test(s)) return '50-80'
  return null
}

function parsePilares(reg: Linha[]): DiagPilar[] {
  const pilares: DiagPilar[] = []
  for (let i = 0; i < reg.length; i++) {
    if (!ehNomePilar(reg[i].p, reg[i].h)) continue
    const nome = reg[i].p
    const chave = chaveDoPilar(nome)
    const jan = reg.slice(i + 1, i + 120)
    const totalTxt = chave
      ? `{acerto_pilar_${chave}} de {total_pilar_${chave}} questões`
      : (jan.find((l) => /de\s+\d+\s+quest/i.test(l.p))?.f ?? 'X de N questões')
    const bandas: { faixa: string; texto: string }[] = []
    for (let k = 0; k < jan.length; k++) {
      const faixa = detectarFaixa(jan[k].p)
      if (!faixa) continue
      let txt = ''
      for (let n = k + 1; n < jan.length; n++) {
        const l = jan[n]
        if (detectarFaixa(l.p) || /texto modulado/i.test(norm(l.p)) || /de\s+\d+\s+quest/i.test(l.p) || ehNomePilar(l.p, l.h)) break
        txt += (txt ? ' ' : '') + l.f
      }
      bandas.push({ faixa, texto: txt })
    }
    if (bandas.length) pilares.push({ nome, chave, totalTxt, bandas })
  }
  return pilares
}

function parseDisciplinas(reg: Linha[]): DiagDisciplina[] {
  const out: DiagDisciplina[] = []
  let cur: DiagDisciplina | null = null
  const push = () => { if (cur) out.push(cur) }
  for (const l of reg) {
    const t = l.p
    if (/^[-–]\s*categoria/i.test(norm(t))) { if (cur) cur.categoria = lim(t.replace(/^[-–]\s*categoria:?\s*/i, '')) || 'Assunto'; continue }
    // Nome + nota na MESMA linha (ex.: "D. Eleitoral x/5 x%") — comum no PDF.
    const inline = t.match(/^(.{2,}?)\s+([xX\d]+\s*\/\s*\d+)\b/)
    if (inline && !/^[-–]/.test(t)) { push(); cur = { nome: lim(inline[1]), total: inline[2].replace(/\s+/g, ''), categoria: 'Assunto' }; continue }
    // Só a nota (Word/HTML: nome e nota em células separadas).
    if (RE_SCORE.test(t) && t.length < 20) { if (cur) cur.total = (t.match(RE_SCORE)?.[1] ?? cur.total).replace(/\s+/g, ''); continue }
    // Nome sozinho.
    if (t.length >= 3 && !/^texto|^\d+%$/i.test(norm(t)) && !/(desempenho|sugest|gabarito|pilar)/.test(norm(t))) { push(); cur = { nome: l.f, total: 'x/N', categoria: 'Assunto' } }
  }
  push()
  return out
}

const RE_BULLET = /^\s*(?:[•·▪‣◦*]|[-–—]\s|\d+[.)])\s*/
const limparMarcador = (t: string) => t.replace(/^\s*(?:[•·▪‣◦*]|[-–—]|\d+[.)]|>+)\s*/, '')
const ehTituloSug = (l: Linha) => !l.p.startsWith('>') && !RE_BULLET.test(l.p) && (UP(l.p) || l.h) && l.p.length < 46 && !/prioridade/i.test(l.p)

/** Sugestões + parágrafos de FECHAMENTO (texto de encerramento após as sugestões). */
function parseSugestoes(reg: Linha[]): { sugestoes: DiagSugestao[]; fechamento: string[] } {
  const out: DiagSugestao[] = []
  const fechamento: string[] = []
  let cur: DiagSugestao | null = null
  for (const l of reg) {
    const t = l.p
    if (ehTituloSug(l)) { if (cur) out.push(cur); cur = { titulo: l.f, prioridade: 'Prioridade Alta', intro: '', itens: [] }; continue }
    if (!cur) { if (t.length > 60) fechamento.push(l.f); continue }
    if (/prioridade/i.test(t)) { cur.prioridade = lim(t.replace(/^\[!\]\s*/, '')); continue }
    if (t.startsWith('>') || RE_BULLET.test(t)) { const forte = t.startsWith('>>') || /^\s*\*\*/.test(l.f); cur.itens.push({ forte, texto: limparMarcador(l.f) }); continue }
    if (t.length > 40) {
      if (!cur.intro && cur.itens.length === 0) cur.intro = l.f // parágrafo antes dos itens = introdução
      else fechamento.push(l.f) // parágrafo depois dos itens = fechamento
    }
  }
  if (cur) out.push(cur)
  return { sugestoes: out, fechamento }
}

/** Extrai o texto de um PDF em linhas (agrupa por Y, ordena por X) — aproximado; colunas embaralham. */
export async function pdfParaHtml(buffer: Buffer): Promise<string> {
  const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer), isEvalSupported: false, useSystemFonts: true, disableFontFace: true }).promise
  const linhas: string[] = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const tc = await page.getTextContent()
    const its = (tc.items as any[]).filter((i) => typeof i.str === 'string' && i.str.trim()).map((i) => ({ x: i.transform[4] as number, y: i.transform[5] as number, s: i.str as string }))
    its.sort((a, b) => (b.y - a.y) || (a.x - b.x))
    let lineY: number | null = null, cur = ''
    const flush = () => { const t = lim(cur); if (t) linhas.push(t); cur = ''; lineY = null }
    for (const it of its) {
      if (lineY !== null && Math.abs(it.y - lineY) > 3) flush()
      if (lineY === null) lineY = it.y
      cur += (cur ? ' ' : '') + it.s
    }
    flush()
    page.cleanup?.()
  }
  await doc.destroy?.()
  return linhas.map((l) => `<p>${l.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</p>`).join('')
}

export function htmlParaDiagnostico(html: string): { conteudo: DiagConteudo; avisos: string[] } {
  const linhas = extrairLinhas(html)
  const avisos: string[] = []
  const conteudo: DiagConteudo = structuredClone(DIAG_PADRAO)
  const nP = linhas.map((l) => norm(l.p))
  const acha = (re: RegExp, from = 0) => { for (let i = from; i < nP.length; i++) if (re.test(nP[i])) return i; return -1 }

  // Detecção de seções por sinônimos (acento/maiúsculas indiferentes).
  const iLP = acha(/desempenho em lingua|lingua portuguesa/)
  let iPilar = acha(/por pilar/); if (iPilar < 0) iPilar = acha(/desempenho.*pilar|pilar.*desempenho/)
  const iDisc = acha(/por disciplina|por materia|por assunto|desempenho por disciplina/)
  const iSug = acha(/sugest|recomenda|plano de estudo|como estudar|o que estudar|proximos passos|o que priorizar/)
  const iGab = acha(/gabarito|quest(o|ao)es?\s+(anulad|desatualiz|atualiz)/)

  // Início das seções (p/ delimitar intro).
  const secs = [iLP, iPilar, iDisc, iSug, iGab].filter((x) => x >= 0)
  const primSec = secs.length ? Math.min(...secs) : linhas.length

  // Título/subtítulo.
  const iTit = acha(/diagn[oó]stico/)
  let iniIntro = 0
  if (iTit >= 0) {
    conteudo.tituloCabecalho = linhas[iTit].f || conteudo.tituloCabecalho
    iniIntro = iTit + 1
    if (linhas[iTit + 1] && linhas[iTit + 1].p.length < 80 && !/acert|quest/.test(nP[iTit + 1])) { conteudo.subtitulo = linhas[iTit + 1].f; iniIntro = iTit + 2 }
  }

  // Nota.
  const iNota = nP.findIndex((t) => /acert/.test(t) && /quest/.test(t))
  if (iNota >= 0) {
    conteudo.notaTexto = linhas[iNota].f
    const m = linhas[iNota].p.match(/de\s+(\d+)\s+quest/i) || linhas[iNota].p.match(/\/\s*(\d+)/) || linhas[iNota].p.match(/(\d+)\s+quest/i)
    if (m) conteudo.notaTotal = m[1]
    iniIntro = Math.max(iniIntro, iNota + 1)
  }

  // Intro: parágrafos longos entre o cabeçalho/nota e a 1ª seção.
  const intro = linhas.slice(iniIntro, primSec).filter((l) => l.p.length > 60 && !/^\[nome|^nome:/.test(norm(l.p))).map((l) => l.f)
  if (intro.length) conteudo.intro = intro

  // Seção SEPARADA de Língua Portuguesa (card próprio, antes dos pilares jurídicos).
  if (iLP >= 0 && (iPilar < 0 || iLP < iPilar)) {
    const fimLP = iPilar >= 0 ? iPilar : (iDisc >= 0 ? iDisc : linhas.length)
    const regLP = linhas.slice(iLP + 1, fimLP)
    const cardIdx = regLP.findIndex((l) => ehNomePilar(l.p, l.h))
    const secIntro = regLP.slice(0, cardIdx >= 0 ? cardIdx : regLP.length).filter((l) => l.p.length > 50).map((l) => l.f).join(' ')
    const lp = parsePilares(regLP)[0]
    if (lp) {
      const chave = lp.chave ?? 'lingua_portuguesa'
      conteudo.linguaPortuguesa = {
        chave, tipoFonte: 'pilar',
        secTitulo: linhas[iLP].f || 'Desempenho em Língua Portuguesa',
        secIntro, titulo: lp.nome,
        totalTxt: `{acerto_pilar_${chave}} de {total_pilar_${chave}} questões`,
        bandas: lp.bandas,
      }
    }
  }

  if (iPilar >= 0) {
    const fim = iDisc >= 0 ? iDisc : (iSug >= 0 ? iSug : (iGab >= 0 ? iGab : undefined))
    const p = parsePilares(linhas.slice(iPilar + 1, fim))
    if (p.length) conteudo.pilares = p; else avisos.push('Não reconheci os pilares — usando o padrão.')
  } else avisos.push('Seção “desempenho por pilar” não encontrada.')

  if (iDisc >= 0) {
    const regDisc = linhas.slice(iDisc + 1, iSug >= 0 ? iSug : (iGab >= 0 ? iGab : undefined))
    // 1º parágrafo longo (não é nome de disciplina) = introdução das disciplinas (senão viraria disciplina falsa).
    let ini = 0
    if (regDisc[0] && regDisc[0].p.length > 60 && !ehNomePilar(regDisc[0].p, regDisc[0].h)) { conteudo.disciplinasIntro = regDisc[0].f; ini = 1 }
    const d = parseDisciplinas(regDisc.slice(ini))
    if (d.length) conteudo.disciplinas = d; else avisos.push('Não reconheci as disciplinas.')
  } else avisos.push('Seção “desempenho por disciplina” não encontrada.')

  if (iSug >= 0) {
    const { sugestoes, fechamento } = parseSugestoes(linhas.slice(iSug + 1, iGab >= 0 ? iGab : undefined))
    if (sugestoes.length) conteudo.sugestoes = sugestoes
    if (fechamento.length) conteudo.fechamento = fechamento
  }

  if (iGab >= 0) {
    const reg = linhas.slice(iGab + 1)
    conteudo.gabaritoTitulo = linhas[iGab].f || conteudo.gabaritoTitulo
    conteudo.gabaritoIntro = reg.filter((l) => l.p.length > 40 && !/^quest[ãa]o\s+\d+/i.test(l.p)).map((l) => l.f).slice(0, 4)
    conteudo.gabaritoObs = reg.filter((l) => /^quest[ãa]o\s+\d+/i.test(l.p)).map((l) => l.f)
  }

  if (secs.length === 0) avisos.push('Não reconheci a estrutura do diagnóstico — confira a prévia; talvez seja um formato muito diferente.')
  return { conteudo, avisos }
}
