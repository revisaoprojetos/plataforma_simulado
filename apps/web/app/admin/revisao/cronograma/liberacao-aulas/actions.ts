'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { checkPermission, getCurrentAccess } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { casarLinhas, type ModuloMin } from '@/lib/produtos/liberacao-aulas-match'
import { listarTodas, semTabela } from './dados'
import { somarDias, type AcaoMassa, type EntradaLinha, type FiltrosLiberacao, type LinhaLiberacao, type LiberacaoCfg, type Resultado } from './tipos'

// Ações admin da sub-aba "Liberação de aulas". Toda ação: checkPermission + service role + tenant explícito + auditoria.
// 'use server' só exporta funções async; tipos ficam em ./tipos.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATA_RE = /^\d{4}-\d{2}-\d{2}$/
const TABELA = 'simulado_produto_liberacao_aulas'
const MIGRAR = 'Aplique a migração 20261117010000 para usar a liberação de aulas.'

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
const dataOk = (s: string) => { if (!DATA_RE.test(s)) return false; const d = new Date(`${s}T00:00:00Z`); return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s }
const falha = (error: { code?: string; message?: string } | null | undefined) => ({ ok: false as const, error: semTabela(error) ? MIGRAR : `Não foi possível salvar: ${error?.message ?? 'erro'}` })

/** Liga/desliga o gate e define o que vale para o aluno sem/com cronograma fixado. */
export async function salvarCfgLiberacao(produtoId: string, cfg: LiberacaoCfg): Promise<Resultado> {
  const g = await guard('cronogramas:update', produtoId)
  if (!g.ok) return g
  if (!['planilha', 'liberado', 'atual'].includes(cfg.sem_plano)) return { ok: false, error: 'Opção inválida para o aluno sem cronograma.' }
  if (!['concluir_meta', 'plano', 'mais_cedo'].includes(cfg.com_plano)) return { ok: false, error: 'Opção inválida para o aluno com cronograma.' }
  const dias = Math.trunc(Number(cfg.dias_antes))
  if (!Number.isFinite(dias) || dias < 0 || dias > 365) return { ok: false, error: 'Dias de antecedência: de 0 a 365.' }
  const { data: antes } = await g.svc.from('simulado_produto_liberacao_cfg').select('ativo, sem_plano, com_plano, dias_antes').eq('tenant_id', g.tenantId).eq('produto_id', produtoId).maybeSingle()
  const depois = { ativo: !!cfg.ativo, sem_plano: cfg.sem_plano, com_plano: cfg.com_plano, dias_antes: dias }
  const { error } = await g.svc.from('simulado_produto_liberacao_cfg').upsert({ produto_id: produtoId, tenant_id: g.tenantId, ...depois, atualizado_por: g.atorId, atualizado_em: new Date().toISOString() }, { onConflict: 'produto_id' })
  if (error) return falha(error)
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_produto_liberacao_cfg', entidadeId: produtoId, antes: (antes as any) ?? null, depois, atorId: g.atorId, tenantId: g.tenantId })
  return { ok: true }
}

/** Valida que a aula é submódulo deste produto/tenant e devolve o módulo raiz (matéria). */
async function aulaDoProduto(g: Extract<Awaited<ReturnType<typeof guard>>, { ok: true }>, produtoId: string, aulaId: string): Promise<{ moduloId: string } | null> {
  const { data } = await g.svc.from('simulado_produto_modulos').select('id, pai_id').eq('tenant_id', g.tenantId).eq('produto_id', produtoId).eq('deletado', false).eq('id', aulaId).maybeSingle()
  const m = data as any
  return m?.pai_id ? { moduloId: m.pai_id } : null
}

