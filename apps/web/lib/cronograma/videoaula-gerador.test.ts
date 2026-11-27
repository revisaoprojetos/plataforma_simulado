import { describe, expect, it } from 'vitest'
import { materialDaMeta } from './conteudo-meta'
import { chaveSelecaoGerador, classificacaoSlugDoTipo, indexarSelecoes, type SelecaoGerador } from './selecao-gerador'
import { colunaVideoaula, ehTipoVideoaula, montarVideoaulas, selecaoVideoaulaDaMeta, temSelecaoVideoaula, videoaulasPorMeta } from './videoaula-gerador'
import { montarPayloadRevisaoIframe } from './revisao-iframe'

const conjuntos = [{ id: 'A', disciplina: 'Direito Administrativo', ordem: 0 }]
const sel = (aula: string, tipo: string, extra: Partial<SelecaoGerador> = {}): SelecaoGerador => ({
  metaChave: chaveSelecaoGerador('A', aula, tipo), documentoId: `doc-${aula}-${tipo}`, parteId: null, rotuloAluno: null, visivelAluno: true, ...extra,
})
const meta = (id: string, tipo: string, aula: string | null, disc = 'Direito Administrativo') => ({ id, tipo, disciplinas: [disc], aula })

describe('coluna Videoaula', () => {
  const cat = (ativo = true) => [{ id: 'c1', slug: 'videoaula', nome: 'Videoaula', cor: null, papel: 'apoio', ativo }, { id: 'c2', slug: 'pdfull', nome: 'PDFull', cor: null, papel: 'leitura', ativo: true }]
  it('existe só com a classificação ativa no tenant', () => {
    expect(colunaVideoaula(cat())).toMatchObject({ tipo: 'videoaula', classificacaoId: 'c1', classificacaoSlug: 'videoaula', papel: 'apoio' })
    expect(colunaVideoaula(cat(false))).toBeNull()
    expect(colunaVideoaula([])).toBeNull()
  })
  it('slug próprio não vira PDFull por engano (materialDaMeta) e é classificação do catálogo', () => {
    expect(materialDaMeta('videoaula')).toBeNull()
    expect(materialDaMeta('pdfull')).toBe('pdfull')
    expect(classificacaoSlugDoTipo('videoaula', new Set(['pdfull', 'videoaula']))).toBe('videoaula')
    expect(ehTipoVideoaula('videoaula')).toBe(true)
    expect(ehTipoVideoaula('pdfull')).toBe(false)
  })
})

describe('videoaulasPorMeta', () => {
  it('SEM seleção de videoaula: mapa vazio (comportamento de antes)', () => {
    const idx = indexarSelecoes([sel('1', 'pdfull')], conjuntos)
    expect(temSelecaoVideoaula(idx)).toBe(false)
    expect(videoaulasPorMeta([meta('m1', 'pdfull', '1')], idx).size).toBe(0)
    expect(videoaulasPorMeta([meta('m1', 'pdfull', '1')], new Map()).size).toBe(0)
  })
  it('a videoaula vai para UMA meta âncora da aula: PDFull antes de flash/questões; "01" = "1"', () => {
    const idx = indexarSelecoes([sel('01', 'videoaula', { documentoId: 'v1' })], conjuntos)
    const r = videoaulasPorMeta([meta('q', 'quest', '1'), meta('f', 'flash', '1'), meta('p', 'pdfull', '1'), meta('o', 'pdfull', '2')], idx)
    expect([...r.keys()]).toEqual(['p'])
    expect(r.get('p')?.documentoId).toBe('v1')
  })
  it('sem PDFull na aula cai na primeira meta (outro PDF de meta / questões)', () => {
    const idx = indexarSelecoes([sel('3', 'videoaula')], conjuntos)
    expect([...videoaulasPorMeta([meta('q', 'quest', '3'), meta('l', 'legproc', '3')], idx).keys()]).toEqual(['l'])
    expect([...videoaulasPorMeta([meta('q', 'quest', '3'), meta('x', 'quest', '3')], idx).keys()]).toEqual(['q'])
  })
  it('seleção oculta ao aluno, meta sem aula e outra disciplina não geram vídeo', () => {
    const idx = indexarSelecoes([sel('1', 'videoaula', { visivelAluno: false }), sel('2', 'videoaula')], conjuntos)
    expect(videoaulasPorMeta([meta('a', 'pdfull', '1'), meta('b', 'pdfull', null), meta('c', 'pdfull', '2', 'Direito Civil')], idx).size).toBe(0)
    expect(selecaoVideoaulaDaMeta(meta('d', 'pdfull', '2'), idx)?.documentoId).toBe('doc-2-videoaula')
  })
})

