import { describe, it, expect } from 'vitest'
import { classificarDispositivo as cd, IndexadorDispositivos, ehCitacao, dentroDeTabelaOuCaixa } from '../dispositivos'
import { extrairTrechosHtml, injetarUidsNoHtml, hashTexto } from '../trechos'
import { alinhar } from '../alinhamento'
import { NIVEL_TIPO } from '../../leitura/indice'

const tp = (t: string, tag = 'p', ctx?: Parameters<typeof cd>[2]) => cd(tag, t, ctx)

describe('artigos', () => {
  it('Art. 1º-A', () => {
    const c = tp('Art. 1º-A Fica instituído…')
    expect(c).toMatchObject({ tipo: 'artigo', rotulo: 'Art. 1º-A', chave: '1-a' })
  })
  it('Art. 1º - A lei (hífen solto NÃO é sufixo)', () => {
    expect(tp('Art. 1º - A lei vigora.')).toMatchObject({ tipo: 'artigo', chave: '1' })
  })
  it('variações: Art 1, Art. 5.º, Art. 1.234, Artigo 7, Art.9', () => {
    expect(tp('Art 1 Texto').chave).toBe('1')
    expect(tp('Art. 5.º Texto').rotulo).toBe('Art. 5º')
    expect(tp('Art. 1.234 Texto').chave).toBe('1234')
    expect(tp('Artigo 7º Texto').tipo).toBe('artigo')
    expect(tp('Art.9º Texto').chave).toBe('9')
  })
  it('Artigo único / Art. único', () => {
    expect(tp('Artigo único. Esta lei entra em vigor.')).toMatchObject({ tipo: 'artigo', rotulo: 'Artigo único', chave: 'unico' })
    expect(tp('Art. único - Texto').chave).toBe('unico')
  })
  it('Art. XII (romano) sem confundir com palavra', () => {
    expect(tp('Art. XII Texto')).toMatchObject({ tipo: 'artigo', chave: 'xii' })
    expect(tp('Art. Civil não é artigo').tipo).toBe('texto')
    expect(tp('Artista plástico').tipo).toBe('texto')
  })
})

describe('parágrafos', () => {
  it('§ 1º, § 2.º, §3º-A', () => {
    expect(tp('§ 1º Texto')).toMatchObject({ tipo: 'paragrafo', rotulo: '§ 1º', chave: '1' })
    expect(tp('§ 2.º Texto').rotulo).toBe('§ 2º')
    expect(tp('§3º-A Texto')).toMatchObject({ rotulo: '§ 3º-A', chave: '3-a' })
  })
  it('§ único e Parágrafo único compartilham a chave', () => {
    expect(tp('§ único. Texto')).toMatchObject({ tipo: 'paragrafo', rotulo: '§ único', chave: 'unico' })
    expect(tp('Parágrafo único. Texto')).toMatchObject({ tipo: 'paragrafo', chave: 'unico' })
  })
  it('§§ 1º e 2º', () => {
    expect(tp('§§ 1º e 2º Texto')).toMatchObject({ tipo: 'paragrafo', rotulo: '§§ 1º e 2º', chave: 's-1-2' })
  })
})

describe('incisos, alíneas, itens', () => {
  it('I –, I., I), XIV–', () => {
    expect(tp('I – texto')).toMatchObject({ tipo: 'inciso', rotulo: 'I', chave: 'i' })
    expect(tp('II. texto')).toMatchObject({ tipo: 'inciso', rotulo: 'II' })
    expect(tp('III) texto').tipo).toBe('inciso')
    expect(tp('XIV–texto')).toMatchObject({ tipo: 'inciso', rotulo: 'XIV' })
  })
  it('não confunde com siglas/palavras', () => {
    expect(tp('CD-ROM do aluno').tipo).toBe('texto')
    expect(tp('MIX-tape').tipo).toBe('texto')
    expect(tp('I.C.A. é uma sigla').tipo).toBe('texto')
  })
  it('alínea a) e item 1. (item só dentro de inciso/alínea)', () => {
    expect(tp('a) texto')).toMatchObject({ tipo: 'alinea', rotulo: 'a)', chave: 'a' })
    expect(tp('1. Primeiro').tipo).toBe('texto')
    expect(tp('1. Primeiro', 'p', { emDispositivo: true })).toMatchObject({ tipo: 'item', chave: '1' })
  })
})

