'use server'
import type { Categoria } from './actions-tipos'
import {
  LOTE_MAX_DOCS, LOTE_MAX_IDS,
  type AlvoLote, type AcaoLote, type PreviaLote, type ResultadoLote, type ItemResultadoLote,
} from './lote-actions-tipos'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, checkPermission } from '@/lib/auth/permissions'
import { fetchAll, fetchAllByIn } from '@/lib/supabase/fetch-all'
import { registrarAudit } from '@/lib/audit'
import { definirVersaoAtual } from '@/lib/conteudo/documentos'

// AÇÕES EM LOTE da Biblioteca (admin). Estende as ações unitárias existentes (mover, status, acesso,
// visibilidade, legenda, lixeira) para N documentos — e para pastas (vale para os documentos contidos,
// com opção de incluir subpastas). Cada UPDATE é por lote de 80 ids (atômico por lote, idempotente: repetir
// a chamada converge ao mesmo estado). Resultado por item (ok/erro) + UMA entrada de auditoria-resumo.

const DOCS = 'simulado_conteudo_documentos'
const PASTAS = 'simulado_pastas'
const CHUNK = 80
const CATEGORIAS: Categoria[] = ['conteudo', 'modelo_caderno', 'jurisclub']
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const folderArea = (c: Categoria) => (c === 'modelo_caderno' ? 'conteudo_modelo' : c === 'jurisclub' ? 'conteudo_jurisclub' : 'conteudo')
const colunaAusente = (m?: string) => /column .* does not exist|schema cache|42703|PGRST204/i.test(m ?? '')
const uuids = (a: unknown): string[] => [...new Set((Array.isArray(a) ? a : []).filter((x): x is string => typeof x === 'string' && UUID.test(x)))]

async function guard() {
  if (!(await checkPermission('configuracoes:update'))) return { ok: false as const, error: 'Sem permissão.' }
  const access = await getCurrentAccess()
  if (!access.tenantId) return { ok: false as const, error: 'Tenant não resolvido.' }
  return { ok: true as const, tenantId: access.tenantId, atorId: access.userId ?? null }
}

type DocRow = { id: string; titulo: string; pasta_id: string | null; tipo_origem: string; status: string; categoria: string; versao_atual_id: string | null }
const COLS_DOC = 'id, titulo, pasta_id, tipo_origem, status, categoria, versao_atual_id'

type Resolvido =
  | { ok: true; docs: DocRow[]; escopo: Set<string>; topo: string[]; excedeu: boolean; totalPastas: number }
  | { ok: false; error: string }

/** Resolve o alvo (docs + pastas[+subpastas]) na lista final de documentos do tenant (sem lixeira). */
async function resolver(svc: ReturnType<typeof createAdminClient>, tenantId: string, alvo: AlvoLote, forcarSub: boolean): Promise<Resolvido> {
  const docIds = uuids(alvo?.docIds)
  const pastaIds = uuids(alvo?.pastaIds)
  if (docIds.length + pastaIds.length === 0) return { ok: false, error: 'Nada selecionado.' }
  if (docIds.length + pastaIds.length > LOTE_MAX_IDS) return { ok: false, error: `Selecione no máximo ${LOTE_MAX_IDS} itens por vez.` }
  const categoria: Categoria = CATEGORIAS.includes(alvo.categoria) ? alvo.categoria : 'conteudo'

  const escopo = new Set<string>(); const topo: string[] = []
  if (pastaIds.length) {
    const todas = (await fetchAll<any>(() => svc.from(PASTAS).select('id, pai_id, deletado').eq('tenant_id', tenantId).eq('folder_area', folderArea(categoria)).eq('is_folder', true).order('id', { ascending: true }))) ?? []
    const vivas = todas.filter((p) => !p.deletado)
    const existentes = new Set(vivas.map((p) => p.id as string))
    for (const id of pastaIds) if (existentes.has(id)) { escopo.add(id); topo.push(id) }
    if (alvo.incluirSubpastas || forcarSub) {
      const filhos = new Map<string, string[]>()
      for (const p of vivas) if (p.pai_id) (filhos.get(p.pai_id) ?? filhos.set(p.pai_id, []).get(p.pai_id)!).push(p.id)
      const pilha = [...escopo]
      while (pilha.length) { const cur = pilha.pop()!; for (const f of filhos.get(cur) ?? []) if (!escopo.has(f)) { escopo.add(f); pilha.push(f) } }
    }
  }

  const porId = new Map<string, DocRow>()
  const add = (rows: any[]) => { for (const r of rows) if (!porId.has(r.id)) porId.set(r.id, r as DocRow) }
  if (docIds.length) add((await fetchAllByIn<any>(docIds, (c) => svc.from(DOCS).select(COLS_DOC).eq('tenant_id', tenantId).eq('deletado', false).in('id', c).order('id', { ascending: true }))) ?? [])
  if (escopo.size) add((await fetchAllByIn<any>([...escopo], (c) => svc.from(DOCS).select(COLS_DOC).eq('tenant_id', tenantId).eq('deletado', false).in('pasta_id', c).order('id', { ascending: true }))) ?? [])
  const docs = [...porId.values()].sort((a, b) => a.titulo.localeCompare(b.titulo, 'pt-BR'))
  return { ok: true, docs, escopo, topo, excedeu: docs.length > LOTE_MAX_DOCS, totalPastas: escopo.size }
}

