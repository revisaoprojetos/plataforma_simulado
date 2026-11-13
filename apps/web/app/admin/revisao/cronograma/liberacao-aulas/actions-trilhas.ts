'use server'

import { registrarAudit } from '@/lib/audit'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { menorLiberacao } from '@/lib/produtos/liberacao-trilhas-calc'
import { ContextoAluno, avaliarRegra } from '@/lib/segmentos/avaliar'
import { normalizarRegra, type RegraSegmento } from '@/lib/segmentos/tipos'
import { semTabela } from './dados'
import { guardTrilhas, logarLiberacao, type GuardTrilhas as G } from './guard-trilhas'
import { lerGradeCompleta, lerTodasCelulas, listarTrilhas } from './dados-trilhas'
import { somarDias } from './tipos'
import {
  AVISO_MIGRACAO, OFFSET_PADRAO,
  type AcaoGrade, type ContagemAudiencia, type EntradaCelula, type EntradaTrilha, type FiltrosGrade, type LinhaGrade, type MudancaBase, type PreviaRecalculo, type Resultado,
} from './tipos-trilhas'

// Ações admin das abas "Cronogramas" e "Regras". Toda ação: checkPermission + service role + tenant explícito +
// registrarAudit + linha em simulado_liberacao_log. 'use server' só exporta funções async; tipos em ./tipos-trilhas.
// O cliente as chama pela rota /api/admin/revisao/liberacao-aulas/trilhas (domínios custom rejeitam server actions).

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATA_RE = /^\d{4}-\d{2}-\d{2}$/
const T_TRILHA = 'simulado_liberacao_trilhas'
const T_CEL = 'simulado_liberacao_trilha_aulas'
const T_AULA = 'simulado_produto_liberacao_aulas'

const dataOk = (s: unknown): s is string => { if (typeof s !== 'string' || !DATA_RE.test(s)) return false; const d = new Date(`${s}T00:00:00Z`); return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s }
const falha = (error: { code?: string; message?: string } | null | undefined) => ({ ok: false as const, error: semTabela(error) ? AVISO_MIGRACAO : error?.code === '23505' ? 'Já existe uma trilha com esse nome neste produto.' : `Não foi possível salvar: ${error?.message ?? 'erro'}` })

async function trilhaDoProduto(g: G, produtoId: string, trilhaId: string) {
  if (!UUID_RE.test(trilhaId)) return null
  const { data } = await g.svc.from(T_TRILHA).select('id, nome, offset_dias, segmento_ids').eq('tenant_id', g.tenantId).eq('produto_id', produtoId).eq('id', trilhaId).maybeSingle()
  return (data as { id: string; nome: string; offset_dias: number; segmento_ids: string[] } | null) ?? null
}

