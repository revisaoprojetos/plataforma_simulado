// Caderno (beta) — TESTES DE INTEGRIDADE das ROTAS com Supabase em memória (lib/aluno/teste-util/fake-supabase.ts):
// isolamento tenant+estudante, idempotência/versão, lixeira (60 dias), árvore, restauração, upload, limites de corpo, rate limit.
import { randomUUID } from 'crypto'
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeDb, violacoesDeEscopo, type Linha } from './teste-util/fake-supabase'

vi.mock('server-only', () => ({}))
const h = vi.hoisted(() => ({
  sessao: null as any,
  db: null as any,
  removidos: [] as string[],
  enviados: [] as { path: string; bucket: string }[],
}))
vi.mock('@/lib/aluno-session', () => ({ getSessaoAluno: async () => h.sessao }))
vi.mock('@/lib/aluno/caderno-beta-acesso', () => ({ cadernoBetaLiberado: async () => true }))
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: () => h.db }))
vi.mock('@/lib/conteudo/politica-download', () => ({ bloqueioDownloadsAluno: async () => false }))
vi.mock('@/lib/storage', async () => {
  const v = await import('@/lib/storage/validate')
  return {
    sniffMime: v.sniffMime,
    getStorage: () => ({
      upload: async (p: { path: string; bucket: string }) => { h.enviados.push({ path: p.path, bucket: p.bucket }); return {} },
      remove: async (_b: string, path: string) => { h.removidos.push(path) },
      download: async () => null,
    }),
  }
})

import { GET as getArvore } from '../../app/api/aluno/notebook/arvore/route'
import { GET as getPagina, PATCH as patchPagina, DELETE as delPagina } from '../../app/api/aluno/notebook/paginas/[id]/route'
import { POST as postPagina } from '../../app/api/aluno/notebook/paginas/route'
import { POST as postCopiar } from '../../app/api/aluno/notebook/paginas/[id]/copiar/route'
import { POST as postMover } from '../../app/api/aluno/notebook/paginas/[id]/mover/route'
import { POST as postRestaurarPagina } from '../../app/api/aluno/notebook/paginas/[id]/restaurar/route'
import { POST as postRestaurarSecao } from '../../app/api/aluno/notebook/secoes/[id]/restaurar/route'
import { POST as postSecao } from '../../app/api/aluno/notebook/secoes/route'
import { PATCH as patchSecao, DELETE as delSecao } from '../../app/api/aluno/notebook/secoes/[id]/route'
import { GET as getExportar } from '../../app/api/aluno/notebook/paginas/[id]/exportar/route'
import { GET as getLixeira } from '../../app/api/aluno/notebook/lixeira/route'
import { GET as getBusca } from '../../app/api/aluno/notebook/busca/route'
import { GET as getAutoErros } from '../../app/api/aluno/notebook/auto/erros/route'
import { POST as postArquivo } from '../../app/api/aluno/notebook/arquivos/route'
import { lerJson } from './notebook-api'
import { LIMITES, ROTA_ARQUIVOS_NOTEBOOK } from './notebook-tipos'
import { ocultarGabaritoNaoRespondidas, questoesParaAluno } from './cadernos-aluno'

const P = 'simulado_aluno_notebook_paginas'
const S = 'simulado_aluno_notebook_secoes'
const N = 'simulado_aluno_notebook'
const doc = (...content: any[]) => ({ type: 'doc', content })
const par = (text: string, marks?: any[]) => ({ type: 'paragraph', content: [{ type: 'text', text, ...(marks ? { marks } : {}) }] })
const dias = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString()
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })

let db: FakeDb
let T1: string, T2: string, E1: string, E2: string, E3: string
let nb1: Linha, nb2: Linha, nb3: Linha
let sec1: Linha, sec2: Linha, sec3: Linha
let pag1: Linha, pag2: Linha, pag3: Linha

const req = (url: string, init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}) =>
  new NextRequest(`http://localhost${url}`, { method: init.method ?? 'GET', headers: init.headers, body: init.body === undefined ? undefined : typeof init.body === 'string' ? init.body : JSON.stringify(init.body) })
const json = async (r: Response) => ({ status: r.status, ...(await r.json()) })

function sessao(tenantId: string, estudanteId: string, extra: Record<string, unknown> = {}) {
  h.sessao = { tenantId, estudanteId, email: 'aluno@teste.com', ...extra }
}

beforeEach(() => {
  db = new FakeDb(); h.db = db; h.removidos = []; h.enviados = []
  T1 = randomUUID(); T2 = randomUUID(); E1 = randomUUID(); E2 = randomUUID(); E3 = randomUUID()
  ;[nb1] = db.seed(N, { tenant_id: T1, estudante_id: E1, titulo: 'Meu Caderno' })
  ;[nb2] = db.seed(N, { tenant_id: T1, estudante_id: E2, titulo: 'Meu Caderno' })
  ;[nb3] = db.seed(N, { tenant_id: T2, estudante_id: E3, titulo: 'Meu Caderno' })
  ;[sec1] = db.seed(S, { tenant_id: T1, estudante_id: E1, notebook_id: nb1.id, nome: 'Geral', ordem: 1024, tipo: 'manual', deletado_em: null })
  ;[sec2] = db.seed(S, { tenant_id: T1, estudante_id: E2, notebook_id: nb2.id, nome: 'Alheia', ordem: 1024, tipo: 'manual', deletado_em: null })
  ;[sec3] = db.seed(S, { tenant_id: T2, estudante_id: E3, notebook_id: nb3.id, nome: 'Outro tenant', ordem: 1024, tipo: 'manual', deletado_em: null })
  const pg = (t: string, e: string, n: Linha, s: Linha, titulo: string, ordem = 1024) => db.seed(P, {
    tenant_id: t, estudante_id: e, notebook_id: n.id, secao_id: s.id, titulo, tipo_pagina: 'texto', doc: doc(par('x')), texto_busca: 'x', ordem, nivel: 0,
    arquivada: false, deletado_em: null, client_op_id: null, ultimo_op_id: null,
  })[0]
  pag1 = pg(T1, E1, nb1, sec1, 'Minha página'); pag2 = pg(T1, E2, nb2, sec2, 'Página do colega'); pag3 = pg(T2, E3, nb3, sec3, 'Página de outro tenant')
  sessao(T1, E1)
})

