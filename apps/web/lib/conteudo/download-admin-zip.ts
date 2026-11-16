/**
 * Montagem PURA do ZIP do download em lote (sem banco/storage) — isolada para teste de integridade.
 * Entrada: arquivos já gerados {dir, titulo, ext, bytes}; saída: bytes do ZIP + relatório. Nomes únicos (case-insensitive),
 * sanitizados; o conteúdo entra byte-a-byte (binary) — pdf/docx em STORE (já comprimidos), texto/rtf/odt em DEFLATE.
 */
import PizZip from 'pizzip'
import { sanitizarNomeArquivo } from './baixar-pura'
import { nomeUnico } from './download-admin-pura'

export interface EntradaZip { dir: string; titulo: string; ext: string; bytes: Uint8Array }

export function montarZip(entradas: EntradaZip[], relatorio: string): { bytes: Uint8Array; caminhos: string[] } {
  const zip = new PizZip()
  const usados = new Set<string>(['_relatorio.txt'])
  const caminhos: string[] = []
  for (const e of entradas) {
    const nome = sanitizarNomeArquivo(e.titulo, e.ext)
    const caminho = nomeUnico(usados, e.dir ? `${e.dir}/${nome}` : nome)
    const comprime = e.ext === 'txt' || e.ext === 'rtf' || e.ext === 'odt' ? 'DEFLATE' : 'STORE'
    zip.file(caminho, e.bytes, { binary: true, compression: comprime })
    caminhos.push(caminho)
  }
  zip.file('_relatorio.txt', relatorio, { compression: 'DEFLATE' })
  return { bytes: zip.generate({ type: 'uint8array', compression: 'STORE' }) as Uint8Array, caminhos }
}

/** Integridade mínima de um arquivo gerado: não-vazio + assinatura (magic bytes) coerente com a extensão. null = ok; senão o motivo. */
export function validarBytesArquivo(bytes: Uint8Array, ext: string): string | null {
  if (!bytes || bytes.byteLength === 0) return 'Arquivo vazio (0 bytes).'
  const h = (i: number) => bytes[i]
  if (ext === 'pdf' && !(bytes.byteLength > 8 && h(0) === 0x25 && h(1) === 0x50 && h(2) === 0x44 && h(3) === 0x46)) return 'O arquivo não é um PDF válido (assinatura ausente).'
  if ((ext === 'docx' || ext === 'odt') && !(bytes.byteLength > 4 && h(0) === 0x50 && h(1) === 0x4b)) return `O arquivo não é um .${ext} válido (assinatura ausente).`
  if (ext === 'rtf' && !(bytes.byteLength > 4 && h(0) === 0x7b && h(1) === 0x5c && h(2) === 0x72)) return 'O arquivo não é um RTF válido (assinatura ausente).'
  return null
}
