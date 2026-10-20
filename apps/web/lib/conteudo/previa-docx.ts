import 'server-only'
import PizZip from 'pizzip'
import Docxtemplater from 'docxtemplater'
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx'

// Merge NÃO-DESTRUTIVO de um .docx template com dados (docxtemplater) + auto-correção de marcadores de
// laço órfãos (mesma lógica da prévia do Teste — extraída para reusar na Biblioteca sem duplicar).
// É PURO (recebe os bytes do docx). Nunca toca no arquivo original.

function removerMarcadoresOrfaos(xml: string): { xml: string; removidos: number } {
  const nomes = new Set<string>()
  for (const m of xml.matchAll(/\{#([a-zA-Z0-9_]+)\}/g)) nomes.add(m[1])
  for (const m of xml.matchAll(/\{\/([a-zA-Z0-9_]+)\}/g)) nomes.add(m[1])
  const remover: { start: number; end: number }[] = []
  for (const nome of nomes) {
    const re = new RegExp(`\\{(#|/)${nome}\\}`, 'g')
    const ocorr: { start: number; end: number; abre: boolean }[] = []
    let m: RegExpExecArray | null
    while ((m = re.exec(xml))) ocorr.push({ start: m.index, end: m.index + m[0].length, abre: m[1] === '#' })
    let aberto: { start: number; end: number } | null = null
    for (const o of ocorr) {
      if (o.abre) { if (aberto) remover.push(aberto); aberto = { start: o.start, end: o.end } }
      else { if (!aberto) remover.push({ start: o.start, end: o.end }); else aberto = null }
    }
    if (aberto) remover.push(aberto)
  }
  if (!remover.length) return { xml, removidos: 0 }
  remover.sort((a, b) => b.start - a.start)
  let out = xml
  for (const r of remover) out = out.slice(0, r.start) + out.slice(r.end)
  return { xml: out, removidos: remover.length }
}

function lacosDesbalanceados(xml: string): { nome: string; abre: number; fecha: number }[] {
  const nomes = new Set<string>()
  for (const m of xml.matchAll(/\{#([a-zA-Z0-9_]+)\}/g)) nomes.add(m[1])
  for (const m of xml.matchAll(/\{\/([a-zA-Z0-9_]+)\}/g)) nomes.add(m[1])
  const out: { nome: string; abre: number; fecha: number }[] = []
  for (const nome of nomes) {
    const abre = (xml.match(new RegExp(`\\{#${nome}\\}`, 'g')) || []).length
    const fecha = (xml.match(new RegExp(`\\{/${nome}\\}`, 'g')) || []).length
    if (abre !== fecha) out.push({ nome, abre, fecha })
  }
  return out
}

async function docxAviso(linhas: { texto: string; forte?: boolean }[]): Promise<Buffer> {
  const doc = new Document({ sections: [{ children: [
    new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('Prévia indisponível')] }),
    ...linhas.map((l) => new Paragraph({ children: [new TextRun({ text: l.texto, bold: l.forte })] })),
  ] }] })
  return Packer.toBuffer(doc)
}

/** Renderiza a prévia: auto-corrige laços órfãos, faz o merge com `dados` e devolve o .docx preenchido
 *  (ou um .docx de AVISO legível quando o template tem marcadores quebrados). */
export async function renderPreviaDocx(buf: Buffer, dados: Record<string, unknown>): Promise<Buffer> {
  try {
    const zip = new PizZip(buf)
    try {
      const f = zip.file('word/document.xml')
      if (f) { const { xml, removidos } = removerMarcadoresOrfaos(f.asText()); if (removidos) zip.file('word/document.xml', xml) }
    } catch { /* segue; o catch externo trata */ }
    const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true, nullGetter: () => '' })
    doc.render(dados)
    return doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' })
  } catch (e) {
    try {
      let xml = ''
      try { xml = new PizZip(buf).file('word/document.xml')?.asText() || '' } catch { /* ignore */ }
      const desb = xml ? lacosDesbalanceados(xml) : []
      const linhas: { texto: string; forte?: boolean }[] = [
        { texto: 'O documento tem um problema nos marcadores de laço e não pôde ser preenchido.' }, { texto: '' },
      ]
      if (desb.length) {
        linhas.push({ texto: 'Marcadores desbalanceados (abre ≠ fecha):', forte: true })
        for (const d of desb) linhas.push({ texto: `• {#${d.nome}} aparece ${d.abre}x  e  {/${d.nome}} aparece ${d.fecha}x` })
        linhas.push({ texto: '' }, { texto: 'Causa provável: o bloco foi inserido mais de uma vez, deixando um {#...} sem o {/...}.' }, { texto: 'Como resolver: deixe apenas UM de cada bloco e salve de novo.' })
      } else {
        linhas.push({ texto: `Detalhe técnico: ${(e as Error).message}` }, { texto: 'Verifique se não há uma chave { } aberta ou um laço {#...} sem fechar.' })
      }
      return await docxAviso(linhas)
    } catch { return buf }
  }
}