/** Prévia ("serão afetados N documentos") — leitura pura, sem escrita. */
export async function previaLote(alvo: AlvoLote, opts?: { forcarSubpastas?: boolean }): Promise<PreviaLote> {
  const vazio: PreviaLote = { ok: false, totalDocs: 0, totalPastas: 0, excedeu: false, amostra: [], docIds: [] }
  const g = await guard(); if (!g.ok) return { ...vazio, error: g.error }
  try {
    const r = await resolver(createAdminClient(), g.tenantId, alvo, !!opts?.forcarSubpastas)
    if (!r.ok) return { ...vazio, error: r.error }
    return {
      ok: true, totalDocs: r.docs.length, totalPastas: r.totalPastas, excedeu: r.excedeu,
      amostra: r.docs.slice(0, 8).map((d) => ({ id: d.id, titulo: d.titulo })),
      docIds: r.excedeu ? [] : r.docs.map((d) => d.id),
    }
  } catch (e: any) { return { ...vazio, error: e?.message || 'Falha ao calcular a prévia.' } }
}

type Svc = ReturnType<typeof createAdminClient>
type Erros = Map<string, string>
type Ctx = { svc: Svc; tenantId: string; atorId: string | null; docs: DocRow[]; res: Resolvido & { ok: true }; alvo: AlvoLote; categoriaFinal: Categoria }

const fatiar = <T,>(a: T[], n = CHUNK): T[][] => { const o: T[][] = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o }

/** UPDATE em lotes de 80 ids. Erro do lote → todos os ids dele falham; id ausente do retorno → "não encontrado". */
async function atualizar(ctx: Ctx, ids: string[], patch: Record<string, unknown>, opts?: { fallback?: Record<string, unknown>; msgColuna?: string }): Promise<Erros> {
  const erros: Erros = new Map()
  for (const chunk of fatiar(ids)) {
    const exec = (p: Record<string, unknown>) => ctx.svc.from(DOCS).update(p).eq('tenant_id', ctx.tenantId).eq('deletado', false).in('id', chunk).select('id')
    let r = await exec(patch)
    if (r.error && opts?.fallback && colunaAusente(r.error.message)) r = await exec(opts.fallback)
    if (r.error) {
      const msg = colunaAusente(r.error.message) && opts?.msgColuna ? opts.msgColuna : r.error.message
      for (const id of chunk) erros.set(id, msg)
      continue
    }
    const got = new Set(((r.data as any[]) ?? []).map((x) => x.id))
    for (const id of chunk) if (!got.has(id)) erros.set(id, 'Documento não encontrado ou já na lixeira.')
  }
  return erros
}