// ── CRUD de trilhas ──
export async function salvarTrilha(produtoId: string, e: EntradaTrilha): Promise<Resultado<{ id: string }>> {
  const g = await guardTrilhas('cronogramas:update', produtoId)
  if (!g.ok) return g
  const nome = String(e.nome ?? '').trim()
  if (!nome || nome.length > 120) return { ok: false, error: 'Informe o nome da trilha (até 120 caracteres).' }
  const offset = Math.trunc(Number(e.offsetDias))
  if (!Number.isFinite(offset) || offset < 0 || offset > 730) return { ok: false, error: 'Antecedência (offset): de 0 a 730 dias.' }
  if (e.inicioCronograma && !dataOk(e.inicioCronograma)) return { ok: false, error: 'Início do cronograma inválido.' }
  const cor = e.cor && /^#[0-9a-f]{6}$/i.test(e.cor) ? e.cor : null
  const campos = { nome, descricao: e.descricao?.trim() || null, cor, inicio_cronograma: e.inicioCronograma || null, offset_dias: offset, ativo: e.ativo !== false, atualizado_em: new Date().toISOString() }
  if (e.id) {
    const antes = await trilhaDoProduto(g, produtoId, e.id)
    if (!antes) return { ok: false, error: 'Trilha não encontrada.' }
    const { data: ant } = await g.svc.from(T_TRILHA).select('nome, descricao, cor, inicio_cronograma, offset_dias, ativo, ordem').eq('id', e.id).maybeSingle()
    const ordem = e.ordem != null && Number.isFinite(Number(e.ordem)) ? Math.trunc(Number(e.ordem)) : (ant as any)?.ordem
    const { error } = await g.svc.from(T_TRILHA).update({ ...campos, ordem }).eq('tenant_id', g.tenantId).eq('produto_id', produtoId).eq('id', e.id)
    if (error) return falha(error)
    await registrarAudit({ operacao: 'UPDATE', entidade: T_TRILHA, entidadeId: e.id, antes: (ant as any) ?? null, depois: { ...campos, ordem }, atorId: g.atorId, tenantId: g.tenantId })
    await logarLiberacao(g, produtoId, { acao: 'trilha_alterada', alvoTipo: 'trilha', alvoId: e.id, detalhe: { nome, antes: ant, depois: campos } })
    return { ok: true, id: e.id }
  }
  const { data: ult } = await g.svc.from(T_TRILHA).select('ordem').eq('tenant_id', g.tenantId).eq('produto_id', produtoId).order('ordem', { ascending: false }).limit(1)
  const ordem = (((ult ?? []) as any[])[0]?.ordem ?? 0) + 1
  const { data, error } = await g.svc.from(T_TRILHA).insert({ ...campos, tenant_id: g.tenantId, produto_id: produtoId, ordem, criado_por: g.atorId }).select('id').single()
  if (error) return falha(error)
  const id = (data as any).id as string
  await registrarAudit({ operacao: 'INSERT', entidade: T_TRILHA, entidadeId: id, depois: { ...campos, ordem }, atorId: g.atorId, tenantId: g.tenantId })
  await logarLiberacao(g, produtoId, { acao: 'trilha_criada', alvoTipo: 'trilha', alvoId: id, detalhe: { nome, offset_dias: offset } })
  return { ok: true, id }
}

export async function excluirTrilha(produtoId: string, trilhaId: string): Promise<Resultado> {
  const g = await guardTrilhas('cronogramas:update', produtoId)
  if (!g.ok) return g
  const t = await trilhaDoProduto(g, produtoId, trilhaId)
  if (!t) return { ok: false, error: 'Trilha não encontrada.' }
  const { count } = await g.svc.from(T_CEL).select('id', { count: 'exact', head: true }).eq('tenant_id', g.tenantId).eq('trilha_id', trilhaId)
  const { error } = await g.svc.from(T_TRILHA).delete().eq('tenant_id', g.tenantId).eq('produto_id', produtoId).eq('id', trilhaId)
  if (error) return falha(error)
  await registrarAudit({ operacao: 'DELETE', entidade: T_TRILHA, entidadeId: trilhaId, antes: { nome: t.nome, offset_dias: t.offset_dias, segmento_ids: t.segmento_ids, celulas: count ?? 0 }, atorId: g.atorId, tenantId: g.tenantId })
  await logarLiberacao(g, produtoId, { acao: 'trilha_excluida', alvoTipo: 'trilha', alvoId: trilhaId, detalhe: { nome: t.nome, celulas_removidas: count ?? 0 } })
  return { ok: true }
}

/** Regras: quais Segmentos dão acesso à trilha. */
export async function salvarSegmentosTrilha(produtoId: string, trilhaId: string, segmentoIds: string[]): Promise<Resultado> {
  const g = await guardTrilhas('cronogramas:update', produtoId)
  if (!g.ok) return g
  const t = await trilhaDoProduto(g, produtoId, trilhaId)
  if (!t) return { ok: false, error: 'Trilha não encontrada.' }
  const ids = [...new Set((segmentoIds ?? []).filter((i) => UUID_RE.test(i)))].slice(0, 100)
  if (ids.length) {
    const { data } = await g.svc.from('simulado_segmentos').select('id').eq('tenant_id', g.tenantId).eq('deletado', false).in('id', ids)
    const ok = new Set(((data ?? []) as any[]).map((s) => s.id))
    if (ids.some((i) => !ok.has(i))) return { ok: false, error: 'Algum segmento não existe mais. Recarregue a página.' }
  }
  const { error } = await g.svc.from(T_TRILHA).update({ segmento_ids: ids, atualizado_em: new Date().toISOString() }).eq('tenant_id', g.tenantId).eq('id', trilhaId)
  if (error) return falha(error)
  await registrarAudit({ operacao: 'UPDATE', entidade: T_TRILHA, entidadeId: trilhaId, antes: { segmento_ids: t.segmento_ids }, depois: { segmento_ids: ids }, atorId: g.atorId, tenantId: g.tenantId })
  await logarLiberacao(g, produtoId, { acao: 'regra_trilha_alterada', alvoTipo: 'trilha', alvoId: trilhaId, detalhe: { nome: t.nome, antes: t.segmento_ids, depois: ids } })
  return { ok: true }
}

