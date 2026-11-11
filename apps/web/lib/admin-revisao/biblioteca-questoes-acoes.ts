import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { sqlQuery } from '@/lib/data/sql'
import { registrarAudit } from '@/lib/audit'
import { chavesDe, gruposDuplicados, usoDeQuestoes } from './biblioteca-questoes-duplicadas'
import { limparCacheQuestoes } from './biblioteca-questoes'
import type { UsoQ } from './biblioteca-questoes-gestao-tipos'

// AÇÕES de gestão (somente servidor): classificar em massa, unificar/arquivar questões duplicadas, mesclar etiquetas e ficha da questão.
// Isolamento: o service role ignora RLS → TODA escrita filtra tenant_id e valida que ids/taxonomia pertencem ao tenant.
// Sem transação no cliente PostgREST: os passos são IDEMPOTENTES e o arquivamento (que tira a duplicada da fila) é o ÚLTIMO.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const CHUNK = 80
const pedacos = <T,>(a: T[], n = CHUNK) => { const o: T[][] = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o }
type Ator = { tenantId: string; userId: string | null }
type R = { ok: boolean; error?: string; [k: string]: any }

// ───────────────────────── classificar em massa ─────────────────────────
export interface PatchClassif { disciplinaId?: string | null; assuntoId?: string | null; bancaId?: string | null; orgaoId?: string | null; ano?: number | null; dificuldade?: string | null; cargo?: string | null; status?: string | null }

