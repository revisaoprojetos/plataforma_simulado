import { describe, expect, it } from 'vitest'
import { condicoesFiltros, predicadoDim, sanearLista } from './questoes-sql'
import { estadoQDeParams, paramsDeEstadoQ, ESTADO_Q_PADRAO } from '@/lib/admin-revisao/biblioteca-questoes-tipos'

const U1 = '11111111-1111-4111-8111-111111111111'
const U2 = '22222222-2222-4222-8222-222222222222'
const mk = () => { const params: unknown[] = ['tenant']; return { params, add: (v: unknown) => { params.push(v); return `$${params.length}` } } }

describe('sanearLista', () => {
  it('descarta uuid/ano/whitelist inválidos', () => {
    expect(sanearLista('banca', `${U1}|lixo|${U2}`)).toEqual([U1, U2])
    expect(sanearLista('ano', '2024|24|abc|2023')).toEqual(['2024', '2023'])
    expect(sanearLista('status', 'publicada|x|rascunho')).toEqual(['publicada', 'rascunho'])
  })
})

describe('condicoesFiltros', () => {
  it('uma dimensão multi vira = any(array) parametrizado', () => {
    const { params, add } = mk()
    const w = condicoesFiltros({ banca: `${U1}|${U2}` }, add)
    expect(w).toEqual(['q.banca_id = any($2::uuid[])'])
    expect(params[1]).toEqual([U1, U2])
  })
  it('ignora as dimensões pedidas (faceta) e dimensões vazias', () => {
    const { add } = mk()
    expect(condicoesFiltros({ banca: U1, status: 'rascunho', ano: '' }, add, ['banca'])).toEqual(['q.status = any($2::text[])'])
  })
  it('seleção só com lixo vira false (nunca ignora o filtro)', () => {
    const { add } = mk()
    expect(condicoesFiltros({ banca: 'lixo' }, add)).toEqual(['false'])
  })
  it('assunto abrange sub-assuntos e etiqueta usa exists; tenant fica no $1', () => {
    const { add } = mk()
    expect(predicadoDim('assunto', [U1], add)).toContain('with recursive')
    expect(predicadoDim('etiqueta', [U1], add)).toContain('exists')
    expect(predicadoDim('assunto', [U1], add)).toContain('tenant_id = $1')
  })
})

describe('EstadoQ <-> params (multi)', () => {
  it('ida e volta preserva listas e remove valores inválidos', () => {
    const sp = new URLSearchParams({ banca: `${U1}|x`, status: 'publicada|rascunho', disc: U2, det: 'Tema A|Tema B' })
    const e = estadoQDeParams(sp)
    expect(e.banca).toBe(U1)
    expect(e.status).toBe('publicada|rascunho')
    const p = paramsDeEstadoQ(e)
    expect(p.get('det')).toBe('Tema A|Tema B')
    expect(estadoQDeParams(p)).toEqual(e)
    expect(paramsDeEstadoQ(ESTADO_Q_PADRAO).toString()).toBe('')
  })
})
