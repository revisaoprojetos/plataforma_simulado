import { afterEach, describe, expect, it, vi } from 'vitest'
import { novoUuid } from './notebook-uuid'

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('novoUuid', () => {
  afterEach(() => { vi.unstubAllGlobals() })
  it('v4 com crypto.randomUUID', () => { expect(novoUuid()).toMatch(V4) })
  it('v4 sem randomUUID (getRandomValues)', () => {
    vi.stubGlobal('crypto', { getRandomValues: (a: Uint8Array) => { for (let i = 0; i < a.length; i++) a[i] = (i * 37 + 11) & 255; return a } })
    expect(novoUuid()).toMatch(V4)
  })
  it('v4 sem crypto algum (Math.random) e sem repetir', () => {
    vi.stubGlobal('crypto', undefined)
    const a = novoUuid(), b = novoUuid()
    expect(a).toMatch(V4); expect(b).toMatch(V4); expect(a).not.toBe(b)
  })
})