async function acaoMover(ctx: Ctx, a: Extract<AcaoLote, { tipo: 'mover' }>): Promise<Erros> {
  const erros: Erros = new Map()
  if (a.destinoId) {
    if (!UUID.test(a.destinoId)) { for (const d of ctx.docs) erros.set(d.id, 'Pasta de destino inválida.'); return erros }
    const { data } = await ctx.svc.from(PASTAS).select('id').eq('tenant_id', ctx.tenantId).eq('id', a.destinoId).eq('is_folder', true).eq('deletado', false).eq('folder_area', folderArea(ctx.categoriaFinal)).maybeSingle()
    if (!data) { for (const d of ctx.docs) erros.set(d.id, 'Pasta de destino não encontrada nesta coleção.'); return erros }
  }
  const ids = ctx.docs.map((d) => d.id)
  const e = await atualizar(ctx, ids, { pasta_id: a.destinoId ?? null, atualizado_em: new Date().toISOString() })
  e.forEach((v, k) => erros.set(k, v))
  return erros
}

async function acaoCategoria(ctx: Ctx, a: Extract<AcaoLote, { tipo: 'categoria' }>): Promise<Erros> {
  const erros: Erros = new Map()
  if (!CATEGORIAS.includes(a.categoria)) { for (const d of ctx.docs) erros.set(d.id, 'Categoria inválida.'); return erros }
  if (a.categoria === ctx.alvo.categoria) return erros // idempotente: já está nela
  const agora = new Date().toISOString()
  // Pastas do escopo acompanham a coleção (senão o documento ficaria numa pasta de outra coleção).
  if (ctx.res.escopo.size) {
    for (const chunk of fatiar([...ctx.res.escopo])) {
      const r = await ctx.svc.from(PASTAS).update({ folder_area: folderArea(a.categoria) }).eq('tenant_id', ctx.tenantId).in('id', chunk)
      if (r.error) for (const d of ctx.docs) if (d.pasta_id && chunk.includes(d.pasta_id)) erros.set(d.id, `Falha ao mover a pasta: ${r.error.message}`)
    }
    if (ctx.res.topo.length) await ctx.svc.from(PASTAS).update({ pai_id: null }).eq('tenant_id', ctx.tenantId).in('id', ctx.res.topo.slice(0, CHUNK))
  }
  const dentro = ctx.docs.filter((d) => !erros.has(d.id) && d.pasta_id && ctx.res.escopo.has(d.pasta_id)).map((d) => d.id)
  const fora = ctx.docs.filter((d) => !erros.has(d.id) && !(d.pasta_id && ctx.res.escopo.has(d.pasta_id))).map((d) => d.id)
  const e1 = await atualizar(ctx, dentro, { categoria: a.categoria, atualizado_em: agora })
  const e2 = await atualizar(ctx, fora, { categoria: a.categoria, pasta_id: null, atualizado_em: agora }) // vai p/ a raiz da nova coleção
  e1.forEach((v, k) => erros.set(k, v)); e2.forEach((v, k) => erros.set(k, v))
  return erros
}

async function acaoStatus(ctx: Ctx, a: Extract<AcaoLote, { tipo: 'status' }>): Promise<Erros> {
  const erros: Erros = new Map()
  const agora = new Date().toISOString()
  if (a.status !== 'publicado') {
    (await atualizar(ctx, ctx.docs.map((d) => d.id), { status: a.status, atualizado_em: agora })).forEach((v, k) => erros.set(k, v))
    return erros
  }
  // Publicar: quem já tem versão atual (ou é "questões", sem arquivo) só troca o status; os demais
  // ganham a ÚLTIMA versão como atual via definirVersaoAtual (mesmos efeitos do publicar unitário).
  const simples = ctx.docs.filter((d) => d.versao_atual_id || d.tipo_origem === 'questoes')
  const precisam = ctx.docs.filter((d) => !d.versao_atual_id && d.tipo_origem !== 'questoes')
  ;(await atualizar(ctx, simples.map((d) => d.id), { status: 'publicado', atualizado_em: agora })).forEach((v, k) => erros.set(k, v))
  if (precisam.length) {
    const vers = (await fetchAllByIn<any>(precisam.map((d) => d.id), (c) => ctx.svc.from('simulado_conteudo_versoes').select('id, documento_id, numero').eq('tenant_id', ctx.tenantId).in('documento_id', c).order('id', { ascending: true }))) ?? []
    const ultima = new Map<string, { id: string; numero: number }>()
    for (const v of vers) { const cur = ultima.get(v.documento_id); if (!cur || Number(v.numero) > cur.numero) ultima.set(v.documento_id, { id: v.id, numero: Number(v.numero) }) }
    for (const grupo of fatiar(precisam, 5)) {
      await Promise.all(grupo.map(async (d) => {
        const u = ultima.get(d.id)
        if (!u) { erros.set(d.id, 'Sem versão para publicar.'); return }
        const r = await definirVersaoAtual(d.id, u.id)
        if (!r.ok) erros.set(d.id, r.erro || 'Falha ao publicar.')
      }))
    }
  }
  return erros
}

