import { describe, it, expect, vi } from 'vitest'
import { parseStorageUrl } from '@/lib/storage/canonico'
import { pdfPathDeUrl } from '@/lib/storage/pdf-proxy'
import { comFallbackSupabase, estatisticasFallback } from '@/lib/storage/providers/com-fallback'
import type { StorageProvider } from '@/lib/storage/types'

describe('URLs de storage (Supabase e Hetzner)', () => {
  it('parseStorageUrl reconhece Supabase e S3 path-style', () => {
    expect(parseStorageUrl('https://x.supabase.co/storage/v1/object/public/imagens/assets/a.webp')).toEqual({ bucket: 'imagens', path: 'assets/a.webp' })
    expect(parseStorageUrl('https://hel1.your-objectstorage.com/revisaopge-imagens/assets/a.webp?v=1')).toEqual({ bucket: 'imagens', path: 'assets/a.webp' })
    expect(parseStorageUrl('https://exemplo.com/outra/coisa.png')).toBeNull()
  })
  it('pdfPathDeUrl mantém os dois formatos', () => {
    const job = '02195fa6-3db8-49d0-8c07-d21328a26a13/7f88b9a5-e9a7-41a9-9dfd-170900dc36f8.pdf'
    expect(pdfPathDeUrl(`https://x.supabase.co/storage/v1/object/public/pdfs/${job}`)).toBe(job)
    expect(pdfPathDeUrl(`https://hel1.your-objectstorage.com/revisaopge-pdfs/${job}`)).toBe(job)
    expect(pdfPathDeUrl('https://hel1.your-objectstorage.com/revisaopge-pdfs/materiais/t/a.pdf')).toBe('materiais/t/a.pdf')
    expect(pdfPathDeUrl('https://hel1.your-objectstorage.com/revisaopge-imagens/assets/a.webp')).toBeNull()
  })
  it('fallback conta leituras que caem no Supabase', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const prim = { name: 's3', exists: async () => false, download: async () => null, getSignedUrl: async () => 'p' } as unknown as StorageProvider
    const sec = { name: 'supabase', exists: async () => true, download: async () => new Uint8Array([1]), getSignedUrl: async () => 's' } as unknown as StorageProvider
    const w = comFallbackSupabase(prim, () => sec)
    const antes = estatisticasFallback().total
    await w.download('pdfs', 'a')
    await w.getSignedUrl('pdfs', 'b')
    expect(estatisticasFallback().total).toBe(antes + 2)
  })
})
