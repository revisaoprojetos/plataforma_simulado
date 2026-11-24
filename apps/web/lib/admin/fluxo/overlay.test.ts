import { describe, it, expect } from 'vitest'
import type { DiagramaFluxo } from './adaptador'
import { adicionarNo, ajustarNoBase, conectar, criarDiagrama, desfazer, duplicarNo, editarNoUsuario, empurrar, excluirDiagrama, hashOverlay, historicoVazio, mesclar, moverNo, normalizarOverlay, nosOcultos, overlayEhVazio, overlayVazio, podarOverlay, posicaoBase, refazer, removerAresta, removerNo, restaurarNoBase } from './overlay'
import { acharCiclos, validarGrafo } from './grafo'
import { resumirAcao, resumirCondicao } from './resumo'
import { CATALOGO } from '../../cronograma/adaptativo/regras-usuario'

const base: DiagramaFluxo[] = [{
  id: 'a', titulo: 'A', resumo: 'r',
  nos: [{ id: 'a.1', tipo: 'inicio', titulo: 'Início', descricao: 'd', col: 0, row: 0 }, { id: 'a.2', tipo: 'etapa', titulo: 'Etapa', descricao: 'd', col: 1, row: 0 }, { id: 'a.3', tipo: 'resultado', titulo: 'Fim', descricao: 'd', col: 2, row: 0 }],
  arestas: [{ de: 'a.1', para: 'a.2' }, { de: 'a.2', para: 'a.3', rotulo: 'ok' }],
}]

describe('overlay: mesclagem com o grafo base', () => {
  it('overlay vazio devolve o grafo base (mesmos nós/arestas) com posição em px', () => {
    const m = mesclar(base, overlayVazio())
    expect(m).toHaveLength(1)
    expect(m[0].nos.map((n) => n.id)).toEqual(['a.1', 'a.2', 'a.3'])
    expect(m[0].arestas.map((a) => `${a.de}>${a.para}`)).toEqual(['a.1>a.2', 'a.2>a.3'])
    expect(m[0].nos[1]).toMatchObject({ ...posicaoBase({ col: 1, row: 0 }), origem: 'base' })
    expect(overlayEhVazio(overlayVazio())).toBe(true)
  })
  it('ocultar/restaurar nó base remove suas arestas da visão sem apagar o dado', () => {
    const o = removerNo(overlayVazio(), 'a.2')
    const m = mesclar(base, o)
    expect(m[0].nos.map((n) => n.id)).toEqual(['a.1', 'a.3'])
    expect(m[0].arestas).toHaveLength(0)
    expect(nosOcultos(base, o)).toEqual([{ id: 'a.2', titulo: 'Etapa', diagrama: 'a' }])
    expect(overlayEhVazio(restaurarNoBase(o, 'a.2'))).toBe(true)
  })
  it('renomear e mover nó base via ajustes; mover nó do usuário', () => {
    let o = ajustarNoBase(overlayVazio(), 'a.2', { titulo: 'Novo nome' })
    o = moverNo(o, 'a.2', 500, 300)
    const n = mesclar(base, o)[0].nos.find((x) => x.id === 'a.2')!
    expect(n).toMatchObject({ titulo: 'Novo nome', x: 500, y: 300, editado: true })
    const r = adicionarNo(o, 'etapa', 'a', 10, 20)
    const o2 = moverNo(r.overlay, r.id, 33, 44)
    expect(o2.nos[0]).toMatchObject({ x: 33, y: 44 })
  })
  it('nós e arestas do usuário aparecem; ocultar aresta base; remover nó do usuário leva as arestas', () => {
    const r1 = adicionarNo(overlayVazio(), 'etapa', 'a', 700, 20)
    const c = conectar(r1.overlay, 'a', 'a.3', r1.id, 'sim')
    expect(c.id).toBeTruthy()
    let m = mesclar(base, c.overlay)[0]
    expect(m.nos.find((n) => n.id === r1.id)?.origem).toBe('usuario')
    expect(m.arestas.find((a) => a.id === c.id)).toMatchObject({ de: 'a.3', para: r1.id, rotulo: 'sim', origem: 'usuario' })
    const oc = removerAresta(c.overlay, 'a.2>a.3')
    m = mesclar(base, oc)[0]
    expect(m.arestas.some((a) => a.id === 'a.2>a.3')).toBe(false)
    const sem = removerNo(c.overlay, r1.id)
    expect(sem.nos).toHaveLength(0)
    expect(sem.arestas).toHaveLength(0)
  })
  it('conectar recusa laço e duplicata', () => {
    const o = overlayVazio()
    expect(conectar(o, 'a', 'x', 'x').id).toBe('')
    const c = conectar(o, 'a', 'x', 'y')
    expect(conectar(c.overlay, 'a', 'x', 'y').id).toBe('')
  })
  it('diagramas novos: criar, receber nós, excluir leva o conteúdo', () => {
    const d = criarDiagrama(overlayVazio(), '  Meu fluxo ')
    const n = adicionarNo(d.overlay, 'nota', d.id, 0, 0)
    const m = mesclar(base, n.overlay)
    expect(m.map((x) => x.id)).toEqual(['a', d.id])
    expect(m[1]).toMatchObject({ titulo: 'Meu fluxo', origem: 'usuario' })
    expect(m[1].nos).toHaveLength(1)
    const ex = excluirDiagrama(n.overlay, d.id)
    expect(overlayEhVazio(ex)).toBe(true)
  })
  it('duplicar copia regra executável e deixa o original', () => {
    const r = adicionarNo(overlayVazio(), 'acao', 'a', 0, 0)
    const o = editarNoUsuario(r.overlay, r.id, { acao: { tipo: 'bloquear', tipoA: 'fl' } })
    const m = mesclar(base, o)[0].nos.find((x) => x.id === r.id)!
    const d = duplicarNo(o, m, 'a')
    expect(d.overlay.nos).toHaveLength(2)
    expect(d.overlay.nos[1].acao).toEqual({ tipo: 'bloquear', tipoA: 'fl' })
    expect(d.overlay.nos[1].id).not.toBe(r.id)
  })
  it('trocar o tipo do nó descarta a regra do tipo antigo', () => {
    const r = adicionarNo(overlayVazio(), 'acao', 'a', 0, 0)
    const o = editarNoUsuario(r.overlay, r.id, { tipo: 'etapa' })
    expect(o.nos[0].acao).toBeUndefined()
  })
})

