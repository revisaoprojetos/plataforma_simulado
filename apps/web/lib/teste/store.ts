import 'server-only'
import { mkdir, readFile, writeFile, readdir, stat, unlink } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx'

// SPIKE — armazém simples de .docx em disco local (apps/web/.teste-docs). Serve pra avaliar os editores
// Office reais (Collabora/OnlyOffice). NÃO é produção; é só a área de Teste do admin.
const DIR = join(process.cwd(), '.teste-docs')

async function garantirDir() { if (!existsSync(DIR)) await mkdir(DIR, { recursive: true }) }
const caminho = (id: string) => join(DIR, `${id.replace(/[^a-z0-9-]/gi, '')}.docx`)

export function docExiste(id: string): boolean { return existsSync(caminho(id)) }
export async function lerDoc(id: string): Promise<Buffer> { return readFile(caminho(id)) }
/** Versão do doc = data de modificação (muda só quando o conteúdo é salvo). Usada como `key` ESTÁVEL do
 *  OnlyOffice: mesma versão → mesma sessão (evita várias sessões concorrentes e salvar estado velho). */
export async function versaoDoc(id: string): Promise<string> {
  try { const s = await stat(caminho(id)); return String(Math.floor(s.mtimeMs)) } catch { return '0' }
}
export async function salvarDoc(id: string, buf: Buffer): Promise<void> { await garantirDir(); await writeFile(caminho(id), buf) }

// ===== Dados dinâmicos da PRÉVIA (laboratório) — guardados ao lado do .docx, por documento. A rota
// /preview usa estes dados (se houver) no lugar do DADOS_PREVIA estático, pra prévia recalcular ao vivo
// conforme os reguladores da barra lateral. Arquivo .previa.json; versão = mtime (chave do OnlyOffice).
const caminhoPrevia = (id: string) => join(DIR, `${id.replace(/[^a-z0-9-]/gi, '')}.previa.json`)
export async function escreverPrevia(id: string, data: unknown): Promise<void> { await garantirDir(); await writeFile(caminhoPrevia(id), JSON.stringify(data)) }
export async function lerPrevia(id: string): Promise<any | null> { try { return JSON.parse(await readFile(caminhoPrevia(id), 'utf8')) } catch { return null } }
export async function versaoPrevia(id: string): Promise<string> { try { const s = await stat(caminhoPrevia(id)); return String(Math.floor(s.mtimeMs)) } catch { return '0' } }
export async function limparPrevia(id: string): Promise<void> { try { await unlink(caminhoPrevia(id)) } catch { /* já não existe */ } }

/** Cria um .docx em branco (com um título + parágrafo) e devolve o id. */
export async function criarDoc(titulo = 'Documento de teste'): Promise<string> {
  await garantirDir()
  const id = randomUUID()
  const doc = new Document({
    sections: [{
      children: [
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(titulo)] }),
        new Paragraph({ children: [new TextRun('Edite à vontade — cabeçalho, rodapé, tabelas, imagens, quebras de página… tudo nativo do editor.')] }),
      ],
    }],
  })
  const buf = await Packer.toBuffer(doc)
  await writeFile(caminho(id), buf)
  return id
}

/** Lista os documentos existentes (id + data de modificação), mais recentes primeiro. */
export async function listarDocs(): Promise<{ id: string; atualizadoEm: number }[]> {
  await garantirDir()
  const arqs = (await readdir(DIR)).filter((f) => f.endsWith('.docx'))
  const out: { id: string; atualizadoEm: number }[] = []
  for (const f of arqs) { try { const s = await stat(join(DIR, f)); out.push({ id: f.replace(/\.docx$/, ''), atualizadoEm: s.mtimeMs }) } catch { /* ignore */ } }
  return out.sort((a, b) => b.atualizadoEm - a.atualizadoEm)
}