export async function classificarEmMassa(svc: SupabaseClient, a: Ator, ids: string[], patch: PatchClassif, soPreencher: boolean): Promise<R> {
  const { tenantId } = a
  const tem = (k: keyof PatchClassif) => Object.prototype.hasOwnProperty.call(patch, k) && patch[k] !== undefined
  const upd: Record<string, any> = {}
  // validações de pertença ao tenant (service role não passa pela RLS)
  const dono = async (tabela: string, id: string) => !!(await svc.from(tabela).select('id').eq('tenant_id', tenantId).eq('id', id).maybeSingle()).data
  if (tem('disciplinaId') && patch.disciplinaId) { if (!UUID.test(patch.disciplinaId) || !(await dono('simulado_disciplinas', patch.disciplinaId))) return { ok: false, error: 'Disciplina inválida.' } }
  if (tem('assuntoId') && patch.assuntoId) {
    if (!UUID.test(patch.assuntoId)) return { ok: false, error: 'Assunto inválido.' }
    if (!patch.disciplinaId) return { ok: false, error: 'Escolha a disciplina do assunto.' }
    const { data: s } = await svc.from('simulado_assuntos').select('disciplina_id').eq('tenant_id', tenantId).eq('id', patch.assuntoId).maybeSingle()
    if (!s || (s as any).disciplina_id !== patch.disciplinaId) return { ok: false, error: 'O assunto não pertence a essa disciplina.' }
  }
  if (tem('bancaId') && patch.bancaId) { if (!UUID.test(patch.bancaId) || !(await dono('simulado_bancas', patch.bancaId))) return { ok: false, error: 'Banca inválida.' } }
  if (tem('orgaoId') && patch.orgaoId) { if (!UUID.test(patch.orgaoId) || !(await dono('simulado_orgaos', patch.orgaoId))) return { ok: false, error: 'Órgão inválido.' } }
  if (tem('ano') && patch.ano != null && !(Number.isInteger(patch.ano) && patch.ano >= 1950 && patch.ano <= 2100)) return { ok: false, error: 'Ano inválido.' }
  if (tem('dificuldade') && patch.dificuldade && !['facil', 'medio', 'dificil'].includes(patch.dificuldade)) return { ok: false, error: 'Dificuldade inválida.' }
  if (tem('status') && patch.status && !['publicada', 'rascunho', 'arquivada'].includes(patch.status)) return { ok: false, error: 'Status inválido.' }
  if (tem('cargo') && patch.cargo && String(patch.cargo).length > 200) return { ok: false, error: 'Cargo muito longo.' }
  if (tem('disciplinaId')) upd.disciplina_id = patch.disciplinaId ?? null
  if (tem('assuntoId')) upd.assunto_id = patch.assuntoId ?? null
  else if (tem('disciplinaId') && !soPreencher) upd.assunto_id = null // trocar a disciplina sem escolher assunto zera o assunto (não fica assunto de outra disciplina)
  if (tem('bancaId')) upd.banca_id = patch.bancaId ?? null
  if (tem('orgaoId')) upd.orgao_id = patch.orgaoId ?? null
  if (tem('ano')) upd.ano = patch.ano ?? null
  if (tem('dificuldade')) upd.nivel_dificuldade = patch.dificuldade ?? null
  if (tem('cargo')) upd.cargo = patch.cargo ? String(patch.cargo).trim() : null
  if (tem('status')) upd.status = patch.status
  if (!Object.keys(upd).length) return { ok: false, error: 'Nada a alterar.' }

  const afetadas = new Set<string>()
  for (const c of pedacos(ids)) {
    if (!soPreencher) {
      const r = await svc.from('simulado_questoes').update(upd).eq('tenant_id', tenantId).eq('deletado', false).in('id', c).select('id')
      if (r.error) return { ok: false, error: r.error.message, atualizadas: afetadas.size }
      for (const x of (r.data ?? []) as any[]) afetadas.add(x.id)
    } else {
      // preencher só o que está vazio: um UPDATE por campo, sempre com "campo is null"
      const passos: [string, any, (q: any) => any][] = []
      if ('disciplina_id' in upd && upd.disciplina_id) passos.push(['disciplina_id', upd.disciplina_id, (q) => q.is('disciplina_id', null)])
      if ('assunto_id' in upd && upd.assunto_id) passos.push(['assunto_id', upd.assunto_id, (q) => q.is('assunto_id', null).eq('disciplina_id', patch.disciplinaId)])
      for (const [col, k] of [['banca_id', 'banca_id'], ['orgao_id', 'orgao_id'], ['ano', 'ano'], ['nivel_dificuldade', 'nivel_dificuldade']] as const) if (k in upd && upd[k] != null) passos.push([col, upd[k], (q) => q.is(col, null)])
      if ('cargo' in upd && upd.cargo) passos.push(['cargo', upd.cargo, (q) => q.or('cargo.is.null,cargo.eq.')])
      if ('status' in upd) passos.push(['status', upd.status, (q) => q])
      for (const [col, val, filtro] of passos) {
        const r = await filtro(svc.from('simulado_questoes').update({ [col]: val }).eq('tenant_id', tenantId).eq('deletado', false).in('id', c)).select('id')
        if (r.error) return { ok: false, error: r.error.message, atualizadas: afetadas.size }
        for (const x of (r.data ?? []) as any[]) afetadas.add(x.id)
      }
    }
  }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_questoes', entidadeId: ids[0], atorId: a.userId, tenantId, depois: { acao_em_massa: soPreencher ? 'classificar_preencher_vazios' : 'classificar', patch, total: ids.length, atualizadas: afetadas.size, ids: ids.slice(0, 50) } }).catch(() => {})
  limparCacheQuestoes(tenantId)
  return { ok: true, atualizadas: afetadas.size }
}

// ───────────────────────── unificar questões duplicadas ─────────────────────────
const CAMPOS_MESTRE: [string, string][] = [
  ['disciplina_id', 'disciplina'], ['assunto_id', 'assunto'], ['banca_id', 'banca'], ['orgao_id', 'órgão'], ['ano', 'ano'], ['nivel_dificuldade', 'dificuldade'],
  ['cargo', 'cargo'], ['assunto_detalhe', 'assunto específico'], ['comentario_professor', 'comentário do professor'],
]