// ── células da grade ──
async function aulaDoProdutoLib(g: G, produtoId: string, aulaId: string) {
  if (!UUID_RE.test(aulaId)) return null
  const { data } = await g.svc.from(T_AULA).select('id, ordem, disciplina, titulo').eq('tenant_id', g.tenantId).eq('produto_id', produtoId).eq('id', aulaId).maybeSingle()
  return (data as { id: string; ordem: number; disciplina: string; titulo: string } | null) ?? null
}

export async function salvarCelula(produtoId: string, e: EntradaCelula): Promise<Resultado> {
  const g = await guardTrilhas('cronogramas:update', produtoId)
  if (!g.ok) return g
  const [t, a] = await Promise.all([trilhaDoProduto(g, produtoId, e.trilhaId), aulaDoProdutoLib(g, produtoId, e.liberacaoAulaId)])
  if (!t) return { ok: false, error: 'Trilha não encontrada.' }
  if (!a) return { ok: false, error: 'Aula não encontrada neste produto.' }
  if (e.dataCronograma && !dataOk(e.dataCronograma)) return { ok: false, error: 'Data do cronograma inválida.' }
  if (e.dataManual && !dataOk(e.dataManual)) return { ok: false, error: 'Data manual inválida.' }
  const { data: antes } = await g.svc.from(T_CEL).select('data_cronograma, data_manual').eq('trilha_id', e.trilhaId).eq('liberacao_aula_id', e.liberacaoAulaId).maybeSingle()
  const depois = { data_cronograma: e.dataCronograma || null, data_manual: e.dataManual || null }
  const { error } = await g.svc.from(T_CEL).upsert({ tenant_id: g.tenantId, trilha_id: e.trilhaId, liberacao_aula_id: e.liberacaoAulaId, ...depois, atualizado_por: g.atorId, atualizado_em: new Date().toISOString() }, { onConflict: 'trilha_id,liberacao_aula_id' })
  if (error) return falha(error)
  await registrarAudit({ operacao: 'UPDATE', entidade: T_CEL, entidadeId: e.liberacaoAulaId, antes: (antes as any) ?? null, depois: { trilha: t.nome, ...depois }, atorId: g.atorId, tenantId: g.tenantId })
  await logarLiberacao(g, produtoId, { acao: 'data_alterada', alvoTipo: 'aula', alvoId: e.liberacaoAulaId, detalhe: { trilha: t.nome, aula: `${a.disciplina} — ${a.titulo}`, antes, depois } })
  return { ok: true }
}