// ================================================================ (1) isolamento
describe('isolamento: id alheio (outro aluno / outro tenant) => 404', () => {
  it('GET/PATCH/DELETE/exportar de página alheia => 404 e nada é alterado', async () => {
    for (const alheia of [pag2, pag3]) {
      expect((await getPagina(req(`/x`), ctx(alheia.id))).status).toBe(404)
      const patch = await patchPagina(req('/x', { method: 'PATCH', body: { versao: 1, client_op_id: randomUUID(), titulo: 'invadido' } }), ctx(alheia.id))
      expect(patch.status).toBe(404)
      expect((await delPagina(req('/x?definitivo=1', { method: 'DELETE' }), ctx(alheia.id))).status).toBe(404)
      expect((await getExportar(req('/x?formato=pdf'), ctx(alheia.id))).status).toBe(404)
    }
    expect(db.rows(P).find((r) => r.id === pag2.id)).toMatchObject({ titulo: 'Página do colega', deletado_em: null })
    expect(db.rows(P).find((r) => r.id === pag3.id)?.titulo).toBe('Página de outro tenant')
  })

  it('seção alheia: PATCH/DELETE/restaurar => 404', async () => {
    expect((await patchSecao(req('/x', { method: 'PATCH', body: { nome: 'invadida' } }), ctx(sec2.id))).status).toBe(404)
    expect((await delSecao(req('/x', { method: 'DELETE' }), ctx(sec2.id))).status).toBe(404)
    db.rows(S).find((r) => r.id === sec2.id)!.deletado_em = dias(1)
    expect((await postRestaurarSecao(req('/x', { method: 'POST' }), ctx(sec2.id))).status).toBe(404)
    expect(db.rows(S).find((r) => r.id === sec2.id)!.deletado_em).not.toBeNull()
  })

  it('restaurar página alheia => 404', async () => {
    db.rows(P).find((r) => r.id === pag2.id)!.deletado_em = dias(1)
    expect((await postRestaurarPagina(req('/x', { method: 'POST' }), ctx(pag2.id))).status).toBe(404)
    expect(db.rows(P).find((r) => r.id === pag2.id)!.deletado_em).not.toBeNull()
  })

  it('mover: secao_id alheia => 404; antes_de_id de outro aluno => 400; página alheia => 404', async () => {
    expect((await postMover(req('/x', { method: 'POST', body: { secao_id: sec2.id } }), ctx(pag1.id))).status).toBe(404)
    expect((await postMover(req('/x', { method: 'POST', body: { secao_id: sec3.id } }), ctx(pag1.id))).status).toBe(404)
    expect((await postMover(req('/x', { method: 'POST', body: { secao_id: sec1.id, antes_de_id: pag2.id } }), ctx(pag1.id))).status).toBe(400)
    expect((await postMover(req('/x', { method: 'POST', body: { secao_id: sec1.id } }), ctx(pag2.id))).status).toBe(404)
    expect(db.rows(P).find((r) => r.id === pag1.id)!.secao_id).toBe(sec1.id)
  })

  it('copiar: secao_id alheia => 404; página alheia => 404; nada é criado', async () => {
    const antes = db.rows(P).length
    expect((await postCopiar(req('/x', { method: 'POST', body: { secao_id: sec2.id, client_op_id: randomUUID() } }), ctx(pag1.id))).status).toBe(404)
    expect((await postCopiar(req('/x', { method: 'POST', body: { secao_id: sec1.id, client_op_id: randomUUID() } }), ctx(pag2.id))).status).toBe(404)
    expect(db.rows(P).length).toBe(antes)
  })

  it('criar página em seção alheia => 404; PATCH movendo para seção alheia => 404; antes_id alheio é ignorado', async () => {
    expect((await postPagina(req('/x', { method: 'POST', body: { secao_id: sec2.id, client_op_id: randomUUID() } }))).status).toBe(404)
    expect((await patchPagina(req('/x', { method: 'PATCH', body: { versao: 1, client_op_id: randomUUID(), secao_id: sec2.id } }), ctx(pag1.id))).status).toBe(404)
    expect(db.rows(P).find((r) => r.id === pag1.id)!.secao_id).toBe(sec1.id)
  })

  it('busca escopo=pagina com pagina_id alheio => 404', async () => {
    expect((await getBusca(req(`/x?q=abc&escopo=pagina&pagina_id=${pag2.id}`))).status).toBe(404)
  })

  it('TODA consulta das rotas aplica tenant_id + estudante_id da sessão (varredura das consultas mockadas)', async () => {
    const outraOp = () => randomUUID()
    await getArvore(req('/x'))
    await getPagina(req('/x'), ctx(pag1.id))
    await patchPagina(req('/x', { method: 'PATCH', body: { versao: 1, client_op_id: outraOp(), titulo: 'novo', doc: doc(par('olá')), nivel: 1 } }), ctx(pag1.id))
    await postPagina(req('/x', { method: 'POST', body: { secao_id: sec1.id, client_op_id: outraOp() } }))
    await postCopiar(req('/x', { method: 'POST', body: { secao_id: sec1.id, client_op_id: outraOp() } }), ctx(pag1.id))
    await postMover(req('/x', { method: 'POST', body: { secao_id: sec1.id } }), ctx(pag1.id))
    await postSecao(req('/x', { method: 'POST', body: { nome: 'Nova', client_op_id: outraOp() } }))
    await patchSecao(req('/x', { method: 'PATCH', body: { nome: 'Renomeada' } }), ctx(sec1.id))
    await getLixeira(req('/x'))
    await getBusca(req('/x?q=olá'))
    await getBusca(req(`/x?q=olá&escopo=pagina&pagina_id=${pag1.id}`))
    await getExportar(req('/x?formato=pdf'), ctx(pag1.id))
    await delPagina(req('/x', { method: 'DELETE' }), ctx(pag1.id))
    await postRestaurarPagina(req('/x', { method: 'POST' }), ctx(pag1.id))
    await delPagina(req('/x', { method: 'DELETE' }), ctx(pag1.id))
    await delPagina(req('/x?definitivo=1', { method: 'DELETE' }), ctx(pag1.id))
    await delSecao(req('/x', { method: 'DELETE' }), ctx(sec1.id))
    await postRestaurarSecao(req('/x', { method: 'POST' }), ctx(sec1.id))
    expect(db.calls.length).toBeGreaterThan(40)
    expect(violacoesDeEscopo(db, T1, E1, { ignorar: ['simulado_favoritos'] })).toEqual([]) // favoritos não tem tenant_id (só estudante_id)
  })
})

