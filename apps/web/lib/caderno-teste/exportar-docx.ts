import 'server-only'
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, ShadingType, WidthType, BorderStyle, AlignmentType, type ISectionOptions } from 'docx'
import { DIAG_PADRAO, prefFonte, slugDiag, type DiagConteudo } from './diagnostico'
import { CORES_PILAR_PADRAO, type ItemCaderno } from './tipos'
import type { DiscBanco } from './exportar-html'

/**
 * Gera um .docx NATIVO do diagnóstico — visualmente próximo da prévia (tabelas + cor de fundo + fontes +
 * tamanhos que o Word entende), editável no Word. Guarda o item completo (config) em document properties
 * (dc:description) para a reimportação restaurar o mesmo modelo/estilo. Valores preenchidos com os dados
 * do aluno (fiel à prévia).
 */

const hx = (c?: string) => { const h = (c || '').replace('#', ''); return /^[0-9a-fA-F]{6}$/.test(h) ? h.toUpperCase() : '000000' }
const sz = (px: number) => Math.max(8, Math.round(px * 1.5)) // px -> half-points (docx). 10px ~ 15 (7.5pt)

function applyVars(t: string, vars: Record<string, string>): string { return (t || '').replace(/\{\s*([\w-]+)\s*\}/g, (m, k) => (k in vars ? vars[k] : m)) }
function preencher(t: string, vars: Record<string, string>): string {
  return applyVars(t, vars).replace(/\{\s*([\w-]+)\s*\}/g, (m, k) => {
    if (k === 'total_questoes') return '100'
    if (k === 'nome') return '[NOME COMPLETO ALUNO]'
    if (/^pct/.test(k) || k === 'percentual') return 'X%'
    if (/^total/.test(k)) return 'N'
    if (/^acerto/.test(k) || k === 'acertos' || k === 'erros') return 'X'
    if (/^assuntos/.test(k)) return ''
    return m
  })
}

/** Converte texto com marcação leve (**negrito**, *itálico*, <u>sublinhado</u>) + variáveis em TextRuns. */
function runs(raw: string, vars: Record<string, string>, base: { color?: string; size: number; bold?: boolean; font?: string }): TextRun[] {
  const s = preencher(raw ?? '', vars)
  const out: TextRun[] = []
  let i = 0, buf = '', bold = false, ital = false, und = false
  const flush = () => { if (buf) { out.push(new TextRun({ text: buf, bold: base.bold || bold, italics: ital, underline: und ? {} : undefined, color: base.color, size: base.size, font: base.font })); buf = '' } }
  while (i < s.length) {
    if (s.startsWith('**', i)) { flush(); bold = !bold; i += 2; continue }
    if (s.startsWith('<u>', i)) { flush(); und = true; i += 3; continue }
    if (s.startsWith('</u>', i)) { flush(); und = false; i += 4; continue }
    if (s[i] === '*') { flush(); ital = !ital; i += 1; continue }
    buf += s[i]; i += 1
  }
  flush()
  return out.length ? out : [new TextRun({ text: '', size: base.size, color: base.color, font: base.font })]
}

const SEM_BORDA = { top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, insideVertical: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } }

function celula(children: Paragraph[], opts: { bg?: string; widthPct?: number; topBorda?: string } = {}): TableCell {
  return new TableCell({
    children,
    shading: opts.bg ? { type: ShadingType.CLEAR, color: 'auto', fill: opts.bg } : undefined,
    width: opts.widthPct ? { size: opts.widthPct, type: WidthType.PERCENTAGE } : undefined,
    margins: { top: 90, bottom: 90, left: 140, right: 140 },
    borders: opts.topBorda ? { ...SEM_BORDA, top: { style: BorderStyle.SINGLE, size: 18, color: opts.topBorda } } : SEM_BORDA,
  })
}
const tabela = (rows: TableRow[]): Table => new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: SEM_BORDA, rows })

/** Intercala um parágrafo-espaçador entre os blocos: o Word NÃO separa tabelas adjacentes sozinho,
 *  então sem isto os blocos (banners/cards) saem colados. Dá um respiro vertical entre cada bloco. */