async function validar(svc: SupabaseClient, tenantId: string, mestreId: string, dupIds: string[]): Promise<{ ok: boolean; error?: string; todos?: Map<string, any>; completa?: boolean; motivo?: string }> {
  if (!UUID.test(mestreId) || !dupIds.length || dupIds.some((d) => !UUID.test(d))) return { ok: false, error: 'Escolha a questão mestre e ao menos uma duplicada.' }
  if (dupIds.includes(mestreId)) return { ok: false, error: 'A mestre não pode estar entre as duplicadas.' }
  if (dupIds.length > 12) return { ok: false, error: 'Máximo de 12 duplicadas por vez.' }
  const ids = [mestreId, ...dupIds]
  const { data } = await svc.from('simulado_questoes').select('id, status, anulada, deletado, external_id, disciplina_id, assunto_id, banca_id, orgao_id, ano, nivel_dificuldade, cargo, assunto_detalhe, comentario_professor').eq('tenant_id', tenantId).in('id', ids)
  const todos = new Map<string, any>(((data ?? []) as any[]).filter((x) => !x.deletado).map((x) => [x.id, x]))
  if (todos.size !== ids.length) return { ok: false, error: 'Alguma questão não existe neste tenant (ou está na Lixeira).' }
  const m = todos.get(mestreId)
  if (m.status === 'arquivada') return { ok: false, error: 'A mestre está arquivada. Escolha uma questão ativa como mestre.' }
  const ch = await chavesDe(svc, tenantId, ids)
  const cm = ch.get(mestreId)
  let completa = true; let motivo = ''
  for (const d of dupIds) {
    const cd = ch.get(d)
    if (!cm || !cd) { completa = false; motivo = 'Não foi possível comparar o texto das questões.'; break }
    if (cd.enun !== cm.enun) { completa = false; motivo = 'Os enunciados não são idênticos.'; break }
    if (cd.alt !== cm.alt || cd.gab !== cm.gab) { completa = false; motivo = 'As alternativas ou o gabarito são diferentes.'; break }
    if (!!todos.get(d).anulada !== !!m.anulada) { completa = false; motivo = 'Uma delas está anulada e a outra não.'; break }
  }
  return { ok: true, todos, completa, motivo }
}

export async function previaUnificarQuestoes(svc: SupabaseClient, tenantId: string, mestreId: string, dupIds: string[]): Promise<R> {
  const v = await validar(svc, tenantId, mestreId, dupIds)
  if (!v.ok) return v
  const uso = await usoDeQuestoes(svc, tenantId, [mestreId, ...dupIds])
  const soma = (f: (u: UsoQ) => number) => dupIds.reduce((s, d) => s + f(uso[d]), 0)
  const m = v.todos!.get(mestreId)
  const preenche: string[] = []
  for (const [col, rot] of CAMPOS_MESTRE) if ((m[col] == null || m[col] === '') && dupIds.some((d) => { const x = v.todos!.get(d)[col]; return x != null && x !== '' })) preenche.push(rot)
  // etiquetas das duplicadas que a mestre ainda não tem
  const novas = await sqlQuery<{ n: number }>('select count(distinct e.etiqueta_id)::int as n from simulado_questao_etiquetas e where e.questao_id = any($1::uuid[]) and not exists (select 1 from simulado_questao_etiquetas m where m.questao_id = $2::uuid and m.etiqueta_id = e.etiqueta_id)', [dupIds, mestreId])
  return {
    ok: true, completaPermitida: !!v.completa, motivoBloqueio: v.completa ? '' : v.motivo, uso,
    moveria: { etiquetas: novas?.[0]?.n ?? null, favoritos: soma((u) => u.favoritos), comentarios: soma((u) => u.comentarios), feedbacks: soma((u) => u.feedbacks), bancos: soma((u) => u.bancos) },
    ficam: { simulados: soma((u) => u.simulados), respostas: soma((u) => u.respostas), conteudos: soma((u) => u.conteudos) },
    preenche,
  }
}