describe('estruturais', () => {
  it('CAPÍTULO II, TÍTULO II, Livro, Parte, Seção, Subseção', () => {
    expect(tp('CAPÍTULO II')).toMatchObject({ tipo: 'capitulo', rotulo: 'Capítulo II', chave: 'ii' })
    expect(tp('TÍTULO II – Da Organização')).toMatchObject({ tipo: 'titulo', rotulo: 'Título II' })
    expect(tp('LIVRO I DA PARTE GERAL').tipo).toBe('livro')
    expect(tp('Parte Especial').tipo).toBe('parte')
    expect(tp('Seção III - Das Penas').tipo).toBe('secao')
    expect(tp('SUBSEÇÃO I').tipo).toBe('subsecao')
    expect(tp('Capítulo único').chave).toBe('unico')
  })
  it('em <h2> e em <p> dão o mesmo resultado', () => {
    expect(tp('CAPÍTULO I', 'h2')).toMatchObject({ tipo: 'capitulo', chave: 'i' })
  })
  it('sem falso positivo: "Parte da doutrina…" e similares', () => {
    expect(tp('Parte da doutrina entende que a regra é aplicável.').tipo).toBe('texto')
    expect(tp('Título executivo extrajudicial é aquele previsto em lei.').tipo).toBe('texto')
    expect(tp('Parte I do edital é a mais cobrada nas provas.').tipo).toBe('texto')
    expect(tp('Capítulo 2 do livro trata disso.').tipo).toBe('texto')
    expect(tp('Seção judiciária de São Paulo').tipo).toBe('texto')
  })
  it('heading sem rótulo vira seção por tag', () => {
    expect(tp('Das Disposições Gerais', 'h3')).toMatchObject({ tipo: 'secao', via: 'tag' })
  })
})

describe('citação não é dispositivo', () => {
  it('td/th e contexto de tabela/caixa', () => {
    expect(tp('Art. 182, § 4º, III, CF;', 'td')).toMatchObject({ tipo: 'texto', citacao: true })
    expect(tp('Art. 5º Todos são iguais', 'p', { dentroDeTabelaOuCaixa: true }).tipo).toBe('texto')
  })
  it('bloco que só cita', () => {
    expect(tp('Art. 182, § 4º, III, CF;')).toMatchObject({ tipo: 'texto', citacao: true })
    expect(tp('Art. 5º, caput, da CF/88.').tipo).toBe('texto')
    expect(tp('Art. 121 do Código Penal').tipo).toBe('texto')
    expect(tp('Art. 927, Lei 13.105/2015').tipo).toBe('texto')
    // dispositivo real que apenas MENCIONA uma sigla no meio do texto continua artigo
    expect(tp('Art. 5º Todos são iguais perante a lei, nos termos da CF.').tipo).toBe('artigo')
  })
  it('texto entre aspas e "nos termos do art. 5º"', () => {
    expect(tp('“Art. 5º Todos são iguais.”').tipo).toBe('texto')
    expect(tp('"§ 1º Texto alterado"').tipo).toBe('texto')
    expect(tp('nos termos do art. 5º da Constituição').tipo).toBe('texto')
    expect(ehCitacao('nos termos do art. 5º')).toBe(true)
  })
  it('dentroDeTabelaOuCaixa por ancestrais', () => {
    const td = { tagName: 'TD', parentNode: null as any }
    const p: any = { tagName: 'P', parentNode: { tagName: 'TR', parentNode: td } }
    expect(dentroDeTabelaOuCaixa(p)).toBe(true)
    const caixa: any = { tagName: 'DIV', getAttribute: (n: string) => (n === 'class' ? 'caixa-colapsavel' : null), parentNode: null }
    expect(dentroDeTabelaOuCaixa({ tagName: 'P', parentNode: caixa })).toBe(true)
    const stf: any = { tagName: 'DIV', getAttribute: (n: string) => (n === 'data-caixa' ? 'stf' : null), parentNode: null }
    expect(dentroDeTabelaOuCaixa({ tagName: 'P', parentNode: stf })).toBe(true)
    expect(dentroDeTabelaOuCaixa({ tagName: 'P', parentNode: { tagName: 'DIV', parentNode: null } })).toBe(false)
  })
})

