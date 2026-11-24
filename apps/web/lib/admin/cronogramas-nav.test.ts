import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, join } from 'node:path'
import {
  EYEBROW_CRONOGRAMAS, MODALIDADES, grupoDaRota, gruposVisiveis, hrefDaVista, hrefDoGrupo, hrefNoShell, mostraSubabas, normalizarShell, rotaSemCabecalho,
  voltarSeguro, comVoltar, destinoVoltar,
} from './cronogramas-nav'
import { resolverRota } from './setores'

const q = (o: Record<string, string> = {}) => new URLSearchParams(o)
const RAIZ = resolve(__dirname, '../..')
const ler = (f: string) => readFileSync(resolve(RAIZ, f), 'utf8')

const id = (p: string, o: Record<string, string> = {}) => {
  const r = grupoDaRota(p, q(o))
  return r ? `${r.modalidade.id}/${r.grupo.id}/${r.subaba.id}` : null
}

describe('grupoDaRota — rotas legadas /admin/cronogramas/** acendem a aba + vista novas', () => {
  it('Gerador', () => {
    expect(id('/admin/cronogramas')).toBe('gerador/cronogramas/catalogo')
    expect(id('/admin/cronogramas/abc-uuid')).toBe('gerador/cronogramas/catalogo')
    expect(id('/admin/cronogramas/criar')).toBe('gerador/cronogramas/catalogo')
    expect(id('/admin/cronogramas/conteudos')).toBe('gerador/cronogramas/conjuntos')
    expect(id('/admin/cronogramas/conteudos/abc')).toBe('gerador/cronogramas/conjuntos')
    expect(id('/admin/cronogramas/links')).toBe('gerador/cronogramas/links')
    expect(id('/admin/cronogramas/tipos')).toBe('gerador/metas/tipos')
    expect(id('/admin/cronogramas/metas')).toBe('gerador/metas/auditoria-metas')
    expect(id('/admin/cronogramas/fluxo')).toBe('gerador/metas/fluxo-gerador')
    expect(id('/admin/cronogramas/pacotes')).toBe('gerador/acesso/acessos')
    expect(id('/admin/cronogramas/pacotes/abc')).toBe('gerador/acesso/acessos')
    expect(id('/admin/cronogramas/relatorios')).toBe('gerador/dados/relatorios')
    expect(id('/admin/cronogramas/importar')).toBe('gerador/dados/importacao')
  })
  it('Adaptativo (todas as telas)', () => {
    const casos: Record<string, string> = {
      '/admin/cronogramas/adaptativo': 'versoes/liberacao', '/admin/cronogramas/adaptativo/downloads': 'versoes/downloads', '/admin/cronogramas/adaptativo/versoes': 'versoes/versoes',
      '/admin/cronogramas/adaptativo/rastro': 'visao/rastro', '/admin/cronogramas/adaptativo/analise': 'visao/analise', '/admin/cronogramas/adaptativo/integridade': 'visao/integridade',
      '/admin/cronogramas/adaptativo/catalogo': 'conteudo/catalogo-metas', '/admin/cronogramas/adaptativo/catalogo/paginas': 'conteudo/paginas', '/admin/cronogramas/adaptativo/definicoes': 'conteudo/definicoes',
      '/admin/cronogramas/lei-seca': 'conteudo/lei-seca', '/admin/cronogramas/adaptativo/metas': 'regras/metas', '/admin/cronogramas/adaptativo/faixas': 'regras/faixas',
      '/admin/cronogramas/adaptativo/restricoes': 'regras/restricoes', '/admin/cronogramas/adaptativo/personagens': 'regras/personagens',
      '/admin/cronogramas/adaptativo/inteligencia': 'fluxo/inteligencia', '/admin/cronogramas/adaptativo/simulacao': 'fluxo/simulacao', '/admin/cronogramas/adaptativo/mapa': 'fluxo/mapa', '/admin/cronogramas/adaptativo/fluxo': 'fluxo/fluxo',
    }
    for (const [p, v] of Object.entries(casos)) expect(id(p), p).toBe('adaptativo/' + v)
    expect(id('/admin/cronogramas/adaptativo/desconhecida')).toBe('adaptativo/versoes/liberacao')
  })
  it('fora de Cronogramas = null', () => {
    expect(id('/admin/estudantes')).toBeNull()
  })
})

