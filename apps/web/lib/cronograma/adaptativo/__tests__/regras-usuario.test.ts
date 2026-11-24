import { describe, it, expect } from 'vitest'
import { REGRAS_PADRAO, hashRegras, normalizarRegras, type RegrasMotor } from '../regras'
import { diaSemanaISO } from '../restricoes'
import { CATALOGO, compilarRegrasUsuario, extrairRegras, negar, validarAcao } from '../regras-usuario'
import { overlayVazio, type AcaoUsuario, type Comparacao, type OverlayFluxo, type NoUsuario } from '../../../admin/fluxo/overlay'
import * as M30 from '../motor30'
import dados from '../catalogo-html.json'
import type { Cfg28, AulaAS, ItemLP, Plano } from '../motor28'

const CAT = dados as unknown as { aulas: Array<string[] | null>; ordem: number[]; ordemLP: number[]; legprocs: Array<{ disc: string; lei?: string; texto?: string }> }
const AS = CAT.aulas.map((a) => (a ? [...a] : ['', '', '', 0, '', ''])) as unknown as AulaAS[]
const LP = CAT.ordemLP.map((i) => ({ id: 'lp:1:' + i, disc: CAT.legprocs[i].disc, lei: CAT.legprocs[i].lei || '', texto: CAT.legprocs[i].texto || '' })) as unknown as ItemLP[]
const ESS9 = ['Direito Administrativo', 'Direito Constitucional', 'Direito Civil', 'Direito Financeiro', 'Processo Civil', 'Direito Tributário', 'Direito Ambiental', 'Direito do Trabalho', 'Processo do Trabalho']
const CFG = { start: '2026-01-05', horas: [4, 4, 4, 4, 4, 0, 0], discs: ESS9, metas: { pf: true, fl: true, qu: true, lp: true }, arranjo: 'pdf', revisao: { ativa: true, cada: 8 } } as unknown as Cfg28
const gerar = (regras?: RegrasMotor) => M30.gerarPlano(JSON.parse(JSON.stringify(CFG)), AS, LP, {}, null, { ordem: CAT.ordem, hoje: '2026-01-05', ...(regras ? { regras } : {}) })

const cmp = (variavel: string, op: Comparacao['op'], valor: Array<number | string>): Comparacao => ({ variavel, op, valor })
const cond = (id: string, ou: Comparacao[][], diagrama = 'd'): NoUsuario => ({ id, diagrama, tipo: 'condicao', titulo: `C ${id}`, descricao: '', x: 0, y: 0, condicao: { ou } })
const acao = (id: string, a: AcaoUsuario, diagrama = 'd'): NoUsuario => ({ id, diagrama, tipo: 'acao', titulo: `A ${id}`, descricao: '', x: 0, y: 0, acao: a })
const ov = (nos: NoUsuario[], arestas: Array<[string, string, string?]> = []): OverlayFluxo => ({ ...overlayVazio(), nos, arestas: arestas.map(([de, para, rotulo], k) => ({ id: `e${k}`, diagrama: 'd', de, para, ...(rotulo ? { rotulo } : {}) })) })

describe('regras do usuário: overlay vazio não altera nada', () => {
  it('devolve a MESMA referência e o mesmo hash', () => {
    const c = compilarRegrasUsuario(REGRAS_PADRAO, overlayVazio())
    expect(c.regras).toBe(REGRAS_PADRAO)
    expect(c.aplicadas).toBe(0)
    expect(hashRegras(c.regras)).toBe(hashRegras(REGRAS_PADRAO))
  })
  it('só anotações (etapa) e ação informativa não mudam o motor', () => {
    const o = ov([{ id: 'u.1', diagrama: 'd', tipo: 'etapa', titulo: 'x', descricao: '', x: 0, y: 0 }, acao('u.a', { tipo: 'aviso', texto: 'olá' })])
    const c = compilarRegrasUsuario(REGRAS_PADRAO, o)
    expect(c.regras).toBe(REGRAS_PADRAO)
    expect(c.diagnosticos.join(' ')).toMatch(/olá/)
  })
  it('geração do motor com regras compiladas de overlay vazio == sem regras', () => {
    expect(gerar(compilarRegrasUsuario(REGRAS_PADRAO, overlayVazio()).regras)).toEqual(gerar())
  })
})

