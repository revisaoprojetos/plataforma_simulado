import { createHash } from 'crypto'

/**
 * Substitui imagens embutidas em base64 (plano-fundo / imagem) por URLs hospedadas
 * no bucket `pdfs/assets/`. Faz upload apenas 1x por conteúdo (dedupe por hash) e
 * pula se já existe. Deixa o HTML de /imprimir leve → render + Gotenberg MUITO mais rápidos.
 *
 * Muta o `doc` em memória (não salva no banco) — o doc vem do config a cada request.
 */
export async function hospedarImagensDoc(doc: any, svc: any): Promise<void> {
  if (!doc) return
  const cache = new Map<string, string>()

  async function urlDe(b64: string): Promise<string | null> {
    const cached = cache.get(b64)
    if (cached) return cached
    const m = /^data:image\/([a-z0-9.+-]+);base64,(.+)$/i.exec(b64)
    if (!m) return null
    const tipo = m[1].toLowerCase()
    const ext = tipo === 'jpeg' ? 'jpg' : tipo
    const buf = Buffer.from(m[2], 'base64')
    const hash = createHash('sha1').update(buf).digest('hex').slice(0, 24)
    const nome = `${hash}.${ext}`
    const path = `assets/${nome}`
    try {
      // Só sobe se ainda não existe (evita reenviar o arquivo grande a cada geração).
      const { data: lista } = await svc.storage.from('pdfs').list('assets', { search: nome, limit: 1 })
      if (!lista?.some((f: any) => f.name === nome)) {
        await svc.storage.from('pdfs').upload(path, buf, { contentType: `image/${tipo}`, upsert: true })
      }
    } catch { /* se falhar o upload/list, mantém base64 (não quebra o PDF) */ return null }
    const url = svc.storage.from('pdfs').getPublicUrl(path).data.publicUrl as string
    cache.set(b64, url)
    return url
  }

  async function walk(blocks: any[]) {
    for (const b of blocks ?? []) {
      const a = b?.attributes
      if (a && typeof a.url === 'string' && a.url.startsWith('data:image')) {
        const u = await urlDe(a.url)
        if (u) a.url = u
      }
      if (b?.innerBlocks) await walk(b.innerBlocks)
    }
  }

  for (const p of doc.pages ?? []) await walk(p.blocks)
  await walk(doc.cabecalho ?? [])
  await walk(doc.rodape ?? [])
}