// ================================================================ (2) sanitização via rota + doc/tinta
describe('PATCH: sanitização e tipo da página', () => {
  const patch = (id: string, body: Record<string, unknown>) => patchPagina(req('/x', { method: 'PATCH', body: { versao: 1, client_op_id: randomUUID(), ...body } }), ctx(id))

  it('doc inválido (nó proibido) => 422 e o doc salvo não muda', async () => {
    const r = await json(await patch(pag1.id, { doc: doc({ type: 'iframe' }) }))
    expect(r.status).toBe(422); expect(r.code).toBe('doc_invalido')
    expect(db.rows(P).find((x) => x.id === pag1.id)!.versao).toBe(1)
  })
  it('link javascript: é removido ao salvar; texto_busca é recalculado', async () => {
    const r = await patch(pag1.id, { doc: doc(par('clique', [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }])) })
    expect(r.status).toBe(200)
    const salvo = db.rows(P).find((x) => x.id === pag1.id)!
    expect(JSON.stringify(salvo.doc)).not.toContain('javascript')
    expect(salvo.texto_busca).toBe('clique')
  })
  it('doc + tinta juntos => 422', async () => {
    const r = await json(await patch(pag1.id, { doc: doc(par('a')), tinta: { versao: 3 } }))
    expect(r.status).toBe(422); expect(r.code).toBe('doc_e_tinta')
  })
  it('doc em folha_livre => 422; tinta em página de texto => 422', async () => {
    db.rows(P).find((x) => x.id === pag1.id)!.tipo_pagina = 'folha_livre'
    expect((await json(await patch(pag1.id, { doc: doc(par('a')) }))).code).toBe('doc_em_folha')
    db.rows(P).find((x) => x.id === pag1.id)!.tipo_pagina = 'texto'
    const r = await json(await patch(pag1.id, { tinta: { versao: 3, largura: 1200, altura: 1600, caixas: [], tracos: [] } }))
    expect(r.status).toBe(422); expect(r.code).toBe('tinta_em_texto')
  })
  it('folha_livre aceita tinta válida e recusa tinta com pontos demais', async () => {
    db.rows(P).find((x) => x.id === pag1.id)!.tipo_pagina = 'folha_livre'
    expect((await patch(pag1.id, { tinta: { versao: 3, largura: 1200, altura: 1600, caixas: [], tracos: [] } })).status).toBe(200)
    const traco = (n: number) => ({ id: `t${n}`, ferramenta: 'caneta', cor: 'tinta', largura: 2, pontos: Array.from({ length: 20000 }, (_, i) => [i, i, 0.5]) })
    const pesada = { versao: 3, largura: 1200, altura: 1600, caixas: [], tracos: Array.from({ length: 8 }, (_, i) => traco(i)) }
    expect((await patch(pag1.id, { tinta: pesada, versao: 2 })).status).toBe(422)
  })
  it('doc importado (grifoSnapshot sem pagina/documento_id) salva e recarrega (autosave não dá 422)', async () => {
    const importado = doc({ type: 'grifoSnapshot', attrs: { texto: 'nota importada', origem_item_id: randomUUID() } }, { type: 'paragraph' })
    const r = await patch(pag1.id, { doc: importado })
    expect(r.status).toBe(200)
    const g = await json(await getPagina(req('/x'), ctx(pag1.id)))
    expect(g.pagina.doc.content[0].attrs).toEqual({ texto: 'nota importada' })
    expect(g.pagina.versao).toBe(2)
    expect((await patch(pag1.id, { doc: g.pagina.doc, versao: 2 })).status).toBe(200) // re-save do que o GET devolveu
  })
})

// ================================================================ (3) idempotência / versão
describe('idempotência e versão', () => {
  it('versão velha => 409 com versao_atual e a página; client_op_id repetido => replay 200 (sem reaplicar)', async () => {
    const op = randomUUID()
    const a = await json(await patchPagina(req('/x', { method: 'PATCH', body: { versao: 1, client_op_id: op, titulo: 'v2' } }), ctx(pag1.id)))
    expect(a.status).toBe(200); expect(a.versao).toBe(2)
    const replay = await json(await patchPagina(req('/x', { method: 'PATCH', body: { versao: 1, client_op_id: op, titulo: 'v2' } }), ctx(pag1.id)))
    expect(replay.status).toBe(200); expect(replay.replay).toBe(true); expect(replay.versao).toBe(2)
    const conflito = await json(await patchPagina(req('/x', { method: 'PATCH', body: { versao: 1, client_op_id: randomUUID(), titulo: 'v3' } }), ctx(pag1.id)))
    expect(conflito.status).toBe(409); expect(conflito.code).toBe('conflito'); expect(conflito.versao_atual).toBe(2)
    expect(conflito.pagina.titulo).toBe('v2')
    expect(db.rows(P).find((x) => x.id === pag1.id)!.titulo).toBe('v2')
  })

  it('folha v1 -> v2 -> v3 (PATCH em sequência com a versão devolvida)', async () => {
    db.rows(P).find((x) => x.id === pag1.id)!.tipo_pagina = 'folha_livre'
    const folha = (n: number) => ({ versao: 3, largura: 1200, altura: 1600, caixas: [], tracos: n ? [{ id: 'a', ferramenta: 'caneta', cor: 'tinta', largura: 2, pontos: [[1, 1, 0.5]] }] : [] })
    let versao = 1
    for (const n of [0, 1, 0]) {
      const r = await json(await patchPagina(req('/x', { method: 'PATCH', body: { versao, client_op_id: randomUUID(), tinta: folha(n) } }), ctx(pag1.id)))
      expect(r.status).toBe(200); versao = r.versao
    }
    expect(versao).toBe(4)
  })

  it('POST página com o mesmo client_op_id duas vezes cria UMA só', async () => {
    const op = randomUUID()
    const a = await postPagina(req('/x', { method: 'POST', body: { secao_id: sec1.id, client_op_id: op } }))
    const b = await postPagina(req('/x', { method: 'POST', body: { secao_id: sec1.id, client_op_id: op } }))
    expect(a.status).toBe(201); expect(b.status).toBe(200)
    expect(db.rows(P).filter((r) => r.client_op_id === op).length).toBe(1)
  })

  it('copiar com o mesmo client_op_id duas vezes cria UMA cópia', async () => {
    const op = randomUUID()
    expect((await postCopiar(req('/x', { method: 'POST', body: { secao_id: sec1.id, client_op_id: op } }), ctx(pag1.id))).status).toBe(201)
    expect((await postCopiar(req('/x', { method: 'POST', body: { secao_id: sec1.id, client_op_id: op } }), ctx(pag1.id))).status).toBe(200)
    expect(db.rows(P).filter((r) => r.client_op_id === op).length).toBe(1)
  })

  it('seção: replay por client_op_id devolve a existente; 23505 de corrida vira replay (sem 500); excluída => 409', async () => {
    const op = randomUUID()
    expect((await postSecao(req('/x', { method: 'POST', body: { nome: 'A', client_op_id: op } }))).status).toBe(201)
    const replay = await json(await postSecao(req('/x', { method: 'POST', body: { nome: 'A', client_op_id: op } })))
    expect(replay.status).toBe(200)
    expect(db.rows(S).filter((s) => s.origem_id === op).length).toBe(1)

    // corrida: o SELECT de idempotência não enxerga (simulado), o INSERT bate no índice único
    const op2 = randomUUID()
    db.seed(S, { tenant_id: T1, estudante_id: E1, notebook_id: nb1.id, nome: 'B', ordem: 5, tipo: 'manual', origem_tipo: 'client_op', origem_id: op2, deletado_em: null })
    db.unicos[S] = (nova, rows) => !!nova.origem_id && rows.some((r) => r.origem_id === nova.origem_id && r.notebook_id === nova.notebook_id)
    const antes = db.rows(S).length
    const rc = await json(await postSecao(req('/x', { method: 'POST', body: { nome: 'B', client_op_id: op2 } })))
    expect(rc.status).toBe(200)
    expect(db.rows(S).length).toBe(antes)

    const op3 = randomUUID()
    db.seed(S, { tenant_id: T1, estudante_id: E1, notebook_id: nb1.id, nome: 'C', ordem: 6, tipo: 'manual', origem_tipo: 'client_op', origem_id: op3, deletado_em: dias(1) })
    const rx = await json(await postSecao(req('/x', { method: 'POST', body: { nome: 'C', client_op_id: op3 } })))
    expect(rx.status).toBe(409); expect(rx.code).toBe('secao_excluida')
  })

  it('PATCH sem mudar nada de relevante: refine do zod exige ao menos um campo', async () => {
    expect((await patchPagina(req('/x', { method: 'PATCH', body: { versao: 1, client_op_id: randomUUID() } }), ctx(pag1.id))).status).toBe(400)
  })
})