describe('regras do usuário: condições (E/OU/não)', () => {
  it('resolve grupos E/OU e a negação pelo ramo "não"', () => {
    const o = ov([cond('u.c1', [[cmp('dia_semana', 'em', [5, 6])]]), acao('u.a1', { tipo: 'bloquear', tipoA: 'qu' })], [['u.c1', 'u.a1']])
    expect(extrairRegras(o).regras[0].dnf).toEqual([[cmp('dia_semana', 'em', [5, 6])]])
    const o2 = ov([cond('u.c1', [[cmp('dia_semana', 'em', [5, 6])]]), acao('u.a1', { tipo: 'bloquear', tipoA: 'qu' })], [['u.c1', 'u.a1', 'não']])
    expect(extrairRegras(o2).regras[0].dnf).toEqual([[cmp('dia_semana', 'fora_de', [5, 6])]])
  })
  it('condições encadeadas viram E; ação sem condição vale sempre (com aviso)', () => {
    const o = ov([cond('u.c1', [[cmp('faixa', 'igual', [1])]]), cond('u.c2', [[cmp('dia_semana', 'igual', [0])]]), acao('u.a1', { tipo: 'bloquear', tipoA: 'fl' })], [['u.c1', 'u.c2'], ['u.c2', 'u.a1']])
    expect(extrairRegras(o).regras[0].dnf).toEqual([[cmp('dia_semana', 'igual', [0]), cmp('faixa', 'igual', [1])]])
    const sem = compilarRegrasUsuario(REGRAS_PADRAO, ov([acao('u.a', { tipo: 'limitar_por_dia', tipoA: 'qu', valor: 1 })]))
    expect(sem.avisos.join(' ')).toMatch(/SEMPRE/)
  })
  it('negar é De Morgan', () => {
    expect(negar([[cmp('faixa', 'igual', [1]), cmp('dia_semana', 'igual', [0])]])).toEqual([[cmp('faixa', 'diferente', [1])], [cmp('dia_semana', 'diferente', [0])]])
    expect(negar([[]])).toEqual([])
    expect(negar([])).toEqual([[]])
  })
  it('rejeita variáveis sem ponto de extensão seguro e operadores inválidos', () => {
    const base = (v: Comparacao) => compilarRegrasUsuario(REGRAS_PADRAO, ov([cond('u.c', [[v]]), acao('u.a', { tipo: 'bloquear', tipoA: 'qu' })], [['u.c', 'u.a']]))
    for (const v of [cmp('horas_dia', 'maior', [3]), cmp('semanas_ate_prova', 'menor', [4]), cmp('xyz', 'igual', [1]), cmp('tipo_meta', 'maior', ['pf']), cmp('faixa', 'igual', [9])]) {
      const c = base(v)
      expect(c.erros.length).toBeGreaterThan(0)
      expect(c.regras).toBe(REGRAS_PADRAO)
    }
  })
  it('condição que nunca é verdadeira não tem efeito', () => {
    const c = compilarRegrasUsuario(REGRAS_PADRAO, ov([cond('u.c', [[cmp('faixa', 'igual', [1]), cmp('faixa', 'igual', [2])]]), acao('u.a', { tipo: 'bloquear', tipoA: 'qu' })], [['u.c', 'u.a']]))
    expect(c.regras).toBe(REGRAS_PADRAO)
    expect(c.avisos.join(' ')).toMatch(/nunca/)
  })
})

