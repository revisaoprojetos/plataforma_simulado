import 'server-only'
import mammoth from 'mammoth'
import { parse, type HTMLElement } from 'node-html-parser'
import { genId, RUNNING_PADRAO, type Block, type CadernoDoc } from './types'

/**
 * Conversor de Word (.docx) → documento do caderno (CadernoDoc / blocos).
 *
 * Dois caminhos:
 *  - DIAGNÓSTICO: reconhece o template de "Diagnóstico Individualizado" (nota X/N, pilares
 *    com TEXTO MODULADO por faixa, desempenho por disciplina/grupo, sugestões) e emite os
 *    blocos NATIVOS (diag-nota/diag-pilares/diag-grupo-header/diag-disciplina/diag-sugestoes)
 *    para o resultado ficar estilizado como no Word.
 *  - GENÉRICO: qualquer outro Word vira blocos fiéis (títulos, textos, imagens, listas).
 *
 * Não altera o modelo de dados; usa os blocos que já existem.
 */

type Linha = { texto: string; bold: boolean; heading: number; img?: string }

function bloco(type: string, attributes: Record<string, unknown>, innerBlocks?: Block[]): Block {
  return innerBlocks ? { id: genId('b'), type, attributes, innerBlocks } : { id: genId('b'), type, attributes }
}
const espacador = () => bloco('espacador', { altura: 14 })
function txt(texto: string, patch: Record<string, unknown> = {}): Block {
  return bloco('texto-livre', { texto, align: 'left', size: 12, bold: false, italico: false, sublinhado: false, color: '', fonte: '', lineHeight: 1.5, espacamento: 4, ...patch })
}

/** Placeholders do Word → variáveis do caderno. */
function mapearVars(s: string): string {
  return (s || '')
    .replace(/\[\s*NOME\s+COMPLETO\s+(?:DO\s+)?ALUNO\s*\]/gi, '{nome}')
    .replace(/\[\s*NOME\s*\]/gi, '{nome}')
}
function limpar(t: string): string {
  return mapearVars(t.replace(/ /g, ' ').replace(/\s+/g, ' ').trim())
}
function slug(s: string): string {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}

const HEADINGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'])
function ehBold(el: HTMLElement): boolean {
  const t = el.text.replace(/\s+/g, ' ').trim()
  if (!t) return false
  const fortes = el.querySelectorAll('strong, b').map((s) => s.text.replace(/\s+/g, ' ').trim()).join(' ').replace(/\s+/g, ' ').trim()
  return fortes.length >= t.length - 2
}