// ================================================================ (5) árvore
describe('árvore: ordenação, subpáginas, clamp de nível, leitura sob impersonation', () => {
  it('lista seções e páginas em ordem; cria a estrutura automática; nível é clampado pela página anterior', async () => {
    const a = pag1
    const [b] = db.seed(P, { tenant_id: T1, estudante_id: E1, notebook_id: nb1.id, secao_id: sec1.id, titulo: 'B', tipo_pagina: 'texto', doc: doc(par('b')), texto_busca: 'b', ordem: 2048, nivel: 0, arquivada: false, deletado_em: null })
    const [c] = db.seed(P, { tenant_id: T1, estudante_id: E1, notebook_id: nb1.id, secao_id: sec1.id, titulo: 'C', tipo_pagina: 'texto', doc: doc(par('c')), texto_busca: 'c', ordem: 3072, nivel: 0, arquivada: false, deletado_em: null })
    // C pede nível 2, mas a anterior (B) é nível 0 => vira 1
    const r = await json(await patchPagina(req('/x', { method: 'PATCH', body: { versao: 1, client_op_id: randomUUID(), nivel: 2 } }), ctx(c.id)))
    expect(r.status).toBe(200); expect(r.nivel).toBe(1)
    // primeira página da seção nunca passa de 0
    const r0 = await json(await patchPagina(req('/x', { method: 'PATCH', body: { versao: 1, client_op_id: randomUUID(), nivel: 2 } }), ctx(a.id)))
    expect(r0.nivel).toBe(0)
    const t = await json(await getArvore(req('/x')))
    expect(t.status).toBe(200)
    expect(t.secoes.map((s: any) => s.tipo)).toEqual(expect.arrayContaining(['manual', 'auto_erros', 'auto_favoritos']))
    const doGeral = t.paginas.filter((p: any) => p.secao_id === sec1.id)
    expect(doGeral.map((p: any) => p.titulo)).toEqual(['Minha página', 'B', 'C'])
    expect(doGeral.map((p: any) => p.nivel)).toEqual([0, 0, 1])
    void b
  })

  it('subpáginas ficam agrupadas sob o pai quando a seção ordena por título', async () => {
    db.rows(S).find((s) => s.id === sec1.id)!.ordenar_por = 'titulo'
    const mk = (titulo: string, ordem: number, nivel: number) => db.seed(P, { tenant_id: T1, estudante_id: E1, notebook_id: nb1.id, secao_id: sec1.id, titulo, tipo_pagina: 'texto', doc: doc(par('x')), texto_busca: 'x', ordem, nivel, arquivada: false, deletado_em: null })[0]
    db.rows(P).splice(db.rows(P).findIndex((p) => p.id === pag1.id), 1)
    mk('Zeta', 1, 0); mk('Filha de Zeta', 2, 1); mk('Alfa', 3, 0)
    const t = await json(await getArvore(req('/x')))
    expect(t.paginas.filter((p: any) => p.secao_id === sec1.id).map((p: any) => p.titulo)).toEqual(['Alfa', 'Zeta', 'Filha de Zeta'])
  })

  it('impersonation read_only: GET /arvore NÃO cria notebook/seções (estrutura vazia/virtual)', async () => {
    const T = randomUUID(), E = randomUUID()
    sessao(T, E, { impersonation: { por: 'admin', sessaoId: 's', actionLevel: 'read_only' } })
    const r = await json(await getArvore(req('/x')))
    expect(r.status).toBe(200); expect(r.secoes).toEqual([]); expect(r.paginas).toEqual([]); expect(r.somente_leitura).toBe(true)
    expect(db.calls.filter((c) => c.op !== 'select')).toEqual([])
    expect(db.rows(N).some((n) => n.estudante_id === E)).toBe(false)
  })

  it('impersonation read_only com notebook existente: só lê (nenhuma escrita)', async () => {
    sessao(T1, E1, { impersonation: { por: 'admin', sessaoId: 's', actionLevel: 'read_only' } })
    const r = await json(await getArvore(req('/x')))
    expect(r.status).toBe(200)
    expect(r.secoes.map((s: any) => s.nome)).toEqual(['Geral']) // não criou as automáticas
    expect(db.calls.filter((c) => c.op !== 'select')).toEqual([])
  })
})