export async function unificarQuestoes(svc: SupabaseClient, a: Ator, mestreId: string, dupIds: string[], modo: 'completa' | 'arquivar'): Promise<R> {
  const { tenantId } = a
  dupIds = [...new Set(dupIds)]
  const v = await validar(svc, tenantId, mestreId, dupIds)
  if (!v.ok) return v
  if (modo === 'completa' && !v.completa) return { ok: false, error: `Unificação completa bloqueada: ${v.motivo} Use “Arquivar duplicada”.` }
  const feito: Record<string, number> = {}
  const falha = (passo: string, msg: string): R => ({ ok: false, error: `Falha em “${passo}”: ${msg}. Nada foi arquivado; pode tentar de novo (os passos anteriores são seguros de repetir).`, feito })
  const mover: Record<string, string[]> = {}

  if (modo === 'completa') {
    // a) etiquetas (cópia — não apaga das duplicadas)
    const { data: ets, error: e1 } = await svc.from('simulado_questao_etiquetas').select('etiqueta_id').eq('tenant_id', tenantId).in('questao_id', dupIds)
    if (e1) return falha('etiquetas', e1.message)
    const etIds = [...new Set(((ets ?? []) as any[]).map((x) => x.etiqueta_id))]
    if (etIds.length) {
      const r = await svc.from('simulado_questao_etiquetas').upsert(etIds.map((etiqueta_id) => ({ tenant_id: tenantId, questao_id: mestreId, etiqueta_id })), { onConflict: 'questao_id,etiqueta_id', ignoreDuplicates: true })
      if (r.error) return falha('etiquetas', r.error.message)
    }
    feito.etiquetas = etIds.length
    // b) bancos (pastas de questões) — cópia
    const { data: pas, error: e2 } = await svc.from('simulado_questao_pasta').select('pasta_id').eq('tenant_id', tenantId).in('questao_id', dupIds)
    if (e2) return falha('bancos', e2.message)
    const pIds = [...new Set(((pas ?? []) as any[]).map((x) => x.pasta_id))]
    if (pIds.length) {
      const r = await svc.from('simulado_questao_pasta').upsert(pIds.map((pasta_id) => ({ tenant_id: tenantId, questao_id: mestreId, pasta_id })), { onConflict: 'questao_id,pasta_id', ignoreDuplicates: true })
      if (r.error) return falha('bancos', r.error.message)
    }
    feito.bancos = pIds.length
    // c) favoritos — move (quem já favoritou a mestre só perde a linha repetida)
    const { data: fav, error: e3 } = await svc.from('simulado_favoritos').select('id, estudante_id, questao_id').eq('tenant_id', tenantId).in('questao_id', [mestreId, ...dupIds]).order('id', { ascending: true })
    if (e3) return falha('favoritos', e3.message)
    const jaTem = new Set(((fav ?? []) as any[]).filter((f) => f.questao_id === mestreId).map((f) => f.estudante_id))
    const mvF: string[] = [], delF: string[] = []
    for (const f of ((fav ?? []) as any[]).filter((x) => x.questao_id !== mestreId)) { if (jaTem.has(f.estudante_id)) delF.push(f.id); else { jaTem.add(f.estudante_id); mvF.push(f.id) } }
    for (const c of pedacos(mvF)) { const r = await svc.from('simulado_favoritos').update({ questao_id: mestreId }).eq('tenant_id', tenantId).in('id', c); if (r.error) return falha('favoritos', r.error.message) }
    for (const c of pedacos(delF)) { const r = await svc.from('simulado_favoritos').delete().eq('tenant_id', tenantId).in('id', c); if (r.error) return falha('favoritos', r.error.message) }
    feito.favoritos = mvF.length; mover.favoritos = mvF.slice(0, 200)
    // d) comentários e reportes de erro — passam para a mestre
    for (const [tabela, chave] of [['simulado_comentarios_questao', 'comentarios'], ['simulado_feedbacks_questao', 'feedbacks']] as const) {
      const { data: l, error } = await svc.from(tabela).select('id').eq('tenant_id', tenantId).in('questao_id', dupIds).order('id', { ascending: true })
      if (error) return falha(chave, error.message)
      const idsL = ((l ?? []) as any[]).map((x) => x.id as string)
      for (const c of pedacos(idsL)) { const r = await svc.from(tabela).update({ questao_id: mestreId }).eq('tenant_id', tenantId).in('id', c); if (r.error) return falha(chave, r.error.message) }
      feito[chave] = idsL.length; mover[chave] = idsL.slice(0, 200)
    }
    // e) campos vazios da mestre completados com os das duplicadas (nunca sobrescreve valor existente)
    const m = v.todos!.get(mestreId); const patch: Record<string, any> = {}
    for (const [col] of CAMPOS_MESTRE) { if (m[col] == null || m[col] === '') { for (const d of dupIds) { const x = v.todos!.get(d)[col]; if (x != null && x !== '') { patch[col] = x; break } } } }
    // assunto só vem junto da disciplina dele (evita assunto de outra disciplina)
    if (patch.assunto_id && !patch.disciplina_id && !m.disciplina_id) delete patch.assunto_id
    if (Object.keys(patch).length) { const r = await svc.from('simulado_questoes').update(patch).eq('tenant_id', tenantId).eq('id', mestreId); if (r.error) return falha('campos da mestre', r.error.message) }
    feito.camposPreenchidos = Object.keys(patch).length
  }

  // f) arquivar as duplicadas (por último)
  const ar = await svc.from('simulado_questoes').update({ status: 'arquivada' }).eq('tenant_id', tenantId).eq('deletado', false).in('id', dupIds).select('id')
  if (ar.error) return { ok: false, error: `Não foi possível arquivar: ${ar.error.message}`, feito }
  feito.arquivadas = (ar.data ?? []).length

  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_questoes', entidadeId: mestreId, atorId: a.userId, tenantId, antes: { duplicadas_status: dupIds.map((d) => ({ id: d, status: v.todos!.get(d).status })) }, depois: { unificacao_questoes: modo, mestre: mestreId, duplicadas: dupIds, resultado: feito, movidos: mover } }).catch(() => {})
  for (const d of dupIds) await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_questoes', entidadeId: d, atorId: a.userId, tenantId, antes: { status: v.todos!.get(d).status }, depois: { status: 'arquivada', duplicada_de: mestreId, modo } }).catch(() => {})
  limparCacheQuestoes(tenantId)
  return { ok: true, modo, feito }
}

