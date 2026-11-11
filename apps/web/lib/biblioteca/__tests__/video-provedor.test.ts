import { describe, it, expect } from 'vitest'
import { detectarVideo, parseReferenciaVideoProprio, PLATAFORMA_LABEL, referenciaVideoProprio } from '../video-provedor'

const C = '11111111-1111-4111-8111-111111111111'
const L = '22222222-2222-4222-8222-222222222222'

describe('vídeo próprio', () => {
  it('referenciaVideoProprio monta o esquema', () => {
    expect(referenciaVideoProprio(C, L)).toBe(`video-proprio:${C}:${L}`)
    expect(referenciaVideoProprio(` ${C} `, ` ${L} `)).toBe(`video-proprio:${C}:${L}`)
  })
  it('parseReferenciaVideoProprio extrai os ids (ida e volta)', () => {
    expect(parseReferenciaVideoProprio(referenciaVideoProprio(C, L))).toEqual({ courseId: C, lessonId: L })
    expect(parseReferenciaVideoProprio(`  VIDEO-PROPRIO:${C.toUpperCase()}:${L.toUpperCase()} `)).toEqual({ courseId: C, lessonId: L })
  })
  it('parseReferenciaVideoProprio rejeita o que não é referência válida', () => {
    for (const v of [null, undefined, '', 'video-proprio:', 'video-proprio:abc', `video-proprio:${C}`, `video-proprio:${C}:abc`,
      'https://youtu.be/abcdef123', `outro:${C}:${L}`, `video-proprio:${C}:${L}x`, `video-proprio:${C}:${L}:${L}`]) {
      expect(parseReferenciaVideoProprio(v as string | null | undefined)).toBeNull()
    }
  })
  it('detectarVideo reconhece proprio sem embedUrl', () => {
    expect(detectarVideo(`video-proprio:${C}:${L}`)).toEqual({ plataforma: 'proprio', id: L, embedUrl: null, rotulo: PLATAFORMA_LABEL.proprio })
    expect(PLATAFORMA_LABEL.proprio).toBe('Vídeo próprio (hospedado)')
  })
  it('não afeta os demais provedores', () => {
    expect(detectarVideo('https://youtu.be/abcdef123').plataforma).toBe('youtube')
    expect(detectarVideo('https://vimeo.com/123456789').plataforma).toBe('vimeo')
    expect(detectarVideo('https://drive.google.com/file/d/abc123/view').plataforma).toBe('google_drive')
    expect(detectarVideo('https://exemplo.com/x').plataforma).toBe('desconhecido')
  })
})
