import { NextResponse } from 'next/server'
import PizZip from 'pizzip'
import Docxtemplater from 'docxtemplater'
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx'
import { docExiste, lerDoc, lerPrevia } from '@/lib/teste/store'
import { DADOS_PREVIA } from '@/lib/teste/previa-dados'

// Prévia NÃO-DESTRUTIVA: lê o template salvo, preenche os {campos}/laços com dados de exemplo (docxtemplater)
// e devolve o .docx preenchido — SEM tocar no arquivo editável. O OnlyOffice abre isto em modo leitura.
export const dynamic = 'force-dynamic'

const DOCX_CT = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

// Conta {#laço} vs {/laço} no XML e devolve só os que estão DESBALANCEADOS (abre ≠ fecha). É a causa
// nº 1 de "Unclosed loop": o mesmo bloco foi inserido várias vezes e sobrou um {#} sem {/} (ou vice-versa).
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

// AUTO-CORREÇÃO: remove os marcadores ÓRFÃOS (abertura sem fechamento ou vice-versa) para a prévia não
// quebrar quando o bloco foi inserido/apagado parcialmente várias vezes. Varre cada laço em ordem: um
// {#} com outro {#} aberto antes de fechar → o anterior é órfão; um {/} sem {#} aberto → órfão; {#}
// sobrando no fim → órfão. Só mexe na CÓPIA em memória da prévia; o template salvo fica intacto.
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
      if (o.abre) {
        if (aberto) remover.push(aberto) // abertura anterior ficou sem fechar → órfã
        aberto = { start: o.start, end: o.end }
      } else {
        if (!aberto) remover.push({ start: o.start, end: o.end }) // fechamento sem abertura → órfão
        else aberto = null
      }
    }
    if (aberto) remover.push(aberto) // abertura sobrando no fim → órfã
  }
  if (!remover.length) return { xml, removidos: 0 }
  remover.sort((a, b) => b.start - a.start) // de trás pra frente pra não bagunçar os índices
  let out = xml
  for (const r of remover) out = out.slice(0, r.start) + out.slice(r.end)
  return { xml: out, removidos: remover.length }
}

// Gera um .docx de AVISO legível (em vez de mostrar o template cru em silêncio, que parecia "não gerou").
async function docxAviso(linhas: { texto: string; forte?: boolean }[]): Promise<Buffer> {
  const doc = new Document({
    sections: [{
      children: [
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('Prévia indisponível')] }),
        ...linhas.map((l) => new Paragraph({ children: [new TextRun({ text: l.texto, bold: l.forte })] })),
      ],
    }],
  })
  return Packer.toBuffer(doc)
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!docExiste(id)) return new NextResponse('not found', { status: 404 })
  const buf = await lerDoc(id)
  let out: Buffer = buf
  try {
    const zip = new PizZip(buf)
    // AUTO-CORREÇÃO: tira marcadores de laço órfãos (bloco inserido 2x+ deixa {#} sem {/}) ANTES de
    // renderizar — senão o docxtemplater aborta com "Unclosed loop" e a prévia não sai. Só na cópia da prévia.
    try {
      const f = zip.file('word/document.xml')
      if (f) {
        const { xml, removidos } = removerMarcadoresOrfaos(f.asText())
        if (removidos) zip.file('word/document.xml', xml)
      }
    } catch { /* se não der pra sanear, segue e deixa o catch tratar */ }
    const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true, nullGetter: () => '' })
    // Dados dinâmicos do laboratório (simulado selecionado + reguladores) OU o exemplo estático.
    const dados = (await lerPrevia(id)) || DADOS_PREVIA
    doc.render(dados)
    const zipOut = doc.getZip()
    // Segurança SÓ na prévia: se a margem superior ficou exagerada (resíduo de forçação antiga), limita
    // para não mostrar um vão enorme acima do cabeçalho. Não altera margens normais nem o template.
    try {
      const f = zipOut.file('word/document.xml')
      if (f) {
        const xml = f.asText().replace(/<w:pgMar\b[^>]*\/>/g, (tag) => {
          const top = Number((tag.match(/w:top="(-?\d+)"/) || [])[1] || 0)
          return top > 1700 ? tag.replace(/w:top="-?\d+"/, 'w:top="1480"') : tag
        })
        zipOut.file('word/document.xml', xml)
      }
    } catch { /* mantém como veio */ }
    out = zipOut.generate({ type: 'nodebuffer', compression: 'DEFLATE' })
  } catch (e) {
    // Template com laço desbalanceado/chave estranha → NÃO mostra o doc cru em silêncio (parecia "não
    // gerou"). Gera um aviso explicando o que houve — quase sempre é bloco inserido 2x+ (sobrou {#} sem {/}).
    try {
      let xml = ''
      try { xml = new PizZip(buf).file('word/document.xml')?.asText() || '' } catch { /* ignore */ }
      const desbalanceados = xml ? lacosDesbalanceados(xml) : []
      const linhas: { texto: string; forte?: boolean }[] = [
        { texto: 'O documento tem um problema nos marcadores de laço e não pôde ser preenchido.' },
        { texto: '' },
      ]
      if (desbalanceados.length) {
        linhas.push({ texto: 'Marcadores desbalanceados (abre ≠ fecha):', forte: true })
        for (const d of desbalanceados) {
          linhas.push({ texto: `• {#${d.nome}} aparece ${d.abre}x  e  {/${d.nome}} aparece ${d.fecha}x` })
        }
        linhas.push({ texto: '' })
        linhas.push({ texto: 'Causa provável: o bloco foi inserido mais de uma vez (ou um pedaço foi apagado), deixando um {#...} sem o {/...} correspondente.' })
        linhas.push({ texto: 'Como resolver: deixe apenas UM de cada bloco no documento (apague as cópias extras) e salve de novo. Ou use um documento de teste novo e insira o bloco uma única vez.' })
      } else {
        linhas.push({ texto: `Detalhe técnico: ${(e as Error).message}` })
        linhas.push({ texto: 'Verifique se não há uma chave { } aberta ou um laço {#...} sem fechar.' })
      }
      out = await docxAviso(linhas)
    } catch {
      out = buf // último recurso: devolve o original
    }
  }
  return new NextResponse(new Uint8Array(out), {
    headers: { 'content-type': DOCX_CT, 'content-disposition': `inline; filename="${id}-previa.docx"`, 'cache-control': 'no-store' },
  })
}