describe('regras do usuário: catálogo de ações', () => {
  const comC = (c: Comparacao[][], a: AcaoUsuario) => compilarRegrasUsuario(REGRAS_PADRAO, ov([cond('u.c', c), acao('u.a', a)], [['u.c', 'u.a']]))
  it('bloquear tipo em dia da semana: restrição max 0 com filtro de dia', () => {
    const c = comC([[cmp('dia_semana', 'igual', [0])]], { tipo: 'bloquear', tipoA: 'fl' })
    expect(c.regras.restricoes).toHaveLength(1)
    expect(c.regras.restricoes[0]).toMatchObject({ tipo: 'max_por_dia', tipoA: 'fl', valor: 0, dias: [0], faixas: [] })
    expect(c.regras.restricoes[0].id.startsWith('usr:')).toBe(true)
    expect(hashRegras(c.regras)).not.toBe(hashRegras(REGRAS_PADRAO))
  })
  it('limitar por dia, não no mesmo dia, dias seguidos, sobra e depois de', () => {
    expect(comC([[cmp('faixa', 'em', [1, 2])]], { tipo: 'limitar_por_dia', tipoA: 'qu', valor: 2 }).regras.restricoes[0]).toMatchObject({ tipo: 'max_por_dia', valor: 2, faixas: [1, 2] })
    expect(comC([[]], { tipo: 'nao_mesmo_dia', tipoA: 'pf', tipoB: 'qu' }).regras.restricoes[0]).toMatchObject({ tipo: 'nao_mesmo_dia', tipoA: 'pf', tipoB: 'qu' })
    expect(comC([[]], { tipo: 'nao_dias_seguidos', tipoA: 'fl' }).regras.restricoes[0].tipo).toBe('nao_dias_seguidos')
    expect(comC([[]], { tipo: 'so_na_sobra', tipoA: 'lp' }).regras.restricoes[0].tipo).toBe('so_na_sobra')
    expect(comC([[]], { tipo: 'depois_de', tipoA: 'qu', tipoB: 'fl', valor: 2 }).regras.restricoes[0]).toMatchObject({ tipo: 'depois_de', valor: 2 })
  })
  it('OU gera uma restrição por grupo', () => {
    const c = comC([[cmp('dia_semana', 'igual', [0])], [cmp('dia_semana', 'igual', [2])]], { tipo: 'bloquear', tipoA: 'fl' })
    expect(c.regras.restricoes.map((r) => r.dias)).toEqual([[0], [2]])
  })
  it('ajustar teto de PDFull e limite por dia por faixa', () => {
    const t = comC([[cmp('faixa', 'igual', [1])]], { tipo: 'ajustar_teto_pdf', valor: 2 })
    const alvo = REGRAS_PADRAO.faixas.filter((f) => f.modoQuestoes === 'revisao').length
    expect(t.regras.faixas.filter((f, i) => f.tetoPdf !== REGRAS_PADRAO.faixas[i].tetoPdf || (f.modoQuestoes === 'revisao' && f.tetoPdf === 2)).length).toBeGreaterThanOrEqual(alvo)
    expect(t.regras.faixas.filter((f) => f.modoQuestoes === 'revisao').every((f) => f.tetoPdf === 2)).toBe(true)
    expect(t.regras.faixas.filter((f) => f.modoQuestoes !== 'revisao').map((f) => f.tetoPdf)).toEqual(REGRAS_PADRAO.faixas.filter((f) => f.modoQuestoes !== 'revisao').map((f) => f.tetoPdf))
    const l = comC([[]], { tipo: 'ajustar_limite_dia', campo: 'questoes', valor: 3 })
    expect(l.regras.limitesDia.questoes).toBe(3)
    const lf = comC([[cmp('faixa', 'igual', [3])]], { tipo: 'ajustar_limite_dia', campo: 'revisoes', valor: 1 })
    expect(lf.regras.limitesDia.revisoes).toBe(REGRAS_PADRAO.limitesDia.revisoes)
    expect(lf.regras.faixas.some((f) => f.overrides.limitesDia?.revisoes === 1)).toBe(true)
  })
  it('teto e limite não aceitam dia da semana nem tipo na condição', () => {
    expect(comC([[cmp('dia_semana', 'igual', [0])]], { tipo: 'ajustar_teto_pdf', valor: 2 }).erros.join(' ')).toMatch(/dia da semana/)
    expect(comC([[cmp('tipo_meta', 'igual', ['pf'])]], { tipo: 'ajustar_limite_dia', campo: 'questoes', valor: 2 }).erros.join(' ')).toMatch(/tipo de meta/)
  })
  it('condição por tipo_meta filtra a ação pelo tipo dela', () => {
    expect(comC([[cmp('tipo_meta', 'igual', ['pf'])]], { tipo: 'bloquear', tipoA: 'qu' }).regras).toBe(REGRAS_PADRAO)
    expect(comC([[cmp('tipo_meta', 'igual', ['qu'])]], { tipo: 'limitar_por_dia', tipoA: 'qu', valor: 1 }).regras.restricoes).toHaveLength(1)
  })
  it('valida parâmetros e conflitos (PDFull bloqueado todo dia; dependência circular)', () => {
    expect(validarAcao({ tipo: 'limitar_por_dia', tipoA: 'qu', valor: 99 })).toMatch(/inteiro/)
    expect(validarAcao({ tipo: 'nao_mesmo_dia', tipoA: 'qu', tipoB: 'qu' })).toMatch(/diferentes/)
    expect(validarAcao({ tipo: 'foo' })).toMatch(/desconhecida/)
    const c = comC([[]], { tipo: 'bloquear', tipoA: 'pf' })
    expect(c.erros.join(' ')).toMatch(/impede qualquer leitura/)
    expect(c.regras).toBe(REGRAS_PADRAO)
    const circ = compilarRegrasUsuario(REGRAS_PADRAO, ov([acao('u.a', { tipo: 'depois_de', tipoA: 'qu', tipoB: 'fl', valor: 1 }), acao('u.b', { tipo: 'depois_de', tipoA: 'fl', tipoB: 'qu', valor: 1 })]))
    expect(circ.erros.join(' ')).toMatch(/circular/)
  })
  it('catálogo declara o que ficou de fora', () => {
    expect(CATALOGO.variaveis.filter((v) => !v.disponivel).map((v) => v.chave)).toEqual(['horas_dia', 'semanas_ate_prova'])
    expect(CATALOGO.naoSuportado.length).toBeGreaterThan(0)
  })
})

