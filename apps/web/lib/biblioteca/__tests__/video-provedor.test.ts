import { describe, it, expect } from 'vitest'
import { aulaIdDeReferencia, detectarVideo, PLATAFORMA_LABEL, referenciaVideoProprio } from '../video-provedor'

const ID = '11111111-1111-4111-8111-111111111111'

describe('vídeo próprio', () => {
  it('referenciaVideoProprio monta o esquema', () => {
    expect(referenciaVideoProprio(ID)).toBe(`video-proprio:${ID}`)
    expect(referenciaVideoProprio(` ${ID} `)).toBe(`video-proprio:${ID}`)
  })
  it('aulaIdDeReferencia extrai o uuid (ida e volta)', () => {
    expect(aulaIdDeReferencia(referenciaVideoProprio(ID))).toBe(ID)
    expect(aulaIdDeReferencia(`  VIDEO-PROPRIO:${ID.toUpperCase()} `)).toBe(ID)
  })
  it('aulaIdDeReferencia rejeita o que não é referência válida', () => {
    for (const v of [null, undefined, '', 'video-proprio:', 'video-proprio:abc', 'https://youtu.be/abcdef123', `outro:${ID}`, `video-proprio:${ID}x`]) {
      expect(aulaIdDeReferencia(v as string | null | undefined)).toBeNull()
    }
  })
  it('detectarVideo reconhece proprio sem embedUrl', () => {
    expect(detectarVideo(`video-proprio:${ID}`)).toEqual({ plataforma: 'proprio', id: ID, embedUrl: null, rotulo: PLATAFORMA_LABEL.proprio })
    expect(PLATAFORMA_LABEL.proprio).toBe('Vídeo próprio (hospedado)')
  })
  it('não afeta os demais provedores', () => {
    expect(detectarVideo('https://youtu.be/abcdef123').plataforma).toBe('youtube')
    expect(detectarVideo('https://vimeo.com/123456789').plataforma).toBe('vimeo')
    expect(detectarVideo('https://drive.google.com/file/d/abc123/view').plataforma).toBe('google_drive')
    expect(detectarVideo('https://exemplo.com/x').plataforma).toBe('desconhecido')
  })
})
