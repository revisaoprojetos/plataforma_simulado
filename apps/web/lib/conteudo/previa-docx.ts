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
  // ops: trechos a REMOVER (text:'') e trechos a INSERIR (start===end). Aplicados do fim p/ o início.
  const ops: { start: number; end: number; text: string }[] = []
  // Fecha um `{#nome}` órfão no 1º limite estrutural após ele (fim da célula/linha/corpo) → o conteúdo volta
  // a ser CONDICIONAL (em vez de aparecer sempre). Parágrafo só-marcador é consumido pelo paragraphLoop.
  const fecharNoLimite = (nome: string, apos: number) => {
    const cands = ['</w:tc>', '</w:tr>', '</w:body>'].map((t) => xml.indexOf(t, apos)).filter((i) => i >= 0)
    if (!cands.length) { ops.push({ start: apos, end: apos, text: '' }); return false } // sem limite → não dá p/ fechar
    const pos = Math.min(...cands)
    ops.push({ start: pos, end: pos, text: `<w:p><w:r><w:t xml:space="preserve">{/${nome}}</w:t></w:r></w:p>` })
    return true
  }
  let orfaos = 0
  for (const nome of nomes) {
    const re = new RegExp(`\\{(#|/)${nome}\\}`, 'g')
    const ocorr: { start: number; end: number; abre: boolean }[] = []
    let m: RegExpExecArray | null
    while ((m = re.exec(xml))) ocorr.push({ start: m.index, end: m.index + m[0].length, abre: m[1] === '#' })
    let aberto: { start: number; end: number } | null = null
    for (const o of ocorr) {
      // Novo `{#}` com um anterior ainda aberto = DUPLICATA → remove o anterior (abertura duplicada).
      if (o.abre) { if (aberto) { ops.push({ start: aberto.start, end: aberto.end, text: '' }); orfaos++ }; aberto = { start: o.start, end: o.end } }
      // `{/}` sem abertura = fechamento órfão → remove.
      else { if (!aberto) { ops.push({ start: o.start, end: o.end, text: '' }); orfaos++ } else aberto = null }
    }
    // Abertura órfã final (sem fechamento) → FECHA no limite da célula (não remove) p/ preservar a condição.
    if (aberto) { orfaos++; fecharNoLimite(nome, aberto.end) }
  }
  if (!orfaos) return { xml, removidos: 0 }
  ops.sort((a, b) => b.start - a.start)
  let out = xml
  for (const op of ops) out = out.slice(0, op.start) + op.text + out.slice(op.end)
  return { xml: out, removidos: orfaos }
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
