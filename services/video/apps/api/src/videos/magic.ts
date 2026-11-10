/**
 * Confere os primeiros bytes do arquivo enviado: a extensão/Content-Type vêm do cliente e mentem
 * com facilidade. Não substitui o ffprobe do worker; só barra, no upload, o que claramente não é vídeo.
 */
const ascii = (b: Buffer, from: number, to: number) => b.subarray(from, to).toString('latin1');

const ISO_ATOMS = ['ftyp', 'moov', 'mdat', 'free', 'wide', 'skip', 'pnot', 'junk'];

/** Devolve o motivo da recusa, ou null se a assinatura combina com a extensão. */
export function magicProblem(head: Buffer, filename: string): string | null {
  const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase();
  if (head.length < 12) return 'arquivo pequeno demais para ser um vídeo';
  switch (ext) {
    case '.mp4':
    case '.m4v':
    case '.mov':
      return ISO_ATOMS.includes(ascii(head, 4, 8)) ? null : 'o conteúdo não é MP4/MOV';
    case '.mkv':
    case '.webm':
      return head.readUInt32BE(0) === 0x1a45dfa3 ? null : 'o conteúdo não é Matroska/WebM';
    case '.avi':
      return ascii(head, 0, 4) === 'RIFF' && ascii(head, 8, 11) === 'AVI'
        ? null
        : 'o conteúdo não é AVI';
    case '.mpg':
    case '.mpeg':
      // MPEG-PS (pack/sequence header) ou MPEG-TS (sincronismo 0x47)
      return head.readUInt32BE(0) === 0x000001ba ||
        head.readUInt32BE(0) === 0x000001b3 ||
        head[0] === 0x47
        ? null
        : 'o conteúdo não é MPEG';
    default:
      return 'extensão não suportada';
  }
}
