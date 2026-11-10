import { describe, it, expect } from 'vitest'
import {
  BeatQueue, QUEUE_MAX, withToken, renewDelayMs, retryDelayMs, classifyStatus, shouldBeat,
  chapterIndexAt, formatTime, stepRate, buildEmbedMessage, isCompleted, RETRY_MAX_MS,
} from '../player-protocolo'

const base = { position: 1, rate: 1, quality: 'auto', device: 'web' }

describe('player-protocolo', () => {
  it('withToken troca ou acrescenta t=', () => {
    expect(withToken('/v1/hls/a.m3u8?t=old&x=1', 'n k')).toBe('/v1/hls/a.m3u8?t=n%20k&x=1')
    expect(withToken('/v1/hls/a.m3u8', 'T')).toBe('/v1/hls/a.m3u8?t=T')
    expect(withToken('/v1/hls/a.m3u8?x=1', 'T')).toBe('/v1/hls/a.m3u8?x=1&t=T')
  })

  it('renova a 80% do expiresIn, com piso', () => {
    expect(renewDelayMs(900)).toBe(720_000)
    expect(renewDelayMs(10)).toBe(15_000)
    expect(renewDelayMs(NaN)).toBe(15_000)
  })

  it('backoff exponencial com teto', () => {
    expect([0, 1, 2, 3].map(retryDelayMs)).toEqual([1000, 2000, 4000, 8000])
    expect(retryDelayMs(20)).toBe(RETRY_MAX_MS)
  })

  it('classifica status', () => {
    expect(classifyStatus(204)).toBe('ok')
    expect(classifyStatus(0)).toBe('retry')
    expect(classifyStatus(429)).toBe('retry')
    expect(classifyStatus(503)).toBe('retry')
    expect(classifyStatus(401)).toBe('fatal')
    expect(classifyStatus(410)).toBe('fatal')
  })

  it('shouldBeat: só tocando e visível; force ignora; respeita intervalo mínimo', () => {
    expect(shouldBeat({ playing: true, hidden: false, now: 10_000, last: 0 })).toBe(true)
    expect(shouldBeat({ playing: false, hidden: false, now: 10_000, last: 0 })).toBe(false)
    expect(shouldBeat({ playing: true, hidden: true, now: 10_000, last: 0 })).toBe(false)
    expect(shouldBeat({ playing: false, hidden: true, now: 10_000, last: 0, force: true })).toBe(true)
    expect(shouldBeat({ playing: true, hidden: false, now: 10_300, last: 10_000, force: true })).toBe(false)
  })

  it('BeatQueue: seq crescente, ack remove e zera backoff', () => {
    const q = new BeatQueue()
    const a = q.push(base)
    const b = q.push(base)
    expect([a.seq, b.seq]).toEqual([1, 2])
    expect(q.next(0)?.seq).toBe(1)
    q.ack(1)
    expect(q.next(0)?.seq).toBe(2)
    expect(q.size).toBe(1)
  })

  it('BeatQueue: retry bloqueia até o backoff; fatal descarta', () => {
    const q = new BeatQueue()
    const a = q.push(base)
    expect(q.fail(a.seq, 'retry', 1000)).toBe(1000)
    expect(q.next(1500)).toBeNull()
    expect(q.next(2000)?.seq).toBe(a.seq)
    expect(q.fail(a.seq, 'retry', 2000)).toBe(2000)
    q.ack(a.seq)
    expect(q.attempts).toBe(0)
    const b = q.push(base)
    expect(q.fail(b.seq, 'fatal', 0)).toBe(0)
    expect(q.size).toBe(0)
  })

  it('BeatQueue: teto descarta os mais antigos', () => {
    const q = new BeatQueue()
    for (let i = 0; i < QUEUE_MAX + 5; i++) q.push(base)
    expect(q.size).toBe(QUEUE_MAX)
    expect(q.next(0)?.seq).toBe(6)
  })

  it('capítulos, tempo, velocidade', () => {
    const ch = [{ startS: 0, title: 'a' }, { startS: 60, title: 'b' }, { startS: 120, title: 'c' }]
    expect(chapterIndexAt(ch, 59)).toBe(0)
    expect(chapterIndexAt(ch, 60)).toBe(1)
    expect(chapterIndexAt([], 5)).toBe(-1)
    expect(formatTime(83)).toBe('1:23')
    expect(formatTime(3723)).toBe('1:02:03')
    expect(formatTime(-4)).toBe('0:00')
    expect(stepRate(1, 1)).toBe(1.25)
    expect(stepRate(2, 1)).toBe(2)
    expect(stepRate(0.5, -1)).toBe(0.5)
  })

  it('postMessage e conclusão', () => {
    expect(buildEmbedMessage({ type: 'video:resize', height: 500 })).toEqual({ ns: 'rev-video', v: 1, type: 'video:resize', height: 500 })
    expect(isCompleted(95, 100, false)).toBe(true)
    expect(isCompleted(10, 100, false)).toBe(false)
    expect(isCompleted(10, 100, true)).toBe(true)
  })
})

import { parseSpriteVtt, spriteCueAt } from '../player-protocolo'
describe('sprite vtt', () => {
  it('interpreta cues e localiza por tempo', () => {
    const vtt = 'WEBVTT\n\n00:00:00.000 --> 00:00:05.000\ns.jpg#xywh=0,0,160,90\n\n00:00:05.000 --> 00:00:10.000\ns.jpg#xywh=160,0,160,90\n'
    const cues = parseSpriteVtt(vtt, (u) => 'https://x/' + u)
    expect(cues).toHaveLength(2)
    expect(spriteCueAt(cues, 6)).toMatchObject({ x: 160, url: 'https://x/s.jpg' })
    expect(spriteCueAt(cues, 11)).toBeNull()
  })
})