describe('montarVideoaulas', () => {
  const idx = indexarSelecoes([sel('1', 'videoaula', { documentoId: 'v1', rotuloAluno: ' Aula gravada ' })], conjuntos)
  const por = videoaulasPorMeta([meta('p', 'pdfull', '1')], idx)
  it('devolve url do leitor com retorno ao cronograma e rótulo do admin', () => {
    const r = montarVideoaulas(por, new Map([['v1', 'Título do vídeo']]), 'em1')
    expect(r.get('p')).toEqual({ id: 'v1', titulo: 'Aula gravada', url: '/aluno/biblioteca/v1?voltar=%2Faluno%2Fcronograma%2Fem1' })
  })
  it('documento despublicado/apagado/não-vídeo (fora de `validos`) ou bloqueado é ignorado', () => {
    expect(montarVideoaulas(por, new Map(), 'em1').size).toBe(0)
    expect(montarVideoaulas(por, new Map([['v1', 'T']]), 'em1', { v1: '2026-12-01' }).size).toBe(0)
    expect(montarVideoaulas(por, new Map([['v1', 'T']]), 'em1', { outro: 'x' }).get('p')?.titulo).toBe('Aula gravada')
  })
  it('sem rótulo usa o título do documento', () => {
    const i2 = indexarSelecoes([sel('1', 'videoaula', { documentoId: 'v2' })], conjuntos)
    expect(montarVideoaulas(videoaulasPorMeta([meta('p', 'pdfull', '1')], i2), new Map([['v2', 'Doc vídeo']]), 'e').get('p')?.titulo).toBe('Doc vídeo')
  })
})

describe('payload do iframe', () => {
  const grade = {
    avisos: [],
    semanas: [{ kind: 'conteudo', numero: 1, inicio: '2026-11-30', fim: '2026-12-06', metas: [{
      id: 'm1', tipo: 'pdfull', disciplina: 'Direito Administrativo', aula: '1', conteudo: null, titulo: 'Aula 1', complemento: null, duracao: '1h', ordem: 0, dia: 0,
      data: '2026-11-30', diaNome: 'Seg', tipoDef: { slug: 'pdfull', nome: 'PDFull', ordem: 1 }, links: null, video: null, pdf: null,
    }] }],
  }
  const base = () => ({
    emissao: { id: 'em1', titulo: 'T', cronograma_nome: 'C', arquivada: false }, grade: grade as never, checks: {}, notas: {},
    config: {} as never, progresso: null, hoje: '2026-11-30', semDatas: false, desatualizada: false, indisponivel: false,
  })
  it('sem videoaulas o payload é IDÊNTICO ao de antes (nem a chave aparece)', () => {
    const a = montarPayloadRevisaoIframe(base())
    const b = montarPayloadRevisaoIframe({ ...base(), videoaulas: new Map() })
    expect(JSON.stringify(b)).toBe(JSON.stringify(a))
    expect(Object.values(a.revisao.metas)[0]).not.toHaveProperty('videoaula')
  })
  it('com videoaula a meta expõe {id,titulo,url} e o vídeo por link continua intacto', () => {
    const v = { id: 'v1', titulo: 'Vídeo', url: '/aluno/biblioteca/v1?voltar=x' }
    const r = montarPayloadRevisaoIframe({ ...base(), videoaulas: new Map([['m1', v]]) })
    const m = Object.values(r.revisao.metas)[0]
    expect(m.videoaula).toEqual(v)
    expect(m.video).toBeNull()
  })
})