// ================================================================ mover (RPC atômica + fallback)
describe('mover bloco: RPC atômica e fallback', () => {
  it('com a RPC: uma única chamada com tenant+estudante e sem UPDATEs soltos', async () => {
    const [p2] = db.seed(P, { tenant_id: T1, estudante_id: E1, notebook_id: nb1.id, secao_id: sec1.id, titulo: 'p2', tipo_pagina: 'texto', doc: doc(par('x')), texto_busca: 'x', ordem: 2048, nivel: 0, arquivada: false, deletado_em: null })
    db.rpcs.notebook_mover_bloco = () => ({ data: 2 })
    const r = await json(await postMover(req('/x', { method: 'POST', body: { secao_id: sec1.id, antes_de_id: pag1.id } }), ctx(p2.id)))
    expect(r.status).toBe(200)
    expect(db.rpcCalls.map((c) => c.nome)).toEqual(['notebook_mover_bloco'])
    expect(db.rpcCalls[0].params).toMatchObject({ p_tenant: T1, p_estudante: E1, p_secao_origem: sec1.id, p_secao_destino: sec1.id })
    expect(db.calls.filter((c) => c.op === 'update')).toEqual([])
  })
  it('RPC acusa P0002 (não pertence ao aluno) => 404', async () => {
    db.rpcs.notebook_mover_bloco = () => ({ error: { code: 'P0002', message: 'pagina nao encontrada' } })
    expect((await postMover(req('/x', { method: 'POST', body: { secao_id: sec1.id } }), ctx(pag1.id))).status).toBe(404)
  })
  it('sem a RPC (PGRST202) cai no caminho antigo e move de verdade', async () => {
    const [sec1b] = db.seed(S, { tenant_id: T1, estudante_id: E1, notebook_id: nb1.id, nome: 'Destino', ordem: 2048, tipo: 'manual', deletado_em: null })
    const r = await json(await postMover(req('/x', { method: 'POST', body: { secao_id: sec1b.id } }), ctx(pag1.id)))
    expect(r.status).toBe(200)
    expect(db.rows(P).find((x) => x.id === pag1.id)!.secao_id).toBe(sec1b.id)
  })
  it('seção automática como destino => 400', async () => {
    const [auto] = db.seed(S, { tenant_id: T1, estudante_id: E1, notebook_id: nb1.id, nome: 'Meus erros', ordem: 1e6, tipo: 'auto_erros', deletado_em: null })
    expect((await postMover(req('/x', { method: 'POST', body: { secao_id: auto.id } }), ctx(pag1.id))).status).toBe(400)
  })
})

// ================================================================ (6) lixeira
describe('lixeira: 60 dias e restauração exata', () => {
  it('lista só itens apagados nos últimos 60 dias', async () => {
    const [velha] = db.seed(P, { tenant_id: T1, estudante_id: E1, notebook_id: nb1.id, secao_id: sec1.id, titulo: 'velha', tipo_pagina: 'texto', doc: doc(par('x')), texto_busca: '', ordem: 5, nivel: 0, arquivada: false, deletado_em: dias(61) })
    const [recente] = db.seed(P, { tenant_id: T1, estudante_id: E1, notebook_id: nb1.id, secao_id: sec1.id, titulo: 'recente', tipo_pagina: 'texto', doc: doc(par('x')), texto_busca: '', ordem: 6, nivel: 0, arquivada: false, deletado_em: dias(59) })
    const r = await json(await getLixeira(req('/x')))
    expect(r.dias).toBe(60)
    expect(r.paginas.map((p: any) => p.id)).toEqual([recente.id])
    expect(r.paginas.map((p: any) => p.id)).not.toContain(velha.id)
  })

  it('restaurar página com mais de 60 dias => 404; dentro do prazo restaura e renormaliza nível/ordem', async () => {
    const [velha] = db.seed(P, { tenant_id: T1, estudante_id: E1, notebook_id: nb1.id, secao_id: sec1.id, titulo: 'velha', tipo_pagina: 'texto', doc: doc(par('x')), texto_busca: '', ordem: 5, nivel: 0, arquivada: false, deletado_em: dias(61) })
    expect((await postRestaurarPagina(req('/x', { method: 'POST' }), ctx(velha.id))).status).toBe(404)
    // dentro do prazo: nível 2 (inválido como 1ª/seguinte de nível 0) e ordem colidindo com a pag1 (1024)
    const [boa] = db.seed(P, { tenant_id: T1, estudante_id: E1, notebook_id: nb1.id, secao_id: sec1.id, titulo: 'boa', tipo_pagina: 'texto', doc: doc(par('x')), texto_busca: '', ordem: 1024, nivel: 2, arquivada: false, deletado_em: dias(2) })
    expect((await postRestaurarPagina(req('/x', { method: 'POST' }), ctx(boa.id))).status).toBe(200)
    const salva = db.rows(P).find((x) => x.id === boa.id)!
    expect(salva.deletado_em).toBeNull()
    expect(salva.ordem).toBeGreaterThan(1024) // colisão => fim da seção
    expect(salva.nivel).toBeLessThanOrEqual(1) // anterior é nível 0 => no máximo 1
  })

  it('restaurar página cuja seção foi apagada => 404', async () => {
    db.rows(S).find((s) => s.id === sec1.id)!.deletado_em = dias(1)
    db.rows(P).find((p) => p.id === pag1.id)!.deletado_em = dias(1)
    expect((await postRestaurarPagina(req('/x', { method: 'POST' }), ctx(pag1.id))).status).toBe(404)
  })

  it('excluir seção grava o MESMO instante em seção e páginas; restaurar traz só as apagadas junto (igualdade exata)', async () => {
    // página apagada ANTES pelo aluno (instante diferente, mesmo a 500 ms de distância) deve continuar na lixeira
    const [antes] = db.seed(P, { tenant_id: T1, estudante_id: E1, notebook_id: nb1.id, secao_id: sec1.id, titulo: 'apagada antes', tipo_pagina: 'texto', doc: doc(par('x')), texto_busca: '', ordem: 7, nivel: 0, arquivada: false, deletado_em: null })
    const d = await json(await delSecao(req('/x', { method: 'DELETE' }), ctx(sec1.id)))
    expect(d.status).toBe(200)
    const sec = db.rows(S).find((s) => s.id === sec1.id)!
    const instante = sec.deletado_em as string
    expect(db.rows(P).filter((p) => p.secao_id === sec1.id).every((p) => p.deletado_em === instante)).toBe(true)
    const apagadaAntes = new Date(Date.parse(instante) - 500).toISOString()
    db.rows(P).find((p) => p.id === antes.id)!.deletado_em = apagadaAntes
    const r = await json(await postRestaurarSecao(req('/x', { method: 'POST' }), ctx(sec1.id)))
    expect(r.status).toBe(200); expect(r.paginas_restauradas).toBe(1)
    expect(db.rows(S).find((s) => s.id === sec1.id)!.deletado_em).toBeNull()
    expect(db.rows(P).find((p) => p.id === pag1.id)!.deletado_em).toBeNull()
    expect(db.rows(P).find((p) => p.id === antes.id)!.deletado_em).toBe(apagadaAntes)
  })

  it('restaurar seção com mais de 60 dias => 404; respeita o teto de seções e de páginas', async () => {
    const [velha] = db.seed(S, { tenant_id: T1, estudante_id: E1, notebook_id: nb1.id, nome: 'velha', ordem: 9, tipo: 'manual', deletado_em: dias(61) })
    expect((await postRestaurarSecao(req('/x', { method: 'POST' }), ctx(velha.id))).status).toBe(404)
    const [recente] = db.seed(S, { tenant_id: T1, estudante_id: E1, notebook_id: nb1.id, nome: 'recente', ordem: 10, tipo: 'manual', deletado_em: dias(1) })
    for (let i = 0; i < LIMITES.secoesManuaisMax; i++) db.seed(S, { tenant_id: T1, estudante_id: E1, notebook_id: nb1.id, nome: `s${i}`, ordem: 100 + i, tipo: 'manual', deletado_em: null })
    expect((await postRestaurarSecao(req('/x', { method: 'POST' }), ctx(recente.id))).status).toBe(400)
  })

  it('restaurar seção renormaliza os níveis (1ª página nunca > 0)', async () => {
    const ts = dias(1)
    const [s] = db.seed(S, { tenant_id: T1, estudante_id: E1, notebook_id: nb1.id, nome: 'rest', ordem: 11, tipo: 'manual', deletado_em: ts })
    const a = db.seed(P, { tenant_id: T1, estudante_id: E1, notebook_id: nb1.id, secao_id: s.id, titulo: 'a', tipo_pagina: 'texto', doc: doc(par('x')), texto_busca: '', ordem: 1, nivel: 2, arquivada: false, deletado_em: ts })[0]
    const b = db.seed(P, { tenant_id: T1, estudante_id: E1, notebook_id: nb1.id, secao_id: s.id, titulo: 'b', tipo_pagina: 'texto', doc: doc(par('x')), texto_busca: '', ordem: 2, nivel: 2, arquivada: false, deletado_em: ts })[0]
    expect((await postRestaurarSecao(req('/x', { method: 'POST' }), ctx(s.id))).status).toBe(200)
    expect(db.rows(P).find((x) => x.id === a.id)!.nivel).toBe(0)
    expect(db.rows(P).find((x) => x.id === b.id)!.nivel).toBe(1)
    expect(db.rows(P).find((x) => x.id === b.id)!.versao).toBe(2) // nível mudou => versao++
  })

  it('teto de páginas por notebook: criar/copiar acima de 2000 => 422', async () => {
    for (let i = 0; i < LIMITES.paginasPorNotebookMax; i++) db.rows(P).push({ id: randomUUID(), tenant_id: T1, estudante_id: E1, notebook_id: nb1.id, secao_id: sec1.id, titulo: 'x', ordem: i, nivel: 0, deletado_em: null, arquivada: false, versao: 1 })
    const c = await json(await postPagina(req('/x', { method: 'POST', body: { secao_id: sec1.id, client_op_id: randomUUID() } })))
    expect(c.status).toBe(422); expect(c.code).toBe('limite_paginas')
    expect((await postCopiar(req('/x', { method: 'POST', body: { secao_id: sec1.id, client_op_id: randomUUID() } }), ctx(pag1.id))).status).toBe(422)
  })
})