function comEspacamento(ns: (Paragraph | Table)[]): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = []
  ns.forEach((n, i) => {
    out.push(n)
    if (i < ns.length - 1) out.push(new Paragraph({ children: [new TextRun({ text: '', size: 6 })], spacing: { before: 0, after: 120 } }))
  })
  return out
}

export async function gerarDocxDiagnostico(item: ItemCaderno, disc: DiscBanco[], vars: Record<string, string> = {}): Promise<Buffer> {
  const c: DiagConteudo = item.conteudo ?? DIAG_PADRAO
  const a = item.ajustes
  const prim = hx(a.corPrimaria || '#2d254f'), amar = hx(a.corSecundaria || '#f6b420')
  const corParte = (parte: string, def: string) => hx((a.coresParte ?? {})[parte] || def)
  const corPilar = (slug?: string) => hx((slug && ((a.coresPilar ?? {})[slug] || CORES_PILAR_PADRAO[slug])) || a.corPrimaria || '#2d254f')
  const P = (children: TextRun[], opts: { align?: any; after?: number } = {}) => new Paragraph({ children, alignment: opts.align, spacing: { after: opts.after ?? 80 } })
  const nodes: (Paragraph | Table)[] = []

  // Faixa de seção (banner).
  const banner = (t: string, cor: string) => nodes.push(tabela([new TableRow({ children: [celula([P(runs(t, vars, { color: 'FFFFFF', size: sz(11), bold: true, font: 'Arial' }))], { bg: cor })] })]))

  // Cabeçalho (título + subtítulo) — faixa colorida.
  if (a.mostrarCabecalho) {
    const bg = corParte('diag_cab', a.corPrimaria || '#2d254f')
    const kids: Paragraph[] = [new Paragraph({ children: runs(c.tituloCabecalho ?? 'Diagnóstico de Desempenho', vars, { color: 'FFFFFF', size: sz(20), bold: true, font: 'Arial' }), spacing: { after: 40 } })]
    if (c.subtitulo) kids.push(new Paragraph({ children: runs(c.subtitulo, vars, { color: 'FFFFFF', size: sz(11), font: 'Arial' }) }))
    nodes.push(tabela([new TableRow({ children: [celula(kids, { bg })] })]))
  }

  // Nome do aluno.
  if (a.mostrarDadosAluno) {
    nodes.push(tabela([new TableRow({ children: [
      celula([P(runs(c.rotuloNome ?? 'NOME:', vars, { color: 'FFFFFF', size: sz(13), bold: true, font: 'Arial' }), { after: 0 })], { bg: corParte('diag_nome_rot', a.corPrimaria || '#2d254f'), widthPct: 18 }),
      celula([P(runs('{nome}', vars, { color: '3B2F00', size: sz(11), bold: true, font: 'Arial' }), { after: 0 })], { bg: corParte('diag_nome_val', amar), widthPct: 82 }),
    ] })]))
  }

  // Nota.
  nodes.push(tabela([new TableRow({ children: [
    celula([new Paragraph({ children: [...runs('{acertos}', vars, { color: 'FFFFFF', size: sz(30), bold: true, font: 'Arial' }), new TextRun({ text: `/${preencher(c.notaTotal, vars)}`, color: 'FFFFFF', size: sz(16), bold: true, font: 'Arial' })], spacing: { after: 0 } })], { bg: corParte('diag_nota_num', '#9b6800'), widthPct: 22 }),
    celula([P(runs(c.notaTexto, vars, { color: '3B2F00', size: sz(11), bold: true, font: 'Arial' }), { after: 0 })], { bg: corParte('diag_nota_faixa', amar), widthPct: 78 }),
  ] })]))

  // Introdução.
  for (const p of c.intro) nodes.push(P(runs(p, vars, { color: '1A202C', size: sz(11), font: 'Arial' }), { align: AlignmentType.JUSTIFIED }))

  // Língua Portuguesa (card).
  if (c.linguaPortuguesa) {
    const lp = c.linguaPortuguesa
    banner(lp.secTitulo || 'Desempenho em Língua Portuguesa', corParte('sec_lingua', a.corPrimaria || '#2d254f'))
    if (lp.secIntro) nodes.push(P(runs(lp.secIntro, vars, { color: '5A5570', size: sz(11), font: 'Arial' }), { align: AlignmentType.JUSTIFIED }))
    const cor = corPilar(lp.chave)
    const kids: Paragraph[] = [
      new Paragraph({ children: runs(lp.titulo, vars, { color: cor, size: sz(10), bold: true, font: 'Arial' }), spacing: { after: 20 } }),
      new Paragraph({ children: runs(`{pct_${prefFonte(lp.tipoFonte)}${lp.chave}}`, vars, { color: cor, size: sz(22), bold: true, font: 'Arial' }), spacing: { after: 20 } }),
      new Paragraph({ children: runs(lp.totalTxt, vars, { color: '5A5570', size: sz(10), font: 'Arial' }), spacing: { after: 40 } }),
    ]
    for (const b of lp.bandas) { if (b.texto) kids.push(P(runs(b.texto, vars, { color: '243B53', size: sz(10), font: 'Arial' }), { align: AlignmentType.JUSTIFIED, after: 40 })) }
    nodes.push(tabela([new TableRow({ children: [celula(kids, { bg: 'FFF2CC' })] })]))
  }

  // Desempenho por pilar (linha de cards).
  if (c.pilares.length) {
    banner(c.tituloPilares ?? 'Desempenho por pilar', corParte('sec_pilares', a.corPrimaria || '#2d254f'))
    const w = Math.floor(100 / c.pilares.length)
    nodes.push(tabela([new TableRow({ children: c.pilares.map((pl, i) => {
      const cor = corParte(`pilar:${i}`, a.corPrimaria || '#2d254f')
      const kids: Paragraph[] = [
        new Paragraph({ children: runs(pl.nome, vars, { color: cor, size: sz(10), bold: true, font: 'Arial' }), spacing: { after: 20 } }),
        new Paragraph({ children: runs(pl.chave ? `{pct_${prefFonte(pl.tipoFonte)}${pl.chave}}` : 'X%', vars, { color: cor, size: sz(22), bold: true, font: 'Arial' }), spacing: { after: 20 } }),
        new Paragraph({ children: runs(pl.totalTxt, vars, { color: '5A5570', size: sz(10), font: 'Arial' }), spacing: { after: 40 } }),
      ]
      for (const b of pl.bandas) { if (b.texto) kids.push(P(runs(b.texto, vars, { color: '243B53', size: sz(9), font: 'Arial' }), { align: AlignmentType.JUSTIFIED, after: 40 })) }
      return celula(kids, { bg: 'FFF2CC', widthPct: w })
    }) })]))
  }

  // Desempenho por disciplina.
  const discs = disc.length ? disc : c.disciplinas.map((d) => ({ nome: d.nome, chave: d.chave || slugDiag(d.nome) }))
  if (discs.length) {
    banner(c.tituloDisciplinas ?? 'Desempenho por disciplina', corParte('sec_disciplinas', a.corPrimaria || '#2d254f'))
    if (c.disciplinasIntro) nodes.push(P(runs(c.disciplinasIntro, vars, { color: '5A5570', size: sz(11), font: 'Arial' }), { align: AlignmentType.JUSTIFIED }))
    for (const d of (discs as DiscBanco[])) {
      const fonte = c.discFonte?.[d.chave] ?? d.chave
      const corDisc = corParte(`disc:${d.chave}`, (a.coresDisc ?? {})[d.chave] || (d.pilar ? undefined : undefined) || a.corSecundaria || '#f6b420')
      const corTxt = hx(c.discCorTexto?.[d.chave] ?? a.corPrimaria ?? '#2d254f')
      const assuntos = (vars[`assuntos_${fonte}`] ?? '').split('\n').map((x) => x.trim()).filter(Boolean)
      const kids: Paragraph[] = [new Paragraph({ children: [
        ...runs(c.discNomes?.[d.chave] ?? d.nome, vars, { color: corTxt, size: sz(11), bold: true, font: 'Arial' }),
        new TextRun({ text: `    ${preencher(`{acerto_${fonte}}`, vars)}/${preencher(`{total_${fonte}}`, vars)}  ${preencher(`{pct_${fonte}}`, vars)}`, color: hx('#9a6e00'), size: sz(11), bold: true, font: 'Arial' }),
      ], spacing: { after: 20 } })]
      for (const as of (assuntos.length ? assuntos : ['Assuntos das questões erradas'])) kids.push(new Paragraph({ children: [new TextRun({ text: `- ${as}`, italics: true, color: '5A5570', size: sz(9), font: 'Arial' })], spacing: { after: 10 } }))
      nodes.push(tabela([new TableRow({ children: [celula(kids, { bg: 'F5F3FF', topBorda: corDisc })] })]))
    }
  }

  // Sugestões de estudo.
  if (c.sugestoes.length) {
    banner(c.tituloSugestoes ?? 'Sugestões de estudo', corParte('sec_sugestoes', a.corPrimaria || '#2d254f'))
    for (const s of c.sugestoes) {
      const tituloRow = new TableRow({ children: [celula([new Paragraph({ children: [
        ...runs(s.titulo, vars, { color: hx(s.corTitulo || '#9a6e00'), size: sz(11), bold: true, font: 'Arial' }),
        ...(s.prioridade ? [new TextRun({ text: `   [!] ${s.prioridade}`, color: hx('#9a6e00'), size: sz(9), bold: true, font: 'Arial' })] : []),
      ], spacing: { after: 0 } })], { bg: 'FDF3D0' })] })
      const corpoKids: Paragraph[] = []
      if (s.intro) corpoKids.push(P(runs(s.intro, vars, { color: '1A202C', size: sz(11), font: 'Arial' }), { align: AlignmentType.JUSTIFIED, after: 40 }))
      for (const it of s.itens) corpoKids.push(new Paragraph({ children: [new TextRun({ text: `${it.forte ? '»' : '›'} `, bold: true, color: it.forte ? hx(c.corMarcadorForte || '#e8850c') : hx(c.corMarcador || '#3b5bdb'), size: sz(11), font: 'Arial' }), ...runs(it.texto, vars, { color: '1A202C', size: sz(11), font: 'Arial' })], spacing: { after: 20 } }))
      const corpoRow = new TableRow({ children: [celula(corpoKids.length ? corpoKids : [P([new TextRun({ text: '' })])], { bg: 'F0EEFF' })] })
      nodes.push(tabela([tituloRow, corpoRow]))
    }
  }

  // Fechamento.
  for (const p of (c.fechamento ?? [])) nodes.push(P(runs(p, vars, { color: '1A202C', size: sz(11), font: 'Arial' }), { align: AlignmentType.JUSTIFIED }))

  // Gabarito.
  if (c.gabaritoObs.length || c.gabaritoIntro.length) {
    banner(c.gabaritoTitulo || 'Gabarito oficial desatualizado', corParte('sec_gabarito', a.corPrimaria || '#2d254f'))
    for (const p of c.gabaritoIntro) nodes.push(P(runs(p, vars, { color: '243B53', size: sz(11), font: 'Arial' }), { align: AlignmentType.JUSTIFIED }))
    if (c.gabaritoObs.length) nodes.push(tabela([new TableRow({ children: [celula(c.gabaritoObs.map((o) => new Paragraph({ children: runs(o, vars, { color: '5A5570', size: sz(9), font: 'Arial' }), spacing: { after: 10 } })), { bg: 'F5F3FF', topBorda: hx('#a32d2d') })] })]))
  }

  // Config completa embutida p/ a reimportação restaurar modelo/estilo exatos. Guardada em dc:description E
  // como marcador OCULTO no corpo (texto branco minúsculo) — o mammoth lê o corpo no reimport (sem unzip).
  let cfg = ''
  try { cfg = 'CTV3:' + Buffer.from(JSON.stringify(item), 'utf8').toString('base64') } catch { /* ignora */ }
  if (cfg) nodes.push(new Paragraph({ children: [new TextRun({ text: cfg, color: 'FFFFFF', size: 2 })], spacing: { after: 0 } }))

  const secao: ISectionOptions = { properties: { page: { margin: { top: 720, bottom: 720, left: 720, right: 720 } } }, children: comEspacamento(nodes) }
  const doc = new Document({ description: cfg, creator: 'Revisão — Caderno de teste', title: item.ajustes.titulo || 'Diagnóstico', sections: [secao] })
  return Packer.toBuffer(doc)
}