/** Cria (sem `id`) ou edita uma linha: data, título, observação, vínculo à aula. */
export async function salvarLinhaLiberacao(produtoId: string, e: EntradaLinha): Promise<Resultado<{ id: string }>> {
  const g = await guard('cronogramas:update', produtoId)
  if (!g.ok) return g
  const disciplina = e.disciplina.trim(), titulo = e.titulo.trim()
  if (!disciplina || !titulo) return { ok: false, error: 'Informe a matéria e o título.' }
  if (!dataOk(e.dataLiberacao)) return { ok: false, error: 'Data de liberação inválida.' }
  const numero = e.numeroAula == null || Number.isNaN(Number(e.numeroAula)) ? null : Math.trunc(Number(e.numeroAula))
  const semana = e.semana == null || Number.isNaN(Number(e.semana)) ? null : Math.trunc(Number(e.semana))
  let moduloId: string | null = null
  if (e.aulaId) {
    if (!UUID_RE.test(e.aulaId)) return { ok: false, error: 'Aula inválida.' }
    const a = await aulaDoProduto(g, produtoId, e.aulaId)
    if (!a) return { ok: false, error: 'A aula escolhida não pertence a este produto.' }
    moduloId = a.moduloId
  }
  const campos = {
    disciplina, titulo, numero_aula: numero, data_liberacao: e.dataLiberacao, cronogramas: e.cronogramas?.trim() || null, semana,
    observacao: e.observacao?.trim() || null, aula_id: e.aulaId || null, modulo_id: moduloId, ativo: e.ativo !== false, atualizado_em: new Date().toISOString(),
  }
  if (e.id) {
    if (!UUID_RE.test(e.id)) return { ok: false, error: 'Linha inválida.' }
    const { data: antes } = await g.svc.from(TABELA).select('disciplina, titulo, numero_aula, data_liberacao, observacao, aula_id, ativo').eq('tenant_id', g.tenantId).eq('produto_id', produtoId).eq('id', e.id).maybeSingle()
    if (!antes) return { ok: false, error: 'Linha não encontrada.' }
    const { error } = await g.svc.from(TABELA).update(campos).eq('tenant_id', g.tenantId).eq('produto_id', produtoId).eq('id', e.id)
    if (error) return falha(error)
    await registrarAudit({ operacao: 'UPDATE', entidade: TABELA, entidadeId: e.id, antes: antes as any, depois: campos, atorId: g.atorId, tenantId: g.tenantId })
    return { ok: true, id: e.id }
  }
  const { data: ult, error: eMax } = await g.svc.from(TABELA).select('ordem').eq('tenant_id', g.tenantId).eq('produto_id', produtoId).order('ordem', { ascending: false }).limit(1)
  if (eMax) return falha(eMax)
  const ordem = (((ult ?? []) as any[])[0]?.ordem ?? 0) + 1
  const { data, error } = await g.svc.from(TABELA).insert({ ...campos, tenant_id: g.tenantId, produto_id: produtoId, ordem, criado_por: g.atorId }).select('id').single()
  if (error) return falha(error)
  await registrarAudit({ operacao: 'INSERT', entidade: TABELA, entidadeId: (data as any).id, depois: { ordem, ...campos }, atorId: g.atorId, tenantId: g.tenantId })
  return { ok: true, id: (data as any).id }
}

/** Ações em massa sobre as linhas selecionadas (máx. 500 por vez). */
export async function acaoMassaLiberacao(produtoId: string, ids: string[], acao: AcaoMassa): Promise<Resultado<{ afetadas: number }>> {
  const g = await guard('cronogramas:update', produtoId)
  if (!g.ok) return g
  const lista = [...new Set(ids)].filter((i) => UUID_RE.test(i)).slice(0, 500)
  if (!lista.length) return { ok: false, error: 'Nenhuma linha selecionada.' }
  const base = () => g.svc.from(TABELA)
  const agora = new Date().toISOString()
  let afetadas = 0
  let resumo: Record<string, unknown> = { tipo: acao.tipo, linhas: lista.length }

  if (acao.tipo === 'data') {
    if (!dataOk(acao.data)) return { ok: false, error: 'Data inválida.' }
    for (let i = 0; i < lista.length; i += 100) {
      const { error, count } = await base().update({ data_liberacao: acao.data, atualizado_em: agora }, { count: 'exact' }).eq('tenant_id', g.tenantId).eq('produto_id', produtoId).in('id', lista.slice(i, i + 100))
      if (error) return falha(error); afetadas += count ?? 0
    }
    resumo = { ...resumo, data: acao.data }
  } else if (acao.tipo === 'deslocar') {
    const dias = Math.trunc(Number(acao.dias))
    if (!Number.isFinite(dias) || dias === 0 || Math.abs(dias) > 3650) return { ok: false, error: 'Informe um número de dias diferente de zero.' }
    const rows = await fetchAll<{ id: string; data_liberacao: string }>(() => base().select('id, data_liberacao').eq('tenant_id', g.tenantId).eq('produto_id', produtoId).in('id', lista).order('id', { ascending: true }) as any)
    const porData = new Map<string, string[]>()
    for (const r of rows) { const n = somarDias(r.data_liberacao, dias); const l = porData.get(n) ?? []; l.push(r.id); porData.set(n, l) }
    for (const [data, grupo] of porData) {
      const { error } = await base().update({ data_liberacao: data, atualizado_em: agora }).eq('tenant_id', g.tenantId).eq('produto_id', produtoId).in('id', grupo)
      if (error) return falha(error); afetadas += grupo.length
    }
    resumo = { ...resumo, dias }
  } else if (acao.tipo === 'ativo') {
    const { error, count } = await base().update({ ativo: !!acao.ativo, atualizado_em: agora }, { count: 'exact' }).eq('tenant_id', g.tenantId).eq('produto_id', produtoId).in('id', lista)
    if (error) return falha(error); afetadas = count ?? 0
    resumo = { ...resumo, ativo: !!acao.ativo }
  } else if (acao.tipo === 'vincular') {
    let moduloId: string | null = null
    if (acao.aulaId) {
      if (!UUID_RE.test(acao.aulaId)) return { ok: false, error: 'Aula inválida.' }
      const a = await aulaDoProduto(g, produtoId, acao.aulaId)
      if (!a) return { ok: false, error: 'A aula escolhida não pertence a este produto.' }
      moduloId = a.moduloId
    }
    const { error, count } = await base().update({ aula_id: acao.aulaId, modulo_id: moduloId, atualizado_em: agora }, { count: 'exact' }).eq('tenant_id', g.tenantId).eq('produto_id', produtoId).in('id', lista)
    if (error) return falha(error); afetadas = count ?? 0
    resumo = { ...resumo, aula_id: acao.aulaId }
  } else if (acao.tipo === 'excluir') {
    const { error, count } = await base().delete({ count: 'exact' }).eq('tenant_id', g.tenantId).eq('produto_id', produtoId).in('id', lista)
    if (error) return falha(error); afetadas = count ?? 0
  } else return { ok: false, error: 'Ação inválida.' }

  await registrarAudit({ operacao: acao.tipo === 'excluir' ? 'DELETE' : 'UPDATE', entidade: TABELA, entidadeId: produtoId, depois: { massa: true, afetadas, ...resumo }, atorId: g.atorId, tenantId: g.tenantId })
  return { ok: true, afetadas }
}