async function acaoAcesso(ctx: Ctx, a: Extract<AcaoLote, { tipo: 'acesso' }>): Promise<Erros> {
  const base =
    a.modo === 'herdar' ? { herda_acesso: true, acesso_geral: null, acesso_geral_papel: 'reader' }
    : a.modo === 'todos' ? { herda_acesso: false, acesso_geral: 'todos', acesso_geral_papel: 'reader' }
    : { herda_acesso: false, acesso_geral: 'restrito', acesso_geral_papel: 'reader' } // restrito | bloquear
  const modoAcesso = a.modo === 'herdar' ? 'herdar' : a.modo === 'bloquear' ? 'bloquear' : 'propria'
  const erros = await atualizar(ctx, ctx.docs.map((d) => d.id), { ...base, modo_acesso: modoAcesso, atualizado_em: new Date().toISOString() }, {
    fallback: { ...base },
    msgColuna: 'Rode a migração de acesso (20261022000000) e NOTIFY pgrst.',
  })
  // Grupos: só quando "restrito" com lista informada (substituir = troca a lista; adicionar = acrescenta sem duplicar).
  const grupoIds = a.modo === 'restrito' && Array.isArray(a.grupoIds) ? uuids(a.grupoIds).slice(0, 100) : null
  if (grupoIds) {
    const TG = 'simulado_conteudo_documento_grupos'
    const ok = ctx.docs.filter((d) => !erros.has(d.id)).map((d) => d.id)
    for (const chunk of fatiar(ok)) {
      try {
        let existentes = new Set<string>()
        if (a.gruposModo === 'adicionar') {
          const ex = (await fetchAllByIn<any>(chunk, (c) => ctx.svc.from(TG).select('documento_id, grupo_id').eq('tenant_id', ctx.tenantId).in('documento_id', c).order('documento_id', { ascending: true }), { chunk: CHUNK })) ?? []
          existentes = new Set(ex.map((r) => `${r.documento_id}:${r.grupo_id}`))
        } else {
          const del = await ctx.svc.from(TG).delete().eq('tenant_id', ctx.tenantId).in('documento_id', chunk)
          if (del.error) { for (const id of chunk) erros.set(id, del.error.message); continue }
        }
        const linhas = chunk.flatMap((id) => grupoIds.filter((gid) => !existentes.has(`${id}:${gid}`)).map((gid) => ({ tenant_id: ctx.tenantId, documento_id: id, grupo_id: gid, papel: 'reader', origem: 'avulsa', pode_ler: true, pode_baixar: true, pode_grifar: true })))
        for (const parte of fatiar(linhas, 500)) {
          let ins = await ctx.svc.from(TG).insert(parte)
          if (ins.error && colunaAusente(ins.error.message)) ins = await ctx.svc.from(TG).insert(parte.map((l) => ({ tenant_id: l.tenant_id, documento_id: l.documento_id, grupo_id: l.grupo_id, papel: l.papel })))
          if (ins.error) { for (const id of chunk) erros.set(id, ins.error.message); break }
        }
      } catch (e: any) { for (const id of chunk) erros.set(id, e?.message || 'Falha ao gravar grupos.') }
    }
  }
  return erros
}

