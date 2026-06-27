// Validação server-side de upload: tamanho, MIME e magic bytes (ponto S3 do plano).
// Evita confiar no Content-Type enviado pelo cliente — confere a assinatura real.

export interface ValidateOptions {
  /** MIMEs permitidos, ex.: ['image/png', 'image/jpeg', 'application/pdf']. */
  permitidos: string[]
  /** Tamanho máximo em bytes. */
  maxBytes: number
}

export interface ValidateResult {
  ok: boolean
  error?: string
  /** MIME detectado pela assinatura (magic bytes). */
  mimeDetectado?: string
}

function toBuf(data: Buffer | Uint8Array | ArrayBuffer): Uint8Array {
  if (data instanceof Uint8Array) return data
  return new Uint8Array(data)
}

/** Detecta o MIME pela assinatura (magic bytes) dos formatos comuns. */
export function sniffMime(data: Buffer | Uint8Array | ArrayBuffer): string | null {
  const b = toBuf(data)
  const is = (sig: number[], offset = 0) => sig.every((v, i) => b[offset + i] === v)

  if (is([0x89, 0x50, 0x4e, 0x47])) return 'image/png'
  if (is([0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (is([0x47, 0x49, 0x46, 0x38])) return 'image/gif'
  if (is([0x25, 0x50, 0x44, 0x46])) return 'application/pdf' // %PDF
  // WEBP: "RIFF"...."WEBP"
  if (is([0x52, 0x49, 0x46, 0x46]) && is([0x57, 0x45, 0x42, 0x50], 8)) return 'image/webp'
  // ZIP / docx/xlsx (PK..)
  if (is([0x50, 0x4b, 0x03, 0x04])) return 'application/zip'
  return null
}

export function validateFile(
  data: Buffer | Uint8Array | ArrayBuffer,
  declaredMime: string,
  opts: ValidateOptions,
): ValidateResult {
  const size = toBuf(data).byteLength
  if (size === 0) return { ok: false, error: 'Arquivo vazio.' }
  if (size > opts.maxBytes) {
    return { ok: false, error: `Arquivo excede o limite de ${Math.round(opts.maxBytes / 1024 / 1024)} MB.` }
  }

  const mimeDetectado = sniffMime(data)

  // Se conseguimos detectar a assinatura, ela manda (mais confiável que o header).
  const efetivo = mimeDetectado ?? declaredMime
  if (!opts.permitidos.includes(efetivo)) {
    return { ok: false, error: `Tipo de arquivo não permitido (${efetivo}).`, mimeDetectado: mimeDetectado ?? undefined }
  }

  // Se há assinatura conhecida e ela diverge do declarado, rejeita (anti-spoof).
  if (mimeDetectado && declaredMime && mimeDetectado !== declaredMime) {
    return { ok: false, error: 'O conteúdo do arquivo não corresponde ao tipo informado.', mimeDetectado }
  }

  return { ok: true, mimeDetectado: mimeDetectado ?? undefined }
}

/** Presets de validação comuns. */
export const PRESETS = {
  imagem: { permitidos: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'], maxBytes: 5 * 1024 * 1024 },
  documento: { permitidos: ['application/pdf'], maxBytes: 20 * 1024 * 1024 },
  imagemOuPdf: { permitidos: ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'], maxBytes: 20 * 1024 * 1024 },
} satisfies Record<string, ValidateOptions>