// ================================================================ exportação via rota
describe('exportar (rota): entradas hostis', () => {
  it('página com palavra de 100k terminando em < 5 s com PDF e DOCX', async () => {
    db.rows(P).find((p) => p.id === pag1.id)!.doc = doc(par('w'.repeat(100_000)), par('ctrl\u0000\u0001\ud800x'))
    for (const formato of ['pdf', 'docx']) {
      const t0 = Date.now()
      const r = await getExportar(req(`/x?formato=${formato}`), ctx(pag1.id))
      expect(r.status).toBe(200)
      expect(Date.now() - t0).toBeLessThan(5000)
    }
  })
})

// ================================================================ (8) upload
describe('upload (rota)', () => {
  const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
  async function enviar(bytes: Uint8Array, nome: string, mime: string, opts: { tipo?: string; semContentLength?: boolean; contentLength?: number } = {}) {
    const fd = new FormData()
    fd.set('file', new File([bytes as BlobPart], nome, { type: mime }))
    fd.set('tipo', opts.tipo ?? 'imagem')
    const resp = new Response(fd)
    const corpo = new Uint8Array(await resp.arrayBuffer())
    const headers: Record<string, string> = { 'content-type': resp.headers.get('content-type')! }
    if (!opts.semContentLength) headers['content-length'] = String(opts.contentLength ?? corpo.byteLength)
    return postArquivo(new NextRequest('http://localhost/api/aluno/notebook/arquivos', { method: 'POST', headers, body: corpo }))
  }

  it('imagem PNG válida => 201 com caminho por tenant/estudante da SESSÃO; registra na cota', async () => {
    const r = await json(await enviar(PNG, 'a.png', 'image/png'))
    expect(r.status).toBe(201)
    expect(r.arquivo.url.startsWith(`${ROTA_ARQUIVOS_NOTEBOOK}/`)).toBe(true)
    expect(h.enviados[0].path).toBe(`caderno-arquivos/${T1}/${E1}/${r.arquivo.arquivo}`)
  })
  it('sem content-length => 411 (antes de bufferizar)', async () => {
    const r = await json(await enviar(PNG, 'a.png', 'image/png', { semContentLength: true }))
    expect(r.status).toBe(411); expect(h.enviados).toEqual([])
  })
  it('content-length acima do limite => 413 sem ler o corpo', async () => {
    const r = await enviar(PNG, 'a.png', 'image/png', { contentLength: LIMITES.anexoBytesMax + 1024 * 1024 })
    expect(r.status).toBe(413)
  })
  it('mime divergente, SVG e HTML => 415 e nada vai ao storage', async () => {
    expect((await enviar(PNG, 'a.png', 'image/jpeg')).status).toBe(415)
    expect((await enviar(new TextEncoder().encode('<svg><script>1</script></svg>'), 'a.svg', 'image/svg+xml')).status).toBe(415)
    expect((await enviar(new TextEncoder().encode('<html></html>'), 'a.html', 'text/html', { tipo: 'arquivo' })).status).toBe(415)
    expect(h.enviados).toEqual([])
  })
  it('cota por aluno (tabela opcional): 300 arquivos => 413 cota_excedida; sem a tabela só vale o limite por requisição', async () => {
    for (let i = 0; i < LIMITES.cotaArquivosQtd; i++) db.seed('simulado_aluno_notebook_arquivos', { tenant_id: T1, estudante_id: E1, arquivo: `${randomUUID()}.png`, bytes: 10 })
    const r = await json(await enviar(PNG, 'a.png', 'image/png'))
    expect(r.status).toBe(413); expect(r.code).toBe('cota_excedida')
  })
  it('produção sem STORAGE_CADERNO_BUCKET => 503 storage_indisponivel pedindo a variável (nunca usa o bucket público)', async () => {
    vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('STORAGE_CADERNO_BUCKET', '')
    try {
      const r = await json(await enviar(PNG, 'a.png', 'image/png'))
      expect(r.status).toBe(503); expect(r.code).toBe('storage_indisponivel'); expect(r.message).toContain('STORAGE_CADERNO_BUCKET')
      expect(h.enviados).toEqual([])
    } finally { vi.unstubAllEnvs() }
  })
  it('com STORAGE_CADERNO_BUCKET em produção envia para esse bucket', async () => {
    vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('STORAGE_CADERNO_BUCKET', 'caderno-privado')
    try {
      expect((await enviar(PNG, 'a.png', 'image/png')).status).toBe(201)
      expect(h.enviados[0].bucket).toBe('caderno-privado')
    } finally { vi.unstubAllEnvs() }
  })
})

