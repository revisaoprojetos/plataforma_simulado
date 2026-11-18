import { describe, it, expect } from 'vitest'
import { recalcularGrifo, normalizarTextoPdf, espinhaDoPdf, criarAncora, resolverAncora, ancoraDeTexto, ancoraDeRectsETexto, intervaloDosRects, rectsDoTrecho, paginaDoOffset, type PaginaPdf } from './pdf-texto-ancora'

// monta uma página: cada linha vira um item (largura proporcional ao nº de caracteres)
const pg = (n: number, linhas: string[]): PaginaPdf => ({
  pagina: n,
  itens: linhas.map((s, i) => ({ str: s, x0: 0.1, x1: 0.1 + s.length * 0.01, y0: 0.1 + i * 0.05, y1: 0.12 + i * 0.05 })),
})
const A = 'Art. 5º Todos são iguais perante a lei, sem distinção de qualquer natureza.'
const B = 'O prazo para contestar é de quinze dias úteis contados da citação.'
const C = 'A decisão será publicada no diário oficial eletrônico da justiça.'
const doc1 = [pg(1, [A, B]), pg(2, [C, 'Texto repetido que aparece duas vezes no documento inteiro.']), pg(3, ['Texto repetido que aparece duas vezes no documento inteiro.', 'Fim.'])]

describe('normalizarTextoPdf', () => {
  it('NFKC, hífen-macio, zero-width e espaços', () => {
    expect(normalizarTextoPdf('ﬁnal­  da \n vida​')).toBe('final da vida')
  })
  it('determinística (idempotente)', () => {
    const s = normalizarTextoPdf('  A  \t b ')
    expect(normalizarTextoPdf(s)).toBe(s)
  })
})

describe('espinhaDoPdf', () => {
  it('concatena itens com 1 espaço, mapeia páginas e ignora itens vazios', () => {
    const e = espinhaDoPdf([pg(1, ['aa', '  ', 'bb']), pg(2, ['cc'])])
    expect(e.texto).toBe('aa bb cc')
    expect(e.paginas).toEqual([{ pagina: 1, ini: 0, fim: 5 }, { pagina: 2, ini: 6, fim: 8 }])
    expect(paginaDoOffset(e, 6)).toBe(2)
  })
})

