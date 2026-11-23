// Caderno (beta) — otimização de SERVIDOR: RPCs com fallback, árvore paralela, ?campos=versao, replay leve, enunciado_texto e POST /paginas enxuto.
import { randomUUID } from 'crypto'
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeDb, type Linha } from './teste-util/fake-supabase'

vi.mock('server-only', () => ({}))
const h = vi.hoisted(() => ({ sessao: null as any, db: null as any }))
vi.mock('@/lib/aluno-session', () => ({ getSessaoAluno: async () => h.sessao }))
vi.mock('@/lib/aluno/caderno-beta-acesso', () => ({ cadernoBetaLiberado: async () => true }))
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: () => h.db }))

import { GET as getArvore } from '../../app/api/aluno/notebook/arvore/route'
import { GET as getPagina, PATCH as patchPagina } from '../../app/api/aluno/notebook/paginas/[id]/route'
import { POST as postPagina } from '../../app/api/aluno/notebook/paginas/route'
import { GET as getAutoErros } from '../../app/api/aluno/notebook/auto/erros/route'
import { GET as getLixeira } from '../../app/api/aluno/notebook/lixeira/route'
import { contarErrosAluno, enunciadoTexto, limparCacheErros, tabelaAusente } from './notebook-server'
import { limparCacheEstrutura } from './notebook-api'

const P = 'simulado_aluno_notebook_paginas'
const S = 'simulado_aluno_notebook_secoes'
const N = 'simulado_aluno_notebook'
const R = 'simulado_respostas_avulsas'
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })
const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x' }] }] }
const req = (url: string, init: { method?: string; body?: unknown } = {}) =>
  new NextRequest(`http://localhost${url}`, { method: init.method ?? 'GET', body: init.body === undefined ? undefined : JSON.stringify(init.body) })
const json = async (r: Response) => ({ status: r.status, ...(await r.json()) })

let db: FakeDb
let T1: string, E1: string, E2: string
let nb: Linha, sec: Linha, pg: Linha[]

beforeEach(() => {
  db = new FakeDb(); h.db = db; limparCacheErros(); limparCacheEstrutura()
  T1 = randomUUID(); E1 = randomUUID(); E2 = randomUUID()
  ;[nb] = db.seed(N, { tenant_id: T1, estudante_id: E1, titulo: 'Meu Caderno' })
  ;[sec] = db.seed(S, { tenant_id: T1, estudante_id: E1, notebook_id: nb.id, nome: 'Geral', ordem: 1024, tipo: 'manual', deletado_em: null })
  db.seed(S, { tenant_id: T1, estudante_id: E1, notebook_id: nb.id, nome: 'Meus erros', ordem: 1_000_000, tipo: 'auto_erros', deletado_em: null })
  db.seed(S, { tenant_id: T1, estudante_id: E1, notebook_id: nb.id, nome: 'Salvas', ordem: 1_000_001, tipo: 'auto_favoritos', deletado_em: null })
  pg = [1, 2, 3].map((i) => db.seed(P, {
    tenant_id: T1, estudante_id: E1, notebook_id: nb.id, secao_id: sec.id, titulo: `P${i}`, tipo_pagina: 'texto', doc, ordem: 1024 * i, nivel: 0,
    arquivada: false, deletado_em: null, client_op_id: null, ultimo_op_id: null,
  })[0])
  h.sessao = { tenantId: T1, estudanteId: E1, email: 'a@t.com' }
})

/** 3 questões respondidas: q1 errada (última), q2 errada depois acertada, q3 errada. */
function seedRespostas() {
  const q = [1, 2, 3].map((i) => db.seed('simulado_questoes', { tenant_id: T1, tipo: 'objetiva', enunciado: `<p>Enunciado <b>${i}</b>&nbsp;legado</p>`, status: 'publicada' })[0])
  const resp = (qi: number, correta: boolean, dia: number) => db.seed(R, { tenant_id: T1, estudante_id: E1, questao_id: q[qi].id, correta, respondido_em: new Date(2026, 10, dia).toISOString() })
  resp(0, false, 1); resp(1, false, 2); resp(1, true, 3); resp(2, false, 4)
  return q
}