export async function acaoGrade(produtoId: string, aulaIds: string[], acao: AcaoGrade): Promise<Resultado<{ afetadas: number }>> {
  const g = await guardTrilhas('cronogramas:update', produtoId)
  if (!g.ok) return g
  const ids = [...new Set((aulaIds ?? []).filter((i) => UUID_RE.test(i)))].slice(0, 500)
  if (!ids.length) return { ok: false, error: 'Nenhuma aula selecionada.' }
  // trilhas do produto (valida e limita o escopo)
  const { data: ts, error: eT } = await g.svc.from(T_TRILHA).select('id, nome').eq('tenant_id', g.tenantId).eq('produto_id', produtoId)
  if (eT) return falha(eT)
  const trilhas = (ts ?? []) as Array<{ id: string; nome: string }>
  const alvoId = acao.trilhaId
  if (alvoId && !trilhas.some((t) => t.id === alvoId)) return { ok: false, error: 'Trilha não encontrada.' }
  const escopo = alvoId ? [alvoId] : trilhas.map((t) => t.id)
  if (!escopo.length) return { ok: false, error: 'O produto não tem trilhas.' }
  const agora = new Date().toISOString()
  let afetadas = 0

  if (acao.tipo === 'deslocar') {
    const dias = Math.trunc(Number(acao.dias))
    if (!Number.isFinite(dias) || dias === 0 || Math.abs(dias) > 3650) return { ok: false, error: 'Informe um número de dias diferente de zero.' }
    const rows: Array<{ id: string; liberacao_aula_id: string; data_cronograma: string | null; data_manual: string | null }> = []
    for (let i = 0; i < ids.length; i += 80) {
      const { data, error } = await g.svc.from(T_CEL).select('id, liberacao_aula_id, data_cronograma, data_manual').eq('tenant_id', g.tenantId).eq('trilha_id', escopo[0]).in('liberacao_aula_id', ids.slice(i, i + 80))
      if (error) return falha(error)
      rows.push(...((data ?? []) as any[]))
    }
    const upserts = rows.filter((r) => r.data_cronograma || (acao.incluirManual && r.data_manual)).map((r) => ({
      tenant_id: g.tenantId, trilha_id: escopo[0], liberacao_aula_id: r.liberacao_aula_id,
      data_cronograma: r.data_cronograma ? somarDias(r.data_cronograma, dias) : null,
      data_manual: acao.incluirManual && r.data_manual ? somarDias(r.data_manual, dias) : r.data_manual,
      atualizado_por: g.atorId, atualizado_em: agora,
    }))
    for (let i = 0; i < upserts.length; i += 200) {
      const { error } = await g.svc.from(T_CEL).upsert(upserts.slice(i, i + 200), { onConflict: 'trilha_id,liberacao_aula_id' })
      if (error) return falha(error)
    }
    afetadas = upserts.length
  } else if (acao.tipo === 'limpar_manual') {
    for (let i = 0; i < ids.length; i += 80) {
      const { error, count } = await g.svc.from(T_CEL).update({ data_manual: null, atualizado_por: g.atorId, atualizado_em: agora }, { count: 'exact' }).eq('tenant_id', g.tenantId).in('trilha_id', escopo).in('liberacao_aula_id', ids.slice(i, i + 80)).not('data_manual', 'is', null)
      if (error) return falha(error); afetadas += count ?? 0
    }
  } else if (acao.tipo === 'limpar_data') {
    for (let i = 0; i < ids.length; i += 80) {
      const { error, count } = await g.svc.from(T_CEL).update({ data_cronograma: null, data_manual: null, atualizado_por: g.atorId, atualizado_em: agora }, { count: 'exact' }).eq('tenant_id', g.tenantId).eq('trilha_id', escopo[0]).in('liberacao_aula_id', ids.slice(i, i + 80))
      if (error) return falha(error); afetadas += count ?? 0
    }
  } else return { ok: false, error: 'Ação inválida.' }

  const resumo = { ...acao, aulas: ids.length, afetadas, trilha: alvoId ? trilhas.find((t) => t.id === alvoId)?.nome : 'todas' }
  await registrarAudit({ operacao: 'UPDATE', entidade: T_CEL, entidadeId: produtoId, depois: { massa: true, ...resumo }, atorId: g.atorId, tenantId: g.tenantId })
  await logarLiberacao(g, produtoId, { acao: `grade_${acao.tipo}`, alvoTipo: 'trilha', alvoId: alvoId ?? null, detalhe: resumo })
  return { ok: true, afetadas }
}

export async function linhasGradeExportar(produtoId: string, filtros: FiltrosGrade): Promise<Resultado<{ linhas: LinhaGrade[]; trilhas: Array<{ id: string; nome: string }> }>> {
  const g = await guardTrilhas('cronogramas:view', produtoId)
  if (!g.ok) return g
  const { trilhas } = await listarTrilhas(g.svc, g.tenantId, produtoId)
  try {
    const linhas = await lerGradeCompleta(g.svc, g.tenantId, produtoId, trilhas, filtros)
    return { ok: true, linhas, trilhas: trilhas.filter((t) => t.ativo).map((t) => ({ id: t.id, nome: t.nome })) }
  } catch { return { ok: false, error: 'Não foi possível ler a grade.' } }
}