describe('criarAncora / resolverAncora', () => {
  const e = espinhaDoPdf(doc1)
  const ini = e.texto.indexOf('prazo para contestar'), fim = ini + 'prazo para contestar'.length
  const anc = criarAncora(e, ini, fim)!
  it('cria exact/prefix/suffix/offsets', () => {
    expect(anc.exact).toBe('prazo para contestar')
    expect(anc.prefix.endsWith('O ')).toBe(true)
    expect(anc.suffix.startsWith(' é de quinze')).toBe(true)
    expect(anc.char_inicio).toBe(ini)
  })
  it('resolve na MESMA espinha (confiança alta, mesma posição)', () => {
    const r = resolverAncora(e, anc)!
    expect([r.inicio, r.fim, r.pagina]).toEqual([ini, fim, 1])
    expect(r.confianca).toBeGreaterThanOrEqual(0.9)
  })
  it('versão nova com REPAGINAÇÃO (texto empurrado p/ outra página e outro offset)', () => {
    const nova = espinhaDoPdf([pg(1, ['Capa nova da edição atualizada, com sumário e apresentação.']), pg(2, [A]), pg(3, ['Parágrafo novo inserido antes.', B]), pg(4, [C])])
    const r = resolverAncora(nova, anc)!
    expect(r.pagina).toBe(3)
    expect(nova.texto.slice(r.inicio, r.fim)).toBe('prazo para contestar')
    expect(r.inicio).not.toBe(anc.char_inicio)
    expect(r.confianca).toBeGreaterThanOrEqual(0.7)
  })
  it('espaçamento diferente entre itens (palavra partida) ainda resolve', () => {
    const nova = espinhaDoPdf([pg(1, [A, 'O pra', 'zo para cont', 'estar é de quinze dias úteis contados da citação.'])])
    const a2 = { ...anc, exact: 'prazo para contestar' }
    const r = resolverAncora(nova, a2)!
    expect(r.metodo).toBe('unica') // chave compacta ignora os espaços espúrios entre fragmentos
    expect(nova.texto.slice(r.inicio, r.fim).replace(/ /g, '')).toBe('prazoparacontestar')
  })
  it('texto removido → null (não adivinha)', () => {
    const nova = espinhaDoPdf([pg(1, [A, 'O prazo foi alterado para vinte dias.'])])
    expect(resolverAncora(nova, anc)).toBeNull()
  })
  it('texto REPETIDO: desempata por prefix/suffix', () => {
    const dup = espinhaDoPdf([pg(1, ['Alfa. O recurso deve ser interposto em cinco dias. Beta.']), pg(2, ['Gama. O recurso deve ser interposto em cinco dias. Delta.'])])
    const i2 = dup.texto.lastIndexOf('O recurso deve ser interposto em cinco dias')
    const a = criarAncora(dup, i2, i2 + 'O recurso deve ser interposto em cinco dias'.length)!
    // versão nova: páginas trocadas de lugar e texto de contexto preservado
    const nova = espinhaDoPdf([pg(1, ['Gama. O recurso deve ser interposto em cinco dias. Delta.']), pg(2, ['Alfa. O recurso deve ser interposto em cinco dias. Beta.'])])
    const r = resolverAncora(nova, a)!
    expect(nova.texto.slice(Math.max(0, r.inicio - 6), r.inicio)).toContain('Gama')
    expect(r.pagina).toBe(1)
  })
  it('texto repetido SEM contexto distintivo → ambíguo (null) quando a posição mudou', () => {
    const a = { exact: 'Texto repetido que aparece duas vezes no documento inteiro.', prefix: '', suffix: '', char_inicio: 5, char_fim: 60 }
    expect(resolverAncora(e, a)).toBeNull()
  })
  it('fallback agressivo: acento/pontuação diferentes', () => {
    const nova = espinhaDoPdf([pg(1, ['O prazo, para contestar; é de quinze dias.'])])
    const a = { exact: 'prazo para contestar', prefix: 'O ', suffix: ' é de quinze', char_inicio: 2, char_fim: 22 }
    const r = resolverAncora(nova, a)
    expect(r?.metodo).toBe('agressiva')
  })
  it('trecho curto demais sem posição idêntica → null', () => {
    const a = { exact: 'lei', prefix: 'perante a ', suffix: ', sem distinção', char_inicio: 999, char_fim: 1002 }
    expect(resolverAncora(e, a)).toBeNull()
  })
})

describe('ancoraDeTexto (backfill por texto + página)', () => {
  const e = espinhaDoPdf(doc1)
  it('único → ancora', () => {
    const r = ancoraDeTexto(e, 'prazo para contestar é de quinze', 1)!
    expect(r.resolucao.pagina).toBe(1)
    expect(r.ancora.exact).toBe('prazo para contestar é de quinze')
  })
  it('repetido em 2 páginas: só aceita se 1 estiver na página gravada', () => {
    const t = 'Texto repetido que aparece duas vezes no documento inteiro.'
    expect(ancoraDeTexto(e, t, null)).toBeNull()
    expect(ancoraDeTexto(e, t, 2)?.resolucao.pagina).toBe(2)
    expect(ancoraDeTexto(e, t, 3)?.resolucao.pagina).toBe(3)
  })
  it('curto/inexistente → null', () => {
    expect(ancoraDeTexto(e, 'prazo', 1)).toBeNull()
    expect(ancoraDeTexto(e, 'texto que nao existe em lugar nenhum', 1)).toBeNull()
  })
})

