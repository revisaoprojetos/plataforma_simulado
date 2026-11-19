// Caderno (beta) — infraestrutura comum dos route handlers /api/aluno/notebook/**: autenticação, acesso beta,
// tolerância a migração pendente, garantia do notebook (sob demanda) e rate limit de escrita.
import 'server-only'
import { NextResponse } from 'next/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { cadernoBetaLiberado } from '@/lib/aluno/caderno-beta-acesso'
import { createAdminClient } from '@/lib/supabase/server'
import { tabelaAusente } from '@/lib/aluno/notebook-server'

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

export async function lerJson(request: Request): Promise<{ ok: true; corpo: unknown } | { ok: false; resposta: NextResponse }> {
  try { return { ok: true, corpo: await request.json() } } catch { return { ok: false, resposta: resp400('Corpo JSON inválido.') } }
}

/** 401 sem sessão; 403 `beta_nao_liberado` sem acesso. Devolve a sessão + service client. */
export async function autenticarBeta(): Promise<
  { ok: true; svc: any; tenantId: string; estudanteId: string } | { ok: false; resposta: NextResponse }
> {
  const sessao = await getSessaoAluno()
  if (!sessao) return { ok: false, resposta: NextResponse.json({ ok: false, code: 'nao_autenticado', message: 'Não autenticado.' }, { status: 401 }) }
  const liberado = await cadernoBetaLiberado({ tenantId: sessao.tenantId, estudanteId: sessao.estudanteId, email: sessao.email })
  if (!liberado) return { ok: false, resposta: NextResponse.json({ ok: false, code: 'beta_nao_liberado', message: 'Recurso não liberado para sua conta.' }, { status: 403 }) }
  return { ok: true, svc: createAdminClient(), tenantId: sessao.tenantId, estudanteId: sessao.estudanteId }
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
export async function garantirEstrutura(svc: any, tenantId: string, estudanteId: string, notebookId: string): Promise<{ error: unknown } | null> {
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
      const r = await svc.from('simulado_aluno_notebook_secoes').select('id').eq('notebook_id', notebookId).eq('origem_tipo', 'seed').maybeSingle()
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

// ---------------------------------------------------------------- rate limit de escrita (~10/s por estudante, memória do processo)
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
