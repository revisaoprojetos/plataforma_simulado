import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

// Central de Dúvidas (admin Plataforma Revisão) — LEITURA paginada no servidor (.range() + count, projeção explícita, .in() em lotes de 80).
// Fontes (já existentes): simulado_duvidas / simulado_duvida_mensagens, simulado_material_reportes, simulado_material_avaliacoes.
// Tolerante às migrações 20261027010000 / 20261027020000 ausentes: devolve `migrado=false` em vez de quebrar.

const T_DUV = 'simulado_duvidas'
const T_MSG = 'simulado_duvida_mensagens'
const T_REP = 'simulado_material_reportes'
const T_AVA = 'simulado_material_avaliacoes'
const TABELA_AUSENTE = /relation .* does not exist|could not find the table|schema cache|does not exist/i
const CHUNK = 80

async function emLotes<T>(ids: string[], run: (lote: string[]) => PromiseLike<{ data: T[] | null }>): Promise<T[]> {
  const out: T[] = []
  const u = [...new Set(ids.filter(Boolean))]
  for (let i = 0; i < u.length; i += CHUNK) { const { data } = await run(u.slice(i, i + CHUNK)); if (data) out.push(...data) }
  return out
}

/** "há 2 h", "ontem", "há 3 dias" — calculado no servidor a partir do ISO. */
export function relativo(iso: string | null | undefined): string {
  if (!iso) return ''
  const ms = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(ms) || ms < 0) return 'agora'
  const min = Math.floor(ms / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h} h`
  if (h < 48) return 'ontem'
  return `há ${Math.floor(h / 24)} dias`
}

async function nomesAlunos(svc: SupabaseClient, tenantId: string, ids: string[]) {
  const rows = await emLotes<{ id: string; nome: string | null }>(ids, (l) => svc.from('simulado_estudantes').select('id, nome').eq('tenant_id', tenantId).in('id', l))
  return new Map(rows.map((r) => [r.id, r.nome ?? 'Aluno']))
}
/** Privacidade: mostra só o primeiro nome + inicial do sobrenome ("Rafael T.") como no protótipo. */
export function nomeCurto(n: string | null | undefined): string {
  const p = (n ?? '').trim().split(/\s+/).filter(Boolean)
  if (!p.length) return 'Aluno'
  return p.length === 1 ? p[0] : `${p[0]} ${p[p.length - 1][0].toUpperCase()}.`
}
async function titulosDocs(svc: SupabaseClient, tenantId: string, ids: string[]) {
  const rows = await emLotes<{ id: string; titulo: string | null }>(ids, (l) => svc.from('simulado_conteudo_documentos').select('id, titulo').eq('tenant_id', tenantId).in('id', l))
  return new Map(rows.map((r) => [r.id, r.titulo ?? 'Material']))
}

// ───────────────────────────── contagens (badges das abas) ─────────────────────────────

export interface ContagensDuvidas { abertas: number; respondidas: number; problemasAbertos: number; avaliacoes: number; migrado: boolean }
export async function contagensDuvidas(svc: SupabaseClient, tenantId: string): Promise<ContagensDuvidas> {
  const c = (t: string, f: (q: any) => any) => f(svc.from(t).select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId))
  const [a, r, p, v] = await Promise.all([
    c(T_DUV, (q) => q.eq('status', 'aberta')), c(T_DUV, (q) => q.in('status', ['respondida', 'resolvida'])),
    c(T_REP, (q) => q.neq('status', 'resolvido')), c(T_AVA, (q) => q),
  ])
  const ausente = [a, r, p, v].some((x: any) => x.error && TABELA_AUSENTE.test(x.error.message))
  return { abertas: a.count ?? 0, respondidas: r.count ?? 0, problemasAbertos: p.count ?? 0, avaliacoes: v.count ?? 0, migrado: !ausente }
}

// ───────────────────────────── dúvidas ─────────────────────────────

export interface ItemDuvida { id: string; titulo: string; disciplina: string | null; aluno: string; onde: string; quando: string; preview: string; status: string }
export interface MsgDuvida { id: string; autor: 'aluno' | 'professor'; nome: string; texto: string; quando: string }
export interface ThreadDuvida {
  id: string; titulo: string; disciplina: string | null; aluno: string; onde: string; quando: string; status: string
  mensagens: MsgDuvida[]; encaminhamentos: Array<{ professor: string; quando: string }>
}

export async function listarDuvidasPagina(svc: SupabaseClient, tenantId: string, f: { grupo: 'aberta' | 'respondida'; q?: string; pagina: number; por: number }): Promise<{ itens: ItemDuvida[]; total: number }> {
  let q = svc.from(T_DUV).select('id, estudante_id, titulo, disciplina_id, origem, status, ultima_msg_em', { count: 'exact' }).eq('tenant_id', tenantId)
  q = f.grupo === 'aberta' ? q.eq('status', 'aberta') : q.in('status', ['respondida', 'resolvida'])
  const b = (f.q ?? '').trim().replace(/[%_,()]/g, ' ')
  if (b) q = q.ilike('titulo', `%${b}%`)
  const { data, count, error } = await q.order('ultima_msg_em', { ascending: false }).order('id', { ascending: false }).range((f.pagina - 1) * f.por, f.pagina * f.por - 1)
  if (error) throw error
  const rows = (data ?? []) as Array<{ id: string; estudante_id: string; titulo: string; disciplina_id: string | null; origem: { label?: string | null; pagina?: number | null } | null; status: string; ultima_msg_em: string }>
  const [nomes, discs, msgs] = await Promise.all([
    nomesAlunos(svc, tenantId, rows.map((r) => r.estudante_id)),
    emLotes<{ id: string; nome: string }>(rows.map((r) => r.disciplina_id ?? ''), (l) => svc.from('simulado_disciplinas').select('id, nome').eq('tenant_id', tenantId).in('id', l)),
    emLotes<{ id: string; duvida_id: string; texto: string; criado_em: string }>(rows.map((r) => r.id), (l) =>
      svc.from(T_MSG).select('id, duvida_id, texto, criado_em').eq('tenant_id', tenantId).eq('autor_tipo', 'aluno').in('duvida_id', l).order('criado_em', { ascending: true }).order('id', { ascending: true })),
  ])
  const dn = new Map(discs.map((d) => [d.id, d.nome]))
  const primeira = new Map<string, string>()
  for (const m of msgs) if (!primeira.has(m.duvida_id)) primeira.set(m.duvida_id, m.texto)
  return {
    total: count ?? 0,
    itens: rows.map((r) => ({
      id: r.id, titulo: r.titulo, disciplina: r.disciplina_id ? dn.get(r.disciplina_id) ?? null : null, aluno: nomeCurto(nomes.get(r.estudante_id)),
      onde: [r.origem?.label, r.origem?.pagina ? `p. ${r.origem.pagina}` : null].filter(Boolean).join(' · ') || 'Geral',
      quando: relativo(r.ultima_msg_em), preview: primeira.get(r.id) ?? '', status: r.status,
    })),
  }
}

export async function carregarThread(svc: SupabaseClient, tenantId: string, id: string): Promise<ThreadDuvida | null> {
  const { data: d } = await svc.from(T_DUV).select('id, estudante_id, titulo, disciplina_id, origem, status, ultima_msg_em').eq('tenant_id', tenantId).eq('id', id).maybeSingle()
  if (!d) return null
  const r = d as { id: string; estudante_id: string; titulo: string; disciplina_id: string | null; origem: { label?: string | null; pagina?: number | null } | null; status: string; ultima_msg_em: string }
  const [msgs, nomes, disc, enc] = await Promise.all([
    svc.from(T_MSG).select('id, autor_tipo, autor_nome, texto, criado_em').eq('tenant_id', tenantId).eq('duvida_id', id).order('criado_em', { ascending: true }).order('id', { ascending: true }).limit(200),
    nomesAlunos(svc, tenantId, [r.estudante_id]),
    r.disciplina_id ? svc.from('simulado_disciplinas').select('nome').eq('tenant_id', tenantId).eq('id', r.disciplina_id).maybeSingle() : Promise.resolve({ data: null }),
    svc.from('simulado_revisao_duvida_encaminhamentos').select('professor_nome, criado_em').eq('tenant_id', tenantId).eq('duvida_id', id).order('criado_em', { ascending: false }).limit(10),
  ])
  const aluno = nomeCurto(nomes.get(r.estudante_id))
  return {
    id: r.id, titulo: r.titulo, disciplina: (disc.data as { nome: string } | null)?.nome ?? null, aluno, status: r.status, quando: relativo(r.ultima_msg_em),
    onde: [r.origem?.label, r.origem?.pagina ? `p. ${r.origem.pagina}` : null].filter(Boolean).join(' · ') || 'Geral',
    mensagens: ((msgs.data ?? []) as Array<{ id: string; autor_tipo: 'aluno' | 'professor'; autor_nome: string | null; texto: string; criado_em: string }>)
      .map((m) => ({ id: m.id, autor: m.autor_tipo, nome: m.autor_tipo === 'aluno' ? aluno : m.autor_nome ?? 'Equipe', texto: m.texto, quando: relativo(m.criado_em) })),
    encaminhamentos: enc.error ? [] : ((enc.data ?? []) as Array<{ professor_nome: string; criado_em: string }>).map((e) => ({ professor: e.professor_nome, quando: relativo(e.criado_em) })),
  }
}

/** Equipe que pode receber encaminhamentos (acessos ativos que não são estudante), com nome de simulado_users. */
export async function listarProfessores(svc: SupabaseClient, tenantId: string): Promise<Array<{ id: string; nome: string }>> {
  const { data } = await svc.from('simulado_tenant_acessos').select('user_id, role').eq('tenant_id', tenantId).eq('ativo', true).neq('role', 'estudante').order('user_id', { ascending: true }).limit(200)
  const ids = ((data ?? []) as Array<{ user_id: string }>).map((a) => a.user_id)
  const us = await emLotes<{ id: string; nome: string | null; email: string | null }>(ids, (l) => svc.from('simulado_users').select('id, nome, email').in('id', l))
  return us.map((u) => ({ id: u.id, nome: u.nome || u.email || 'Professor' })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

// ───────────────────────────── problemas em materiais ─────────────────────────────

export interface ItemReporte { id: string; material: string; documentoId: string; pagina: string; aluno: string; tipo: string; texto: string; quando: string; status: string; resposta: string | null }
const ORD_REP: Record<string, string> = { quando: 'criado_em', tipo: 'tipo', status: 'status' }

export async function listarReportesPagina(svc: SupabaseClient, tenantId: string, f: { situ?: string; tipo?: string; q?: string; ord?: string; dir?: string; pagina: number; por: number }): Promise<{ itens: ItemReporte[]; total: number }> {
  let q = svc.from(T_REP).select('id, estudante_id, documento_id, pagina, tipo, descricao, status, resposta, criado_em', { count: 'exact' }).eq('tenant_id', tenantId)
  if (f.situ === 'abertos') q = q.neq('status', 'resolvido'); else if (f.situ === 'corrigidos') q = q.eq('status', 'resolvido')
  if (['erro_conteudo', 'erro_tecnico', 'desatualizado', 'outro'].includes(f.tipo ?? '')) q = q.eq('tipo', f.tipo as string)
  const b = (f.q ?? '').trim().replace(/[%_,()]/g, ' ')
  if (b) q = q.ilike('descricao', `%${b}%`)
  const col = ORD_REP[f.ord ?? ''] ?? 'criado_em'
  const asc = f.ord ? f.dir !== 'desc' : false
  const { data, count, error } = await q.order(col, { ascending: asc }).order('id', { ascending: false }).range((f.pagina - 1) * f.por, f.pagina * f.por - 1)
  if (error) throw error
  const rows = (data ?? []) as Array<{ id: string; estudante_id: string; documento_id: string; pagina: number | null; tipo: string; descricao: string; status: string; resposta: string | null; criado_em: string }>
  const [nomes, docs] = await Promise.all([nomesAlunos(svc, tenantId, rows.map((r) => r.estudante_id)), titulosDocs(svc, tenantId, rows.map((r) => r.documento_id))])
  return {
    total: count ?? 0,
    itens: rows.map((r) => ({
      id: r.id, documentoId: r.documento_id, material: docs.get(r.documento_id) ?? 'Material', pagina: r.pagina ? `p. ${r.pagina}` : 'sem página',
      aluno: nomeCurto(nomes.get(r.estudante_id)), tipo: r.tipo, texto: r.descricao, quando: relativo(r.criado_em), status: r.status, resposta: r.resposta,
    })),
  }
}

// ───────────────────────────── avaliações ─────────────────────────────

export interface ItemAvaliacao { id: string; material: string; documentoId: string; nota: number; comentario: string | null; aluno: string; quando: string }
export async function resumoAvaliacoes(svc: SupabaseClient, tenantId: string): Promise<{ media: number; baixas: number; comComentario: number; total: number }> {
  const porNota = await Promise.all([1, 2, 3, 4, 5].map((n) => svc.from(T_AVA).select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('nota', n)))
  const cn = porNota.map((r) => r.count ?? 0)
  const total = cn.reduce((a, b) => a + b, 0)
  const soma = cn.reduce((a, c, i) => a + c * (i + 1), 0)
  const com = await svc.from(T_AVA).select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).not('comentario', 'is', null).neq('comentario', '')
  return { media: total ? soma / total : 0, baixas: cn[0] + cn[1], comComentario: com.count ?? 0, total }
}

export async function listarAvaliacoesPagina(svc: SupabaseClient, tenantId: string, f: { nota?: string; q?: string; ord?: string; dir?: string; pagina: number; por: number }): Promise<{ itens: ItemAvaliacao[]; total: number }> {
  let q = svc.from(T_AVA).select('id, estudante_id, documento_id, nota, comentario, criado_em', { count: 'exact' }).eq('tenant_id', tenantId)
  if (['1', '2', '3', '4', '5'].includes(f.nota ?? '')) q = q.eq('nota', Number(f.nota))
  else if (f.nota === 'baixas') q = q.lte('nota', 2)
  const b = (f.q ?? '').trim().replace(/[%_,()]/g, ' ')
  if (b) q = q.ilike('comentario', `%${b}%`)
  // padrão do protótipo: menores notas primeiro
  const col = f.ord === 'quando' ? 'criado_em' : 'nota'
  const asc = f.ord ? f.dir !== 'desc' : true
  const { data, count, error } = await q.order(col, { ascending: asc }).order('id', { ascending: false }).range((f.pagina - 1) * f.por, f.pagina * f.por - 1)
  if (error) throw error
  const rows = (data ?? []) as Array<{ id: string; estudante_id: string; documento_id: string; nota: number; comentario: string | null; criado_em: string }>
  const [nomes, docs] = await Promise.all([nomesAlunos(svc, tenantId, rows.map((r) => r.estudante_id)), titulosDocs(svc, tenantId, rows.map((r) => r.documento_id))])
  return {
    total: count ?? 0,
    itens: rows.map((r) => ({ id: r.id, documentoId: r.documento_id, material: docs.get(r.documento_id) ?? 'Material', nota: r.nota, comentario: r.comentario, aluno: nomeCurto(nomes.get(r.estudante_id)), quando: relativo(r.criado_em) })),
  }
}
