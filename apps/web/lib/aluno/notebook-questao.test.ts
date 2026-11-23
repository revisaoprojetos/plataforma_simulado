import { describe, expect, it } from 'vitest'
import { aplicarResposta, gabaritoVisivel } from './notebook-questao'

const q = { id: 'q', gabarito_oculto: true, comentario_professor: null, alternativas: [{ id: 'a', correta: false }, { id: 'b', correta: false }] }
describe('gabarito oculto do caderno', () => {
  it('visível só quando não oculto', () => { expect(gabaritoVisivel(q)).toBe(false); expect(gabaritoVisivel({ id: 'x' })).toBe(true) })
  it('resposta marca só a escolhida', () => {
    const r = aplicarResposta(q, 'b', true)
    expect(r.alternativas.map((a) => a.correta)).toEqual([false, true])
    expect(q.alternativas[1].correta).toBe(false)
  })
  it('questão com gabarito (erros/antigo) não muda', () => { const o = { id: 'x', alternativas: [{ id: 'a', correta: true }] }; expect(aplicarResposta(o, 'a', false)).toBe(o) })
})
