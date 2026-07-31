/**
 * Redimensiona uma imagem no CLIENTE e devolve um data URL (JPEG base64) — mesmo padrão
 * usado nas capas de banco/caderno. Sem bucket: a imagem já vai pronta para salvar no banco.
 * `max` = maior dimensão (px); `quality` = 0..1. Uso apenas no browser (canvas).
 */
export async function redimensionarImagem(file: File, max = 900, quality = 0.72): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas')
  ctx.drawImage(bitmap, 0, 0, w, h)
  return canvas.toDataURL('image/jpeg', quality)
}