describe('tabela única de níveis', () => {
  it('nível vem de leitura/indice.ts', () => {
    expect(cd('p', 'Art. 1º x').nivel).toBe(NIVEL_TIPO.artigo)
    expect(cd('p', 'CAPÍTULO I').nivel).toBe(NIVEL_TIPO.capitulo)
    expect(cd('p', 'a) x').nivel).toBe(NIVEL_TIPO.alinea)
  })
})

describe('IndexadorDispositivos: ids estáveis', () => {
  const rodar = (blocos: [string, string][]) => {
    const ix = new IndexadorDispositivos()
    return blocos.map(([tag, t]) => ix.proximo(tag, t)?.id ?? null)
  }
  it('ids derivados do rótulo (compatíveis com o formato antigo no caso comum)', () => {
    expect(rodar([['p', 'Art. 5º Texto'], ['p', '§ 1º Texto'], ['p', 'I – x'], ['p', 'a) y'], ['p', 'Parágrafo único.']]))
      .toEqual(['art-5', 'art-5.par-1', 'art-5.par-1.inc-i', 'art-5.par-1.inc-i.al-a', 'art-5.par-unico'])
  })
  it('Art. 1º e Art. 1º-A não colidem (antes: art-1 / art-1~2 dependente da ordem)', () => {
    const a = rodar([['p', 'Art. 1º-A x'], ['p', 'Art. 1º y']])
    const b = rodar([['p', 'Art. 1º y'], ['p', 'Art. 1º-A x']])
    expect(a).toEqual(['art-1-a', 'art-1'])
    expect(b).toEqual(['art-1', 'art-1-a']) // independente da ordem
  })
  it('repetidos recebem ~n por id-base; capítulos repetidos em títulos diferentes não colidem', () => {
    const ids = rodar([
      ['p', 'TÍTULO I'], ['p', 'CAPÍTULO I'], ['p', 'Art. 1º a'],
      ['p', 'TÍTULO II'], ['p', 'CAPÍTULO I'], ['p', 'Art. 1º b'],
    ])
    expect(ids).toEqual(['titulo-i', 'titulo-i.capitulo-i', 'art-1', 'titulo-ii', 'titulo-ii.capitulo-i', 'art-1~2'])
  })
  it('citações não geram id; contexto não é poluído por elas', () => {
    const ix = new IndexadorDispositivos()
    ix.proximo('p', 'Art. 5º Texto')
    expect(ix.proximo('td', 'Art. 7º, CF')).toBeNull()
    expect(ix.proximo('p', '§ 1º x')?.id).toBe('art-5.par-1')
  })
  it('item só sob inciso/alínea', () => {
    const ix = new IndexadorDispositivos()
    ix.proximo('p', 'Art. 5º x')
    expect(ix.proximo('p', '1. solto')).toBeNull()
    ix.proximo('p', 'I – x')
    expect(ix.proximo('p', '1. item')?.tipo).toBe('item')
  })
})

// ── RESTRIÇÃO CRÍTICA: sequência de blocos e uids NÃO mudam, só tipo/rotulo ──────────────────────────
// Referência: cópia FIEL do extrator ANTES da mudança (mesmo BLOCOS/CONTAINERS/filtro length<2).
const REF_BLOCOS = /<(h[1-6]|p|li|blockquote|pre|td|th)\b[^>]*>([\s\S]*?)<\/\1>/gi
const REF_CONT = /<\/?(div|section|article|main|header|footer|span|font|a)\b[^>]*>/gi
function refTexto(h: string) {
  const s = h.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ')
  return s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&sect;/g, '§').replace(/\s+/g, ' ').trim()
}
function refExtrair(html: string) {
  const limpo = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style|head)\b[\s\S]*?<\/\1>/gi, '').replace(REF_CONT, ' ')
  const out: { texto: string; hashTexto: string }[] = []
  let m: RegExpExecArray | null
  REF_BLOCOS.lastIndex = 0
  while ((m = REF_BLOCOS.exec(limpo))) {
    const t = refTexto(m[2])
    if (!t || t.length < 2) continue
    out.push({ texto: t, hashTexto: hashTexto(t) })
  }
  return out
}

