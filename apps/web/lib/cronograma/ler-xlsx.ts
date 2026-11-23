import PizZip from 'pizzip'
import type { AbasXlsx } from './importar-planilha'

/** Erro com mensagem já em português, pronta para o toast. */
export class ErroLeituraXlsx extends Error {}

type ExcelJSLike = { Workbook: new () => any }

const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'

function ehZip(b: Uint8Array) {
  return b.length > 3 && b[0] === 0x50 && b[1] === 0x4b
}
function ehOle(b: Uint8Array) {
  return b.length > 4 && b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0
}

/**
 * Causa do "Cannot read properties of undefined (reading 'sheets')": o exceljs só reconhece a
 * raiz literal `<workbook>`. Planilhas geradas por algumas ferramentas usam o namespace com
 * prefixo (`<x:workbook xmlns:x="...main">`) e o parser devolve undefined. Aqui removemos o
 * prefixo do namespace principal de todas as partes xl/**.xml antes de entregar ao exceljs.
 */
function normalizarPrefixos(bytes: Uint8Array): Uint8Array {
  const zip = new PizZip(bytes)
  let mudou = false
  for (const nome of Object.keys(zip.files)) {
    if (zip.files[nome].dir || !/^xl\/.*\.xml$/i.test(nome)) continue
    const xml = zip.file(nome)?.asText()
    if (!xml) continue
    const m = xml.match(/<([A-Za-z_][\w.-]*):[\w.-]+\b[^>]*?\sxmlns:\1="http:\/\/schemas\.openxmlformats\.org\/spreadsheetml\/2006\/main"/)
    if (!m) continue
    const p = m[1]
    const novo = xml
      .replace(new RegExp(`<(/?)${p}:`, 'g'), '<$1')
      .replace(new RegExp(`xmlns:${p}="${NS_MAIN}"`), `xmlns="${NS_MAIN}"`)
    zip.file(nome, novo)
    mudou = true
  }
  return mudou ? (zip.generate({ type: 'uint8array' }) as Uint8Array) : bytes
}

function traduzir(e: unknown): ErroLeituraXlsx {
  const msg = (e as Error)?.message ?? String(e)
  if (/password|encrypt|protected/i.test(msg)) return new ErroLeituraXlsx('O arquivo está protegido por senha. Remova a proteção e envie novamente.')
  if (/central directory|zip|corrupt/i.test(msg)) return new ErroLeituraXlsx('O arquivo está corrompido ou não é um .xlsx válido. Reexporte a planilha (Arquivo > Fazer download > Microsoft Excel) e tente de novo.')
  if (/reading 'sheets'/.test(msg)) return new ErroLeituraXlsx('A estrutura interna da planilha não pôde ser lida. Abra no Excel/Google Planilhas, use "Salvar como .xlsx" e envie o novo arquivo.')
  return new ErroLeituraXlsx(`Não foi possível ler a planilha: ${msg}`)
}

/** Lê um .xlsx (bytes) e devolve as abas como lista de linhas (cabeçalho = linha 1). */
export async function lerXlsx(entrada: ArrayBuffer | Uint8Array, ExcelJS: ExcelJSLike): Promise<AbasXlsx> {
  const bytes = entrada instanceof Uint8Array ? entrada : new Uint8Array(entrada)
  if (!ehZip(bytes)) {
    if (ehOle(bytes)) throw new ErroLeituraXlsx('Este é um arquivo .xls antigo (ou protegido por senha). Abra no Excel e salve como .xlsx.')
    const ini = new TextDecoder().decode(bytes.slice(0, 200)).trimStart().toLowerCase()
    if (ini.startsWith('<')) throw new ErroLeituraXlsx('O arquivo parece uma página HTML/XML renomeada para .xlsx. Exporte a planilha como .xlsx de verdade.')
    throw new ErroLeituraXlsx('O arquivo não é um .xlsx válido (parece texto/CSV renomeado). Envie como .csv ou exporte como .xlsx.')
  }

  let wb: any
  try {
    wb = new ExcelJS.Workbook()
    await wb.xlsx.load(bytes)
  } catch (e) {
    if (!/reading 'sheets'/.test((e as Error)?.message ?? '')) throw traduzir(e)
    try {
      wb = new ExcelJS.Workbook()
      await wb.xlsx.load(normalizarPrefixos(bytes))
    } catch (e2) {
      throw traduzir(e2)
    }
  }

  if (!wb.worksheets?.length) throw new ErroLeituraXlsx('A planilha não tem nenhuma aba. Use o modelo com as abas Cronogramas, Atividades e Links.')

  const abas: AbasXlsx = {}
  for (const ws of wb.worksheets) {
    const cabecalho = ((ws.getRow(1).values as unknown[]) ?? []).slice(1).map((c) => String(c ?? '').trim())
    const linhas: Record<string, unknown>[] = []
    for (let i = 2; i <= ws.rowCount; i++) {
      const valores = ((ws.getRow(i).values as unknown[]) ?? []).slice(1)
      const linha: Record<string, unknown> = {}
      cabecalho.forEach((c, j) => {
        if (c) linha[c] = valores[j]
      })
      if (Object.values(linha).some((v) => v !== null && v !== undefined && String(v).trim())) linhas.push(linha)
    }
    abas[ws.name] = linhas
  }
  return abas
}
