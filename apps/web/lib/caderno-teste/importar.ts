import 'server-only'
import zlib from 'node:zlib'
import { parse, type HTMLElement } from 'node-html-parser'
import { DIAG_PADRAO, slugDiag, type DiagConteudo, type DiagPilar, type DiagDisciplina, type DiagSugestao } from './diagnostico'

// ===== Recuperação de CAIXAS DE TEXTO do .docx (o mammoth ignora text boxes/shapes) =====
/** Descompacta 1 entrada de um zip (.docx) sem dependência externa. */
function unzipEntry(buf: Buffer, nome: string): string | null {
  try {
    let eocd = -1
    for (let i = buf.length - 22; i >= 0 && i > buf.length - 22 - 65536; i--) { if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break } }
    if (eocd < 0) return null
    const count = buf.readUInt16LE(eocd + 10)
    let p = buf.readUInt32LE(eocd + 16)
    for (let n = 0; n < count; n++) {
      if (buf.readUInt32LE(p) !== 0x02014b50) break
      const method = buf.readUInt16LE(p + 10)
      const compSize = buf.readUInt32LE(p + 20)
      const fnLen = buf.readUInt16LE(p + 28), exLen = buf.readUInt16LE(p + 30), cmLen = buf.readUInt16LE(p + 32)
      const lho = buf.readUInt32LE(p + 42)
      const fname = buf.toString('utf8', p + 46, p + 46 + fnLen)
      if (fname === nome) {
        const lfn = buf.readUInt16LE(lho + 26), lex = buf.readUInt16LE(lho + 28)
        const data = buf.subarray(lho + 30 + lfn + lex, lho + 30 + lfn + lex + compSize)
        return method === 0 ? data.toString('utf8') : zlib.inflateRawSync(data).toString('utf8')
      }
      p += 46 + fnLen + exLen + cmLen
    }
  } catch { /* zip inesperado */ }
  return null
}
const decodeXml = (s: string) => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d)).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))

/** Extrai os parágrafos que estão DENTRO de caixas de texto/shapes (<w:txbxContent>) do document.xml. */
export function caixasDeTextoDocx(buf: Buffer): string[] {
  const xml = unzipEntry(buf, 'word/document.xml'); if (!xml) return []
  const out: string[] = []
  for (const tb of xml.matchAll(/<w:txbxContent[\s\S]*?<\/w:txbxContent>/g)) {
    for (const pm of tb[0].matchAll(/<w:p[\s>][\s\S]*?<\/w:p>/g)) {
      const t = lim(decodeXml((pm[0].match(/<w:t[^>]*>[\s\S]*?<\/w:t>/g) ?? []).join('')))
      if (t) out.push(t)
    }
  }
  return out
}

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
  if (m) {
    // Normaliza p/ as 3 faixas canônicas — o doc pode usar 0-50/51-80 (em vez de 0-49/50-80),
    // e sem isso o pilar acumulava bandas duplicadas (0-50 + 0-49 + 51-80 + 50-80 + 81-100).
    const lo = Number(m[1]), hi = Number(m[2])
    if (hi >= 81 || lo >= 81) return '81-100'
    if (lo >= 50) return '50-80'
    return '0-49'
  }
  const s = norm(t)
  if (t.length > 26) return null // frases longas não são rótulo de faixa
  if (/(abaixo|menos|inferior|ate 49|ate 50)/.test(s) && /(49|50)/.test(s)) return '0-49'
  if (/(acima|mais|superior|excelente)/.test(s) && /(80|81)/.test(s)) return '81-100'
  if (/(entre|intermediari|medi)/.test(s) && /(50)/.test(s)) return '50-80'
  return null
}

/** Faixa detectada pela ABERTURA de um parágrafo longo (o próprio texto da banda), quando o
 *  doc não traz um rótulo curto separado. Ex.: "…ficou abaixo de 50%…", "…foi intermediário",
 *  "…foi excelente". Analisa só o começo (veredito) para não confundir com o corpo do texto. */
