import 'server-only'
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType, AlignmentType, HeadingLevel } from 'docx'

// SPIKE — MODELOS prontos (docx desenhado + variáveis). Cada um já vem com design + tags {var} e laços,
// pra o coordenador "pegar e usar". Merge (docxtemplater) preenche por aluno depois.
const NAVY = '072c94', GOLD = 'f6b420', CINZA = 'eef2fb', INK = '1a3a6b'
const noBorda = { top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } }
const run = (t: string, o: { bold?: boolean; size?: number; color?: string } = {}) => new TextRun({ text: t, bold: o.bold, size: o.size, color: o.color, font: 'Arial' })
const P = (children: TextRun[], o: { align?: (typeof AlignmentType)[keyof typeof AlignmentType]; after?: number } = {}) => new Paragraph({ children, alignment: o.align, spacing: { after: o.after ?? 80 } })
const cell = (children: Paragraph[], o: { bg?: string; w?: number; topBorda?: string } = {}) => new TableCell({
  children, width: o.w ? { size: o.w, type: WidthType.PERCENTAGE } : undefined,
  shading: o.bg ? { type: ShadingType.CLEAR, fill: o.bg, color: 'auto' } : undefined,
  margins: { top: 60, bottom: 60, left: 120, right: 120 },
  borders: o.topBorda ? { ...noBorda, top: { style: BorderStyle.SINGLE, size: 24, color: o.topBorda } } : noBorda,
})
const tabela = (rows: TableRow[]) => new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: noBorda, rows })
const buf = (doc: Document) => Packer.toBuffer(doc)

// ── DIAGNÓSTICO ───────────────────────────────────────────────────────────────
export function modeloDiagnostico(): Promise<Buffer> {
  const doc = new Document({ sections: [{ children: [
    // Cabeçalho (fita dourada no topo + fundo navy + título/subtítulo).
    tabela([new TableRow({ children: [cell([
      P([run('Diagnóstico de Desempenho — {nome}', { bold: true, size: 32, color: 'FFFFFF' })]),
      P([run('{simulado}', { size: 20, color: 'FFFFFF' })], { after: 0 }),
    ], { bg: NAVY, topBorda: GOLD })] })]),
    P([], { after: 80 }),
    // Nº de peito (rótulo navy + valor).
    tabela([new TableRow({ children: [
      cell([P([run('Nº DE PEITO:', { bold: true, size: 22, color: 'FFFFFF' })], { after: 0 })], { bg: NAVY, w: 24 }),
      cell([P([run('{numero_peito}', { bold: true, size: 22, color: INK })], { after: 0 })], { bg: CINZA, w: 76 }),
    ] })]),
    P([], { after: 80 }),
    // Nota (bloco dourado) + resumo.
    tabela([new TableRow({ children: [
      cell([P([run('{acertos}', { bold: true, size: 48, color: INK }), run('/{total_questoes}', { bold: true, size: 24, color: INK })], { align: AlignmentType.CENTER, after: 0 })], { bg: GOLD, w: 26 }),
      cell([
        P([run('{acertos} acertos de {total_questoes} itens — {percentual} de aproveitamento', { size: 22, color: INK })], { after: 0 }),
        P([run('Medalha conquistada: KM 21 · AGU', { size: 18, color: '5a5570' })], { after: 0 }),
      ], { bg: CINZA, w: 74 }),
    ] })]),
    P([], { after: 160 }),
    // Desempenho por disciplina (laço).
    P([run('DESEMPENHO POR DISCIPLINA', { bold: true, size: 24, color: NAVY })]),
    P([run('{#disciplinas}• {nome}: {acertos}/{total}  ({pct}){/disciplinas}', { size: 22 })]),
    P([], { after: 120 }),
    // Desempenho por pilar (laço).
    P([run('DESEMPENHO POR PILAR', { bold: true, size: 24, color: NAVY })]),
    P([run('{#pilares}• {nome}: {acerto}/{total}  ({pct}){/pilares}', { size: 22 })]),
  ] }] })
  return buf(doc)
}

