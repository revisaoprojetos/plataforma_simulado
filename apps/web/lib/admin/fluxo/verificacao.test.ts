import { describe, it, expect } from 'vitest'
import type { DiagramaFluxo } from './adaptador'
import { adicionarNo, ajustarNoBase, conectar, editarNoUsuario, overlayVazio, removerNo } from './overlay'
import { ordenarVerificacao, resumirVerificacao, verificarGrafoCompleto } from './verificacao'

const base: DiagramaFluxo[] = [{
  id: 'a', titulo: 'A', resumo: 'r',
  nos: [
    { id: 'a.1', tipo: 'inicio', titulo: 'Início', descricao: 'd', col: 0, row: 0 },
    { id: 'a.2', tipo: 'decisao', titulo: 'Decide', descricao: 'd', col: 1, row: 0 },
    { id: 'a.3', tipo: 'resultado', titulo: 'Sim', descricao: 'd', col: 2, row: 0 },
    { id: 'a.4', tipo: 'resultado', titulo: 'Não', descricao: 'd', col: 2, row: 1 },
  ],
  arestas: [{ de: 'a.1', para: 'a.2' }, { de: 'a.2', para: 'a.3', rotulo: 'sim' }, { de: 'a.2', para: 'a.4', rotulo: 'não' }],
}]

describe('verificarGrafoCompleto', () => {
  it('grafo base intacto: nada a apontar', () => {
    const r = verificarGrafoCompleto(base, overlayVazio())
    expect(r).toEqual([])
    expect(resumirVerificacao(r)).toEqual({ erros: 0, avisos: 0, infos: 0, ok: true })
  })
  it('ocultar uma saída da decisão base gera aviso, e o nó oculto aparece como info', () => {
    const r = verificarGrafoCompleto(base, removerNo(overlayVazio(), 'a.4'))
    expect(r.some((i) => i.severidade === 'aviso' && i.noId === 'a.2' && /2 saídas/.test(i.descricao))).toBe(true)
    expect(r.some((i) => i.severidade === 'info' && i.diagrama === 'a')).toBe(true)
    expect(r[0].severidade).toBe('aviso')
  })
  it('ocultar o único vizinho deixa a etapa base órfã', () => {
    const o = ajustarNoBase(ajustarNoBase(overlayVazio(), 'a.2', { oculto: true }), 'a.1', { oculto: false })
    const r = verificarGrafoCompleto(base, o)
    expect(r.some((i) => i.noId === 'a.1' && /órfã/.test(i.titulo))).toBe(true)
  })
  it('nó do usuário solto, decisão sem saídas e ação sem tipo', () => {
    let o = overlayVazio()
    const d = adicionarNo(o, 'decisao', 'a', 10, 10); o = d.overlay
    const x = adicionarNo(o, 'acao', 'a', 200, 10); o = x.overlay
    o = { ...o, nos: o.nos.map((n) => (n.id === x.id ? { ...n, acao: undefined } : n)) }
    const r = verificarGrafoCompleto(base, o)
    expect(r.some((i) => i.noId === d.id && i.severidade === 'erro')).toBe(true)
    expect(r.some((i) => i.noId === x.id && i.categoria === 'regra' && i.severidade === 'erro')).toBe(true)
    expect(resumirVerificacao(r).ok).toBe(false)
  })
  it('condição sem comparação vira aviso e ciclo de regras executáveis vira erro', () => {
    let o = overlayVazio()
    const c = adicionarNo(o, 'condicao', 'a', 0, 200); o = c.overlay
    const a = adicionarNo(o, 'acao', 'a', 300, 200); o = a.overlay
    o = conectar(o, 'a', c.id, a.id, 'sim').overlay
    o = conectar(o, 'a', a.id, c.id, '').overlay
    o = editarNoUsuario(o, c.id, { condicao: { ou: [] } })
    const r = verificarGrafoCompleto(base, o)
    expect(r.some((i) => i.noId === c.id && i.categoria === 'regra' && i.severidade === 'aviso')).toBe(true)
    expect(r.some((i) => i.severidade === 'erro' && /Ciclo/.test(i.descricao))).toBe(true)
  })
  it('ordena erro, aviso, info', () => {
    const o = ordenarVerificacao([{ id: '1', severidade: 'info', categoria: 'grafo', titulo: '', descricao: '' }, { id: '2', severidade: 'erro', categoria: 'grafo', titulo: '', descricao: '' }])
    expect(o.map((i) => i.id)).toEqual(['2', '1'])
  })
})