// ───────────────────────── mesclar etiquetas ─────────────────────────
export async function mesclarEtiquetas(svc: SupabaseClient, a: Ator, origemId: string, destinoId: string): Promise<R> {
  const { tenantId } = a
  if (!UUID.test(origemId) || !UUID.test(destinoId) || origemId === destinoId) return { ok: false, error: 'Escolha duas etiquetas diferentes.' }
  const get = async (id: string) => { let r: any = await svc.from('simulado_etiquetas').select('id, nome, cor, funcao').eq('tenant_id', tenantId).eq('id', id).eq('deletado', false).maybeSingle(); if (r.error) r = await svc.from('simulado_etiquetas').select('id, nome, cor').eq('tenant_id', tenantId).eq('id', id).maybeSingle(); return r.data as any }
  const [o, d] = await Promise.all([get(origemId), get(destinoId)])
  if (!o || !d) return { ok: false, error: 'Etiqueta não encontrada.' }
  // etiquetas com FUNÇÃO (anular/avisar/desconsiderar) mudam a correção dos simulados: só mescla entre iguais.
  if ((o.funcao ?? null) !== (d.funcao ?? null)) return { ok: false, error: `Estas etiquetas têm funções diferentes (${o.funcao ?? 'só rótulo'} × ${d.funcao ?? 'só rótulo'}). Mesclar mudaria a correção dos simulados — não permitido.` }
  const ids: string[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await svc.from('simulado_questao_etiquetas').select('questao_id').eq('tenant_id', tenantId).eq('etiqueta_id', origemId).order('questao_id', { ascending: true }).range(from, from + 999)
    if (error) return { ok: false, error: error.message }
    ids.push(...((data ?? []) as any[]).map((x) => x.questao_id)); if ((data ?? []).length < 1000) break
  }
  for (const c of pedacos(ids, 500)) {
    const r = await svc.from('simulado_questao_etiquetas').upsert(c.map((questao_id) => ({ tenant_id: tenantId, questao_id, etiqueta_id: destinoId })), { onConflict: 'questao_id,etiqueta_id', ignoreDuplicates: true })
    if (r.error) return { ok: false, error: `Falha ao mover os vínculos: ${r.error.message}. A etiqueta de origem foi mantida.` }
  }
  const dv = await svc.from('simulado_questao_etiquetas').delete().eq('tenant_id', tenantId).eq('etiqueta_id', origemId)
  if (dv.error) return { ok: false, error: dv.error.message }
  const de = await svc.from('simulado_etiquetas').delete().eq('tenant_id', tenantId).eq('id', origemId)
  if (de.error) return { ok: false, error: de.error.message }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_etiquetas', entidadeId: destinoId, atorId: a.userId, tenantId, antes: { origem: o }, depois: { mesclou_etiqueta: o.nome, em: d.nome, questoes_movidas: ids.length } }).catch(() => {})
  limparCacheQuestoes(tenantId)
  return { ok: true, movidas: ids.length, destino: d.nome }
}