describe('exclusão definitiva: limpeza do storage', () => {
  const arq = (n: string) => `${randomUUID()}.${n}`
  it('apaga do storage só os arquivos que a RPC declara órfãos (best-effort) e remove da cota', async () => {
    const orfao = arq('png'), compartilhado = arq('png')
    const alvo = db.rows(P).find((p) => p.id === pag1.id)!
    alvo.doc = doc({ type: 'image', attrs: { src: `${ROTA_ARQUIVOS_NOTEBOOK}/${orfao}` } }, { type: 'image', attrs: { src: `${ROTA_ARQUIVOS_NOTEBOOK}/${compartilhado}` } })
    alvo.deletado_em = dias(1)
    db.seed('simulado_aluno_notebook_arquivos', { tenant_id: T1, estudante_id: E1, arquivo: orfao, bytes: 5 })
    db.rpcs.notebook_arquivos_orfaos = (p) => ({ data: (p.p_arquivos as string[]).filter((a) => a === orfao) })
    const r = await delPagina(req('/x?definitivo=1', { method: 'DELETE' }), ctx(pag1.id))
    expect(r.status).toBe(200)
    expect(h.removidos).toEqual([`caderno-arquivos/${T1}/${E1}/${orfao}`])
    expect(db.rows('simulado_aluno_notebook_arquivos')).toEqual([])
    expect(db.rows(P).some((p) => p.id === pag1.id)).toBe(false)
  })
  it('sem a RPC não apaga NADA do storage (conservador) e a exclusão da página segue', async () => {
    const alvo = db.rows(P).find((p) => p.id === pag1.id)!
    alvo.doc = doc({ type: 'image', attrs: { src: `${ROTA_ARQUIVOS_NOTEBOOK}/${arq('png')}` } }); alvo.deletado_em = dias(1)
    expect((await delPagina(req('/x?definitivo=1', { method: 'DELETE' }), ctx(pag1.id))).status).toBe(200)
    expect(h.removidos).toEqual([])
  })
  it('definitivo exige a página já estar na lixeira', async () => {
    expect((await delPagina(req('/x?definitivo=1', { method: 'DELETE' }), ctx(pag1.id))).status).toBe(400)
  })
})