// ── recalcular data-base ──
async function calcularRecalculo(g: G, produtoId: string): Promise<{ mudancas: MudancaBase[]; previa: PreviaRecalculo } | { erro: string }> {
  const { migrado, trilhas } = await listarTrilhas(g.svc, g.tenantId, produtoId)
  if (!migrado) return { erro: AVISO_MIGRACAO }
  const ativas = trilhas.filter((t) => t.ativo)
  if (!ativas.length) return { erro: 'Não há trilhas ativas para calcular.' }
  const offset = new Map(ativas.map((t) => [t.id, t.offsetDias]))
  const [aulas, celulas] = await Promise.all([
    fetchAll<{ id: string; ordem: number; disciplina: string; titulo: string; data_liberacao: string }>(() => g.svc.from(T_AULA).select('id, ordem, disciplina, titulo, data_liberacao').eq('tenant_id', g.tenantId).eq('produto_id', produtoId).order('id', { ascending: true }) as any),
    lerTodasCelulas(g.svc, g.tenantId, ativas.map((t) => t.id)),
  ])
  const por = new Map<string, Array<{ data_cronograma: string | null; data_manual: string | null; offset_dias: number }>>()
  for (const c of celulas) { const l = por.get(c.liberacao_aula_id) ?? []; l.push({ data_cronograma: c.data_cronograma, data_manual: c.data_manual, offset_dias: offset.get(c.trilha_id) ?? OFFSET_PADRAO }); por.set(c.liberacao_aula_id, l) }
  const mudancas: MudancaBase[] = []
  let semTrilha = 0
  for (const a of aulas) {
    const menor = menorLiberacao(por.get(a.id) ?? [])
    if (!menor) { semTrilha++; continue }
    if (menor !== a.data_liberacao) mudancas.push({ aulaId: a.id, ordem: a.ordem, disciplina: a.disciplina, titulo: a.titulo, de: a.data_liberacao, para: menor })
  }
  mudancas.sort((x, y) => x.ordem - y.ordem)
  return {
    mudancas,
    previa: { total: aulas.length, mudam: mudancas.length, semTrilha, antecipam: mudancas.filter((m) => m.para < m.de).length, adiam: mudancas.filter((m) => m.para > m.de).length, amostra: mudancas.slice(0, 40) },
  }
}

export async function previaRecalculoBase(produtoId: string): Promise<Resultado<{ previa: PreviaRecalculo }>> {
  const g = await guardTrilhas('cronogramas:view', produtoId)
  if (!g.ok) return g
  const r = await calcularRecalculo(g, produtoId)
  return 'erro' in r ? { ok: false, error: r.erro } : { ok: true, previa: r.previa }
}

export async function aplicarRecalculoBase(produtoId: string, origem: 'manual' | 'automatico' = 'manual'): Promise<Resultado<{ atualizadas: number }>> {
  const g = await guardTrilhas('cronogramas:update', produtoId)
  if (!g.ok) return g
  const r = await calcularRecalculo(g, produtoId)
  if ('erro' in r) return { ok: false, error: r.erro }
  const agora = new Date().toISOString()
  const porData = new Map<string, string[]>()
  for (const m of r.mudancas) { const l = porData.get(m.para) ?? []; l.push(m.aulaId); porData.set(m.para, l) }
  for (const [data, ids] of porData) {
    for (let i = 0; i < ids.length; i += 100) {
      const { error } = await g.svc.from(T_AULA).update({ data_liberacao: data, atualizado_em: agora }).eq('tenant_id', g.tenantId).eq('produto_id', produtoId).in('id', ids.slice(i, i + 100))
      if (error) return falha(error)
    }
  }
  const detalhe = { mudaram: r.mudancas.length, antecipadas: r.previa.antecipam, adiadas: r.previa.adiam, sem_trilha: r.previa.semTrilha, alteracoes: r.mudancas.slice(0, 500).map((m) => ({ ordem: m.ordem, de: m.de, para: m.para })) }
  await registrarAudit({ operacao: 'UPDATE', entidade: T_AULA, entidadeId: produtoId, depois: { recalculo_data_base: true, ...detalhe, alteracoes: undefined }, atorId: g.atorId, tenantId: g.tenantId })
  await logarLiberacao(g, produtoId, { origem, acao: 'recalculo', alvoTipo: 'produto', alvoId: produtoId, detalhe })
  return { ok: true, atualizadas: r.mudancas.length }
}

// ── Regras: quantos alunos casam em cada trilha ──
const AUDIENCIA_MAX = 2000
const TTL_MS = 10 * 60 * 1000
const cacheAud = new Map<string, { t: number; v: ContagemAudiencia }>()

