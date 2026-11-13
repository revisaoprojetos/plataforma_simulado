'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { checkPermission, getCurrentAccess } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { registrarRegraLog } from '@/lib/produtos/regras-log'
import { fetchAllByIn } from '@/lib/supabase/fetch-all'
import { semTabela } from '../dados'
import type { Resultado } from '../tipos'
import { termoSeguro } from './dados-alunos'
import { AVISO_MIGRACAO, type AlunoOpcao, type EditarExcecao, type NovaExcecao } from './tipos-alunos'

// Ações da aba Alunos/Exceções. Toda ação: checkPermission + service role + tenant explícito + registrarAudit +
// linha em simulado_liberacao_log. 'use server' só exporta funções async; tipos em ./tipos-alunos.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATA_RE = /^\d{4}-\d{2}-\d{2}$/
const MAX_COMBINACOES = 2000

async function guard(perm: 'cronogramas:view' | 'cronogramas:update', produtoId: string) {
  if (!(await checkPermission(perm))) return { ok: false as const, error: 'Sem permissão.' }
  const access = await getCurrentAccess()
  if (!access.tenantId) return { ok: false as const, error: 'Tenant não resolvido.' }
  if (!UUID_RE.test(produtoId)) return { ok: false as const, error: 'Produto inválido.' }
  const svc = createAdminClient()
  const { data } = await svc.from('simulado_produtos').select('id').eq('tenant_id', access.tenantId).eq('id', produtoId).maybeSingle()
  if (!data) return { ok: false as const, error: 'Produto não encontrado.' }
  return { ok: true as const, svc, tenantId: access.tenantId, atorId: access.userId ?? null }
}
type G = Extract<Awaited<ReturnType<typeof guard>>, { ok: true }>

const falha = (e: { code?: string; message?: string } | null | undefined) => ({ ok: false as const, error: semTabela(e) ? AVISO_MIGRACAO : `Não foi possível salvar: ${e?.message ?? 'erro'}` })

/** Validade AAAA-MM-DD -> fim do dia em Brasília (timestamptz). '' = sem validade. null = inválida. */
function validadeParaIso(v: string): string | null | undefined {
  const s = (v ?? '').trim()
  if (!s) return null
  if (!DATA_RE.test(s)) return undefined
  const d = new Date(`${s}T23:59:59-03:00`)
  return Number.isNaN(+d) ? undefined : d.toISOString()
}

async function gravarLog(g: G, produtoId: string, linhas: Array<{ acao: string; alvo_tipo?: string | null; alvo_id?: string | null; estudante_id?: string | null; detalhe: Record<string, unknown> }>) {
  if (!linhas.length) return
  for (let i = 0; i < linhas.length; i += 500) {
    await g.svc.from('simulado_liberacao_log').insert(linhas.slice(i, i + 500).map((l) => ({ tenant_id: g.tenantId, produto_id: produtoId, origem: 'manual', alvo_tipo: l.alvo_tipo ?? null, alvo_id: l.alvo_id ?? null, estudante_id: l.estudante_id ?? null, acao: l.acao, detalhe: l.detalhe, feito_por: g.atorId })))
  }
  // Log unificado das regras do produto (aba Regras › Histórico) — best-effort.
  await registrarRegraLog({ tenantId: g.tenantId, produtoId, camada: 'excecao', acao: linhas[0].acao, alvoTipo: (linhas[0].alvo_tipo as 'aula' | 'modulo' | null) ?? null, alvoId: linhas[0].alvo_id ?? null, alvoRotulo: linhas.length > 1 ? `${linhas.length} registro(s)` : null, depois: linhas[0].detalhe, atorId: g.atorId })
}

/** Busca rápida de alunos (nome/e-mail) para o seletor da criação em massa. */
export async function buscarAlunos(produtoId: string, termo: string): Promise<AlunoOpcao[]> {
  const g = await guard('cronogramas:view', produtoId)
  if (!g.ok) return []
  const t = termoSeguro(termo)
  if (t.length < 2) return []
  const { data } = await g.svc.from('simulado_estudantes').select('id, nome, email').eq('tenant_id', g.tenantId).eq('deletado', false).or(`nome.ilike.%${t}%,email.ilike.%${t}%`).order('nome', { ascending: true }).limit(15)
  return ((data ?? []) as any[]).map((r) => ({ id: r.id, nome: r.nome ?? '(sem nome)', email: r.email ?? '' }))
}

