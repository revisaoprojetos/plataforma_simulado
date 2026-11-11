import { describe, it, expect } from 'vitest'
import { absolutizar, escaparBusca, mapearPlayback, normalizarBase, statusAulaDoServico } from '../puro'
import { criarVideoSchema, listarAdminSchema, playbackReqSchema } from '../tipos'

const R = '11111111-1111-4111-8111-111111111111'
const C = '33333333-3333-4333-8333-333333333333'

describe('base/URLs', () => {
  it('normalizarBase remove barra e /v1', () => {
    expect(normalizarBase('https://v.example.com/')).toEqual({ origin: 'https://v.example.com', v1: 'https://v.example.com/v1' })
    expect(normalizarBase('https://v.example.com/v1/').v1).toBe('https://v.example.com/v1')
  })
  it('absolutizar', () => {
    expect(absolutizar('https://v', '/v1/hls/x')).toBe('https://v/v1/hls/x')
    expect(absolutizar('https://v', 'https://s3/x')).toBe('https://s3/x')
    expect(absolutizar('https://v', null)).toBeNull()
  })
})

describe('mapearPlayback', () => {
  it('monta o contrato do front', () => {
    const r = mapearPlayback({
      sessionId: 's', playbackToken: 't', expiresIn: 300, manifestUrl: '/v1/hls/v/master.m3u8?t=t', posterUrl: 'https://s3/p.jpg', spriteVttUrl: '/v1/hls/v/sprite.vtt?t=t', durationS: 90,
      watermark: { text: 'Ana' }, resumeAt: 12.5, subtitles: [{ lang: 'pt', url: '/v1/hls/v/subtitles/pt.vtt?t=t' }], chapters: [{ startS: 0, title: 'Intro' }],
    }, normalizarBase('https://v.example.com'), 'next-id', 'lesson-1')
    expect(r).toMatchObject({
      apiBase: 'https://v.example.com/v1', manifestUrl: 'https://v.example.com/v1/hls/v/master.m3u8?t=t', playbackToken: 't', expiresIn: 300,
      sessionId: 's', resumeAt: 12.5, watermark: { text: 'Ana' }, poster: 'https://s3/p.jpg', nextAulaId: 'next-id',
      lessonId: 'lesson-1', durationS: 90, spriteVttUrl: 'https://v.example.com/v1/hls/v/sprite.vtt?t=t',
    })
    expect(r.subtitles[0].url).toBe('https://v.example.com/v1/hls/v/subtitles/pt.vtt?t=t')
  })
  it('valores ausentes viram defaults', () => {
    const r = mapearPlayback({ sessionId: 's', playbackToken: 't', expiresIn: 1, manifestUrl: '/m' }, normalizarBase('https://v'), null, 'l')
    expect(r).toMatchObject({ resumeAt: 0, durationS: null, spriteVttUrl: null, watermark: null, subtitles: [], chapters: [], poster: null, nextAulaId: null })
  })
})

describe('misc', () => {
  it('statusAulaDoServico', () => {
    expect(statusAulaDoServico('ready')).toBe('pronta')
    expect(statusAulaDoServico('failed')).toBe('erro')
    expect(statusAulaDoServico('queued')).toBe('processando')
    expect(statusAulaDoServico('uploading')).toBe('enviando')
  })
  it('escaparBusca neutraliza curingas e separadores', () => {
    expect(escaparBusca('a%b_c,d(e)')).toBe('a\\%b\\_c\\,d\\(e\\)')
  })
})

describe('schemas zod', () => {
  it('playback exige uuid e rejeita extras', () => {
    expect(playbackReqSchema.safeParse({ courseId: C, lessonId: R }).success).toBe(true)
    expect(playbackReqSchema.safeParse({ courseId: C, lessonId: 'x' }).success).toBe(false)
    expect(playbackReqSchema.safeParse({ lessonId: R }).success).toBe(false)
    expect(playbackReqSchema.safeParse({ courseId: C, lessonId: R, extra: 1 }).success).toBe(false)
  })
  it('criarVideo: pastaId opcional/nula', () => {
    expect(criarVideoSchema.safeParse({ titulo: 'Aula 1' }).success).toBe(true)
    expect(criarVideoSchema.safeParse({ titulo: 'Aula 1', pastaId: null }).success).toBe(true)
    expect(criarVideoSchema.safeParse({ titulo: '' }).success).toBe(false)
  })
  it('listar: defaults e limites', () => {
    const r = listarAdminSchema.parse({})
    expect(r).toMatchObject({ page: 1, pageSize: 25, sort: 'criado_em', dir: 'desc', search: '' })
    expect(listarAdminSchema.safeParse({ pageSize: 500 }).success).toBe(false)
    expect(listarAdminSchema.safeParse({ sort: 'senha' }).success).toBe(false)
  })
})