describe('grupoDaRota — shell /admin/revisao/cronograma (?sub=<aba>&v=<vista>)', () => {
  const B = '/admin/revisao/cronograma'
  it('sem ?aba= abre o Gerador (Visão geral)', () => { expect(id(B)).toBe('gerador/visao/visao') })
  it('Gerador por ?sub=&v=', () => {
    for (const [sub, v, esperado] of [
      ['cronogramas', 'catalogo', 'cronogramas/catalogo'], ['cronogramas', 'conjuntos', 'cronogramas/conjuntos'], ['cronogramas', 'links', 'cronogramas/links'],
      ['metas', 'tipos', 'metas/tipos'], ['metas', 'auditoria-metas', 'metas/auditoria-metas'], ['metas', 'fluxo-gerador', 'metas/fluxo-gerador'],
      ['acesso', 'acessos', 'acesso/acessos'], ['acesso', 'liberacao', 'acesso/liberacao'], ['acesso', 'liberacao-aulas', 'acesso/liberacao-aulas'],
      ['dados', 'relatorios', 'dados/relatorios'], ['dados', 'importacao', 'dados/importacao'],
    ]) expect(id(B, { aba: 'gerador', sub, v }), sub + '/' + v).toBe('gerador/' + esperado)
    expect(id(B, { aba: 'gerador', sub: 'cronogramas' })).toBe('gerador/cronogramas/catalogo')
    expect(id(B, { aba: 'gerador', sub: 'lixo' })).toBe('gerador/visao/visao')
  })
  it('links ANTIGOS (?sub=conteudos|metas&vista=|acessos…) acendem a vista certa', () => {
    expect(id(B, { aba: 'gerador', sub: 'catalogo' })).toBe('gerador/cronogramas/catalogo')
    expect(id(B, { aba: 'gerador', sub: 'conteudos' })).toBe('gerador/cronogramas/conjuntos')
    expect(id(B, { aba: 'gerador', sub: 'conteudos', painel: 'links' })).toBe('gerador/cronogramas/links')
    expect(id(B, { aba: 'gerador', sub: 'metas' })).toBe('gerador/metas/tipos')
    expect(id(B, { aba: 'gerador', sub: 'metas', vista: 'duracao' })).toBe('gerador/metas/auditoria-metas')
    for (const [s, v] of [['acessos', 'acesso/acessos'], ['liberacao', 'acesso/liberacao'], ['liberacao-aulas', 'acesso/liberacao-aulas'], ['relatorios', 'dados/relatorios'], ['importacao', 'dados/importacao']]) {
      expect(id(B, { aba: 'gerador', sub: s }), s).toBe('gerador/' + v)
    }
  })
  it('Adaptativo: padrão = Visão geral; ?sub=&v= e links antigos', () => {
    expect(id(B, { aba: 'adaptativo' })).toBe('adaptativo/visao/analise')
    for (const [sub, v, esperado] of [['conteudo', 'cobertura', 'conteudo/cobertura'], ['conteudo', 'disciplinas', 'conteudo/disciplinas'], ['regras', 'faixas', 'regras/faixas'], ['regras', 'especial', 'regras/especial'], ['versoes', 'versoes', 'versoes/versoes'], ['versoes', 'sprint', 'versoes/sprint'], ['fluxo', 'mapa', 'fluxo/mapa']]) {
      expect(id(B, { aba: 'adaptativo', sub, v }), sub + '/' + v).toBe('adaptativo/' + esperado)
    }
    for (const [s, v] of [['mat', 'conteudo/cobertura'], ['disc', 'conteudo/disciplinas'], ['regras', 'regras/regras'], ['faixas', 'regras/faixas'], ['especial', 'regras/especial'], ['ver', 'versoes/versoes'], ['sprint', 'versoes/sprint']]) {
      expect(id(B, { aba: 'adaptativo', sub: s }), s).toBe('adaptativo/' + v)
    }
  })
  it('normalizarShell: só links antigos são reescritos', () => {
    expect(normalizarShell('gerador', 'conteudos', q({ painel: 'links' }))).toEqual({ sub: 'cronogramas', v: 'links', legado: true })
    expect(normalizarShell('adaptativo', 'ver', q())).toEqual({ sub: 'versoes', v: 'versoes', legado: true })
    expect(normalizarShell('adaptativo', 'conteudo', q({ v: 'cobertura' }))).toEqual({ sub: 'conteudo', v: 'cobertura', legado: false })
    expect(normalizarShell('gerador', 'visao', q())).toEqual({ sub: 'visao', v: null, legado: false })
  })
})