/** Cria exceções: (aulas/módulos) × (alunos/grupos). Ignora combinações idênticas já ativas. */
export async function criarExcecoes(produtoId: string, e: NovaExcecao): Promise<Resultado<{ criadas: number; ignoradas: number }>> {
  const g = await guard('cronogramas:update', produtoId)
  if (!g.ok) return g
  if (e.acao !== 'liberar' && e.acao !== 'bloquear') return { ok: false, error: 'Ação inválida.' }
  const alunoIds = [...new Set((e.alunoIds ?? []).filter((x) => UUID_RE.test(x)))]
  const grupoIds = [...new Set((e.grupoIds ?? []).filter((x) => UUID_RE.test(x)))]
  if (!alunoIds.length && !grupoIds.length) return { ok: false, error: 'Escolha ao menos um aluno ou um grupo.' }
  const alvos = [...new Map((e.alvos ?? []).filter((a) => (a.tipo === 'aula' || a.tipo === 'modulo') && UUID_RE.test(a.id)).map((a) => [a.id, a])).values()]
  if (!alvos.length) return { ok: false, error: 'Escolha ao menos uma aula ou módulo.' }
  if (alvos.length * (alunoIds.length + grupoIds.length) > MAX_COMBINACOES) return { ok: false, error: `Combinações demais (máx. ${MAX_COMBINACOES}). Reduza aulas ou destinatários.` }
  const expira = validadeParaIso(e.validade)
  if (expira === undefined) return { ok: false, error: 'Validade inválida.' }
  if (expira && expira < new Date().toISOString()) return { ok: false, error: 'A validade já passou.' }
  const motivo = (e.motivo ?? '').trim().slice(0, 500) || null

  // alvos pertencem ao produto
  const { data: mods } = await g.svc.from('simulado_produto_modulos').select('id, pai_id, titulo').eq('tenant_id', g.tenantId).eq('produto_id', produtoId).eq('deletado', false).limit(5000)
  const porId = new Map(((mods ?? []) as any[]).map((m) => [m.id as string, m]))
  for (const a of alvos) {
    const m = porId.get(a.id)
    if (!m) return { ok: false, error: 'Aula ou módulo não pertence a este produto.' }
    if ((a.tipo === 'aula') !== !!m.pai_id) return { ok: false, error: `"${m.titulo}" não é ${a.tipo === 'aula' ? 'uma aula' : 'um módulo'}.` }
  }
  // destinatários pertencem ao tenant
  if (alunoIds.length) {
    const ok = await fetchAllByIn<any>(alunoIds, (c) => g.svc.from('simulado_estudantes').select('id').eq('tenant_id', g.tenantId).in('id', c).order('id', { ascending: true }) as any)
    if (ok.length !== alunoIds.length) return { ok: false, error: 'Algum aluno não pertence a esta plataforma.' }
  }
  if (grupoIds.length) {
    const ok = await fetchAllByIn<any>(grupoIds, (c) => g.svc.from('simulado_grupos').select('id').eq('tenant_id', g.tenantId).in('id', c).order('id', { ascending: true }) as any)
    if (ok.length !== grupoIds.length) return { ok: false, error: 'Algum grupo não pertence a esta plataforma.' }
  }

  // duplicatas ativas (mesmo alvo+destino+ação)
  const existentes = await fetchAllByIn<any>(alvos.map((a) => a.id), (c) =>
    g.svc.from('simulado_liberacao_excecoes').select('alvo_id, estudante_id, grupo_id, acao').eq('tenant_id', g.tenantId).eq('produto_id', produtoId).eq('ativo', true).eq('acao', e.acao).in('alvo_id', c).order('id', { ascending: true }) as any).catch((x) => x)
  if (!Array.isArray(existentes)) return falha(existentes as any)
  const chave = new Set(existentes.map((x: any) => `${x.alvo_id}|${x.estudante_id ?? ''}|${x.grupo_id ?? ''}`))
  const novas: any[] = []
  let ignoradas = 0
  for (const a of alvos) {
    for (const al of alunoIds) { if (chave.has(`${a.id}|${al}|`)) ignoradas++; else novas.push({ tenant_id: g.tenantId, produto_id: produtoId, alvo_tipo: a.tipo, alvo_id: a.id, estudante_id: al, grupo_id: null, acao: e.acao, motivo, expira_em: expira, ativo: true, criado_por: g.atorId }) }
    for (const gr of grupoIds) { if (chave.has(`${a.id}||${gr}`)) ignoradas++; else novas.push({ tenant_id: g.tenantId, produto_id: produtoId, alvo_tipo: a.tipo, alvo_id: a.id, estudante_id: null, grupo_id: gr, acao: e.acao, motivo, expira_em: expira, ativo: true, criado_por: g.atorId }) }
  }
  for (let i = 0; i < novas.length; i += 500) {
    const { error } = await g.svc.from('simulado_liberacao_excecoes').insert(novas.slice(i, i + 500))
    if (error) return falha(error)
  }
  if (novas.length) {
    await gravarLog(g, produtoId, novas.length > 300
      ? [{ acao: 'excecao_criada_lote', detalhe: { quantidade: novas.length, acao: e.acao, motivo, expira_em: expira, alvos: alvos.length, alunos: alunoIds.length, grupos: grupoIds.length } }]
      : novas.map((n) => ({ acao: 'excecao_criada', alvo_tipo: n.alvo_tipo, alvo_id: n.alvo_id, estudante_id: n.estudante_id, detalhe: { acao: n.acao, motivo, expira_em: expira, grupo_id: n.grupo_id } })))
    await registrarAudit({ operacao: 'INSERT', entidade: 'simulado_liberacao_excecoes', entidadeId: produtoId, antes: null, depois: { criadas: novas.length, acao: e.acao, motivo, expira_em: expira, alvos: alvos.length, alunos: alunoIds.length, grupos: grupoIds.length }, atorId: g.atorId, tenantId: g.tenantId })
  }
  return { ok: true, criadas: novas.length, ignoradas }
}