function faixaNaAbertura(t: string): string | null {
  if (t.length <= 40) return null // parágrafos curtos são rótulos (detectarFaixa), não texto de banda
  const s = norm(t).slice(0, 100)
  if (/(abaixo|menos|inferior|ruim|deixou a desejar|nao foi bom|ficou baixo|precisa (de )?aten)/.test(s)) return '0-49'
  if (/(excelente|otimo|maravilhoso|excepcional|muito bom|acima de 8|parabens)/.test(s)) return '81-100'
  if (/(intermediari|foi medi|foi medio|na media|razoavel|regular|espaco.*(cresc|melhor)|há espaco|ha espaco)/.test(s)) return '50-80'
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
    const vistas = new Set<string>()
    for (let k = 0; k < jan.length; k++) {
      // (a) rótulo curto ("0-49" / "Abaixo de 50%") → texto vem nas linhas seguintes.
      const faixa = detectarFaixa(jan[k].p)
      if (faixa) {
        if (vistas.has(faixa)) continue
        let txt = ''
        for (let n = k + 1; n < jan.length; n++) {
          const l = jan[n]
          if (detectarFaixa(l.p) || /texto modulado/i.test(norm(l.p)) || /de\s+\d+\s+quest/i.test(l.p) || ehNomePilar(l.p, l.h)) break
          txt += (txt ? ' ' : '') + l.f
        }
        if (txt.trim()) { bandas.push({ faixa, texto: txt }); vistas.add(faixa) }
        continue
      }
      // (b) parágrafo longo que JÁ é o texto da banda (veredito na abertura).
      const inl = faixaNaAbertura(jan[k].p)
      if (inl && !vistas.has(inl)) { bandas.push({ faixa: inl, texto: jan[k].f }); vistas.add(inl) }
    }
    const ORD = ['0-49', '50-80', '81-100']
    bandas.sort((a, b) => ORD.indexOf(a.faixa) - ORD.indexOf(b.faixa))
    if (bandas.length) pilares.push({ nome, chave, totalTxt, bandas })
  }
  return pilares
}

/** Linhas que NÃO são disciplina (resumos/agrupamentos que apareciam como "disciplina" falsa):
 *  "Acertos /33", "Acertos: 20", "Grupo II/III", "Nota", "Total", "…% de aproveitamento". */
const RE_RUIDO_DISC = /(^|\s)acert|^grupo\s|^grupo$|aproveitamento|^nota\b|^total\b|^\d+\s*%$/

function parseDisciplinas(reg: Linha[]): DiagDisciplina[] {
  const out: DiagDisciplina[] = []
  let cur: DiagDisciplina | null = null
  const push = () => { if (cur) out.push(cur) }
  for (const l of reg) {
    const t = l.p
    if (/^[-–]\s*categoria/i.test(norm(t))) { if (cur) cur.categoria = lim(t.replace(/^[-–]\s*categoria:?\s*/i, '')) || 'Assunto'; continue }
    // Pula linhas de resumo/agrupamento (não são disciplinas) — ex.: "Acertos /33", "Grupo II".
    if (RE_RUIDO_DISC.test(norm(t))) continue
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

// Detecta linha de item (bullet/seta/número). Aceita ● ○ ◆ » › ▶ etc. `* ` avulso é bullet; `**` NÃO (negrito).
const RE_BULLET = /^\s*(?:[•·▪‣◦●○◉◆■»›▶◾▸]|[-–—]\s|\*(?!\*)\s|\d+[.)])\s*/
// Marcador no início p/ REMOVER (repetido/combinado: ">> ●● texto", "• → texto"). Preserva `**negrito**`.
const RE_MARCADOR_INI = /^\s*(?:>+|[•·▪‣◦●○◉◆■»›▶◾▸]+|[-–—]\s|\*(?!\*)\s|\d+[.)])\s*/
const limparMarcador = (t: string) => { let s = t, p: string; do { p = s; s = s.replace(RE_MARCADOR_INI, '') } while (s !== p); return s.trim() }
/** Limpa um item de sugestão: tira marcadores E conserta **negrito** quebrado (o doc às vezes solta
 *  `**` sem par → antes aparecia "** " cru e itens vazios "**"). */
