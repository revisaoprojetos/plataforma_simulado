import { describe, it, expect } from 'vitest'
import {
  match,
  validarRegra,
  classificarStatus,
  calcularInicio,
  calcularFim,
  estadoInicialGrant,
  temAcessoEfetivo,
  normalizarStatus,
} from '../motor'
import type { PedidoNormalizado, RegraFiltros, CriterioValor } from '../tipos'

// ── helpers ───────────────────────────────────────────────────────────────────
function pedido(p: Partial<PedidoNormalizado>): PedidoNormalizado {
  return { plataforma: 'hotmart', produtoId: null, produtoNome: null, ofertaId: null, ofertaNome: null, dataCompra: null, ...p }
}
function filtros(f: Partial<RegraFiltros>): RegraFiltros {
  return { plataformas: [], produtos: [], ofertas: [], periodoDe: null, periodoAte: null, ...f }
}
const id = (v: string): CriterioValor => ({ tipo: 'id', valor: v })
const nome = (v: string, modo: CriterioValor['modo'] = 'igual'): CriterioValor => ({ tipo: 'nome', valor: v, modo })

// ── §6.1 matriz de casamento (tabela do spec) ──────────────────────────────────
describe('match — matriz §6.1', () => {
  it('plataforma=hotmart + oferta_id=O1 × hotmart/P1/O1 → casa', () => {
    const r = match(pedido({ produtoId: 'P1', ofertaId: 'O1' }), filtros({ plataformas: ['hotmart'], ofertas: [id('O1')] }))
    expect(r.casou).toBe(true)
  })
  it('plataforma=hotmart + oferta_id=O1 × hotmart/P1/O2 → NÃO casa (produto igual não basta)', () => {
    const r = match(pedido({ produtoId: 'P1', ofertaId: 'O2' }), filtros({ plataformas: ['hotmart'], ofertas: [id('O1')] }))
    expect(r.casou).toBe(false)
    expect(r.motivo).toContain('oferta')
  })
  it('plataforma=hotmart + oferta_id=O1 × kiwify/O1 → NÃO casa (mesmo ID, outra plataforma)', () => {
    const r = match(pedido({ plataforma: 'kiwify', ofertaId: 'O1' }), filtros({ plataformas: ['hotmart'], ofertas: [id('O1')] }))
    expect(r.casou).toBe(false)
    expect(r.motivo).toContain('plataforma')
  })
  it('plataforma=hotmart + oferta_id=O1 × hotmart/sem oferta → NÃO casa', () => {
    const r = match(pedido({ ofertaId: null }), filtros({ plataformas: ['hotmart'], ofertas: [id('O1')] }))
    expect(r.casou).toBe(false)
  })
  it('produto_id=P1 + período jan–mar × compra em abril → NÃO casa', () => {
    const r = match(
      pedido({ produtoId: 'P1', dataCompra: '2026-04-10T12:00:00-03:00' }),
      filtros({ produtos: [id('P1')], periodoDe: '2026-01-01', periodoAte: '2026-03-31' }),
    )
    expect(r.casou).toBe(false)
    expect(r.motivo).toContain('periodo')
  })
  it('produto nome contém "curso" (qualquer plataforma) × "Curso X" → casa', () => {
    const r = match(pedido({ plataforma: 'kiwify', produtoNome: 'Curso X' }), filtros({ produtos: [nome('curso', 'contem')] }))
    expect(r.casou).toBe(true)
  })
})

