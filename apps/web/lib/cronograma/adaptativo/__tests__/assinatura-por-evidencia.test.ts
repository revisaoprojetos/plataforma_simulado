import { describe, it, expect } from 'vitest'
import { assinaturaPorEvidencia, mapaPorChave, remapearId } from '../remap-as'

// AS atual: A B C D (índices 0..3). Na GERAÇÃO existia um documento X entre B e C (A B X C D): tudo depois dele andou 1 posição.
const atual = { chaves: ['d:A', 'd:B', 'd:C', 'd:D'], discs: ['Adm', 'Adm', 'Civil', 'Civil'] }
const ev = (meta_id: string, chave: string, disciplina = 'x') => ({ meta_id, chave, disciplina })

describe('assinaturaPorEvidencia', () => {
  it('prova o deslocamento e o remapeador leva cada meta para a aula certa', () => {
    const evid = [ev('pf:0', 'd:A'), ev('pf:1', 'd:B'), ev('pf:2', 'd:X'), ev('pf:3', 'd:C'), ev('pf:4', 'd:D')]
    const r = assinaturaPorEvidencia(evid, ['pf:0', 'pf:1', 'pf:2', 'pf:3', 'pf:4'], atual)
    expect(r).not.toBeNull()
    expect(r!.deslocadas).toBe(3) // índices 2, 3 e 4 (o 4 nem existe mais no AS atual)
    expect(r!.ausentes).toBe(1)
    const m = mapaPorChave(r!.assinatura.chaves, atual.chaves)
    expect(remapearId('pf:3', m).id).toBe('pf:2') // era a aula C, hoje no índice 2
    expect(remapearId('pf:4', m).id).toBe('pf:3')
    expect(remapearId('pf:2', m).tipo).toBe('orfa') // o documento removido vira órfão (nunca "vira" outra aula)
  })
  it('sem diferença contra o AS atual → null (nada a remapear)', () => {
    expect(assinaturaPorEvidencia([ev('pf:0', 'd:A'), ev('pf:1', 'd:B')], ['pf:0', 'pf:1'], atual)).toBeNull()
  })
  it('índice da grade sem evidência → null (cobertura incompleta)', () => {
    expect(assinaturaPorEvidencia([ev('pf:3', 'd:C')], ['pf:3', 'pf:4'], atual)).toBeNull()
  })
  it('duas chaves para o mesmo índice → null (evidência inconsistente)', () => {
    expect(assinaturaPorEvidencia([ev('pf:1', 'd:B'), ev('fl:1', 'd:Z')], ['pf:1'], atual)).toBeNull()
  })
  it('muitos documentos ausentes do AS atual → null (evidência suspeita)', () => {
    const evid = [ev('pf:0', 'd:Q1'), ev('pf:1', 'd:Q2'), ev('pf:2', 'd:Q3'), ev('pf:3', 'd:C')]
    expect(assinaturaPorEvidencia(evid, ['pf:0', 'pf:1', 'pf:2', 'pf:3'], atual)).toBeNull()
  })
  it('usa também pp/rf/rq/qu como evidência do índice', () => {
    const r = assinaturaPorEvidencia([ev('pp:3:1', 'd:C'), ev('qu:4:hist:1', 'd:D'), ev('pf:2', 'd:X')], ['pp:3:1', 'qu:4:hist:1', 'pf:2'], atual)
    expect(r).not.toBeNull()
    expect(r!.assinatura.chaves[3]).toBe('d:C')
  })
})