async function audienciaDoProduto(g: G, produtoId: string): Promise<string[]> {
  const agora = new Date().toISOString()
  const ids = new Set<string>()
  const ass = await fetchAll<{ id: string; estudante_id: string; expira_em: string | null }>(() => g.svc.from('simulado_assinaturas').select('id, estudante_id, expira_em').eq('tenant_id', g.tenantId).eq('produto_id', produtoId).eq('status', 'ativo').order('id', { ascending: true }) as any)
  for (const a of ass) if (!a.expira_em || a.expira_em > agora) ids.add(a.estudante_id)
  const { data: it } = await g.svc.from('simulado_produto_itens').select('item_id').eq('tenant_id', g.tenantId).eq('produto_id', produtoId).eq('tipo_item', 'grupo').limit(500)
  const grupos = ((it ?? []) as any[]).map((r) => r.item_id as string)
  for (let i = 0; i < grupos.length; i += 50) {
    const ms = await fetchAll<{ id: string; estudante_id: string; expira_em: string | null }>(() => g.svc.from('simulado_grupo_membros').select('id, estudante_id, expira_em').eq('tenant_id', g.tenantId).in('grupo_id', grupos.slice(i, i + 50)).order('id', { ascending: true }) as any)
    for (const m of ms) if (!m.expira_em || m.expira_em > agora) ids.add(m.estudante_id)
  }
  return [...ids].sort()
}

export async function contarAudienciaTrilhas(produtoId: string, forcar = false): Promise<Resultado<{ contagem: ContagemAudiencia }>> {
  const g = await guardTrilhas('cronogramas:view', produtoId)
  if (!g.ok) return g
  const { migrado, trilhas } = await listarTrilhas(g.svc, g.tenantId, produtoId)
  if (!migrado) return { ok: false, error: AVISO_MIGRACAO }
  const ativas = trilhas.filter((t) => t.ativo && t.segmentoIds.length)
  const chave = `${g.tenantId}|${produtoId}|${ativas.map((t) => `${t.id}:${[...t.segmentoIds].sort().join(',')}`).join(';')}`
  const hit = cacheAud.get(chave)
  if (!forcar && hit && Date.now() - hit.t < TTL_MS) return { ok: true, contagem: hit.v }

  const segIds = [...new Set(ativas.flatMap((t) => t.segmentoIds))]
  const regras = new Map<string, RegraSegmento>()
  if (segIds.length) {
    const { data } = await g.svc.from('simulado_segmentos').select('id, regra').eq('tenant_id', g.tenantId).eq('deletado', false).in('id', segIds)
    for (const s of (data ?? []) as any[]) regras.set(s.id, normalizarRegra(s.regra))
  }
  const tenantId: string = g.tenantId
  const todos = await audienciaDoProduto(g, produtoId)
  const alvo = todos.slice(0, AUDIENCIA_MAX)
  const contagem = new Map<string, number>(ativas.map((t) => [t.id, 0]))
  let emVarias = 0, semTrilha = 0, i = 0

  async function trabalhador() {
    while (i < alvo.length) {
      const idx = i++
      const ctx = new ContextoAluno(g.svc, tenantId, alvo[idx] as string)
      const memoSeg = new Map<string, boolean>()
      const casa = async (sid: string) => {
        if (!memoSeg.has(sid)) { const r = regras.get(sid); memoSeg.set(sid, r ? await avaliarRegra(r, ctx).catch(() => false) : false) }
        return memoSeg.get(sid)!
      }
      let n = 0
      for (const t of ativas) {
        let ok = false
        for (const sid of t.segmentoIds) { if (await casa(sid)) { ok = true; break } }
        if (ok) { n++; contagem.set(t.id, (contagem.get(t.id) ?? 0) + 1) }
      }
      if (n > 1) emVarias++
      if (n === 0) semTrilha++
    }
  }
  await Promise.all(Array.from({ length: 8 }, trabalhador))
  const v: ContagemAudiencia = {
    audiencia: alvo.length, amostrado: todos.length > alvo.length, total: todos.length,
    porTrilha: ativas.map((t) => ({ trilhaId: t.id, alunos: contagem.get(t.id) ?? 0 })), emVarias, semTrilha, calculadoEm: new Date().toISOString(),
  }
  cacheAud.set(chave, { t: Date.now(), v })
  return { ok: true, contagem: v }
}