// ───────────────────────── etiquetas em massa (a partir da seleção) ─────────────────────────
export async function etiquetaEmMassa(svc: SupabaseClient, a: Ator, ids: string[], etiquetaId: string, remover: boolean): Promise<R> {
  const { tenantId } = a
  if (!UUID.test(etiquetaId)) return { ok: false, error: 'Etiqueta inválida.' }
  const { data: et } = await svc.from('simulado_etiquetas').select('id').eq('tenant_id', tenantId).eq('id', etiquetaId).eq('deletado', false).maybeSingle()
  if (!et) return { ok: false, error: 'Etiqueta não encontrada.' }
  const validas: string[] = []
  for (const c of pedacos(ids)) {
    const { data } = await svc.from('simulado_questoes').select('id').eq('tenant_id', tenantId).eq('deletado', false).in('id', c).order('id', { ascending: true })
    validas.push(...((data ?? []) as any[]).map((x) => x.id))
  }
  if (!validas.length) return { ok: false, error: 'Nenhuma questão válida.' }
  for (const c of pedacos(validas)) {
    const r = remover
      ? await svc.from('simulado_questao_etiquetas').delete().eq('tenant_id', tenantId).eq('etiqueta_id', etiquetaId).in('questao_id', c)
      : await svc.from('simulado_questao_etiquetas').upsert(c.map((questao_id) => ({ tenant_id: tenantId, questao_id, etiqueta_id: etiquetaId })), { onConflict: 'questao_id,etiqueta_id', ignoreDuplicates: true })
    if (r.error) return { ok: false, error: r.error.message }
  }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_questoes', entidadeId: validas[0], atorId: a.userId, tenantId, depois: { acao_em_massa: remover ? 'remover_etiqueta' : 'aplicar_etiqueta', etiqueta_id: etiquetaId, questoes: validas.length, ids: validas.slice(0, 50) } }).catch(() => {})
  limparCacheQuestoes(tenantId)
  return { ok: true, atualizadas: validas.length }
}

// ───────────────────────── ficha da questão (painel lateral) ─────────────────────────
export async function fichaQuestao(svc: SupabaseClient, tenantId: string, id: string): Promise<R> {
  if (!UUID.test(id)) return { ok: false, error: 'Questão inválida.' }
  const q = await svc.from('simulado_questoes').select('id, codigo, status, tipo, nivel_dificuldade, ano, cargo, assunto_detalhe, versao, anulada, disciplina_id, assunto_id, banca_id, orgao_id, external_id, created_at, updated_at').eq('tenant_id', tenantId).eq('id', id).maybeSingle()
  if (!q.data) return { ok: false, error: 'Questão não encontrada.' }
  const [ets, uso, sims, fbs, grupos] = await Promise.all([
    svc.from('simulado_questao_etiquetas').select('etiqueta_id').eq('tenant_id', tenantId).eq('questao_id', id),
    usoDeQuestoes(svc, tenantId, [id]),
    sqlQuery<any>(`select s.id::text as id, s.titulo, s.status from simulado_prova_questoes p join simulado_simulados s on s.id = p.simulado_id where p.questao_id = $1::uuid and p.tenant_id = $2 and coalesce(s.deletado, false) = false order by s.titulo limit 12`, [id, tenantId]),
    svc.from('simulado_feedbacks_questao').select('tipo, mensagem, status, criado_em').eq('tenant_id', tenantId).eq('questao_id', id).order('criado_em', { ascending: false }).limit(5),
    gruposDuplicados(svc, tenantId),
  ])
  const g = grupos.grupos.find((x) => x.ids.includes(id))
  return {
    ok: true, questao: q.data, etiquetaIds: ((ets.data ?? []) as any[]).map((x) => x.etiqueta_id), uso: uso[id], simulados: sims ?? [],
    feedbacks: ((fbs.data ?? []) as any[]).map((f) => ({ tipo: f.tipo, mensagem: String(f.mensagem ?? '').slice(0, 240), status: f.status, criadoEm: f.criado_em })),
    duplicadas: g && g.ativas >= 2 ? { nivel: g.nivel, outros: g.ids.filter((x) => x !== id) } : null,
  }
}