const limparItemSug = (t: string): string => {
  let s = limparMarcador(t).replace(/\*\*\s*\*\*/g, '')            // remove negrito VAZIO "** **"
  if ((s.match(/\*\*/g) ?? []).length % 2 !== 0) s = s.replace(/\*\*/g, '') // ** desbalanceado → texto puro (senão o par preserva o negrito)
  return s.trim()
}
/** Item tem conteúdo real? (descarta "**", vazio, só pontuação/marcador). */
const itemTemTexto = (t: string): boolean => /[0-9A-Za-zÀ-ú]/.test(t)
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
    // Prioridade: SÓ um rótulo curto começando por "prioridade" (ou "[!] prioridade") — não um
    // parágrafo que apenas MENCIONA a palavra (antes virava um textão na área de prioridade).
    if (/^\s*(?:\[!\]\s*)?prioridade\b/i.test(t) && t.length < 40) { cur.prioridade = lim(t.replace(/^\s*\[!\]\s*/, '')); continue }
    if (t.startsWith('>') || RE_BULLET.test(t)) {
      const forte = /^\s*>>/.test(t) // "forte" só quando o doc marca com >> (negrito sozinho NÃO é forte)
      // Divide itens colados na MESMA linha por marcadores inline (>> > ● • › ▶ …), limpa cada um e
      // conserta **negrito** quebrado. Descarta pedaços vazios/só-marcador (ex.: "**").
      const partes = l.f.split(/\s*(?:>{1,2}|[•·▪‣◦●○◉◆■»›▶◾▸])\s+/).map((x) => limparItemSug(x)).filter(itemTemTexto)
      for (const p of (partes.length ? partes : [limparItemSug(l.f)])) if (itemTemTexto(p)) cur.itens.push({ forte, texto: p })
      continue
    }
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

