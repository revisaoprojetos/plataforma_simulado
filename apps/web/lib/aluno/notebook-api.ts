// Caderno (beta) — infraestrutura comum dos route handlers /api/aluno/notebook/**: autenticação, acesso beta,
// tolerância a migração pendente, garantia do notebook (sob demanda) e rate limit de escrita.
import 'server-only'
import { NextResponse } from 'next/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { cadernoBetaLiberado } from '@/lib/aluno/caderno-beta-acesso'
import { createAdminClient } from '@/lib/supabase/server'
import { tabelaAusente } from '@/lib/aluno/notebook-server'
import { LIMITES } from '@/lib/aluno/notebook-tipos'

export interface CtxNotebook { svc: any; tenantId: string; estudanteId: string; notebookId: string }

export function respMigracaoPendente() {
  return NextResponse.json({ ok: false, code: 'migracao_pendente', message: 'Recurso em preparação' }, { status: 503 })
}

/** Erro de banco -> resposta (503 migração pendente | 500 genérico, sem vazar detalhes). */
export function respErroDb(error: unknown, rotulo: string) {
  if (tabelaAusente(error)) return respMigracaoPendente()
  console.error(`[notebook] ${rotulo}:`, (error as { code?: string; message?: string } | null)?.code, (error as { message?: string } | null)?.message)
  return NextResponse.json({ ok: false, code: 'erro_interno', message: 'Não foi possível concluir. Tente novamente.' }, { status: 500 })
}

export const respJson = (corpo: Record<string, unknown>, status = 200) => NextResponse.json({ ok: true, ...corpo }, { status })
export const resp400 = (message: string, extra: Record<string, unknown> = {}) => NextResponse.json({ ok: false, code: 'requisicao_invalida', message, ...extra }, { status: 400 })
export const resp404 = () => NextResponse.json({ ok: false, code: 'nao_encontrado', message: 'Não encontrado.' }, { status: 404 })

/** Teto do corpo JSON das rotas do caderno (a folha livre vai até 1 MB; doc de texto até 2 MB). */
export const CORPO_JSON_MAX_BYTES = 3 * 1024 * 1024
export const resp413 = (message = 'Requisição grande demais.') => NextResponse.json({ ok: false, code: 'corpo_grande', message }, { status: 413 })

/**
 * Lê o corpo JSON COM TETO: rejeita 413 por content-length > máx. e, quando ausente/mentiroso (chunked), lê o stream
 * contando bytes e aborta ao passar do limite (nunca bufferiza mais que `max`+1 chunk).
 */
export async function lerJson(request: Request, max: number = CORPO_JSON_MAX_BYTES): Promise<{ ok: true; corpo: unknown } | { ok: false; resposta: NextResponse }> {
  const cl = request.headers.get('content-length')
  if (cl !== null) {
    const n = Number(cl)
    if (!Number.isFinite(n) || n < 0) return { ok: false, resposta: resp400('Content-Length inválido.') }
    if (n > max) return { ok: false, resposta: resp413() }
  }
  try {
    const reader = request.body?.getReader()
    if (!reader) return { ok: false, resposta: resp400('Corpo JSON inválido.') }
    const partes: Uint8Array[] = []
    let total = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > max) { try { await reader.cancel() } catch { /* ignore */ } return { ok: false, resposta: resp413() } }
      partes.push(value)
    }
    const buf = new Uint8Array(total)
    let o = 0
    for (const p of partes) { buf.set(p, o); o += p.byteLength }
    return { ok: true, corpo: JSON.parse(new TextDecoder().decode(buf)) }
  } catch { return { ok: false, resposta: resp400('Corpo JSON inválido.') } }
}

/** 401 sem sessão; 403 `beta_nao_liberado` sem acesso. Devolve a sessão + service client. */
export async function autenticarBeta(): Promise<
  { ok: true; svc: any; tenantId: string; estudanteId: string; somenteLeitura: boolean } | { ok: false; resposta: NextResponse }
> {
  const sessao = await getSessaoAluno()
  if (!sessao) return { ok: false, resposta: NextResponse.json({ ok: false, code: 'nao_autenticado', message: 'Não autenticado.' }, { status: 401 }) }
  const liberado = await cadernoBetaLiberado({ tenantId: sessao.tenantId, estudanteId: sessao.estudanteId, email: sessao.email })
  if (!liberado) return { ok: false, resposta: NextResponse.json({ ok: false, code: 'beta_nao_liberado', message: 'Recurso não liberado para sua conta.' }, { status: 403 }) }
  // admin visualizando a conta em modo read_only (impersonation): rotas de leitura NÃO podem criar notebook/seções
  return { ok: true, svc: createAdminClient(), tenantId: sessao.tenantId, estudanteId: sessao.estudanteId, somenteLeitura: sessao.impersonation?.actionLevel === 'read_only' }
}