/** Extrai o texto do Word em LINHAS ordenadas (achata tabelas nos parágrafos internos). */
function extrairLinhas(root: HTMLElement): Linha[] {
  const linhas: Linha[] = []
  const push = (el: HTMLElement, prefixo = '') => {
    const img = el.querySelector('img')
    const texto = limpar(el.text)
    if (img && !texto) { const url = img.getAttribute('src') || ''; if (url) linhas.push({ texto: '', bold: false, heading: 0, img: url }); return }
    if (!texto) return
    const tag = (el.rawTagName || '').toLowerCase()
    linhas.push({ texto: prefixo + texto, bold: ehBold(el), heading: HEADINGS.has(tag) ? Number(tag[1]) : 0 })
  }
  for (const node of root.childNodes as any[]) {
    const el = node as HTMLElement
    const tag = (el.rawTagName || '').toLowerCase()
    if (!tag) continue
    if (tag === 'table') { for (const p of el.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li')) push(p); continue }
    if (tag === 'ul' || tag === 'ol') { el.querySelectorAll('li').forEach((li, i) => push(li, tag === 'ol' ? `${i + 1}. ` : '• ')); continue }
    if (HEADINGS.has(tag) || tag === 'p') push(el)
  }
  return linhas
}

const RE_NOTA = /^X\s*\/\s*(\d+)\b/i // "X/10", "X/100"
const RE_FAIXA = /^(\d{1,3})\s*[-–]\s*(\d{1,3})/ // "0-50", "81-100", "81-10"
const UP = (s: string) => s === s.toUpperCase() && /[A-ZÀ-Ú]/.test(s)

/** É um Word de diagnóstico? (título/estrutura reconhecíveis). */
function ehDiagnostico(linhas: Linha[]): boolean {
  const t = linhas.map((l) => l.texto.toUpperCase()).join(' \n ')
  return /DIAGN[ÓO]STICO/.test(t) && (/TEXTO MODULADO/.test(t) || /DESEMPENHO/.test(t))
}

/** Converte um diagnóstico do Word nos blocos nativos diag-*. */
function converterDiagnostico(linhas: Linha[]): CadernoDoc {
  const primeiraImg = linhas.find((l) => l.img)?.img ?? ''
  // Ignora as linhas de imagem no fluxo de texto.
  const L = linhas.filter((l) => !l.img)

  // Título e subtítulo: primeiras linhas antes de "NOME".
  let titulo = 'Diagnóstico de Desempenho'
  let subtitulo = ''
  const idxNome = L.findIndex((l) => /^NOME\s*:?/i.test(l.texto))
  if (idxNome > 0) {
    const cab = L.slice(0, idxNome).filter((l) => l.texto.length > 3)
    if (cab[0]) titulo = cab[0].texto
    if (cab[1]) subtitulo = cab[1].texto
  }

  // Nota: linha "X/N" seguida de "X acertos de N questões".
  const idxNota = L.findIndex((l) => RE_NOTA.test(l.texto))
  const totalQ = idxNota >= 0 ? Number(L[idxNota].texto.match(RE_NOTA)![1]) : 100

  // Pilares: cada pilar = NOME(maiúsc) … "0-50" f1 … "51-80" f2 … "81-100" f3.
  type Pilar = { chave: string; nome: string; f1: string; f2: string; f3: string }
  const pilares: Pilar[] = []
  {
    // Escopa à região dos pilares (entre "DESEMPENHO POR PILAR"/"EM X" e "POR DISCIPLINA"/"SUGESTÕES").
    const ini = L.findIndex((l) => /DESEMPENHO\s+(POR\s+PILAR|EM\s+)/i.test(l.texto))
    const fim = L.findIndex((l, k) => ini >= 0 && k > ini && /DESEMPENHO POR (DISCIPLINA|ASSUNTO)|SUGEST[ÕO]ES/i.test(l.texto))
    const reg = ini >= 0 ? L.slice(ini, fim >= 0 ? fim : undefined) : []
    const ehNomePilar = (t: string) => UP(t) && t.length <= 30 && /[A-ZÀ-Ú]{3,}/.test(t) && !/^X\s*[%/]/i.test(t) && !/DESEMPENHO|GRATUITO|SIMULADO|EDITAL|SEMANA|QUIZ|DIAS|MESES|PR[ÉE]-|TEXTO MODULADO|QUEST/i.test(t)
    for (let k = 0; k < reg.length; k++) {
      if (!ehNomePilar(reg[k].texto)) continue
      const jan = reg.slice(k + 1, k + 14)
      if (!jan.some((l) => RE_FAIXA.test(l.texto))) continue
      const nome = reg[k].texto
      const faixa = (lo: number) => { const j = jan.findIndex((l) => { const m = l.texto.match(RE_FAIXA); return m && Number(m[1]) === lo }); return j >= 0 && jan[j + 1] ? jan[j + 1].texto : '' }
      const j3 = jan.findIndex((l) => /^8\d\s*[-–]/.test(l.texto))
      pilares.push({ chave: slug(nome), nome, f1: faixa(0), f2: faixa(51), f3: j3 >= 0 && jan[j3 + 1] ? jan[j3 + 1].texto : '' })
    }
  }

  // Disciplinas por grupo: depois de "POR DISCIPLINA"/"POR ASSUNTO"; "Grupo/…" = header.
  type Disc = { chave: string; nome: string; assunto: string }
  const grupos: { grupo: string; disciplinas: Disc[] }[] = []
  {
    const start = L.findIndex((l) => /DESEMPENHO POR (DISCIPLINA|ASSUNTO)/i.test(l.texto))
    const fim = L.findIndex((l, k) => k > start && /SUGEST[ÕO]ES/i.test(l.texto))
    if (start >= 0) {
      let atual: { grupo: string; disciplinas: Disc[] } | null = null
      const trecho = L.slice(start + 1, fim >= 0 ? fim : undefined)
      for (let k = 0; k < trecho.length; k++) {
        const t = trecho[k].texto
        if (/^Grupo\b/i.test(t) || /^Atualiza|^Acertos\b/i.test(t) || (trecho[k].bold && /^[A-ZÀ-Ú][a-zà-ú]/.test(t) === false && !/^X\s*\//i.test(t) && t.length < 40 && !/^\d/.test(t))) {
          // header de grupo (Grupo I/II ou rótulo em maiúsculas)
          if (/^Acertos\b/i.test(t)) continue
          atual = { grupo: t.replace(/\s+/g, ' ').trim(), disciplinas: [] }
          grupos.push(atual)
          continue
        }
        // nome de disciplina = linha seguida de "X/n" (score) OU antes de "- Categoria".
        const proximo = trecho[k + 1]?.texto ?? ''
        if (/^X\s*\/\s*\d/i.test(proximo) || /^[A-ZÀ-Ú]/.test(t)) {
          if (/^X\s*\//i.test(t) || /Categoria/i.test(t) || /^\d/.test(t)) continue
          if (t.length < 3) continue
          if (!atual) { atual = { grupo: 'Disciplinas', disciplinas: [] }; grupos.push(atual) }
          atual.disciplinas.push({ chave: slug(t), nome: t, assunto: '' })
        }
      }
    }
  }

  // Sugestões: após "SUGESTÕES DE ESTUDO"; cada bloco = TÍTULO(maiúsc) + "Prioridade …" + intro + tópicos.
  type Sug = { titulo: string; prioridade: string; intro: string; topicos: string }
  const sugestoes: Sug[] = []
  {
    const start = L.findIndex((l) => /SUGEST[ÕO]ES DE ESTUDO/i.test(l.texto))
    if (start >= 0) {
      let cur: Sug | null = null
      for (let k = start + 1; k < L.length; k++) {
        const t = L[k].texto
        if (UP(t) && t.length < 40 && !/PRIORIDADE/i.test(t)) { if (cur) sugestoes.push(cur); cur = { titulo: t, prioridade: '', intro: '', topicos: '' }; continue }
        if (!cur) continue
        if (/PRIORIDADE/i.test(t)) { cur.prioridade = t.replace(/^\[!\]\s*/, '').trim(); continue }
        if (!cur.intro && t.length > 40) { cur.intro = t; continue }
        cur.topicos += (cur.topicos ? '\n' : '') + t.replace(/^[•\d.]+\s*/, '')
      }
      if (cur) sugestoes.push(cur)
    }
  }

  // ---- Monta o documento ----
  const capa: Block[] = [
    bloco('plano-fundo', { url: primeiraImg, opacidade: 100 }),
    bloco('espacador', { altura: 220 }),
    txt('DIAGNÓSTICO\nINDIVIDUALIZADO', { align: 'center', size: 26, bold: true }),
  ]

  const conteudo: Block[] = [bloco('plano-fundo', { url: primeiraImg, opacidade: 100 })]
  conteudo.push(bloco('card', {}, [txt(titulo, { bold: true, size: 15 }), txt(subtitulo, { size: 11 })]))
  conteudo.push(espacador())
  conteudo.push(bloco('card', {}, [bloco('colunas', {}, [
    bloco('coluna', {}, [txt('NOME:', { bold: true })]),
    bloco('coluna', {}, [txt('{nome}')]),
  ])]))
  conteudo.push(espacador())
  conteudo.push(bloco('diag-nota', { varNumero: 'acertos', varTotal: 'total_questoes', texto: `{acertos} acertos de ${totalQ} questões — {percentual} de aproveitamento` }))
  conteudo.push(espacador())
  if (pilares.length) {
    conteudo.push(bloco('card', {}, [txt('DESEMPENHO POR PILAR', { bold: true })]))
    conteudo.push(espacador())
    // Um bloco diag-pilar (único) por pilar — editável e reordenável separadamente.
    for (const p of pilares) { conteudo.push(bloco('diag-pilar', { chave: p.chave, nome: p.nome, f1: p.f1, f2: p.f2, f3: p.f3 })); conteudo.push(espacador()) }
  }
  if (grupos.length) {
    conteudo.push(bloco('card', {}, [txt('DESEMPENHO POR DISCIPLINA', { bold: true })]))
    conteudo.push(espacador())
    for (const g of grupos) {
      conteudo.push(bloco('diag-grupo-header', { grupo: g.grupo, chaves: g.disciplinas.map((d) => d.chave) }))
      for (const d of g.disciplinas) { conteudo.push(bloco('diag-disciplina', { chave: d.chave, nome: d.nome, assunto: 'Assunto Principal', assuntoAuto: true })); conteudo.push(espacador()) }
    }
  }
  if (sugestoes.length) {
    conteudo.push(bloco('card', {}, [txt('SUGESTÕES DE ESTUDO', { bold: true })]))
    conteudo.push(espacador())
    for (const s of sugestoes) { conteudo.push(bloco('diag-sugestoes', { titulo: s.titulo, prioridade: s.prioridade || 'Prioridade Alta', mostrarPrioridade: true, intro: s.intro, topicos: s.topicos })); conteudo.push(espacador()) }
  }

  return {
    versao: 1,
    pages: [
      { id: genId('page'), kind: 'capa', titulo: 'Capa', blocks: capa },
      { id: genId('page'), kind: 'conteudo', titulo: 'Conteúdo', blocks: conteudo },
    ],
    cabecalho: [], rodape: [], running: { ...RUNNING_PADRAO },
  }
}

/** Conversão genérica (qualquer Word) → blocos fiéis. */
function converterGenerico(root: HTMLElement): { blocks: Block[]; imagens: number } {
  const blocks: Block[] = []
  let imagens = 0
  const push = (b: Block | null) => { if (b) { blocks.push(b); if (b.type === 'imagem') imagens++ } }
  const el2b = (el: HTMLElement, prefixo = ''): Block | null => {
    const img = el.querySelector('img')
    const texto = limpar(el.text)
    if (img && !texto) { const url = img.getAttribute('src') || ''; return url ? bloco('imagem', { url, largura: 100, align: 'left' }) : null }
    if (!texto) return null
    const tag = (el.rawTagName || '').toLowerCase()
    if (HEADINGS.has(tag)) return bloco('titulo-secao', { texto: prefixo + texto, nivel: Math.min(3, Number(tag[1]) || 2), align: 'left', cor: '', mostrarLinha: false, fonte: '', italico: false, sublinhado: false, espacamento: 4 })
    return txt(prefixo + texto, { bold: ehBold(el) })
  }
  for (const node of root.childNodes as any[]) {
    const el = node as HTMLElement
    const tag = (el.rawTagName || '').toLowerCase()
    if (!tag) continue
    if (tag === 'table') { for (const p of el.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li')) push(el2b(p)); push(bloco('separador', { espessura: 1, estilo: 'solido', cor: '' })); continue }
    if (tag === 'ul' || tag === 'ol') { el.querySelectorAll('li').forEach((li, i) => push(el2b(li, tag === 'ol' ? `${i + 1}. ` : '• '))); continue }
    if (HEADINGS.has(tag) || tag === 'p') push(el2b(el))
  }
  while (blocks.length && blocks[blocks.length - 1].type === 'separador') blocks.pop()
  return { blocks, imagens }
}

export type ResultadoImportWord = { doc: CadernoDoc; avisos: string[]; resumo: { blocos: number; imagens: number; tipo: 'diagnostico' | 'generico' } }

/** Converte o buffer de um .docx em um CadernoDoc. */
export async function converterWordParaDoc(buffer: Buffer): Promise<ResultadoImportWord> {
  const avisos: string[] = []
  const { value: html, messages } = await mammoth.convertToHtml({ buffer })
  for (const m of messages) if (m.type === 'warning' && avisos.length < 20) avisos.push(m.message)
  const root = parse(html)

  const linhas = extrairLinhas(root)
  if (ehDiagnostico(linhas)) {
    const doc = converterDiagnostico(linhas)
    const blocos = doc.pages.reduce((n, p) => n + p.blocks.length, 0)
    return { doc, avisos, resumo: { blocos, imagens: linhas.filter((l) => l.img).length, tipo: 'diagnostico' } }
  }

  const { blocks, imagens } = converterGenerico(root)
  const doc: CadernoDoc = {
    versao: 1,
    pages: [{ id: genId('page'), kind: 'conteudo', titulo: 'Importado do Word', blocks }],
    cabecalho: [], rodape: [], running: { ...RUNNING_PADRAO },
  }
  return { doc, avisos, resumo: { blocos: blocks.length, imagens, tipo: 'generico' } }
}