/** Tenta vincular, com o casador, as linhas SEM vínculo às aulas ainda livres do produto. */
export async function recasarSemVinculo(produtoId: string): Promise<Resultado<{ casadas: number; restantes: number }>> {
  const g = await guard('cronogramas:update', produtoId)
  if (!g.ok) return g
  const [linhas, mods, usadas] = await Promise.all([
    fetchAll<{ id: string; ordem: number; disciplina: string; numero_aula: number | null; titulo: string }>(() => g.svc.from(TABELA).select('id, ordem, disciplina, numero_aula, titulo').eq('tenant_id', g.tenantId).eq('produto_id', produtoId).is('aula_id', null).order('id', { ascending: true }) as any),
    fetchAll<ModuloMin>(() => g.svc.from('simulado_produto_modulos').select('id, pai_id, titulo, ordem').eq('tenant_id', g.tenantId).eq('produto_id', produtoId).eq('deletado', false).order('ordem', { ascending: true }).order('id', { ascending: true }) as any),
    fetchAll<{ id: string; aula_id: string | null }>(() => g.svc.from(TABELA).select('id, aula_id').eq('tenant_id', g.tenantId).eq('produto_id', produtoId).not('aula_id', 'is', null).order('id', { ascending: true }) as any),
  ])
  if (!linhas.length) return { ok: true, casadas: 0, restantes: 0 }
  const ocupadas = new Set(usadas.map((u) => u.aula_id))
  const livres = mods.filter((m) => !m.pai_id || !ocupadas.has(m.id))
  const res = casarLinhas(linhas.map((l) => ({ ordem: l.ordem, disciplina: l.disciplina, numeroAula: l.numero_aula, titulo: l.titulo })), livres)
  const porOrdem = new Map(res.map((r) => [r.ordem, r]))
  let casadas = 0
  for (const l of linhas) {
    const r = porOrdem.get(l.ordem)
    if (!r?.aulaId) continue
    const { error } = await g.svc.from(TABELA).update({ aula_id: r.aulaId, modulo_id: r.moduloId, atualizado_em: new Date().toISOString() }).eq('tenant_id', g.tenantId).eq('produto_id', produtoId).eq('id', l.id)
    if (error) return falha(error); casadas++
  }
  await registrarAudit({ operacao: 'UPDATE', entidade: TABELA, entidadeId: produtoId, depois: { recasar_sem_vinculo: true, casadas, restantes: linhas.length - casadas }, atorId: g.atorId, tenantId: g.tenantId })
  return { ok: true, casadas, restantes: linhas.length - casadas }
}

/** Todas as linhas do filtro atual (exportação CSV/XLSX no cliente). */
export async function linhasParaExportar(produtoId: string, filtros: FiltrosLiberacao): Promise<Resultado<{ linhas: LinhaLiberacao[] }>> {
  const g = await guard('cronogramas:view', produtoId)
  if (!g.ok) return g
  try { return { ok: true, linhas: await listarTodas(g.svc, g.tenantId, produtoId, filtros) } }
  catch { return { ok: false, error: 'Não foi possível ler as linhas.' } }
}