async function acaoVisibilidade(ctx: Ctx, a: Extract<AcaoLote, { tipo: 'visibilidade' }>): Promise<Erros> {
  return atualizar(ctx, ctx.docs.map((d) => d.id), { oculto: !!a.oculto }, { msgColuna: 'Rode a migração de acesso v2 (20261026000000).' })
}

async function acaoLegenda(ctx: Ctx, a: Extract<AcaoLote, { tipo: 'legenda' }>): Promise<Erros> {
  const patch: Record<string, unknown> = {}
  if (a.ocultarTabela !== undefined) patch.legproc_ocultar_legenda = a.ocultarTabela
  if (a.categorias !== undefined) patch.legenda_categorias = !!a.categorias
  if (!Object.keys(patch).length) return new Map()
  return atualizar(ctx, ctx.docs.map((d) => d.id), patch, { msgColuna: 'Rode as migrações da legenda (20261101120000 / 20261104150000).' })
}

async function acaoLixeira(ctx: Ctx): Promise<Erros> {
  // Soft-delete → Lixeira (purge em 30 dias). Esta tabela não tem trigger de carimbo: seta explícito.
  return atualizar(ctx, ctx.docs.map((d) => d.id), { deletado: true, deletado_em: new Date().toISOString(), deletado_por: ctx.atorId })
}

const ORDEM: AcaoLote['tipo'][] = ['categoria', 'mover', 'status', 'acesso', 'visibilidade', 'legenda', 'lixeira']
const COLS_ANTES: Record<AcaoLote['tipo'], string[]> = {
  mover: [], categoria: [], status: [], lixeira: ['deletado'],
  acesso: ['acesso_geral', 'herda_acesso', 'modo_acesso'], visibilidade: ['oculto'], legenda: ['legproc_ocultar_legenda', 'legenda_categorias'],
}

/** Estado anterior dos campos extras (tolerante a colunas de migração pendente). */
async function lerExtras(ctx: Ctx, cols: string[]): Promise<Map<string, Record<string, unknown>>> {
  const out = new Map<string, Record<string, unknown>>()
  if (!cols.length) return out
  try {
    const rows = (await fetchAllByIn<any>(ctx.docs.map((d) => d.id), (c) => ctx.svc.from(DOCS).select(`id, ${cols.join(', ')}`).eq('tenant_id', ctx.tenantId).in('id', c).order('id', { ascending: true }))) ?? []
    for (const r of rows) { const { id, ...resto } = r; out.set(id, resto) }
  } catch { /* coluna ausente: segue sem o "antes" desses campos */ }
  return out
}

/**
 * Executa UMA OU MAIS ações sobre o alvo (docs e/ou pastas). Várias ações = "Configurar pasta".
 * Resultado por documento (ok/erro) + auditoria-resumo única (ids + antes por item).
 */