// ── §6.1 "só uma dimensão casa, resto falha → não libera" (caso de teste 16) ─────
describe('match — AND estrito: nenhuma dimensão isolada libera', () => {
  const f = filtros({ plataformas: ['hotmart'], produtos: [id('P1')], ofertas: [id('O1')], periodoDe: '2026-01-01', periodoAte: '2026-12-31' })
  const base = { produtoId: 'P1', ofertaId: 'O1', dataCompra: '2026-06-01T10:00:00-03:00' }
  it('todas casam → casa', () => expect(match(pedido(base), f).casou).toBe(true))
  it('só plataforma falha', () => expect(match(pedido({ ...base, plataforma: 'kiwify' }), f).casou).toBe(false))
  it('só produto falha', () => expect(match(pedido({ ...base, produtoId: 'PX' }), f).casou).toBe(false))
  it('só oferta falha', () => expect(match(pedido({ ...base, ofertaId: 'OX' }), f).casou).toBe(false))
  it('só período falha', () => expect(match(pedido({ ...base, dataCompra: '2027-01-01T10:00:00-03:00' }), f).casou).toBe(false))
})

// ── §6.1 sem fallback (caso 18) ─────────────────────────────────────────────────
describe('match — sem fallback id→nome', () => {
  it('regra pede oferta_id; pedido sem oferta_id mas com nome igual → NÃO casa', () => {
    const r = match(
      pedido({ ofertaId: null, ofertaNome: 'Plano Premium' }),
      filtros({ plataformas: ['hotmart'], ofertas: [id('Plano Premium')] }),
    )
    expect(r.casou).toBe(false)
  })
  it('critério nome compara só com o nome, ignora o id', () => {
    const r = match(pedido({ produtoId: 'abc', produtoNome: 'Direito Penal' }), filtros({ produtos: [nome('direito penal')] }))
    expect(r.casou).toBe(true)
  })
})

// ── modos de nome (caso 3) ──────────────────────────────────────────────────────
describe('match — modos de nome (sem acento/caixa)', () => {
  const p = pedido({ produtoNome: 'Direito Administrativo Avançado' })
  it('igual exige igualdade total', () => {
    expect(match(p, filtros({ produtos: [nome('direito administrativo avancado', 'igual')] })).casou).toBe(true)
    expect(match(p, filtros({ produtos: [nome('direito', 'igual')] })).casou).toBe(false)
  })
  it('contém', () => expect(match(p, filtros({ produtos: [nome('ADMINISTRATIVO', 'contem')] })).casou).toBe(true))
  it('começa com', () => {
    expect(match(p, filtros({ produtos: [nome('direito', 'comeca')] })).casou).toBe(true)
    expect(match(p, filtros({ produtos: [nome('avancado', 'comeca')] })).casou).toBe(false)
  })
})

// ── OR dentro da dimensão ───────────────────────────────────────────────────────
describe('match — OR entre vários valores da mesma dimensão', () => {
  it('basta 1 id casar', () => {
    const r = match(pedido({ produtoId: 'P2' }), filtros({ produtos: [id('P1'), id('P2'), id('P3')] }))
    expect(r.casou).toBe(true)
  })
})

// ── período inclusivo nas bordas (BRT) ──────────────────────────────────────────
describe('match — período inclusivo em BRT', () => {
  const f = filtros({ periodoDe: '2026-01-01', periodoAte: '2026-01-31' })
  it('início do dia 01 (00:00 BRT) casa', () => expect(match(pedido({ dataCompra: '2026-01-01T00:00:00-03:00' }), f).casou).toBe(true))
  it('fim do dia 31 (23:59 BRT) casa', () => expect(match(pedido({ dataCompra: '2026-01-31T23:59:00-03:00' }), f).casou).toBe(true))
  it('01 às 02:00 UTC = 31/12 23:00 BRT → NÃO casa', () => expect(match(pedido({ dataCompra: '2026-01-01T02:00:00Z' }), f).casou).toBe(false))
  it('período configurado + pedido sem data → NÃO casa', () => expect(match(pedido({ dataCompra: null }), f).casou).toBe(false))
})