// ================================================================ M1 limites de corpo + M5 rate limit/busca
describe('corpo JSON com teto e rate limit', () => {
  it('content-length acima de 3 MB => 413', async () => {
    const r = await lerJson(req('/x', { method: 'POST', body: '{}', headers: { 'content-length': String(4 * 1024 * 1024) } }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.resposta.status).toBe(413)
  })
  it('sem content-length, o stream é cortado ao passar de 3 MB => 413 (não bufferiza tudo)', async () => {
    const grande = `{"x":"${'a'.repeat(3 * 1024 * 1024 + 10)}"}`
    const r = await lerJson(new Request('http://localhost/x', { method: 'POST', body: grande }))
    expect(!r.ok && r.resposta.status).toBe(413)
  })
  it('JSON inválido/vazio => 400; JSON válido passa; PATCH grande demais => 413', async () => {
    const inv = await lerJson(new Request('http://localhost/x', { method: 'POST', body: '{nao json' }))
    expect(!inv.ok && inv.resposta.status).toBe(400)
    const vazio = await lerJson(new Request('http://localhost/x', { method: 'POST' }))
    expect(!vazio.ok && vazio.resposta.status).toBe(400)
    const ok = await lerJson(new Request('http://localhost/x', { method: 'POST', body: '{"a":1}' }))
    expect(ok.ok && ok.corpo).toEqual({ a: 1 })
    const r = await patchPagina(req('/x', { method: 'PATCH', body: { versao: 1, client_op_id: randomUUID(), titulo: 'x'.repeat(3 * 1024 * 1024 + 10) } }), ctx(pag1.id))
    expect(r.status).toBe(413)
  })
  it('GETs caros têm rate limit (busca/auto/lixeira ≈ 5/s por aluno)', async () => {
    const codigos: number[] = []
    for (let i = 0; i < 7; i++) codigos.push((await getBusca(req('/x?q=abc'))).status)
    expect(codigos.slice(0, 5).every((c) => c === 200)).toBe(true)
    expect(codigos.slice(5)).toEqual([429, 429])
    const lix: number[] = []
    for (let i = 0; i < 7; i++) lix.push((await getLixeira(req('/x'))).status)
    expect(lix.filter((c) => c === 429).length).toBe(2)
    const aut: number[] = []
    for (let i = 0; i < 7; i++) aut.push((await getAutoErros(req('/x'))).status)
    expect(aut.filter((c) => c === 429).length).toBe(2)
  })
})

describe('busca', () => {
  it('com a RPC: o trecho vem do banco e o total da janela; escopo/limite são repassados', async () => {
    db.rpcs.notebook_buscar = () => ({ data: [{ id: pag1.id, secao_id: sec1.id, titulo: 'Minha página', trecho: '…olá mundo…', total: 7 }] })
    const r = await json(await getBusca(req(`/x?q=olá&escopo=secao&secao_id=${sec1.id}&limit=10`)))
    expect(r.total).toBe(7); expect(r.itens[0].trecho).toBe('…olá mundo…')
    expect(db.rpcCalls[0].params).toMatchObject({ p_tenant: T1, p_estudante: E1, p_secao: sec1.id, p_limit: 10 })
  })
  it('sem a RPC: fallback com no máximo 10 itens por requisição e trecho calculado no servidor', async () => {
    for (let i = 0; i < 25; i++) db.seed(P, { tenant_id: T1, estudante_id: E1, notebook_id: nb1.id, secao_id: sec1.id, titulo: `p${i}`, tipo_pagina: 'texto', doc: doc(par('x')), texto_busca: `texto com palavra${i} no meio`, ordem: 10 + i, nivel: 0, arquivada: false, deletado_em: null, atualizado_em: new Date().toISOString() })
    const r = await json(await getBusca(req('/x?q=palavra&limit=30')))
    expect(r.status).toBe(200); expect(r.itens.length).toBeLessThanOrEqual(10)
  })
  it('busca inválida (curta) => 400', async () => {
    expect((await getBusca(req('/x?q=a'))).status).toBe(400)
  })
})

// ================================================================ A1 questoesParaAluno
describe('questoesParaAluno: tenant + gabarito só após responder', () => {
  const Q1 = randomUUID(), Q2 = randomUUID(), QX = randomUUID()
  function seedQuestoes() {
    db.tabelas['simulado_questoes'] = [
      { id: Q1, tenant_id: T1, tipo: 'objetiva', enunciado: 'e1', disciplina_id: null, ano: 2024, comentario_professor: 'COMENTARIO-1', status: 'publicada' },
      { id: Q2, tenant_id: T1, tipo: 'objetiva', enunciado: 'e2', disciplina_id: null, ano: 2024, comentario_professor: 'COMENTARIO-2', status: 'publicada' },
      { id: QX, tenant_id: T2, tipo: 'objetiva', enunciado: 'DE OUTRO TENANT', disciplina_id: null, ano: 2024, comentario_professor: 'SEGREDO', status: 'publicada' },
    ]
    db.tabelas['simulado_alternativas'] = [
      { id: randomUUID(), tenant_id: T1, questao_id: Q1, texto: 'a', ordem: 1, correta: true },
      { id: randomUUID(), tenant_id: T1, questao_id: Q1, texto: 'b', ordem: 2, correta: false },
      { id: randomUUID(), tenant_id: T1, questao_id: Q2, texto: 'a', ordem: 1, correta: false },
      { id: randomUUID(), tenant_id: T1, questao_id: Q2, texto: 'b', ordem: 2, correta: true },
      { id: randomUUID(), tenant_id: T2, questao_id: QX, texto: 'a', ordem: 1, correta: true },
    ]
    db.tabelas['simulado_respostas_avulsas'] = [{ id: randomUUID(), tenant_id: T1, estudante_id: E1, questao_id: Q1, correta: true, respondido_em: dias(1) }, { id: randomUUID(), tenant_id: T1, estudante_id: E2, questao_id: Q2, correta: true, respondido_em: dias(1) }]
  }

  it('questão de OUTRO tenant referenciada por id nunca é devolvida (queries filtram tenant_id)', async () => {
    seedQuestoes()
    const lista = await questoesParaAluno(db, T1, E1, [Q1, QX])
    expect(lista.map((q) => q.id)).toEqual([Q1])
    expect(JSON.stringify(lista)).not.toContain('SEGREDO')
    const tabQ = db.calls.filter((c) => c.table === 'simulado_questoes' || c.table === 'simulado_alternativas')
    expect(tabQ.length).toBeGreaterThan(0)
    expect(tabQ.every((c) => c.eq.tenant_id === T1)).toBe(true)
  })

  it('comportamento antigo (cadernos de questões) mantém o gabarito; no Caderno beta só das já respondidas', async () => {
    seedQuestoes()
    const antigo = await questoesParaAluno(db, T1, E1, [Q1, Q2])
    expect(antigo.every((q) => q.alternativas.some((a) => a.correta))).toBe(true)
    const beta = await questoesParaAluno(db, T1, E1, [Q1, Q2], { ocultarGabaritoNaoRespondidas: true })
    const q1 = beta.find((q) => q.id === Q1)!, q2 = beta.find((q) => q.id === Q2)!
    expect(q1.alternativas.some((a) => a.correta)).toBe(true); expect(q1.comentario_professor).toBe('COMENTARIO-1'); expect(q1.gabarito_oculto).toBeUndefined()
    // Q2 foi respondida só pelo OUTRO aluno (E2): para E1 continua oculta
    expect(q2.alternativas.every((a) => !a.correta)).toBe(true); expect(q2.comentario_professor).toBeNull(); expect(q2.gabarito_oculto).toBe(true)
    expect(JSON.stringify(beta)).not.toContain('COMENTARIO-2')
    const resp = db.calls.filter((c) => c.table === 'simulado_respostas_avulsas')
    expect(resp.every((c) => c.eq.tenant_id === T1 && c.eq.estudante_id === E1)).toBe(true)
  })

  it('ocultarGabaritoNaoRespondidas (pura) não muta a entrada e preserva as respondidas', () => {
    const q: any = { id: 'a', enunciado: '', favorito: false, comentario_professor: 'x', alternativas: [{ id: '1', texto: '', ordem: 1, correta: true }] }
    const out = ocultarGabaritoNaoRespondidas([q], new Set())
    expect(out[0].alternativas[0].correta).toBe(false); expect(q.alternativas[0].correta).toBe(true)
    expect(ocultarGabaritoNaoRespondidas([q], new Set(['a']))[0]).toBe(q)
  })

  it('GET da página hidrata questaoRef só do tenant e sem gabarito das não respondidas', async () => {
    seedQuestoes()
    db.rows(P).find((p) => p.id === pag1.id)!.doc = doc({ type: 'questaoRef', attrs: { questao_id: Q2 } }, { type: 'questaoRef', attrs: { questao_id: QX } })
    const r = await json(await getPagina(req('/x'), ctx(pag1.id)))
    expect(r.status).toBe(200)
    expect(r.refs.questoes.map((q: any) => q.id)).toEqual([Q2])
    expect(r.refs.questoes[0].gabarito_oculto).toBe(true)
    expect(JSON.stringify(r.refs)).not.toContain('SEGREDO')
    expect(JSON.stringify(r.refs)).not.toContain('COMENTARIO-2')
  })
})