/** Lê o notebook SEM criar (impersonation read_only). null = ainda não existe. */
export async function lerNotebookSemCriar(svc: any, tenantId: string, estudanteId: string): Promise<{ notebook: { id: string; titulo: string } | null } | { error: unknown }> {
  const r = await svc.from('simulado_aluno_notebook').select('id, titulo').eq('tenant_id', tenantId).eq('estudante_id', estudanteId).maybeSingle()
  if (r.error) return { error: r.error }
  return { notebook: r.data ?? null }
}

/** Garante o notebook (1 por tenant+estudante). Retorna id/titulo ou o erro de banco. */
export async function garantirNotebook(svc: any, tenantId: string, estudanteId: string): Promise<{ notebook: { id: string; titulo: string } } | { error: unknown }> {
  const ler = () => svc.from('simulado_aluno_notebook').select('id, titulo').eq('tenant_id', tenantId).eq('estudante_id', estudanteId).maybeSingle()
  const a = await ler()
  if (a.error) return { error: a.error }
  if (a.data) return { notebook: a.data }
  const up = await svc.from('simulado_aluno_notebook').upsert({ tenant_id: tenantId, estudante_id: estudanteId }, { onConflict: 'tenant_id,estudante_id', ignoreDuplicates: true })
  if (up.error) return { error: up.error }
  const b = await ler()
  if (b.error || !b.data) return { error: b.error ?? new Error('notebook não criado') }
  return { notebook: b.data }
}

/**
 * Estrutura mínima: seções automáticas (1 de cada) e, se o notebook nunca teve seção, a semente 'Geral' + 'Sem título'.
 * Idempotente (índices únicos de origem/auto; 23505 é ignorado). Só a rota da árvore chama.
 */
// Estrutura já garantida (por notebook, em memória da réplica, 10 min): evita 1 select de seções a cada carga da árvore.
// Seguro: seções automáticas nunca são excluídas pela API e a semente só nasce com ZERO seções (que contam as apagadas).
const estruturaOk = new Map<string, number>()
const ESTRUTURA_OK_MS = 10 * 60_000
export function limparCacheEstrutura() { estruturaOk.clear() }

export async function garantirEstrutura(svc: any, tenantId: string, estudanteId: string, notebookId: string): Promise<{ error: unknown } | null> {
  const agora = Date.now()
  if ((estruturaOk.get(notebookId) ?? 0) > agora) return null
  const r = await garantirEstruturaBanco(svc, tenantId, estudanteId, notebookId)
  if (!r) {
    if (estruturaOk.size > 2000) estruturaOk.clear()
    estruturaOk.set(notebookId, agora + ESTRUTURA_OK_MS)
  }
  return r
}

async function garantirEstruturaBanco(svc: any, tenantId: string, estudanteId: string, notebookId: string): Promise<{ error: unknown } | null> {
  const { data: existentes, error } = await svc.from('simulado_aluno_notebook_secoes').select('id, tipo')
    .eq('tenant_id', tenantId).eq('estudante_id', estudanteId).eq('notebook_id', notebookId).limit(500)
  if (error) return { error }
  const base = { tenant_id: tenantId, estudante_id: estudanteId, notebook_id: notebookId }
  const tipos = new Set((existentes ?? []).map((s: any) => s.tipo))
  const ignorar = (e: any) => !e || e.code === '23505'

  if ((existentes ?? []).length === 0) {
    const g = await svc.from('simulado_aluno_notebook_secoes').insert({ ...base, nome: 'Geral', ordem: 1024, tipo: 'manual', origem_tipo: 'seed', origem_id: notebookId }).select('id').maybeSingle()
    if (!ignorar(g.error)) return { error: g.error }
    let secaoId: string | undefined = g.data?.id
    if (!secaoId) {
      const r = await svc.from('simulado_aluno_notebook_secoes').select('id').eq('tenant_id', tenantId).eq('estudante_id', estudanteId).eq('notebook_id', notebookId).eq('origem_tipo', 'seed').maybeSingle()
      secaoId = r.data?.id
    }
    if (secaoId) {
      const p = await svc.from('simulado_aluno_notebook_paginas').insert({
        ...base, secao_id: secaoId, titulo: 'Sem título', ordem: 1024, origem_tipo: 'seed', origem_id: notebookId,
      })
      if (!ignorar(p.error)) return { error: p.error }
    }
  }
  const autos: [string, string, number][] = [['auto_erros', 'Meus erros', 1_000_000], ['auto_favoritos', 'Questões salvas', 1_000_001]]
  for (const [tipo, nome, ordem] of autos) {
    if (tipos.has(tipo)) continue
    const r = await svc.from('simulado_aluno_notebook_secoes').insert({ ...base, nome, ordem, tipo })
    if (!ignorar(r.error)) return { error: r.error }
  }
  return null
}

