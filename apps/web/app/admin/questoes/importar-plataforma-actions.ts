'use server'

// Importação de questões ENTRE plataformas (cross-tenant), por-questão. Exclusivo do super-admin
// (lê/escreve outros tenants via service role, fora do RLS) — gate em TODA action.
// Reusa o motor idempotente `copiarQuestao` (dedup por external_id `cp:{origem}:{id}`).

import { createAdminClient } from '@/lib/supabase/server'
import { isSuperAdmin, getCurrentAccess } from '@/lib/auth/permissions'
import { getCurrentTenantId } from '@/lib/tenant'
import { copiarQuestao } from '@/lib/compartilhamento/copiar'
import { registrarAudit } from '@/lib/audit'

const NEGADO = 'Área exclusiva do super-administrador global.'
const PER_PAGE = 15

/** Banca "própria" da plataforma de destino (nome do tenant) — find-or-create. As questões importadas
 *  recebem esta banca no lugar da banca da origem. */
async function bancaDaPlataforma(svc: ReturnType<typeof createAdminClient>, destino: string): Promise<string | null> {
  const { data: t } = await svc.from('simulado_tenants').select('nome').eq('id', destino).maybeSingle()
  const nome = ((t as any)?.nome ?? '').trim() || 'Plataforma'
  const { data: ex } = await svc.from('simulado_bancas').select('id').eq('tenant_id', destino).eq('nome', nome).limit(1)
  if (ex && ex.length) return (ex[0] as any).id
  const { data: nova } = await svc.from('simulado_bancas').insert({ tenant_id: destino, nome }).select('id').single()
  return (nova as any)?.id ?? null
}

export interface QuestaoOrigem {
  id: string
  codigo: string | null
  enunciado: string
  status: string | null
  tipo: string | null
  nivel_dificuldade: string | null
  ano: number | null
  disciplina: string | null
  assunto: string | null
  banca: string | null
  orgao: string | null
  cargo: string | null
}

export interface FiltrosOrigem {
  busca?: string
  status?: string
  disciplinaId?: string
  dificuldade?: string
  tipo?: string
  page?: number
}

/** Plataformas (tenants ativos) elegíveis como ORIGEM — exclui a plataforma atual (destino). */
export async function listarPlataformasOrigem(): Promise<{ ok?: boolean; error?: string; plataformas?: { id: string; nome: string; slug: string }[] }> {
  if (!(await isSuperAdmin())) return { error: NEGADO }
  const svc = createAdminClient()
  const atual = await getCurrentTenantId()
  const { data } = await svc.from('simulado_tenants').select('id, nome, slug').eq('ativo', true).order('nome')
  const plataformas = (data ?? []).filter((t: any) => t.id !== atual).map((t: any) => ({ id: t.id, nome: t.nome, slug: t.slug }))
  return { ok: true, plataformas }
}

/** Busca paginada (server-side) das questões de uma plataforma de ORIGEM. Espelha a query de
 *  /admin/questoes mas filtrada por `tenant_id = origem`. Também devolve as disciplinas da origem
 *  (para o filtro) na resposta. */
export async function buscarQuestoesDePlataforma(
  origem: string,
  filtros: FiltrosOrigem = {},
): Promise<{ ok?: boolean; error?: string; questoes?: QuestaoOrigem[]; total?: number; totalPages?: number; disciplinas?: { id: string; nome: string }[] }> {
  if (!(await isSuperAdmin())) return { error: NEGADO }
  if (!origem) return { error: 'Plataforma de origem inválida.' }
  const svc = createAdminClient()
  const page = Math.max(1, filtros.page ?? 1)
  const q = (filtros.busca ?? '').trim()

  // Espelha /admin/questoes: tenta com codigo + EXTRAS; cai p/ versões sem essas colunas (bases antigas).
  const REST = 'enunciado, status, tipo, nivel_dificuldade, ano, disciplinas:simulado_disciplinas(nome), bancas:simulado_bancas(nome)'
  const EXTRAS = ', cargo, assunto_detalhe, assunto_id, orgao_id'
  const montar = (comCodigo: boolean, comExtras: boolean) => {
    const sel = (comCodigo ? 'id, codigo, ' : 'id, ') + REST + (comExtras ? EXTRAS : '')
    let query = svc
      .from('simulado_questoes')
      .select(sel, { count: 'exact' })
      .eq('deletado', false)
      .eq('tenant_id', origem)
      .order('created_at', { ascending: false })
      .range((page - 1) * PER_PAGE, page * PER_PAGE - 1)
    if (q) query = comCodigo ? query.or(`enunciado.ilike.%${q}%,codigo.ilike.%${q}%`) : query.ilike('enunciado', `%${q}%`)
    if (filtros.status) query = query.eq('status', filtros.status)
    if (filtros.disciplinaId) query = query.eq('disciplina_id', filtros.disciplinaId)
    if (filtros.dificuldade) query = query.eq('nivel_dificuldade', filtros.dificuldade)
    if (filtros.tipo) query = query.eq('tipo', filtros.tipo)
    return query
  }

  let res = await montar(true, true)
  if (res.error && /(cargo|assunto_detalhe|assunto_id|orgao_id)/i.test(res.error.message)) res = await montar(true, false)
  if (res.error && /codigo/i.test(res.error.message)) res = await montar(false, false)
  if (res.error) return { error: 'Falha ao buscar questões da plataforma.' }
  const rows = (res.data ?? []) as any[]

  // Nomes de Assunto/Órgão por id (RLS do embed barra; service role já é full). Fallback assunto_detalhe.
  const assIds = [...new Set(rows.map((x) => x.assunto_id).filter(Boolean))]
  const orgIds = [...new Set(rows.map((x) => x.orgao_id).filter(Boolean))]
  const [assR, orgR] = await Promise.all([
    assIds.length ? svc.from('simulado_assuntos').select('id, nome').in('id', assIds) : Promise.resolve({ data: [] as any[] }),
    orgIds.length ? svc.from('simulado_orgaos').select('id, nome').in('id', orgIds) : Promise.resolve({ data: [] as any[] }),
  ])
  const nomeAss = new Map(((assR.data ?? []) as any[]).map((a) => [a.id, a.nome]))
  const nomeOrg = new Map(((orgR.data ?? []) as any[]).map((o) => [o.id, o.nome]))

  const questoes: QuestaoOrigem[] = rows.map((x) => ({
    id: x.id,
    codigo: x.codigo ?? null,
    enunciado: x.enunciado ?? '',
    status: x.status ?? null,
    tipo: x.tipo ?? null,
    nivel_dificuldade: x.nivel_dificuldade ?? null,
    ano: x.ano ?? null,
    disciplina: x.disciplinas?.nome ?? null,
    assunto: nomeAss.get(x.assunto_id) ?? x.assunto_detalhe ?? null,
    banca: x.bancas?.nome ?? null,
    orgao: nomeOrg.get(x.orgao_id) ?? null,
    cargo: x.cargo ?? null,
  }))
  const total = res.count ?? 0

  // Disciplinas da origem (p/ o filtro) — só na 1ª página, para não repetir a cada busca.
  let disciplinas: { id: string; nome: string }[] | undefined
  if (page === 1) {
    const { data: disc } = await svc.from('simulado_disciplinas').select('id, nome').eq('tenant_id', origem).order('nome')
    disciplinas = (disc ?? []).map((d: any) => ({ id: d.id, nome: d.nome }))
  }

  return { ok: true, questoes, total, totalPages: Math.ceil(total / PER_PAGE), disciplinas }
}

