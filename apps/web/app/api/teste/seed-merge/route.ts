import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { salvarDoc } from '@/lib/teste/store'
import { createAdminClient } from '@/lib/supabase/server'
import { carregarRegistros } from '@/lib/caderno-designer/merge'
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx'
import PizZip from 'pizzip'
import Docxtemplater from 'docxtemplater'

// SPIKE — prova do MERGE: cria um TEMPLATE .docx com tags + laços (disciplinas/pilares), puxa os dados
// REAIS de 1 aluno do banco do Simulado 1 e gera o .docx PREENCHIDO (docxtemplater). Guarda os dois.
export const dynamic = 'force-dynamic'
const TID = '02195fa6-3db8-49d0-8c07-d21328a26a13'
const BANCO = '97003edf-8a1b-45f9-b9c2-0c577fe66021' // Minissimulado 1 · 17/10 · AGU

const human = (s: string) => s.split('_').filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ')
const PILARES = [{ chave: 'lei_seca', nome: 'Lei Seca' }, { chave: 'jurisprudencia', nome: 'Jurisprudência' }, { chave: 'doutrina', nome: 'Doutrina' }]

async function guardar(buf: Buffer): Promise<string> { const id = randomUUID(); await salvarDoc(id, buf); return id }

// Template .docx com as tags (docxtemplater). Laços de disciplina e pilar repetem o parágrafo por item.
async function montarTemplate(): Promise<Buffer> {
  const L = (t: string, o: { bold?: boolean; size?: number } = {}) => new Paragraph({ children: [new TextRun({ text: t, bold: o.bold, size: o.size })] })
  const doc = new Document({ sections: [{ children: [
    new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('Diagnóstico de Desempenho — {nome}')] }),
    L('Nº de peito: {numero_peito}    ·    Simulado: {simulado}'),
    L('Nota: {acertos}/{total_questoes}  ({percentual})   ·   Erros: {erros}   ·   Em branco: {em_branco}'),
    L(''),
    L('Desempenho por disciplina', { bold: true, size: 26 }),
    L('{#disciplinas}• {nome}: {acertos}/{total}  ({pct}){/disciplinas}'),
    L(''),
    L('Desempenho por pilar', { bold: true, size: 26 }),
    L('{#pilares}• {nome}: {acerto}/{total}  ({pct}){/pilares}'),
  ] }] })
  return Packer.toBuffer(doc)
}

export async function POST() {
  try {
    const templateBuf = await montarTemplate()

    // Dados REAIS de 1 aluno (primeiro com acertos > 0, senão o primeiro).
    const svc = createAdminClient()
    const regs = await carregarRegistros(svc, TID, BANCO, 'Minissimulado 1 · 17/10 · AGU', undefined, undefined, 20)
    const reg = regs.find((r) => Number(r.vars.acertos || 0) > 0) ?? regs[0]
    if (!reg) return NextResponse.json({ error: 'nenhum aluno com dados no banco do Simulado 1' }, { status: 404 })
    const v = reg.vars

    // Deriva as disciplinas das chaves das vars (total_<slug>, exceto pilar/total_questoes).
    const discChaves = Object.keys(v).filter((k) => k.startsWith('total_') && !k.startsWith('total_pilar_') && !k.startsWith('total_bloco_') && k !== 'total_questoes').map((k) => k.slice('total_'.length))
    const disciplinas = discChaves.map((c) => ({ nome: human(c), acertos: v['acerto_' + c] ?? '0', total: v['total_' + c] ?? '0', pct: v['pct_' + c] ?? '0%' }))
    const pilares = PILARES.filter((p) => v['total_pilar_' + p.chave] !== undefined).map((p) => ({ nome: p.nome, acerto: v['acerto_pilar_' + p.chave] ?? '0', total: v['total_pilar_' + p.chave] ?? '0', pct: v['pct_pilar_' + p.chave] ?? '0%' }))

    const data = { ...v, disciplinas, pilares }

    // Merge.
    const zip = new PizZip(templateBuf)
    const docx = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true })
    docx.render(data)
    const filledBuf = docx.getZip().generate({ type: 'nodebuffer' }) as Buffer

    const template = await guardar(templateBuf)
    const preenchido = await guardar(filledBuf)
    return NextResponse.json({ template, preenchido, aluno: v.nome, disciplinas: disciplinas.length, pilares: pilares.length })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