export function htmlParaDiagnostico(html: string, caixas: string[] = []): { conteudo: DiagConteudo; avisos: string[] } {
  const linhas = extrairLinhas(html)
  const avisos: string[] = []
  const conteudo: DiagConteudo = structuredClone(DIAG_PADRAO)
  const nP = linhas.map((l) => norm(l.p))
  const acha = (re: RegExp, from = 0) => { for (let i = from; i < nP.length; i++) if (re.test(nP[i])) return i; return -1 }
  // Cabeçalho de seção é uma linha CURTA (ou título/negrito). Evita casar a FRASE da introdução
  // (ex.: "…o desempenho por pilar… e por disciplina…"), que senão zeraria a fatia dos pilares.
  const achaSec = (re: RegExp) => {
    let alt = -1
    for (let i = 0; i < nP.length; i++) if (re.test(nP[i])) { if (linhas[i].p.length <= 48 || linhas[i].h) return i; if (alt < 0) alt = i }
    return alt
  }

  // Detecção de seções por sinônimos (acento/maiúsculas indiferentes).
  const iLP = achaSec(/desempenho em lingua|lingua portuguesa/)
  let iPilar = achaSec(/por pilar/); if (iPilar < 0) iPilar = achaSec(/desempenho.*pilar|pilar.*desempenho/)
  const iDisc = achaSec(/por disciplina|por materia|por assunto|desempenho por disciplina/)
  const iSug = achaSec(/sugest|recomenda|plano de estudo|como estudar|o que estudar|proximos passos|o que priorizar/)
  const iGab = achaSec(/gabarito|quest(o|ao)es?\s+(anulad|desatualiz|atualiz)/)

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

  // Nota. O modelo (Word/PDF) traz "X acertos de N questões — X% de aproveitamento" com o "X" como
  // PLACEHOLDER visual. Precisamos gravar os TOKENS ({acertos}/{total_questoes}/{percentual}) — senão
  // o render mostra o "X" literal em vez do dado do aluno. Convertendo os placeholders p/ tokens:
  const iNota = nP.findIndex((t) => /acert/.test(t) && /quest/.test(t))
  if (iNota >= 0) {
    conteudo.notaTexto = linhas[iNota].f
      .replace(/\bX\s*%/gi, '{percentual}')              // "X%" → aproveitamento
      .replace(/\bX\b/g, '{acertos}')                    // "X" (acertos) → acertos
      .replace(/\b\d+(?=\s*quest)/i, '{total_questoes}') // "de 30 questões" → token (total real do banco)
    conteudo.notaTotal = '{total_questoes}'
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
  } else { conteudo.pilares = []; avisos.push('Seção “desempenho por pilar” não encontrada — bloco omitido.') } // doc sem pilares → não cria a seção (limpa o default)

  // Bandas vazias? Recupera os textos que estavam em CAIXAS DE TEXTO do .docx (mammoth ignora),
  // atribuindo-os por ordem (3 por pilar) + faixa detectada na abertura.
  const semBanda = (conteudo.pilares ?? []).filter((pl) => (pl.bandas ?? []).every((b) => !b.texto?.trim()))
  const textosCaixa = caixas.filter((t) => t.length > 40)
  if (semBanda.length && textosCaixa.length) {
    semBanda.forEach((pl, gi) => {
      const grupo = textosCaixa.slice(gi * 3, gi * 3 + 3)
      if (!grupo.length) return
      const usados = new Set<number>()
      pl.bandas = ['0-49', '50-80', '81-100'].map((f, k) => {
        let idx = grupo.findIndex((t, ti) => !usados.has(ti) && faixaNaAbertura(t) === f)
        if (idx < 0) idx = grupo.findIndex((_, ti) => !usados.has(ti)) // sobra por posição
        if (idx >= 0) usados.add(idx)
        return { faixa: f, texto: idx >= 0 ? grupo[idx] : '' }
      })
    })
    avisos.push('Recuperei textos de bandas que estavam em caixas de texto do Word.')
  }

  if (iDisc >= 0) {
    const regDisc = linhas.slice(iDisc + 1, iSug >= 0 ? iSug : (iGab >= 0 ? iGab : undefined))
    // 1º parágrafo longo (não é nome de disciplina) = introdução das disciplinas (senão viraria disciplina falsa).
    let ini = 0
    if (regDisc[0] && regDisc[0].p.length > 60 && !ehNomePilar(regDisc[0].p, regDisc[0].h)) { conteudo.disciplinasIntro = regDisc[0].f; ini = 1 }
    const d = parseDisciplinas(regDisc.slice(ini))
    if (d.length) conteudo.disciplinas = d; else avisos.push('Não reconheci as disciplinas.')
  } else { conteudo.disciplinas = []; avisos.push('Seção “desempenho por disciplina” não encontrada — bloco omitido.') } // doc sem disciplinas → não cria a seção

  if (iSug >= 0) {
    const { sugestoes, fechamento } = parseSugestoes(linhas.slice(iSug + 1, iGab >= 0 ? iGab : undefined))
    if (sugestoes.length) conteudo.sugestoes = sugestoes
    if (fechamento.length) conteudo.fechamento = fechamento
  } else { conteudo.sugestoes = []; conteudo.fechamento = [] } // doc sem “sugestões de estudo” → não cria a seção (limpa o default)

  if (iGab >= 0) {
    const reg = linhas.slice(iGab + 1)
    conteudo.gabaritoTitulo = linhas[iGab].f || conteudo.gabaritoTitulo
    conteudo.gabaritoIntro = reg.filter((l) => l.p.length > 40 && !/^quest[ãa]o\s+\d+/i.test(l.p)).map((l) => l.f).slice(0, 4)
    conteudo.gabaritoObs = reg.filter((l) => /^quest[ãa]o\s+\d+/i.test(l.p)).map((l) => l.f)
  } else { conteudo.gabaritoIntro = []; conteudo.gabaritoObs = [] } // doc sem “gabarito desatualizado” → não cria a seção (limpa o default)

  if (secs.length === 0) avisos.push('Não reconheci a estrutura do diagnóstico — confira a prévia; talvez seja um formato muito diferente.')
  return { conteudo, avisos }
}
