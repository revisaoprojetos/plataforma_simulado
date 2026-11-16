/**
 * DOWNLOAD ADMIN da Biblioteca (unitário e em lote) — regras PURAS (client-safe, sem banco/storage):
 * catálogo de formatos, nomes de arquivo/pasta no ZIP (sanitizados, desambiguados), nome do ZIP e limites.
 */
import { sanitizarNomeArquivo } from './baixar-pura'

/** Formatos oferecidos (os mesmos do "Baixar como" do OnlyOffice que o servidor consegue produzir). */
export type FormatoDownload = 'original' | 'pdf' | 'odt' | 'rtf' | 'txt'

export const FORMATOS_DOWNLOAD: { id: FormatoDownload; rotulo: string; dica: string; aceitaCapa: boolean }[] = [
  { id: 'original', rotulo: 'Original (.docx / .pdf)', dica: 'O arquivo como foi enviado. Com capa, documentos .docx saem em PDF.', aceitaCapa: true },
  { id: 'pdf', rotulo: 'PDF', dica: 'Documento convertido em PDF (formatação fiel). Aceita capa.', aceitaCapa: true },
  { id: 'odt', rotulo: 'ODT', dica: 'OpenDocument (só documentos .docx). Capa não se aplica.', aceitaCapa: false },
  { id: 'rtf', rotulo: 'RTF', dica: 'Rich Text (só documentos .docx). Capa não se aplica.', aceitaCapa: false },
  { id: 'txt', rotulo: 'Texto (.txt)', dica: 'Texto puro (só documentos .docx). Capa não se aplica.', aceitaCapa: false },
]

export const FORMATOS_IDS = FORMATOS_DOWNLOAD.map((f) => f.id)
export const formatoValido = (f: unknown): f is FormatoDownload => typeof f === 'string' && (FORMATOS_IDS as string[]).includes(f)

/** Limites do lote (acima disso o servidor recusa com mensagem clara: dividir por pasta). */
export const DL_MAX_DOCS = 200
export const DL_MAX_IDS = 500
export const DL_MAX_BYTES_TOTAL = 350 * 1024 * 1024
export const DL_ORCAMENTO_MS = 270_000
export const DL_CONCORRENCIA = 3

export const EXT_CONVERSAO: Record<Exclude<FormatoDownload, 'original' | 'pdf'>, string> = { odt: 'odt', rtf: 'rtf', txt: 'txt' }

export const MIME_POR_EXT: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  odt: 'application/vnd.oasis.opendocument.text',
  rtf: 'application/rtf',
  txt: 'text/plain; charset=utf-8',
  zip: 'application/zip',
}

/** Segmento de pasta seguro dentro do ZIP (sem separadores, sem ponto inicial, ≤ 80 caracteres). */
export function sanitizarSegmento(nome: unknown): string {
  const s = sanitizarNomeArquivo(nome, 'zz').replace(/\.zz$/i, '')
  return Array.from(s).slice(0, 80).join('').trim().replace(/[.\s]+$/, '') || 'Pasta'
}

/** Garante nome único (case-insensitive) dentro do ZIP: "Título.pdf", "Título (2).pdf", "Título (3).pdf"… */
export function nomeUnico(usados: Set<string>, caminho: string): string {
  const chave = (s: string) => s.toLowerCase()
  if (!usados.has(chave(caminho))) { usados.add(chave(caminho)); return caminho }
  const i = caminho.lastIndexOf('.')
  const dir = caminho.lastIndexOf('/')
  const temExt = i > dir + 1
  const base = temExt ? caminho.slice(0, i) : caminho
  const ext = temExt ? caminho.slice(i) : ''
  for (let n = 2; n < 10000; n++) {
    const c = `${base} (${n})${ext}`
    if (!usados.has(chave(c))) { usados.add(chave(c)); return c }
  }
  return caminho
}

/** Nome do ZIP: nome da pasta (quando só há uma pasta) ou "biblioteca-AAAA-MM-DD". */
export function nomeDoZip(pastaUnica: string | null, hoje = new Date()): string {
  if (pastaUnica) return sanitizarNomeArquivo(pastaUnica, 'zip')
  const p = (n: number) => String(n).padStart(2, '0')
  return `biblioteca-${hoje.getFullYear()}-${p(hoje.getMonth() + 1)}-${p(hoje.getDate())}.zip`
}

export interface LinhaRelatorio { titulo: string; formato: string; mensagem: string }

/** Conteúdo do _relatorio.txt (UTF-8 com BOM, quebras CRLF para o Bloco de Notas). */
export function montarRelatorio(r: { geradoEm: Date; total: number; ok: number; falhas: LinhaRelatorio[]; avisos: LinhaRelatorio[]; incluirCapa: boolean; formatos: string[] }): string {
  const L: string[] = []
  L.push('RELATÓRIO DO DOWNLOAD EM LOTE — Biblioteca')
  L.push(`Gerado em: ${r.geradoEm.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`)
  L.push(`Formatos: ${r.formatos.join(', ')} · Incluir capa: ${r.incluirCapa ? 'sim' : 'não'}`)
  L.push(`Arquivos pedidos: ${r.total} · gerados: ${r.ok} · com falha: ${r.falhas.length} · avisos: ${r.avisos.length}`)
  if (r.falhas.length) { L.push('', 'FALHAS (itens que NÃO entraram no ZIP):'); for (const f of r.falhas) L.push(`  - ${f.titulo} [${f.formato}]: ${f.mensagem}`) }
  if (r.avisos.length) { L.push('', 'AVISOS (entraram no ZIP, com observação):'); for (const f of r.avisos) L.push(`  - ${f.titulo} [${f.formato}]: ${f.mensagem}`) }
  if (!r.falhas.length && !r.avisos.length) L.push('', 'Nenhuma falha ou aviso.')
  return '﻿' + L.join('\r\n') + '\r\n'
}