describe('estrutura da navegação', () => {
  it('ids únicos por modalidade; toda vista tem rota (shell ou legada) e perm', () => {
    for (const m of MODALIDADES) {
      const subs = m.grupos.flatMap((g) => g.subs)
      expect(new Set(subs.map((s) => s.id)).size, m.id).toBe(subs.length)
      expect(new Set(subs.map((s) => s.href)).size, m.id).toBe(subs.length)
      for (const s of subs) { expect(s.perm).toBe('cronogramas:view'); expect(s.shell || s.rotas?.length, s.id).toBeTruthy() }
    }
  })
  it('5 abas por modalidade, na ordem pedida (sem 3ª fileira: telas = abas internas)', () => {
    const nomes = (id: string) => MODALIDADES.find((m) => m.id === id)!.grupos.map((g) => g.label)
    expect(nomes('adaptativo')).toEqual(['Visão geral', 'Conteúdo', 'Regras do motor', 'Fluxo e simulação', 'Versões e entrega'])
    expect(nomes('gerador')).toEqual(['Visão geral', 'Cronogramas', 'Metas', 'Acesso e liberação', 'Dados'])
  })
  it('vistas só com 2+ telas; aba some sem permissão; href da aba = 1ª vista visível; busca de aluno compartilhada', () => {
    const ad = MODALIDADES.find((m) => m.id === 'adaptativo')!
    const gs = gruposVisiveis(ad, () => true)
    expect(gs).toHaveLength(5)
    expect(mostraSubabas(gs.find((g) => g.id === 'visao')!)).toBe(true)
    expect(hrefDoGrupo(gs.find((g) => g.id === 'fluxo')!)).toBe('/admin/cronogramas/adaptativo/fluxo')
    expect(gruposVisiveis(ad, () => false)).toEqual([])
    const visao = gs.find((g) => g.id === 'visao')!
    expect(visao.subs.map((s) => s.id)).toEqual(['analise', 'rastro', 'integridade'])
    expect(hrefDaVista(visao.subs[1], q({ q: 'ana@x.com', pag: '3' }))).toBe('/admin/cronogramas/adaptativo/rastro?q=ana%40x.com')
    expect(hrefDaVista(visao.subs[1], q())).toBe('/admin/cronogramas/adaptativo/rastro')
  })
  it('todo alias do shell (?sub=&v=) de vista legada aponta para uma rota que acende a MESMA vista', () => {
    for (const m of MODALIDADES) for (const g of m.grupos) for (const s of g.subs) {
      if (hrefNoShell(s)) continue
      const [path, qs = ''] = s.href.split('?')
      const r = grupoDaRota(path, new URLSearchParams(qs))
      expect(r && `${r.grupo.id}/${r.subaba.id}`, s.id).toBe(`${g.id}/${s.id}`)
    }
  })
  it('a barra de setor [Gerador|Adaptativo] aponta para os hrefs das modalidades', () => {
    expect(MODALIDADES.map((m) => m.href)).toEqual(['/admin/revisao/cronograma?aba=gerador', '/admin/revisao/cronograma?aba=adaptativo'])
    expect(EYEBROW_CRONOGRAMAS).toBe('Cronogramas')
    // toda rota resolvida na sidebar como "cronogramas" também está na nav (e vice-versa)
    expect(resolverRota('/admin/cronogramas/adaptativo/mapa', q())?.aba.id).toBe('cronogramas')
  })
  it('rotaSemCabecalho: só edição (id, criar, conteudos/[id], pacotes/[id]); nunca o shell nem páginas com cabeçalho', () => {
    for (const p of ['/admin/cronogramas/criar', '/admin/cronogramas/abc', '/admin/cronogramas/conteudos/abc', '/admin/cronogramas/pacotes/abc']) expect(rotaSemCabecalho(p), p).toBe(true)
    for (const p of ['/admin/cronogramas', '/admin/cronogramas/conteudos', '/admin/cronogramas/pacotes', '/admin/cronogramas/fluxo', '/admin/cronogramas/adaptativo/mapa', '/admin/cronogramas/lei-seca', '/admin/revisao/cronograma']) expect(rotaSemCabecalho(p), p).toBe(false)
  })
})

