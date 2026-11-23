import { describe, it, expect, vi } from 'vitest'
import { nomeArquivoSeguro, baixarDeUrl, baixarBlob, baixarViaFetch } from '../baixar-arquivo'

function fakeDoc(suportaDownload = true) {
  const clicks: any[] = []
  const doc: any = {
    body: { appendChild: vi.fn() },
    createElement: () => {
      const a: any = { style: {}, remove: vi.fn(), click: () => clicks.push({ href: a.href, download: a.download, target: a.target }) }
      if (suportaDownload) a.download = ''
      return a
    },
  }
  return { doc, clicks }
}

describe('nomeArquivoSeguro', () => {
  it('limpa reservados e garante extensão', () => {
    expect(nomeArquivoSeguro('Caderno: 1/2?', 'pdf')).toBe('Caderno_12.pdf')
    expect(nomeArquivoSeguro('x.PDF', '.pdf')).toBe('x.PDF')
    expect(nomeArquivoSeguro('', 'pdf', 'caderno')).toBe('caderno.pdf')
  })
})

describe('baixarDeUrl', () => {
  it('same-origin: link download síncrono', () => {
    const { doc, clicks } = fakeDoc()
    expect(baixarDeUrl('/api/x?download=1', 'a.pdf', { doc, origem: 'https://s.com' })).toBe('download')
    expect(clicks[0]).toMatchObject({ href: '/api/x?download=1', download: 'a.pdf' })
    expect(clicks[0].target).toBeFalsy()
  })
  it('externo: abre em nova aba sem download', () => {
    const { doc, clicks } = fakeDoc()
    expect(baixarDeUrl('https://cdn.com/a.pdf', 'a.pdf', { doc, origem: 'https://s.com' })).toBe('aba')
    expect(clicks[0].target).toBe('_blank')
  })
})

describe('baixarBlob', () => {
  const urlApi = { createObjectURL: () => 'blob:1', revokeObjectURL: vi.fn() }
  it('usa <a download> quando suportado', async () => {
    const { doc, clicks } = fakeDoc(true)
    expect(await baixarBlob(new Blob(['x']), 'a.pdf', { doc, urlApi, suportaDownload: true })).toBe('download')
    expect(clicks[0]).toMatchObject({ href: 'blob:1', download: 'a.pdf' })
  })
  it('sem suporte: compartilha o arquivo quando possível', async () => {
    const { doc } = fakeDoc(false)
    const share = vi.fn().mockResolvedValue(undefined)
    const nav: any = { canShare: () => true, share }
    expect(await baixarBlob(new Blob(['x'], { type: 'application/pdf' }), 'a.pdf', { doc, urlApi, nav, suportaDownload: false })).toBe('compartilhado')
    expect(share).toHaveBeenCalled()
  })
  it('sem suporte nem share: nova aba', async () => {
    const { doc, clicks } = fakeDoc(false)
    expect(await baixarBlob(new Blob(['x']), 'a.pdf', { doc, urlApi, nav: {} as any, suportaDownload: false })).toBe('aba')
    expect(clicks[0].target).toBe('_blank')
  })
  it('createObjectURL falha → falhou', async () => {
    const { doc } = fakeDoc()
    const ruim = { createObjectURL: () => { throw new Error('x') }, revokeObjectURL: vi.fn() }
    expect(await baixarBlob(new Blob(['x']), 'a', { doc, urlApi: ruim, suportaDownload: true })).toBe('falhou')
  })
})

describe('baixarViaFetch', () => {
  const resp = (status: number, body: BodyInit | null = 'pdf', type = 'application/pdf') => new Response(body, { status, headers: { 'content-type': type } })
  const base = { nome: 'a.pdf', esperar: async () => {}, entregar: vi.fn().mockResolvedValue('download') as any }
  it('re-tenta 503 e entrega', async () => {
    const f = vi.fn().mockResolvedValueOnce(resp(503)).mockResolvedValueOnce(resp(200))
    expect(await baixarViaFetch('/api/x', { ...base, fetchFn: f as any })).toBe('download')
    expect(f).toHaveBeenCalledTimes(2)
  })
  it('401 → mensagem de sessão', async () => {
    await expect(baixarViaFetch('/api/x', { ...base, fetchFn: (async () => resp(401, '{}', 'application/json')) as any })).rejects.toThrow(/sessão/)
  })
  it('usa message do servidor', async () => {
    await expect(baixarViaFetch('/api/x', { ...base, fetchFn: (async () => resp(500, JSON.stringify({ message: 'Sem navegador' }), 'application/json')) as any })).rejects.toThrow('Sem navegador')
  })
  it('rede caiu → mensagem clara', async () => {
    await expect(baixarViaFetch('/api/x', { ...base, fetchFn: (async () => { throw new TypeError('x') }) as any })).rejects.toThrow(/conexão/)
  })
  it('valida blob', async () => {
    await expect(baixarViaFetch('/api/x', { ...base, validar: () => 'PDF inválido', fetchFn: (async () => resp(200)) as any })).rejects.toThrow('PDF inválido')
  })
  it('entrega falhou → erro', async () => {
    await expect(baixarViaFetch('/api/x', { ...base, entregar: (async () => 'falhou') as any, fetchFn: (async () => resp(200)) as any })).rejects.toThrow(/bloqueou/)
  })
})