describe('regras do usuário: efeito real no motor', () => {
  it('bloquear PDFlash às segundas: nenhuma meta fl cai na segunda e o plano continua gerado', () => {
    const sem = (gerar() as unknown as { plano: Plano }).plano
    const compilado = compilarRegrasUsuario(REGRAS_PADRAO, ov([cond('u.c', [[cmp('dia_semana', 'igual', [0])]]), acao('u.a', { tipo: 'bloquear', tipoA: 'fl' })], [['u.c', 'u.a']])).regras
    const com = (gerar(compilado) as unknown as { plano: Plano }).plano
    const segundas = (p: Plano, pref: string) => Object.entries(p).filter(([id, [d]]) => id.startsWith(pref) && diaSemanaISO(d) === 0).length
    expect(segundas(sem, 'fl:')).toBeGreaterThan(0)
    expect(segundas(com, 'fl:')).toBe(0)
    expect(Object.keys(com).length).toBeGreaterThan(0)
  })
  it('normalização preserva dias e max_por_dia 0; regras salvas seguem clampadas', () => {
    const n = normalizarRegras({ restricoes: [{ id: 'x', tipo: 'max_por_dia', tipoA: 'fl', valor: 0, dias: [6, 0, 9] }] })
    expect(n.restricoes[0]).toMatchObject({ valor: 0, dias: [0, 6] })
    expect(normalizarRegras({ restricoes: [{ tipo: 'max_por_dia', tipoA: 'qu', valor: 99 }] }).restricoes[0].valor).toBe(6)
  })
})