describe('geometria ↔ texto', () => {
  const e = espinhaDoPdf(doc1)
  it('rects → intervalo → âncora (geometria como origem) e volta a rects', () => {
    // seleciona "contestar é de quinze" na linha B (página 1, linha 2): item B começa em x=0.1, 0.01/char
    const iniB = B.indexOf('contestar'), fimB = B.indexOf(' dias')
    const rects = [{ x0: 0.1 + iniB * 0.01, x1: 0.1 + fimB * 0.01, y0: 0.15, y1: 0.17 }]
    const iv = intervaloDosRects(e, 1, rects)!
    expect(e.texto.slice(iv.inicio, iv.fim)).toBe('contestar é de quinze')
    const r = ancoraDeRectsETexto(e, 1, rects, 'contestar é de quinze')!
    expect(r.confere).toBe(true)
    const back = rectsDoTrecho(e, iv.inicio, iv.fim)
    expect(back).toHaveLength(1)
    expect(back[0].rects[0].x0).toBeCloseTo(rects[0].x0, 2)
  })
  it('geometria imprecisa nas pontas é refinada pelo texto', () => {
    const iniB = B.indexOf('contestar') - 2, fimB = B.indexOf(' dias') + 2
    const rects = [{ x0: 0.1 + iniB * 0.01, x1: 0.1 + fimB * 0.01, y0: 0.15, y1: 0.17 }]
    const r = ancoraDeRectsETexto(e, 1, rects, 'contestar é de quinze')!
    expect(r.ancora.exact).toBe('contestar é de quinze')
  })
  it('texto do grifo não bate com o que está sob os rects → confere=false (não grava âncora)', () => {
    const rects = [{ x0: 0.1, x1: 0.3, y0: 0.15, y1: 0.17 }]
    expect(ancoraDeRectsETexto(e, 1, rects, 'algo completamente diferente do trecho')!.confere).toBe(false)
  })
  it('grifo multi-linha gera 1 rect por linha', () => {
    const iv = { inicio: e.texto.indexOf('Todos'), fim: e.texto.indexOf('citação') }
    expect(rectsDoTrecho(e, iv.inicio, iv.fim)[0].rects.length).toBe(2)
  })
})

describe('recalcularGrifo (versão nova, repaginada)', () => {
  const antiga = espinhaDoPdf(doc1)
  const nova = espinhaDoPdf([pg(1, ['Capa nova.']), pg(2, ['Prefácio inserido.', A]), pg(3, [B, C])])
  it('com âncora: recalcula página e rects', () => {
    const ini = antiga.texto.indexOf('quinze dias'), a = criarAncora(antiga, ini, ini + 11)!
    const r = recalcularGrifo(nova, { texto: 'quinze dias', pagina: 1, ancora: a })!
    expect(r.pagina).toBe(3)
    expect(nova.texto.slice(r.ancora.char_inicio, r.ancora.char_fim)).toBe('quinze dias')
    expect(r.rects.length).toBe(1)
  })
  it('legado (sem âncora): usa texto + página gravada', () => {
    const r = recalcularGrifo(nova, { texto: 'diário oficial eletrônico', pagina: 2, ancora: null })!
    expect(r.pagina).toBe(3)
    expect(r.metodo).toBe('texto-pagina')
  })
  it('texto removido → null', () => {
    expect(recalcularGrifo(nova, { texto: 'prazo de vinte e um dias corridos', pagina: 1, ancora: null })).toBeNull()
  })
  it('texto de grifo multi-página: fica o pedaço da página gravada', () => {
    const e2 = espinhaDoPdf([pg(1, ['Final da primeira parte do texto longo']), pg(2, ['segunda parte do texto longo continua aqui'])])
    const r = recalcularGrifo(e2, { texto: 'parte do texto longo segunda parte do texto longo', pagina: 2, ancora: null })!
    expect(r.pagina).toBe(2)
    expect(r.ancora.exact).toBe('segunda parte do texto longo')
  })
})

import { hashAncora, metadadosDoTrecho, reconciliarGrifos, agruparPorHash } from './pdf-texto-ancora'

describe('hashAncora (identidade estável)', () => {
  it('mesma âncora em versões diferentes (repaginada, outro offset) → mesmo hash', () => {
    const e1 = espinhaDoPdf(doc1)
    const i = e1.texto.indexOf('prazo para contestar')
    const a1 = criarAncora(e1, i, i + 20)!
    const e2 = espinhaDoPdf([pg(1, ['Capa nova.']), pg(2, [A]), pg(3, [B, C])])
    const j = e2.texto.indexOf('prazo para contestar')
    const a2 = criarAncora(e2, j, j + 20)!
    expect(a1.char_inicio).not.toBe(a2.char_inicio)
    expect(hashAncora(a1)).toBe(hashAncora(a2))
  })
  it('espaçamento/caixa/acento/pontuação não mudam; trecho ou contexto diferente muda', () => {
    const base = { exact: 'prazo para contestar', prefix: 'O ', suffix: ' é de quinze' }
    expect(hashAncora({ ...base, exact: 'Prazo  para, contestar' })).toBe(hashAncora(base))
    expect(hashAncora({ ...base, exact: 'prazo para recorrer' })).not.toBe(hashAncora(base))
    expect(hashAncora({ ...base, suffix: ' é de dez dias' })).not.toBe(hashAncora(base))
  })
  it('agruparPorHash junta duplicatas (mesmo grifo)', () => {
    const m = agruparPorHash([{ id: '1', ancora_hash: 'x' }, { id: '2', ancora_hash: 'x' }, { id: '3', ancora_hash: 'y' }, { id: '4' }])
    expect(m.get('x')!.map((g) => g.id)).toEqual(['1', '2'])
    expect(m.size).toBe(2)
  })
})