/** Detalhe (lazy) de UMA questão da origem — alternativas com gabarito — para a linha expandida. */
export async function detalheQuestaoOrigem(
  origem: string,
  questaoId: string,
): Promise<{ ok?: boolean; error?: string; alternativas?: { texto: string; correta: boolean; ordem: number }[] }> {
  if (!(await isSuperAdmin())) return { error: NEGADO }
  if (!origem || !questaoId) return { error: 'Parâmetros inválidos.' }
  const svc = createAdminClient()
  const { data } = await svc
    .from('simulado_alternativas')
    .select('texto, correta, ordem')
    .eq('tenant_id', origem)
    .eq('questao_id', questaoId)
    .order('ordem')
  const alternativas = ((data ?? []) as any[]).map((a) => ({ texto: a.texto ?? '', correta: !!a.correta, ordem: a.ordem ?? 0 }))
  return { ok: true, alternativas }
}

/** Copia as questões selecionadas da ORIGEM para a plataforma ATUAL (destino = tenant corrente).
 *  Idempotente: reimportar não duplica (dedup por external_id) — reporta quantas já existiam. */
export async function importarQuestoesDePlataforma(
  origem: string,
  questaoIds: string[],
): Promise<{ ok?: boolean; error?: string; copiadas?: number; jaExistiam?: number; falhas?: number; total?: number }> {
  if (!(await isSuperAdmin())) return { error: NEGADO }
  const destino = await getCurrentTenantId()
  if (!destino) return { error: 'Plataforma de destino não resolvida.' }
  if (!origem || origem === destino) return { error: 'Escolha uma plataforma de origem diferente da atual.' }
  const ids = [...new Set((questaoIds ?? []).filter(Boolean))]
  if (!ids.length) return { error: 'Selecione ao menos uma questão.' }

  const svc = createAdminClient()
  const por = (await getCurrentAccess()).userId

  // Pré-checagem: quais já têm cópia no destino (external_id) → contabilizar "já existiam".
  const externalIds = ids.map((id) => `cp:${origem}:${id}`)
  const { data: existentes } = await svc.from('simulado_questoes').select('external_id').eq('tenant_id', destino).in('external_id', externalIds)
  const jaSet = new Set(((existentes ?? []) as any[]).map((e) => e.external_id))

  let copiadas = 0
  let jaExistiam = 0
  let falhas = 0
  for (const id of ids) {
    const r = await copiarQuestao(svc, origem, destino, id, por)
    if (!r) { falhas++; continue }
    if (jaSet.has(`cp:${origem}:${id}`)) jaExistiam++
    else copiadas++
  }

  // Banca das cópias = a BANCA DA PLATAFORMA DE DESTINO (nome do tenant), não a da origem ("Revisão").
  // O vínculo com a origem fica preservado no `external_id` (cp:{origem}:{id}) — só visível no admin.
  const bancaId = await bancaDaPlataforma(svc, destino)
  if (bancaId) await svc.from('simulado_questoes').update({ banca_id: bancaId }).eq('tenant_id', destino).in('external_id', externalIds)

  await registrarAudit({
    operacao: 'INSERT',
    entidade: 'simulado_questoes',
    tenantId: destino,
    depois: { origem, tipo: 'questao_import', copiadas, jaExistiam, falhas, total: ids.length },
  })

  return { ok: true, copiadas, jaExistiam, falhas, total: ids.length }
}