const FIXTURE = `
<h1>CÓDIGO X</h1><h2>CAPÍTULO I</h2><p>Parte da doutrina entende que…</p>
<p>Art. 1º-A Texto.</p><p>Artigo único. Vigência.</p><p>§ único. Algo.</p><p>§§ 1º e 2º Algo.</p>
<p>I – inciso</p><p>I. outro</p><p>a) alínea</p><p>.</p><p>x</p>
<table><tr><td>Art. 182, § 4º, III, CF;</td><th>Art. 5º cita</th></tr></table>
<div class="caixa-colapsavel"><p>STF: Art. 5º citado</p></div>
<p>nos termos do art. 5º, vale.</p><blockquote>“Art. 9º citado”</blockquote><li>1. Item</li><p>&nbsp;</p>
<h3>Das Disposições</h3><p>TÍTULO II</p><p>Seção I – Das penas</p>`

describe('prova: blocos e uids intactos', () => {
  const novo = extrairTrechosHtml(FIXTURE)
  const ref = refExtrair(FIXTURE)

  it('mesma sequência de blocos (texto e hash) — só tipo/rotulo podem mudar', () => {
    expect(novo.map((t) => t.texto)).toEqual(ref.map((t) => t.texto))
    expect(novo.map((t) => t.hashTexto)).toEqual(ref.map((t) => t.hashTexto))
    expect(novo.map((t) => t.ordem)).toEqual(novo.map((_, i) => i))
  })

  it('injetarUidsNoHtml: uid injetado exatamente nos mesmos blocos, na mesma ordem', () => {
    const uids = novo.map((_, i) => `uid-${i}`)
    const html = injetarUidsNoHtml(FIXTURE, uids)
    const achados = [...html.matchAll(/data-uid="(uid-\d+)"/g)].map((m) => m[1])
    expect(achados).toEqual(uids)
  })

  it('alinhamento (uid) é função só do texto: mesmo resultado com tipos novos', () => {
    const velhos = ref.map((t, i) => ({ indice: i, texto: t.texto, uid: `u${i}` }))
    const novos = novo.map((t, i) => ({ indice: i, texto: t.texto }))
    const al = alinhar(velhos, novos)
    expect(al.alinhamentos.map((a) => a.uid)).toEqual(velhos.map((v) => v.uid))
    expect(al.alinhamentos.every((a) => a.estado === 'identico')).toBe(true)
  })

  it('tipos: só tipo/rotulo mudam, e do jeito esperado', () => {
    const por = (prefixo: string) => novo.find((t) => t.texto.startsWith(prefixo))!
    expect(por('CÓDIGO X').tipo).toBe('titulo') // h1 sem rótulo: legado
    expect(por('CAPÍTULO I')).toMatchObject({ tipo: 'capitulo', rotulo: 'Capítulo I' })
    expect(por('Parte da doutrina').tipo).toBe('paragrafo')
    expect(por('Art. 1º-A')).toMatchObject({ tipo: 'artigo', rotulo: 'Art. 1º-A' })
    expect(por('Artigo único').tipo).toBe('artigo')
    expect(por('§ único').tipo).toBe('paragrafo')
    expect(por('§§ 1º e 2º').rotulo).toBe('§§ 1º e 2º')
    expect(por('I – inciso').tipo).toBe('inciso')
    expect(por('I. outro').tipo).toBe('inciso')
    expect(por('a) alínea').tipo).toBe('alinea')
    expect(por('Art. 182, § 4º').tipo).toBe('paragrafo') // td: citação
    expect(por('Art. 5º cita').tipo).toBe('paragrafo') // th: citação
    expect(por('nos termos').tipo).toBe('paragrafo')
    expect(por('“Art. 9º').tipo).toBe('paragrafo')
    expect(por('Das Disposições').tipo).toBe('titulo') // h3 legado
    expect(por('TÍTULO II').tipo).toBe('titulo')
    expect(por('Seção I').tipo).toBe('secao')
  })
})