describe('S1 — contar/listar "Meus erros" com RPC e sem RPC', () => {
  it('sem RPC: cai no caminho atual (baixa as respostas) e conta só a ÚLTIMA errada', async () => {
    seedRespostas()
    expect(await contarErrosAluno(db, T1, E1)).toBe(2)
    expect(db.rpcCalls.map((r) => r.nome)).toEqual(['notebook_contar_erros'])
    expect(db.calls.some((c) => c.table === R)).toBe(true)
  })
  it('com RPC: usa a contagem do banco e NÃO lê simulado_respostas_avulsas; cacheia 60 s', async () => {
    db.rpcs.notebook_contar_erros = () => ({ data: 7 })
    expect(await contarErrosAluno(db, T1, E1)).toBe(7)
    expect(await contarErrosAluno(db, T1, E1)).toBe(7)
    expect(db.calls.some((c) => c.table === R)).toBe(false)
    expect(db.rpcCalls).toHaveLength(1)
    expect(db.rpcCalls[0].params).toEqual({ p_tenant: T1, p_estudante: E1 })
  })
  it('árvore: seção "Meus erros" mostra a contagem (RPC e fallback dão o mesmo resultado)', async () => {
    seedRespostas()
    const sem = await json(await getArvore(req('/x')))
    limparCacheErros(); db.rpcs.notebook_contar_erros = () => ({ data: 2 })
    const com = await json(await getArvore(req('/x')))
    const qtd = (b: any) => b.secoes.find((s: any) => s.tipo === 'auto_erros').qtd_paginas
    expect(qtd(sem)).toBe(2)
    expect(qtd(com)).toBe(2)
  })
  it('GET auto/erros: RPC paginada devolve ids+total e preserva a ordem; sem RPC o resultado é o mesmo', async () => {
    const q = seedRespostas()
    const sem = await json(await getAutoErros(req('/api/aluno/notebook/auto/erros?offset=0&limit=10')))
    expect(sem.status).toBe(200)
    expect(sem.total).toBe(2)
    expect(sem.itens.map((i: any) => i.id)).toEqual([q[2].id, q[0].id]) // mais recente primeiro
    db.reset(); limparCacheErros()
    db.rpcs.notebook_listar_erros = () => ({ data: [{ questao_id: q[2].id, total: '2' }, { questao_id: q[0].id, total: '2' }] })
    const com = await json(await getAutoErros(req('/api/aluno/notebook/auto/erros?offset=0&limit=10')))
    expect(com.total).toBe(2)
    expect(com.itens.map((i: any) => i.id)).toEqual([q[2].id, q[0].id])
    expect(db.calls.some((c) => c.table === R)).toBe(false)
  })
})

describe('S7 — enunciado_texto', () => {
  it('limpa HTML, colapsa espaços e corta em 400 (campo antigo continua)', async () => {
    expect(enunciadoTexto('<p>Olá&nbsp;<b>mundo</b></p>\n\n<p>fim</p>')).toBe('Olá mundo fim')
    expect(enunciadoTexto('a'.repeat(900))).toHaveLength(400)
    seedRespostas()
    const r = await json(await getAutoErros(req('/x')))
    expect(r.itens[0].enunciado_texto).toBe('Enunciado 3 legado')
    expect(r.itens[0].enunciado).toContain('<p>')
  })
})

describe('S6 — árvore paralela/agregada não altera a resposta', () => {
  it('com e sem RPC notebook_contar_paginas a árvore é idêntica (qtd_paginas e páginas)', async () => {
    db.seed(P, { tenant_id: T1, estudante_id: E1, notebook_id: nb.id, secao_id: sec.id, titulo: 'arq', tipo_pagina: 'texto', doc, ordem: 9999, nivel: 0, arquivada: true, deletado_em: null })
    const sem = await json(await getArvore(req('/x')))
    db.rpcs.notebook_contar_paginas = (p) => ({ data: [{ secao_id: sec.id, qtd: db.rows(P).filter((r) => r.secao_id === sec.id && !r.arquivada && !r.deletado_em && r.tenant_id === p.p_tenant && r.estudante_id === p.p_estudante).length }] })
    const com = await json(await getArvore(req('/x')))
    expect(com.secoes).toEqual(sem.secoes)
    expect(com.paginas).toEqual(sem.paginas)
    expect(com.secoes.find((s: any) => s.id === sec.id).qtd_paginas).toBe(3)
  })
  it('garantirEstrutura não repete o select de seções na 2ª carga da árvore', async () => {
    await getArvore(req('/x')); db.reset()
    await getArvore(req('/x'))
    const selSecoes = db.calls.filter((c) => c.table === S && c.op === 'select')
    expect(selSecoes).toHaveLength(1) // só o da montarArvore
  })
  it('lixeira: contagem de páginas apagadas junto da seção continua correta', async () => {
    const t = new Date(Date.now() - 86_400_000).toISOString()
    const [lixo] = db.seed(S, { tenant_id: T1, estudante_id: E1, notebook_id: nb.id, nome: 'Apagada', ordem: 5, tipo: 'manual', deletado_em: t })
    for (let i = 0; i < 2; i++) db.seed(P, { tenant_id: T1, estudante_id: E1, notebook_id: nb.id, secao_id: lixo.id, titulo: `d${i}`, tipo_pagina: 'texto', ordem: i, deletado_em: t })
    db.seed(P, { tenant_id: T1, estudante_id: E1, notebook_id: nb.id, secao_id: lixo.id, titulo: 'antes', tipo_pagina: 'texto', ordem: 9, deletado_em: new Date(Date.now() - 2 * 86_400_000).toISOString() })
    const r = await json(await getLixeira(req('/x')))
    expect(r.secoes).toHaveLength(1)
    expect(r.secoes[0].qtd_paginas).toBe(2)
    expect(r.paginas.find((p: any) => p.titulo === 'd0').secao_nome).toBe('Apagada')
  })
})