// ── auditoria por dimensão (caso 21) ────────────────────────────────────────────
describe('match — avaliação por dimensão para auditoria', () => {
  it('registra configurada/casou/detalhe por dimensão', () => {
    const r = match(pedido({ plataforma: 'hotmart', ofertaId: 'O2' }), filtros({ plataformas: ['hotmart'], ofertas: [id('O1')] }))
    const plat = r.dimensoes.find((d) => d.dimensao === 'plataforma')!
    const of = r.dimensoes.find((d) => d.dimensao === 'oferta')!
    const prod = r.dimensoes.find((d) => d.dimensao === 'produto')!
    expect(plat).toMatchObject({ configurada: true, casou: true })
    expect(of).toMatchObject({ configurada: true, casou: false })
    expect(prod).toMatchObject({ configurada: false, casou: true }) // curinga
    expect(of.detalhe).toContain('FALHOU')
  })
})

// ── §12 validação de cadastro (casos 17) ────────────────────────────────────────
describe('validarRegra', () => {
  const inicio = { tipo: 'immediate' as const }
  const fim = { tipo: 'lifetime' as const }
  it('id sem plataforma → recusa', () => {
    const v = validarRegra({ filtros: filtros({ produtos: [id('P1')] }), inicio, fim })
    expect(v.ok).toBe(false)
    expect(v.erros.join(' ')).toContain('plataforma')
  })
  it('id com plataforma → ok', () => {
    const v = validarRegra({ filtros: filtros({ plataformas: ['hotmart'], produtos: [id('P1')] }), inicio, fim })
    expect(v.ok).toBe(true)
  })
  it('nome pode valer para qualquer plataforma', () => {
    const v = validarRegra({ filtros: filtros({ produtos: [nome('curso', 'contem')] }), inicio, fim })
    expect(v.ok).toBe(true)
  })
  it('regra sem produto/oferta e sem aplicarATudo → recusa', () => {
    const v = validarRegra({ filtros: filtros({ plataformas: ['hotmart'] }), inicio, fim })
    expect(v.ok).toBe(false)
  })
  it('regra totalmente aberta com aplicarATudo → ok', () => {
    const v = validarRegra({ filtros: filtros({ aplicarATudo: true }), inicio, fim })
    expect(v.ok).toBe(true)
  })
  it('período invertido → recusa', () => {
    const v = validarRegra({ filtros: filtros({ produtos: [nome('x')], periodoDe: '2026-05-01', periodoAte: '2026-01-01' }), inicio, fim })
    expect(v.ok).toBe(false)
  })
  it('datas fixas incoerentes (fim anterior ao início) → recusa', () => {
    const v = validarRegra({
      filtros: filtros({ produtos: [nome('x')] }),
      inicio: { tipo: 'fixed_date', data: '2026-06-02' },
      fim: { tipo: 'fixed_date', data: '2026-06-01' },
    })
    expect(v.ok).toBe(false)
  })
  it('mesma data fixa (acesso de 1 dia: 00:00→23:59) → ok', () => {
    const v = validarRegra({
      filtros: filtros({ produtos: [nome('x')] }),
      inicio: { tipo: 'fixed_date', data: '2026-06-01' },
      fim: { tipo: 'fixed_date', data: '2026-06-01' },
    })
    expect(v.ok).toBe(true)
  })
})

// ── §5 classificação de status (caso 6) ─────────────────────────────────────────
describe('classificarStatus', () => {
  it('positivos liberam', () => {
    for (const s of ['paid', 'approved', 'Aprovado', 'COMPLETED', 'confirmed', 'active'])
      expect(classificarStatus(s).classificacao).toBe('positive')
  })
  it('negativos cancelam', () => {
    for (const s of ['refunded', 'chargeback', 'canceled', 'Cancelado', 'expired', 'refused'])
      expect(classificarStatus(s).classificacao).toBe('negative')
  })
  it('status desconhecido → neutral + mapeado:false', () => {
    const r = classificarStatus('waiting_payment')
    expect(r.classificacao).toBe('neutral')
    expect(r.mapeado).toBe(false)
  })
  it('normaliza espaços/hífens/acentos', () => {
    expect(normalizarStatus('Em Análise')).toBe('em_analise')
    expect(classificarStatus('past-due', { past_due: 'negative' }).classificacao).toBe('negative')
  })
  it('override do status_mappings tem precedência', () => {
    expect(classificarStatus('approved', { approved: 'neutral' }).classificacao).toBe('neutral')
  })
})

