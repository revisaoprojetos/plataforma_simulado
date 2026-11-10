import { describe, it, expect } from 'vitest'
import {
  absolutizar, acessoVigente, diferencaSync, erroDefinitivo, escaparBusca, externalRefDe, mapearPlayback, normalizarBase,
  outraRegraAindaConcede, proximaTentativaMs, statusAulaDoServico, MAX_TENTATIVAS, type Desejado, type Existente,
} from '../puro'
import { criarVideoSchema, listarAdminSchema, playbackReqSchema } from '../tipos'

const AGORA = new Date('2026-11-10T12:00:00Z')
const R = '11111111-1111-4111-8111-111111111111'
const E = '22222222-2222-4222-8222-222222222222'
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

describe('idempotência / backoff', () => {
  it('externalRef = regra:aluno', () => expect(externalRefDe(R, E)).toBe(`${R}:${E}`))
  it('backoff cresce, respeita teto e jitter ±20%', () => {
    const meio = () => 0.5
    expect(proximaTentativaMs(1, meio)).toBe(30_000)
    expect(proximaTentativaMs(2, meio)).toBe(60_000)
    expect(proximaTentativaMs(3, meio)).toBe(120_000)
    expect(proximaTentativaMs(30, meio)).toBe(6 * 3600_000)
    expect(proximaTentativaMs(1, () => 0)).toBe(24_000)
    expect(proximaTentativaMs(1, () => 0.999)).toBeLessThanOrEqual(36_000)
    expect(MAX_TENTATIVAS).toBeGreaterThan(3)
  })
  it('erroDefinitivo: 4xx sim (exceto 408/429), rede/5xx não', () => {
    expect(erroDefinitivo(422)).toBe(true)
    expect(erroDefinitivo(404)).toBe(true)
    expect(erroDefinitivo(409)).toBe(true)
    expect(erroDefinitivo(429)).toBe(false)
    expect(erroDefinitivo(408)).toBe(false)
    expect(erroDefinitivo(502)).toBe(false)
    expect(erroDefinitivo(null)).toBe(false)
  })
})

describe('revogação segura e gate', () => {
  it('outra regra vigente impede revogar no serviço', () => {
    expect(outraRegraAindaConcede([{ acao: 'enroll', estado: 'sincronizado', fimEm: null }], AGORA)).toBe(true)
    expect(outraRegraAindaConcede([{ acao: 'enroll', estado: 'sincronizado', fimEm: '2026-01-01T00:00:00Z' }], AGORA)).toBe(false)
    expect(outraRegraAindaConcede([{ acao: 'revoke', estado: 'sincronizado', fimEm: null }], AGORA)).toBe(false)
    expect(outraRegraAindaConcede([{ acao: 'enroll', estado: 'falhou', fimEm: null }], AGORA)).toBe(false)
    expect(outraRegraAindaConcede([], AGORA)).toBe(false)
  })
  it('acessoVigente respeita estado, janela e ação', () => {
    const ok = { acao: 'enroll', estado: 'sincronizado', inicioEm: null, fimEm: null }
    expect(acessoVigente([ok], AGORA)).toBe(true)
    expect(acessoVigente([{ ...ok, estado: 'pendente' }], AGORA)).toBe(false)
    expect(acessoVigente([{ ...ok, acao: 'revoke' }], AGORA)).toBe(false)
    expect(acessoVigente([{ ...ok, inicioEm: '2026-12-01T00:00:00Z' }], AGORA)).toBe(false)
    expect(acessoVigente([{ ...ok, fimEm: '2026-11-01T00:00:00Z' }], AGORA)).toBe(false)
    expect(acessoVigente([{ ...ok, fimEm: '2026-12-01T00:00:00Z' }], AGORA)).toBe(true)
  })
})

describe('diferencaSync (reconciliação)', () => {
  const d: Desejado = { regraId: R, estudanteId: E, cursoId: C, inicioEm: '2026-11-01T00:00:00Z', fimEm: '2027-11-01T00:00:00Z' }
  const ex = (o: Partial<Existente> = {}): Existente => ({ ...d, acao: 'enroll', estado: 'sincronizado', ...o })

  it('sem linha => enroll', () => expect(diferencaSync([d], [], AGORA)).toEqual({ enroll: [d], revoke: [] }))
  it('já sincronizado com mesmas datas => nada (idempotente)', () => expect(diferencaSync([d], [ex()], AGORA)).toEqual({ enroll: [], revoke: [] }))
  it('datas mudaram => enroll de novo', () => {
    expect(diferencaSync([d], [ex({ fimEm: '2026-12-01T00:00:00Z' })], AGORA).enroll).toHaveLength(1)
  })
  it('linha falhou/revogada com grant ativo => re-enfileira', () => {
    expect(diferencaSync([d], [ex({ estado: 'falhou' })], AGORA).enroll).toHaveLength(1)
    expect(diferencaSync([d], [ex({ acao: 'revoke' })], AGORA).enroll).toHaveLength(1)
  })
  it('enroll sem grant => revoke; revoke já feito => nada', () => {
    expect(diferencaSync([], [ex()], AGORA).revoke).toHaveLength(1)
    expect(diferencaSync([], [ex({ acao: 'revoke' })], AGORA)).toEqual({ enroll: [], revoke: [] })
    expect(diferencaSync([], [ex({ estado: 'falhou' })], AGORA)).toEqual({ enroll: [], revoke: [] })
  })
  it('compara datas por instante, não por string', () => {
    expect(diferencaSync([d], [ex({ inicioEm: '2026-11-01T03:00:00+03:00' })], AGORA)).toEqual({ enroll: [], revoke: [] })
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
    expect(playbackReqSchema.safeParse({ aulaId: R }).success).toBe(true)
    expect(playbackReqSchema.safeParse({ aulaId: 'x' }).success).toBe(false)
    expect(playbackReqSchema.safeParse({ aulaId: R, extra: 1 }).success).toBe(false)
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