describe('S5 — GET ?campos=versao', () => {
  it('devolve só id/versao/atualizado_em, sem hidratar questões; id alheio => 404', async () => {
    db.reset()
    const r = await json(await getPagina(req(`/x?campos=versao`), ctx(pg[0].id)))
    expect(r.status).toBe(200)
    expect(Object.keys(r.pagina).sort()).toEqual(['id', 'versao'])
    expect(r.refs).toBeUndefined()
    expect(db.calls.filter((c) => c.table === 'simulado_questoes')).toHaveLength(0)
    const alheia = db.seed(P, { tenant_id: T1, estudante_id: E2, notebook_id: nb.id, secao_id: sec.id, titulo: 'x', tipo_pagina: 'texto', deletado_em: null })[0]
    expect((await getPagina(req('/x?campos=versao'), ctx(alheia.id))).status).toBe(404)
  })
})

describe('S4 — replay/409 do PATCH', () => {
  it('replay devolve só versão/atualizado_em; conflito real devolve a página', async () => {
    const op = randomUUID()
    const body = { versao: 1, client_op_id: op, doc }
    const a = await json(await patchPagina(req('/x', { method: 'PATCH', body }), ctx(pg[0].id)))
    expect(a.status).toBe(200); expect(a.versao).toBe(2)
    // espiona as colunas lidas no replay
    const cols: string[] = []
    const from = db.from.bind(db)
    ;(db as any).from = (t: string) => { const b: any = from(t); const sel = b.select.bind(b); b.select = (c?: string, o?: any) => { if (c) cols.push(c); return sel(c, o) }; return b }
    const r = await json(await patchPagina(req('/x', { method: 'PATCH', body }), ctx(pg[0].id)))
    expect(r).toMatchObject({ status: 200, replay: true, versao: 2 })
    expect(cols.some((c) => /\bdoc\b|\btinta\b/.test(c))).toBe(false)
    const conf = await json(await patchPagina(req('/x', { method: 'PATCH', body: { versao: 1, client_op_id: randomUUID(), doc } }), ctx(pg[0].id)))
    expect(conf).toMatchObject({ status: 409, code: 'conflito', versao_atual: 2 })
    expect(conf.pagina.doc).toBeTruthy()
  })
})

describe('S8 — tabelaAusente cobre coluna ausente', () => {
  it('42703 / PGRST204 => migração pendente', () => {
    expect(tabelaAusente({ code: '42703' })).toBe(true)
    expect(tabelaAusente({ code: 'PGRST204' })).toBe(true)
    expect(tabelaAusente({ code: '42P01' })).toBe(true)
    expect(tabelaAusente({ code: '23505' })).toBe(false)
  })
})