describe('overlay: normalização, poda, hash e histórico', () => {
  it('normaliza lixo sem quebrar e respeita tipos permitidos', () => {
    const n = normalizarOverlay({ nos: [{ id: 'u.1', diagrama: 'a', tipo: 'acao', titulo: 'x', acao: { tipo: 'bloquear', tipoA: 'fl' } }, { id: 'u.2', diagrama: 'a', tipo: 'bogus' }, 7, { id: '__proto__', diagrama: 'a', tipo: 'etapa' }], arestas: [{ id: 'e', de: 'u.1', para: 'u.1', diagrama: 'a' }], ajustes: { 'a.1': { oculto: true, x: 'z' } } })
    expect(n.nos).toHaveLength(1)
    expect(n.arestas).toHaveLength(0)
    expect(n.ajustes['a.1']).toEqual({ oculto: true })
    expect(normalizarOverlay({ nos: [{ id: 'u.1', diagrama: 'a', tipo: 'acao' }] }, ['etapa', 'nota']).nos).toHaveLength(0)
    expect(normalizarOverlay('lixo')).toEqual(overlayVazio())
    expect(normalizarOverlay(null)).toEqual(overlayVazio())
  })
  it('poda referências órfãs', () => {
    const n = normalizarOverlay({ nos: [{ id: 'u.1', diagrama: 'a', tipo: 'etapa' }, { id: 'u.2', diagrama: 'sumiu', tipo: 'etapa' }], arestas: [{ id: 'e1', de: 'u.1', para: 'a.1', diagrama: 'a' }, { id: 'e2', de: 'u.1', para: 'fantasma', diagrama: 'a' }], ajustes: { 'a.1': { oculto: true }, zzz: { oculto: true } }, arestasOcultas: ['a.1>a.2', 'x>y'] })
    const p = podarOverlay(base, n)
    expect(p.nos.map((x) => x.id)).toEqual(['u.1'])
    expect(p.arestas.map((x) => x.id)).toEqual(['e1'])
    expect(Object.keys(p.ajustes)).toEqual(['a.1'])
    expect(p.arestasOcultas).toEqual(['a.1>a.2'])
  })
  it('hash é estável e muda com o conteúdo', () => {
    const a = overlayVazio(), b = adicionarNo(a, 'nota', 'a', 1, 2).overlay
    expect(hashOverlay(a)).toBe(hashOverlay(overlayVazio()))
    expect(hashOverlay(a)).not.toBe(hashOverlay(b))
  })
  it('desfazer/refazer', () => {
    const o0 = overlayVazio(), o1 = adicionarNo(o0, 'nota', 'a', 0, 0).overlay
    let h = empurrar(historicoVazio(), o0)
    const d = desfazer(h, o1)!
    expect(d.overlay).toBe(o0)
    h = d.h
    expect(refazer(h, d.overlay)!.overlay).toBe(o1)
    expect(desfazer(historicoVazio(), o0)).toBeNull()
  })
})