/** Pura: a soma passa do teto de páginas por notebook? */
export const passaTetoPaginas = (vivas: number, adicionar = 1): boolean => vivas + adicionar > LIMITES.paginasPorNotebookMax

/** Teto de páginas VIVAS por notebook (2000). Devolve true se `adicionar` novas páginas ultrapassariam o teto. */
export async function excedeTetoPaginas(svc: any, tenantId: string, estudanteId: string, notebookId: string, adicionar = 1): Promise<{ excede: boolean } | { error: unknown }> {
  const { count, error } = await svc.from('simulado_aluno_notebook_paginas').select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId).eq('estudante_id', estudanteId).eq('notebook_id', notebookId).is('deletado_em', null)
  if (error) return { error }
  return { excede: passaTetoPaginas(count ?? 0, adicionar) }
}
export const respTetoPaginas = () => NextResponse.json({ ok: false, code: 'limite_paginas', message: `Limite de ${LIMITES.paginasPorNotebookMax} páginas atingido.` }, { status: 422 })

// ---------------------------------------------------------------- rate limit (~10/s por estudante, memória do processo)
// ATENÇÃO: o contador vive na MEMÓRIA de cada réplica do `web`; com N réplicas o teto efetivo é ~N× o configurado.
// É um freio contra rajada/abuso por aba, não uma cota global (cota global exigiria Redis/tabela). Chaves de GETs caros usam prefixo
// próprio (ex.: `busca:<estudante>`), assim cada rota tem a sua janela sem competir com as escritas.
const janela = new Map<string, number[]>()
export function limiteEscrita(estudanteId: string, max = 10, ms = 1000): boolean {
  const agora = Date.now()
  const arr = (janela.get(estudanteId) ?? []).filter((t) => agora - t < ms)
  if (arr.length >= max) { janela.set(estudanteId, arr); return false }
  arr.push(agora)
  janela.set(estudanteId, arr)
  if (janela.size > 2000) for (const [k, v] of janela) if (!v.some((t) => agora - t < ms)) janela.delete(k)
  return true
}
export const resp429 = () => NextResponse.json({ ok: false, code: 'muitas_requisicoes', message: 'Muitas requisições. Aguarde um instante.' }, { status: 429 })

// ---------------------------------------------------------------- ordem entre vizinhos (com renumeração rara)
/** Resolve `entre` {antes_id, depois_id} em uma ordem (ponto médio). Renumera a lista se o espaço acabou. */
export async function ordemEntre(
  svc: any, tabela: 'simulado_aluno_notebook_secoes' | 'simulado_aluno_notebook_paginas', ctx: { tenantId: string; estudanteId: string },
  filtro: Record<string, string>, entre: { antes_id?: string | null; depois_id?: string | null }, idMovido: string,
  calcular: (p: number | null, n: number | null) => { ordem: number; renumerar: boolean },
): Promise<{ ordem: number } | { error: unknown }> {
  const buscar = async (id?: string | null) => {
    if (!id) return null
    let q = svc.from(tabela).select('ordem').eq('id', id).eq('tenant_id', ctx.tenantId).eq('estudante_id', ctx.estudanteId).is('deletado_em', null)
    for (const [k, v] of Object.entries(filtro)) q = q.eq(k, v)
    const { data, error } = await q.maybeSingle()
    if (error) throw error
    return data ? (data.ordem as number) : null
  }
  try {
    const [p, n] = await Promise.all([buscar(entre.antes_id), buscar(entre.depois_id)])
    const r = calcular(p, n)
    if (!r.renumerar) return { ordem: r.ordem }
    // espaço esgotado: renumera a lista (viva) 1024*n, mantendo o item movido logo após `antes_id`
    let q = svc.from(tabela).select('id').eq('tenant_id', ctx.tenantId).eq('estudante_id', ctx.estudanteId).is('deletado_em', null)
    for (const [k, v] of Object.entries(filtro)) q = q.eq(k, v)
    const { data, error } = await q.order('ordem', { ascending: true }).order('id', { ascending: true }).limit(2000)
    if (error) throw error
    const ids: string[] = (data ?? []).map((x: any) => x.id).filter((id: string) => id !== idMovido)
    const pos = entre.antes_id ? ids.indexOf(entre.antes_id) + 1 : 0
    ids.splice(Math.max(pos, 0), 0, idMovido)
    for (let i = 0; i < ids.length; i++) {
      if (ids[i] === idMovido) continue
      const u = await svc.from(tabela).update({ ordem: 1024 * (i + 1) }).eq('id', ids[i]).eq('tenant_id', ctx.tenantId).eq('estudante_id', ctx.estudanteId)
      if (u.error) throw u.error
    }
    return { ordem: 1024 * (ids.indexOf(idMovido) + 1) }
  } catch (error) { return { error } }
}