// ── FOLHA DE RESPOSTAS (grade A–E) ─────────────────────────────────────────────
export function modeloFolha(questoes = 30, alternativas = 5): Promise<Buffer> {
  const LETRAS = ['A', 'B', 'C', 'D', 'E', 'F'].slice(0, alternativas)
  const header = new TableRow({ tableHeader: true, children: [
    cell([P([run('Q', { bold: true, size: 18, color: 'FFFFFF' })], { align: AlignmentType.CENTER, after: 0 })], { bg: NAVY, w: 16 }),
    ...LETRAS.map((l) => cell([P([run(l, { bold: true, size: 18, color: 'FFFFFF' })], { align: AlignmentType.CENTER, after: 0 })], { bg: NAVY })),
  ] })
  const rows = Array.from({ length: questoes }, (_, i) => new TableRow({ children: [
    cell([P([run(String(i + 1), { bold: true, size: 18, color: INK })], { align: AlignmentType.CENTER, after: 0 })], { bg: i % 2 ? CINZA : 'FFFFFF' }),
    ...LETRAS.map(() => cell([P([run('◯', { size: 18, color: '9aa8c6' })], { align: AlignmentType.CENTER, after: 0 })], { bg: i % 2 ? CINZA : 'FFFFFF' })),
  ] }))
  const grade = new Table({ width: { size: 70, type: WidthType.PERCENTAGE }, borders: { top: { style: BorderStyle.SINGLE, size: 4, color: 'c7d7f5' }, bottom: { style: BorderStyle.SINGLE, size: 4, color: 'c7d7f5' }, left: { style: BorderStyle.SINGLE, size: 4, color: 'c7d7f5' }, right: { style: BorderStyle.SINGLE, size: 4, color: 'c7d7f5' }, insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: 'dbe4f3' }, insideVertical: { style: BorderStyle.SINGLE, size: 2, color: 'dbe4f3' } }, rows: [header, ...rows] })
  const doc = new Document({ sections: [{ children: [
    tabela([new TableRow({ children: [cell([P([run('FOLHA DE RESPOSTAS — {simulado}', { bold: true, size: 28, color: 'FFFFFF' })], { after: 0 })], { bg: NAVY, topBorda: GOLD })] })]),
    P([], { after: 80 }),
    tabela([new TableRow({ children: [
      cell([P([run('NOME:', { bold: true, size: 20, color: 'FFFFFF' })], { after: 0 })], { bg: NAVY, w: 16 }),
      cell([P([run('{nome}', { size: 20, color: INK })], { after: 0 })], { bg: CINZA, w: 54 }),
      cell([P([run('Nº DE PEITO:', { bold: true, size: 20, color: 'FFFFFF' })], { after: 0 })], { bg: NAVY, w: 16 }),
      cell([P([run('{numero_peito}', { size: 20, color: INK })], { after: 0 })], { bg: CINZA, w: 14 }),
    ] })]),
    P([], { after: 160 }),
    P([run('Preencha ◯ a alternativa de cada questão.', { size: 18, color: '5a5570' })]),
    grade,
  ] }] })
  return buf(doc)
}

// ── CADERNO DE QUESTÕES (laço por questão) ─────────────────────────────────────
export function modeloCaderno(): Promise<Buffer> {
  const doc = new Document({ sections: [{ children: [
    tabela([new TableRow({ children: [cell([P([run('CADERNO DE QUESTÕES — {simulado}', { bold: true, size: 28, color: 'FFFFFF' })], { after: 0 })], { bg: NAVY, topBorda: GOLD })] })]),
    P([], { after: 120 }),
    P([run('{#questoes}', { size: 2, color: 'FFFFFF' })]),
    tabela([new TableRow({ children: [cell([P([run('QUESTÃO {numero}  ·  {disciplina}', { bold: true, size: 20, color: 'FFFFFF' })], { after: 0 })], { bg: NAVY })] })]),
    P([run('{enunciado}', { size: 22 })], { align: AlignmentType.JUSTIFIED }),
    P([run('{alternativas}', { size: 22 })]),
    P([run('Gabarito oficial: {gabarito}', { size: 18, color: '5a5570' })]),
    P([run('{/questoes}', { size: 2, color: 'FFFFFF' })]),
  ] }] })
  return buf(doc)
}

export const MODELOS: Record<string, { nome: string; descricao: string; gerar: () => Promise<Buffer> }> = {
  diagnostico: { nome: 'Diagnóstico de Desempenho', descricao: 'Fita + cabeçalho + nota/medalha + desempenho por disciplina e por pilar (laços). Com {nome}, {acertos}, {percentual}, {#disciplinas}, {#pilares}.', gerar: modeloDiagnostico },
  folha: { nome: 'Folha de Respostas', descricao: 'Cabeçalho + dados do aluno ({nome}, {numero_peito}) + grade A–E de 30 questões para marcar.', gerar: () => modeloFolha(30, 5) },
  caderno: { nome: 'Caderno de Questões', descricao: 'Laço por questão ({#questoes}): número, disciplina, enunciado, alternativas e gabarito. Repete para cada questão no merge.', gerar: modeloCaderno },
}