describe('?voltar= determinístico', () => {
  it('aceita só caminho interno /admin', () => {
    expect(voltarSeguro('/admin/revisao/cronograma?aba=gerador&sub=cronogramas&v=conjuntos&pag=2')).toBe('/admin/revisao/cronograma?aba=gerador&sub=cronogramas&v=conjuntos&pag=2')
    for (const x of ['https://evil.com', '//evil.com', '/\\evil', 'javascript:alert(1)', '/aluno/x', '/administrador', '/admin/../x://y', '', null, undefined, '/admin/x\n']) expect(voltarSeguro(x as string), String(x)).toBeNull()
  })
  it('comVoltar + destinoVoltar: ida e volta, fallback fixo e rótulo contextual', () => {
    const origem = '/admin/revisao/cronograma?aba=gerador&sub=acesso&v=acessos&pag=3'
    const href = comVoltar('/admin/cronogramas/pacotes/123', origem)
    const v = new URL(href, 'http://x').searchParams.get('voltar')
    expect(destinoVoltar('pacote', v)).toEqual({ href: origem, rotulo: 'Voltar aos Acessos' })
    expect(destinoVoltar('pacote', 'https://evil.com')).toEqual({ href: '/admin/revisao/cronograma?aba=gerador&sub=acesso&v=acessos', rotulo: 'Voltar aos Acessos' })
    expect(destinoVoltar('cronograma', null).rotulo).toBe('Voltar ao Catálogo')
    expect(destinoVoltar('conteudo', null).rotulo).toBe('Voltar aos Conteúdos')
  })
})

describe('estrutural: uma única nav por página, sem abas antigas no shell', () => {
  const lista = (dir: string): string[] => readdirSync(resolve(RAIZ, dir)).flatMap((n) => {
    const rel = join(dir, n)
    return statSync(resolve(RAIZ, rel)).isDirectory() ? lista(rel) : [rel]
  })
  it("o shell não usa 'RevisaoAbas' nem abas [Gerador|Adaptativo]", () => {
    const page = ler('app/admin/revisao/cronograma/page.tsx')
    expect(page).not.toContain('RevisaoAbas')
    expect(page).not.toContain('Cronograma Adaptativo\' }')
    for (const f of lista('app/admin/revisao/cronograma/adaptativo').filter((x) => /\.tsx$/.test(x))) expect(ler(f), f).not.toContain('RevisaoAbas')
  })
  it('<CronogramasNav> é renderizada em UM único componente (CabecalhoArea); nenhuma página/layout a repete', () => {
    const usos = [...lista('app'), ...lista('components')].filter((f) => /\.tsx$/.test(f) && ler(f).split('\n').some((l) => /<CronogramasNav\b/.test(l) && !/^\s*(\/\/|\*|\{\/\*)/.test(l)))
    expect(usos.map((f) => f.replace(/\\/g, '/'))).toEqual(['components/admin/cabecalho-area.tsx'])
  })
  it('<VistasCronograma> (abas internas das telas) também só entra pelo CabecalhoArea, DEPOIS do cabeçalho', () => {
    const usos = [...lista('app'), ...lista('components')].filter((f) => /\.tsx$/.test(f) && ler(f).split('\n').some((l) => /<VistasCronograma\b/.test(l) && !/^\s*(\/\/|\*|\{\/\*)/.test(l)))
    expect(usos.map((f) => f.replace(/\\/g, '/'))).toEqual(['components/admin/cabecalho-area.tsx'])
    const cab = ler('components/admin/cabecalho-area.tsx')
    expect(cab.indexOf('<VistasCronograma')).toBeGreaterThan(cab.indexOf('{abas}'))
  })
  it('layouts usam <ShellCronogramas> (sem nav própria) e o header posiciona a nav DEPOIS do título', () => {
    expect(ler('app/admin/cronogramas/layout.tsx')).toContain('<ShellCronogramas>')
    expect(ler('app/admin/revisao/cronograma/layout.tsx')).toContain('<ShellCronogramas>')
    const cab = ler('components/admin/cabecalho-area.tsx')
    expect(cab.indexOf('{titulo && <h1')).toBeGreaterThan(-1)
    expect(cab.indexOf('<CronogramasNav')).toBeGreaterThan(cab.indexOf('{titulo && <h1'))
  })
  it('páginas com cabeçalho próprio (lista COM_CABECALHO) realmente usam CabecalhoArea/RevisaoHead', () => {
    for (const f of ['cronogramas-client.tsx', 'conteudos/page.tsx', 'pacotes/page.tsx', 'links/page.tsx', 'tipos/page.tsx', 'metas/page.tsx', 'relatorios/page.tsx', 'importar/page.tsx', 'lei-seca/page.tsx']) {
      expect(ler('app/admin/cronogramas/' + f), f).toMatch(/<CabecalhoArea\b|<TituloTela\b|<RevisaoHead\b/)
    }
  })
})