describe('grafo: validação', () => {
  const com = (f: (o: ReturnType<typeof overlayVazio>) => ReturnType<typeof overlayVazio>) => validarGrafo(mesclar(base, f(overlayVazio())))
  it('base sozinho não gera problemas', () => { expect(validarGrafo(mesclar(base, overlayVazio()))).toEqual([]) })
  it('nó solto = aviso; nota solta é permitida', () => {
    const p = com((o) => adicionarNo(o, 'etapa', 'a', 0, 0).overlay)
    expect(p).toHaveLength(1)
    expect(p[0]).toMatchObject({ nivel: 'aviso' })
    expect(com((o) => adicionarNo(o, 'nota', 'a', 0, 0).overlay)).toEqual([])
  })
  it('decisão precisa de 2 saídas (erro)', () => {
    const p = com((o) => { const d = adicionarNo(o, 'decisao', 'a', 0, 0); return conectar(d.overlay, 'a', 'a.1', d.id).overlay })
    expect(p.find((x) => x.nivel === 'erro')?.mensagem).toMatch(/2 saídas/)
    const ok = com((o) => { const d = adicionarNo(o, 'decisao', 'a', 0, 0); let r = conectar(d.overlay, 'a', d.id, 'a.2', 'sim'); r = conectar(r.overlay, 'a', d.id, 'a.3', 'não'); return conectar(r.overlay, 'a', 'a.1', d.id).overlay })
    expect(ok.filter((x) => x.nivel === 'erro')).toEqual([])
  })
  it('ciclo com nó executável é erro; ciclo só de anotações é aviso', () => {
    const a = adicionarNo(overlayVazio(), 'condicao', 'a', 0, 0), b = adicionarNo(a.overlay, 'acao', 'a', 0, 0)
    let o = conectar(b.overlay, 'a', a.id, b.id).overlay
    o = conectar(o, 'a', b.id, a.id).overlay
    expect(validarGrafo(mesclar(base, o)).some((x) => x.nivel === 'erro' && /Ciclo/.test(x.mensagem))).toBe(true)
    const e1 = adicionarNo(overlayVazio(), 'etapa', 'a', 0, 0), e2 = adicionarNo(e1.overlay, 'etapa', 'a', 0, 0)
    let o2 = conectar(e2.overlay, 'a', e1.id, e2.id).overlay
    o2 = conectar(o2, 'a', e2.id, e1.id).overlay
    const p = validarGrafo(mesclar(base, o2)).filter((x) => /Ciclo/.test(x.mensagem))
    expect(p).toHaveLength(1)
    expect(p[0].nivel).toBe('aviso')
  })
  it('acharCiclos detecta laço e componente', () => {
    expect(acharCiclos(['a', 'b', 'c'], [{ de: 'a', para: 'b' }, { de: 'b', para: 'c' }])).toEqual([])
    expect(acharCiclos(['a', 'b'], [{ de: 'a', para: 'b' }, { de: 'b', para: 'a' }])).toHaveLength(1)
    expect(acharCiclos(['a'], [{ de: 'a', para: 'a' }])).toHaveLength(1)
  })
})

describe('resumo dos nós condição/ação', () => {
  it('descreve com rótulos do catálogo', () => {
    expect(resumirCondicao({ ou: [[{ variavel: 'dia_semana', op: 'em', valor: [5, 6] }]] }, CATALOGO)).toBe('Dia da semana está em sábado, domingo')
    expect(resumirCondicao({ ou: [] }, CATALOGO)).toMatch(/sem condição/)
    expect(resumirAcao({ tipo: 'bloquear', tipoA: 'qu' }, CATALOGO)).toBe('Bloquear tipo: Questões')
    expect(resumirAcao({ tipo: 'limitar_por_dia', tipoA: 'qu', valor: 2 }, CATALOGO)).toBe('Limitar por dia: Questões · 2')
  })
})