/** Edita ação, motivo, validade e ativo de uma exceção. */
export async function editarExcecao(produtoId: string, id: string, e: EditarExcecao): Promise<Resultado> {
  const g = await guard('cronogramas:update', produtoId)
  if (!g.ok) return g
  if (!UUID_RE.test(id)) return { ok: false, error: 'Exceção inválida.' }
  if (e.acao !== 'liberar' && e.acao !== 'bloquear') return { ok: false, error: 'Ação inválida.' }
  const expira = validadeParaIso(e.validade)
  if (expira === undefined) return { ok: false, error: 'Validade inválida.' }
  const { data: antes, error: e0 } = await g.svc.from('simulado_liberacao_excecoes').select('*').eq('tenant_id', g.tenantId).eq('produto_id', produtoId).eq('id', id).maybeSingle()
  if (e0) return falha(e0)
  if (!antes) return { ok: false, error: 'Exceção não encontrada.' }
  const depois = { acao: e.acao, motivo: (e.motivo ?? '').trim().slice(0, 500) || null, expira_em: expira, ativo: !!e.ativo, atualizado_em: new Date().toISOString() }
  const { error } = await g.svc.from('simulado_liberacao_excecoes').update(depois).eq('tenant_id', g.tenantId).eq('id', id)
  if (error) return falha(error)
  const a = antes as any
  await gravarLog(g, produtoId, [{ acao: 'excecao_editada', alvo_tipo: a.alvo_tipo, alvo_id: a.alvo_id, estudante_id: a.estudante_id, detalhe: { antes: { acao: a.acao, motivo: a.motivo, expira_em: a.expira_em, ativo: a.ativo }, depois, grupo_id: a.grupo_id } }])
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_liberacao_excecoes', entidadeId: id, antes: a, depois, atorId: g.atorId, tenantId: g.tenantId })
  return { ok: true }
}

/** Ativar / desativar / excluir em lote. */
export async function acaoMassaExcecoes(produtoId: string, ids: string[], tipo: 'ativar' | 'desativar' | 'excluir'): Promise<Resultado<{ afetadas: number }>> {
  const g = await guard('cronogramas:update', produtoId)
  if (!g.ok) return g
  const lista = [...new Set((ids ?? []).filter((x) => UUID_RE.test(x)))].slice(0, 1000)
  if (!lista.length) return { ok: false, error: 'Nada selecionado.' }
  if (!['ativar', 'desativar', 'excluir'].includes(tipo)) return { ok: false, error: 'Ação inválida.' }
  const antes = await fetchAllByIn<any>(lista, (c) => g.svc.from('simulado_liberacao_excecoes').select('id, alvo_tipo, alvo_id, estudante_id, grupo_id, acao, motivo, expira_em, ativo').eq('tenant_id', g.tenantId).eq('produto_id', produtoId).in('id', c).order('id', { ascending: true }) as any).catch((x) => x)
  if (!Array.isArray(antes)) return falha(antes as any)
  if (!antes.length) return { ok: false, error: 'Exceções não encontradas.' }
  const alvoIds = antes.map((a: any) => a.id as string)
  for (let i = 0; i < alvoIds.length; i += 80) {
    const c = alvoIds.slice(i, i + 80)
    const q = g.svc.from('simulado_liberacao_excecoes')
    const { error } = tipo === 'excluir'
      ? await q.delete().eq('tenant_id', g.tenantId).eq('produto_id', produtoId).in('id', c)
      : await q.update({ ativo: tipo === 'ativar', atualizado_em: new Date().toISOString() }).eq('tenant_id', g.tenantId).eq('produto_id', produtoId).in('id', c)
    if (error) return falha(error)
  }
  const nome = tipo === 'excluir' ? 'excecao_excluida' : tipo === 'ativar' ? 'excecao_ativada' : 'excecao_desativada'
  await gravarLog(g, produtoId, antes.length > 300
    ? [{ acao: `${nome}_lote`, detalhe: { quantidade: antes.length } }]
    : antes.map((a: any) => ({ acao: nome, alvo_tipo: a.alvo_tipo, alvo_id: a.alvo_id, estudante_id: a.estudante_id, detalhe: { acao: a.acao, motivo: a.motivo, expira_em: a.expira_em, grupo_id: a.grupo_id } })))
  await registrarAudit({ operacao: tipo === 'excluir' ? 'DELETE' : 'UPDATE', entidade: 'simulado_liberacao_excecoes', entidadeId: produtoId, antes: { ids: alvoIds.slice(0, 200), quantidade: antes.length }, depois: tipo === 'excluir' ? null : { ativo: tipo === 'ativar' }, atorId: g.atorId, tenantId: g.tenantId })
  return { ok: true, afetadas: antes.length }
}