// ── §6.2/§6.3 cálculo de datas ──────────────────────────────────────────────────
describe('calcularInicio / calcularFim', () => {
  const agora = new Date('2026-06-15T12:00:00Z')
  const compra = '2026-06-10T12:00:00Z'
  it('immediate → agora', () => expect(calcularInicio({ tipo: 'immediate' }, compra, agora)).toBe(agora.toISOString()))
  it('after_days início = compra + N dias', () => {
    expect(calcularInicio({ tipo: 'after_days', dias: 7 }, compra, agora)).toBe('2026-06-17T12:00:00.000Z')
  })
  it('lifetime → fim null', () => expect(calcularFim({ tipo: 'lifetime' }, compra, agora)).toBeNull())
  it('fim after_days = compra + N dias', () => {
    expect(calcularFim({ tipo: 'after_days', dias: 30 }, compra, agora)).toBe('2026-07-10T12:00:00.000Z')
  })
  it('fim fixed_date → fim do dia BRT', () => {
    expect(calcularFim({ tipo: 'fixed_date', data: '2026-12-31' }, compra, agora)).toBe('2027-01-01T02:59:59.999Z')
  })
  it('sem data da compra → base = agora', () => {
    expect(calcularInicio({ tipo: 'after_days', dias: 1 }, null, agora)).toBe('2026-06-16T12:00:00.000Z')
  })
})

// ── §6.3 estado inicial do grant ────────────────────────────────────────────────
describe('estadoInicialGrant', () => {
  const agora = new Date('2026-06-15T12:00:00Z')
  it('futuro → scheduled', () => expect(estadoInicialGrant('2026-07-01T00:00:00Z', null, agora)).toBe('scheduled'))
  it('vencido → expired', () => expect(estadoInicialGrant('2026-01-01T00:00:00Z', '2026-02-01T00:00:00Z', agora)).toBe('expired'))
  it('vigente → active', () => expect(estadoInicialGrant('2026-06-01T00:00:00Z', '2026-12-01T00:00:00Z', agora)).toBe('active'))
})

// ── §7 acesso efetivo: união, maior prazo vence (casos 19/20) ───────────────────
describe('temAcessoEfetivo', () => {
  const agora = new Date('2026-06-15T12:00:00Z')
  it('nenhuma concessão → sem acesso', () => expect(temAcessoEfetivo([], agora)).toBe(false))
  it('uma ativa vigente → acesso', () => {
    expect(temAcessoEfetivo([{ status: 'active', startsAt: '2026-06-01T00:00:00Z', endsAt: '2026-12-01T00:00:00Z' }], agora)).toBe(true)
  })
  it('revogada não conta; outra ativa mantém (maior prazo vence)', () => {
    const grants = [
      { status: 'revoked', startsAt: '2026-06-01T00:00:00Z', endsAt: '2026-12-01T00:00:00Z' },
      { status: 'active', startsAt: '2026-06-01T00:00:00Z', endsAt: '2026-07-01T00:00:00Z' },
    ]
    expect(temAcessoEfetivo(grants, agora)).toBe(true)
  })
  it('scheduled (futuro) não dá acesso ainda', () => {
    expect(temAcessoEfetivo([{ status: 'active', startsAt: '2026-07-01T00:00:00Z', endsAt: null }], agora)).toBe(false)
  })
  it('vitalícia (endsAt null) dá acesso', () => {
    expect(temAcessoEfetivo([{ status: 'active', startsAt: '2026-01-01T00:00:00Z', endsAt: null }], agora)).toBe(true)
  })
})