describe('POST /paginas — caminho enxuto e criação otimista', () => {
  const post = (body: Record<string, unknown>) => postPagina(req('/x', { method: 'POST', body: { secao_id: sec.id, client_op_id: randomUUID(), ...body } }))

  it('usa o id do cliente; resposta mínima; replay por client_op_id devolve a existente (200)', async () => {
    const id = randomUUID(), op = randomUUID()
    const r = await json(await post({ id, client_op_id: op, titulo: 'Nova' }))
    expect(r.status).toBe(201)
    expect(r.pagina.id).toBe(id)
    expect(Object.keys(r.pagina).sort()).toEqual(['criado_em', 'id', 'nivel', 'ordem', 'secao_id', 'tipo_pagina', 'titulo', 'versao'])
    const antes = db.rows(P).length
    const rep = await json(await post({ id: randomUUID(), client_op_id: op, titulo: 'Nova' }))
    expect(rep.status).toBe(200)
    expect(rep.pagina.id).toBe(id)
    expect(db.rows(P)).toHaveLength(antes)
  })

  it('id já em uso por outro aluno => 409 sem vazar nada', async () => {
    const alheia = db.seed(P, { tenant_id: T1, estudante_id: E2, notebook_id: nb.id, secao_id: sec.id, titulo: 'segredo', tipo_pagina: 'texto', deletado_em: null })[0]
    db.unicos[P] = (nova, rows) => rows.some((x) => x.id === nova.id)
    const r = await json(await post({ id: alheia.id }))
    expect(r.status).toBe(409)
    expect(JSON.stringify(r)).not.toContain('segredo')
    expect(db.rows(P).find((x) => x.id === alheia.id)!.titulo).toBe('segredo')
  })

  it('antes_de_id: posiciona pelo ponto médio; de outro aluno/seção => 400', async () => {
    const r = await json(await post({ antes_de_id: pg[1].id }))
    expect(r.status).toBe(201)
    expect(r.pagina.ordem).toBe((pg[0].ordem + pg[1].ordem) / 2)
    const outraSecao = db.seed(S, { tenant_id: T1, estudante_id: E1, notebook_id: nb.id, nome: 'Outra', ordem: 2048, tipo: 'manual', deletado_em: null })[0]
    const pOutra = db.seed(P, { tenant_id: T1, estudante_id: E1, notebook_id: nb.id, secao_id: outraSecao.id, titulo: 'o', tipo_pagina: 'texto', ordem: 1, deletado_em: null })[0]
    const alheia = db.seed(P, { tenant_id: T1, estudante_id: E2, notebook_id: nb.id, secao_id: sec.id, titulo: 'a', tipo_pagina: 'texto', ordem: 1, deletado_em: null })[0]
    expect((await post({ antes_de_id: pOutra.id })).status).toBe(400)
    expect((await post({ antes_de_id: alheia.id })).status).toBe(400)
  })

  it('nivel com clamp (<= nível da página anterior + 1; primeira da seção => 0)', async () => {
    db.rows(P).find((x) => x.id === pg[2].id)!.nivel = 1
    const r = await json(await post({ nivel: 2 })) // anterior (última) tem nível 1 => clamp 2
    expect(r.pagina.nivel).toBe(2)
    const r2 = await json(await post({ nivel: 2 })) // anterior agora nível 2 => teto 2
    expect(r2.pagina.nivel).toBe(2)
    const vazia = db.seed(S, { tenant_id: T1, estudante_id: E1, notebook_id: nb.id, nome: 'V', ordem: 3000, tipo: 'manual', deletado_em: null })[0]
    const r3 = await json(await postPagina(req('/x', { method: 'POST', body: { secao_id: vazia.id, client_op_id: randomUUID(), nivel: 2 } })))
    expect(r3.pagina.nivel).toBe(0)
    const r4 = await json(await post({ nivel: 3 }))
    expect(r4.status).toBe(400) // fora de 0..2
    // antes_de_id: clamp pela página de cima (pg[0] nível 0 => 1)
    const r5 = await json(await post({ antes_de_id: pg[1].id, nivel: 2 }))
    expect(r5.pagina.nivel).toBe(1)
  })

  it('caminho quente: poucas consultas, nenhuma de notebook/estrutura, e seção alheia => 404', async () => {
    db.reset()
    const r = await json(await post({}))
    expect(r.status).toBe(201)
    expect(db.calls).toHaveLength(5) // existente, seção, teto, última ordem, insert — uma rodada paralela + insert
    expect(db.calls.some((c) => c.table === N)).toBe(false)
    const alheia = db.seed(S, { tenant_id: T1, estudante_id: E2, notebook_id: nb.id, nome: 'x', ordem: 1, tipo: 'manual', deletado_em: null })[0]
    expect((await postPagina(req('/x', { method: 'POST', body: { secao_id: alheia.id, client_op_id: randomUUID() } }))).status).toBe(404)
  })

  it('teto de páginas continua valendo (422)', async () => {
    const base = db.rows(P)
    for (let i = 0; i < 2000; i++) base.push({ id: randomUUID(), tenant_id: T1, estudante_id: E1, secao_id: sec.id, ordem: i, deletado_em: null, versao: 1, nivel: 0 })
    expect((await post({})).status).toBe(422)
  })
})