export async function executarLote(alvo: AlvoLote, acoesIn: AcaoLote[]): Promise<ResultadoLote> {
  const falha = (error: string): ResultadoLote => ({ ok: false, error, total: 0, sucesso: 0, falhas: 0, itens: [], porAcao: [] })
  const g = await guard(); if (!g.ok) return falha(g.error)
  const acoes = (Array.isArray(acoesIn) ? acoesIn : []).filter((a) => a && ORDEM.includes(a.tipo))
  if (!acoes.length) return falha('Nenhuma ação informada.')
  if (acoes.some((a) => a.tipo === 'lixeira') && acoes.length > 1) return falha('Enviar para a lixeira não pode ser combinado com outras ações.')
  if (new Set(acoes.map((a) => a.tipo)).size !== acoes.length) return falha('Ação repetida.')
  acoes.sort((a, b) => ORDEM.indexOf(a.tipo) - ORDEM.indexOf(b.tipo))

  const svc = createAdminClient()
  try {
    const categoriaAcao = (acoes.find((a) => a.tipo === 'categoria') as Extract<AcaoLote, { tipo: 'categoria' }> | undefined)?.categoria
    const res = await resolver(svc, g.tenantId, alvo, !!categoriaAcao) // mudar a coleção de uma pasta leva a subárvore toda
    if (!res.ok) return falha(res.error)
    if (res.excedeu) return falha(`A seleção resolve para mais de ${LOTE_MAX_DOCS} documentos. Aplique por subpasta.`)
    if (!res.docs.length) return falha('Nenhum documento encontrado na seleção.')
    const categoriaFinal: Categoria = categoriaAcao && CATEGORIAS.includes(categoriaAcao) ? categoriaAcao : (CATEGORIAS.includes(alvo.categoria) ? alvo.categoria : 'conteudo')
    const ctx: Ctx = { svc, tenantId: g.tenantId, atorId: g.atorId, docs: res.docs, res, alvo: { ...alvo, categoria: CATEGORIAS.includes(alvo.categoria) ? alvo.categoria : 'conteudo' }, categoriaFinal }

    const extras = await lerExtras(ctx, [...new Set(acoes.flatMap((a) => COLS_ANTES[a.tipo]))])
    const errosPorDoc = new Map<string, string[]>()
    const porAcao: ResultadoLote['porAcao'] = []
    for (const a of acoes) {
      let e: Erros
      try {
        e = a.tipo === 'mover' ? await acaoMover(ctx, a)
          : a.tipo === 'categoria' ? await acaoCategoria(ctx, a)
          : a.tipo === 'status' ? await acaoStatus(ctx, a)
          : a.tipo === 'acesso' ? await acaoAcesso(ctx, a)
          : a.tipo === 'visibilidade' ? await acaoVisibilidade(ctx, a)
          : a.tipo === 'legenda' ? await acaoLegenda(ctx, a)
          : await acaoLixeira(ctx)
      } catch (err: any) {
        e = new Map(res.docs.map((d) => [d.id, err?.message || 'Falha inesperada.'] as [string, string]))
      }
      e.forEach((msg, id) => (errosPorDoc.get(id) ?? errosPorDoc.set(id, []).get(id)!).push(`${a.tipo}: ${msg}`))
      porAcao.push({ tipo: a.tipo, ok: res.docs.length - e.size, falhas: e.size })
    }

    const itens: ItemResultadoLote[] = res.docs.map((d) => {
      const er = errosPorDoc.get(d.id)
      return er ? { id: d.id, titulo: d.titulo, ok: false, erro: er.join(' | ') } : { id: d.id, titulo: d.titulo, ok: true }
    })
    const sucesso = itens.filter((i) => i.ok).length

    // Auditoria-resumo ÚNICA: ids + "antes" por item (campos tocados) + parâmetros e resultado.
    const so = acoes.length === 1 ? acoes[0] : null
    const operacao = so?.tipo === 'lixeira' ? 'DELETE' : so?.tipo === 'visibilidade' ? (so.oculto ? 'BLOQUEAR' : 'LIBERAR') : so?.tipo === 'status' && so.status === 'publicado' ? 'LIBERAR' : 'UPDATE'
    const base = new Set(acoes.flatMap((a) => (a.tipo === 'mover' ? ['pasta_id'] : a.tipo === 'categoria' ? ['categoria', 'pasta_id'] : a.tipo === 'status' ? ['status', 'versao_atual_id'] : [])))
    registrarAudit({
      operacao, entidade: DOCS, entidadeId: null, tenantId: g.tenantId, atorId: g.atorId,
      antes: { itens: res.docs.map((d) => ({ id: d.id, titulo: d.titulo, ...Object.fromEntries([...base].map((k) => [k, (d as any)[k] ?? null])), ...(extras.get(d.id) ?? {}) })) },
      depois: {
        lote: true, acoes, pastas: res.topo, incluirSubpastas: !!alvo.incluirSubpastas || !!categoriaAcao,
        ids: res.docs.map((d) => d.id), total: itens.length, sucesso, falhas: itens.length - sucesso,
        erros: itens.filter((i) => !i.ok).map((i) => ({ id: i.id, erro: i.erro })),
      },
    }).catch(() => {})

    revalidatePath('/admin/biblioteca'); revalidatePath('/admin/revisao/biblioteca')
    return { ok: true, total: itens.length, sucesso, falhas: itens.length - sucesso, itens, porAcao }
  } catch (e: any) {
    return falha(e?.message || 'Falha ao executar o lote.')
  }
}