describe('metadadosDoTrecho (rótulo jurídico)', () => {
  const it2 = (str: string, y: number, h = 0.02) => ({ str, x0: 0.1, x1: 0.1 + str.length * 0.01, y0: y, y1: y + h })
  const e = espinhaDoPdf([{ pagina: 1, itens: [
    it2('CAPÍTULO I - DOS DIREITOS FUNDAMENTAIS', 0.05, 0.04),
    it2('Art. 5º Todos são iguais perante a lei, sem distinção de qualquer natureza.', 0.12),
    it2('§ 2º Os direitos e garantias expressos não excluem outros decorrentes.', 0.15),
    it2('Texto comum sem rótulo nenhum aqui nesta linha de exemplo.', 0.18),
    it2('A Súmula Vinculante 11 do STF restringe o uso de algemas em casos específicos.', 0.21),
    it2('mais uma linha comum para a mediana de altura.', 0.24), it2('outra linha comum para a mediana de altura.', 0.27),
  ] }])
  const meta = (t: string) => { const i = e.texto.indexOf(t); return metadadosDoTrecho(e, i, i + t.length) }
  it('Art. 5º + título acima', () => {
    const m = meta('iguais perante a lei')
    expect(m.rotulo).toBe('CAPÍTULO I - DOS DIREITOS FUNDAMENTAIS › Art. 5º')
    expect(m.tipo_trecho).toBe('artigo')
    expect(m.contexto).toContain('iguais perante a lei')
  })
  it('§ 2º', () => { const m = meta('garantias expressos'); expect(m.rotulo).toMatch(/§ 2º$/); expect(m.tipo_trecho).toBe('paragrafo') })
  it('Súmula Vinculante', () => { const m = meta('restringe o uso de algemas'); expect(m.rotulo).toMatch(/Súmula Vinculante 11/); expect(m.tipo_trecho).toBe('sumula') })
  it('o próprio título → tipo titulo', () => { expect(meta('DOS DIREITOS FUNDAMENTAIS').tipo_trecho).toBe('titulo') })
})

describe('reconciliarGrifos (modo recuperação)', () => {
  const e1 = espinhaDoPdf(doc1)
  const i = e1.texto.indexOf('prazo para contestar')
  const a = criarAncora(e1, i, i + 20)!
  const nova = espinhaDoPdf([pg(1, ['Capa nova.']), pg(2, [A]), pg(3, [B, C]), pg(4, ['Texto repetido que aparece duas vezes no documento inteiro.']), pg(5, ['Texto repetido que aparece duas vezes no documento inteiro.'])])
  it('resolve por hash após repaginação; ambíguo; ausente; legado por texto+página', () => {
    const r = reconciliarGrifos(nova, [
      { id: 'h', texto: a.exact, pagina: 1, ancora: { ...a, ancora_hash: hashAncora(a) } },
      { id: 'amb', texto: 'Texto repetido que aparece duas vezes no documento inteiro.', pagina: 9, ancora: null },
      { id: 'aus', texto: 'trecho que foi removido por completo da versão', pagina: 1, ancora: null },
      { id: 'leg', texto: 'diário oficial eletrônico', pagina: 2, ancora: null },
    ])
    const por = Object.fromEntries(r.map((x) => [x.id, x]))
    expect(por.h.estado).toBe('resolvido'); expect(por.h.metodo).toBe('hash'); expect(por.h.pagina).toBe(3)
    expect(por.amb.estado).toBe('ambiguo')
    expect(por.aus.estado).toBe('ausente')
    expect(por.leg.estado).toBe('resolvido'); expect(por.leg.pagina).toBe(3)
  })
})
