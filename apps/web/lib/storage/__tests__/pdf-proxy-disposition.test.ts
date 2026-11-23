import { describe, it, expect } from 'vitest'
import { dispositionPdf } from '@/lib/storage/pdf-proxy'

describe('dispositionPdf', () => {
  it('gera filename ASCII + filename* UTF-8 e força .pdf', () => {
    const h = dispositionPdf('Caderno de Questões – Ação.', true)
    expect(h.startsWith('attachment; filename="')).toBe(true)
    expect(h).toContain(`filename*=UTF-8''Caderno%20de%20Quest%C3%B5es`)
    expect(h).toMatch(/\.pdf$/)
    expect(/filename="[\x20-\x7e]*"/.test(h)).toBe(true)
  })
  it('inline e sem aspas/barras/quebras de linha', () => {
    const h = dispositionPdf('a"b\r\nc/d.pdf', false)
    expect(h.startsWith('inline;')).toBe(true)
    expect(h).not.toMatch(/[\r\n]/)
    expect(h).toContain('filename="a_b_c_d.pdf"')
  })
})
