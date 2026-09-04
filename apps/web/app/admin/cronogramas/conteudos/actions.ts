'use server'

/**
 * Banco de Conteúdos dos cronogramas.
 *
 * Biblioteca reutilizável organizada por DISCIPLINA → CONJUNTOS DE AULAS. Cada aula guarda
 * tipo + conteúdo + duração + vídeo + links (QC/TEC) + questões (referência). Compor um
 * cronograma (em metas-actions.ts) COPIA essas aulas para as metas — aqui é só o cadastro.
 *
 * Pastas reusam `simulado_pastas` com folder_area='cronograma_conteudo' (helpers locais, para
 * não tocar em banco-questoes/actions.ts).
 */

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, checkPermission } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { fetchAll, fetchAllByIn } from '@/lib/supabase/fetch-all'
import { garantirPlataformaPdf } from '@/lib/cronograma/plataforma-video'

const AREA = 'cronograma_conteudo'

async function guard(perm = 'cronogramas:view') {
  if (!(await checkPermission(perm))) return { ok: false as const, error: 'Sem permissão.' }
  const access = await getCurrentAccess()
  if (!access.tenantId) return { ok: false as const, error: 'Tenant não resolvido.' }
  return { ok: true as const, tenantId: access.tenantId, atorId: access.userId ?? null }
}

// ── Tipos ────────────────────────────────────────────────────────────────────
export type ConjuntoLista = {
  id: string
  nome: string
  disciplina: string
  disciplina_id: string | null
  descricao: string | null
  cor: string | null
  pasta_id: string | null
  ordem: number
  aulas: number
  questoes: number
  /** Aulas de tipo 'legproc' deste conjunto — alimenta a aba LegProc (o resto é da disciplina). */
  aulasLegproc: number
  /** 'disciplina' (padrão) | 'legproc' — reservado; hoje LegProc vem das aulas, não do conjunto. */
  tipo: string
}
export type PastaLista = { id: string; nome: string; pai_id: string | null }
export type AulaBanco = {
  id: string
  tipo: string
  aula: string | null
  conteudo: string | null
  duracao: string | null
  video_url: string | null
  tema: string | null
  ordem: number
  urls: { plataforma_id: string; url: string }[]
  questoes: { id: string; external_id: string | null; enunciado: string }[]
}
export type ConjuntoDetalhe = {
  conjunto: { id: string; nome: string; disciplina: string; disciplina_id: string | null; descricao: string | null; cor: string | null; pasta_id: string | null }
  aulas: AulaBanco[]
  plataformas: { id: string; nome: string; slug: string }[]
}

// ── Catálogo (pastas + conjuntos num nível) ──────────────────────────────────
export async function listarConteudos(
  pastaId?: string | null,
): Promise<{ ok: boolean; conjuntos?: ConjuntoLista[]; pastas?: PastaLista[]; trilha?: { id: string; nome: string }[]; error?: string }> {
  const g = await guard('cronogramas:view')
  if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const pai = pastaId ?? null

  // Pastas desta área, no nível atual.
  const pastasRaw = await fetchAll<any>(() =>
    svc
      .from('simulado_pastas')
      .select('id, nome, pai_id')
      .eq('tenant_id', g.tenantId)
      .eq('is_folder', true)
      .eq('folder_area', AREA)
      .order('nome') as any,
  ).catch(() => [] as any[])
  const pastas: PastaLista[] = (pastasRaw as any[]).filter((p) => (p.pai_id ?? null) === pai).map((p) => ({ id: p.id, nome: p.nome, pai_id: p.pai_id ?? null }))

  // Conjuntos no nível atual. Tolerante à coluna `tipo` (migração 20260902000000) ainda não aplicada.
  const selConj = 'id, nome, disciplina, disciplina_id, descricao, cor, pasta_id, ordem'
  const buscarConj = (cols: string) =>
    fetchAll<any>(() =>
      svc.from('simulado_cronograma_conjuntos').select(cols).eq('tenant_id', g.tenantId).eq('deletado', false).order('ordem').order('nome') as any,
    )
  let conjuntosRaw: any[]
  try {
    conjuntosRaw = await buscarConj(`${selConj}, tipo`)
  } catch (e: any) {
    if (/tipo|column/i.test(e?.message ?? '')) conjuntosRaw = await buscarConj(selConj)
    else throw e
  }
  const doNivel = (conjuntosRaw as any[]).filter((c) => (c.pasta_id ?? null) === pai)

  // Contagens por conjunto. "aulas" = DIAS de aula distintos (número da aula normalizado),
  // não linhas de conteúdo — uma aula pode ter várias linhas (PDF, flash, quest, legproc…).
  const ids = doNivel.map((c) => c.id)
  const aulasPorConjunto = new Map<string, Set<string>>()
  const legprocPorConjunto = new Map<string, Set<string>>()
  const questoesPorConjunto = new Map<string, number>()
  if (ids.length) {
    const aulas = await fetchAllByIn<any>(ids, (chunk) =>
      svc.from('simulado_cronograma_conjunto_aulas').select('id, conjunto_id, tipo, aula').eq('tenant_id', g.tenantId).in('conjunto_id', chunk).order('id') as any,
    )
    for (const a of aulas) {
      const chave = chaveAulaSrv(a.aula)
      if (!chave) continue
      let sd = aulasPorConjunto.get(a.conjunto_id)
      if (!sd) { sd = new Set(); aulasPorConjunto.set(a.conjunto_id, sd) }
      sd.add(chave)
      if (a.tipo === 'legproc') {
        let sl = legprocPorConjunto.get(a.conjunto_id)
        if (!sl) { sl = new Set(); legprocPorConjunto.set(a.conjunto_id, sl) }
        sl.add(chave)
      }
    }
    const aulaIds = aulas.map((a) => a.id)
    if (aulaIds.length) {
      const qs = await fetchAllByIn<any>(aulaIds, (chunk) =>
        svc.from('simulado_cronograma_conjunto_aula_questoes').select('aula_id').eq('tenant_id', g.tenantId).in('aula_id', chunk).order('id') as any,
      )
      const conjuntoDaAula = new Map<string, string>(aulas.map((a) => [a.id, a.conjunto_id]))
      for (const q of qs) {
        const cid = conjuntoDaAula.get(q.aula_id)
        if (cid) questoesPorConjunto.set(cid, (questoesPorConjunto.get(cid) ?? 0) + 1)
      }
    }
  }

  const conjuntos: ConjuntoLista[] = doNivel.map((c) => ({
    id: c.id,
    nome: c.nome,
    disciplina: c.disciplina,
    disciplina_id: c.disciplina_id ?? null,
    descricao: c.descricao ?? null,
    cor: c.cor ?? null,
    pasta_id: c.pasta_id ?? null,
    ordem: c.ordem ?? 0,
    aulas: aulasPorConjunto.get(c.id)?.size ?? 0,
    questoes: questoesPorConjunto.get(c.id) ?? 0,
    aulasLegproc: legprocPorConjunto.get(c.id)?.size ?? 0,
    tipo: c.tipo ?? 'disciplina',
  }))

  // Trilha (breadcrumb) subindo por pai_id.
  const trilha: { id: string; nome: string }[] = []
  if (pai) {
    const porId = new Map((pastasRaw as any[]).map((p) => [p.id, p]))
    let atual: any = porId.get(pai)
    const visto = new Set<string>()
    while (atual && !visto.has(atual.id)) {
      visto.add(atual.id)
      trilha.unshift({ id: atual.id, nome: atual.nome })
      atual = atual.pai_id ? porId.get(atual.pai_id) : null
    }
  }

  return { ok: true, conjuntos, pastas, trilha }
}

// ── Busca para compor (picker "Adicionar do banco") ─────────────────────────
export type ConjuntoParaCompor = { id: string; nome: string; disciplina: string; disciplina_id: string | null; aulas: number; aulasLegproc: number; questoes: number }

export async function buscarConjuntosParaCompor(
  filtros: { busca?: string; disciplinaId?: string } = {},
): Promise<{ ok: boolean; itens?: ConjuntoParaCompor[]; error?: string }> {
  const g = await guard('cronogramas:view')
  if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  let q = svc.from('simulado_cronograma_conjuntos').select('id, nome, disciplina, disciplina_id').eq('tenant_id', g.tenantId).eq('deletado', false)
  if (filtros.disciplinaId && filtros.disciplinaId !== 'all') q = q.eq('disciplina_id', filtros.disciplinaId)
  const termo = (filtros.busca ?? '').replace(/[,()%*]/g, ' ').trim()
  if (termo) q = q.or(`nome.ilike.%${termo}%,disciplina.ilike.%${termo}%`)
  const conjuntos = await fetchAll<any>(() => q.order('nome') as any)
  const ids = conjuntos.map((c) => c.id)

  // DIAS de aula distintos (não linhas) — casa com o card do banco e a lista de selecionados.
  // Só a contagem de aulas/legproc: as QUESTÕES são puxadas depois, só dos conjuntos escolhidos
  // (a contagem por aula aqui varria conjunto_aula_questoes inteiro e deixava o picker lento).
  const aulasPorConjunto = new Map<string, Set<string>>()
  const legprocPorConjunto = new Map<string, Set<string>>()
  if (ids.length) {
    const aulas = await fetchAllByIn<any>(ids, (chunk) => svc.from('simulado_cronograma_conjunto_aulas').select('conjunto_id, tipo, aula').eq('tenant_id', g.tenantId).in('conjunto_id', chunk) as any)
    for (const a of aulas) {
      const ch = chaveAulaSrv(a.aula)
      if (!ch) continue
      let dias = aulasPorConjunto.get(a.conjunto_id)
      if (!dias) aulasPorConjunto.set(a.conjunto_id, (dias = new Set()))
      dias.add(ch)
      if (a.tipo === 'legproc') {
        let leg = legprocPorConjunto.get(a.conjunto_id)
        if (!leg) legprocPorConjunto.set(a.conjunto_id, (leg = new Set()))
        leg.add(ch)
      }
    }
  }

  const itens: ConjuntoParaCompor[] = conjuntos
    .map((c) => ({ id: c.id, nome: c.nome, disciplina: c.disciplina, disciplina_id: c.disciplina_id ?? null, aulas: aulasPorConjunto.get(c.id)?.size ?? 0, aulasLegproc: legprocPorConjunto.get(c.id)?.size ?? 0, questoes: 0 }))
    .filter((c) => c.aulas > 0)
  return { ok: true, itens }
}

// ── Carregar conteúdos p/ o MONTADOR (sequência de aulas + conteúdo/links por tipo) ──
export type AulaConteudoBanco = {
  /** Chave normalizada da aula ("1","2","1.1"…) — casa "01" com "1" (R11). */
  chave: string
  tipo: string
  /** A aula EXATA como está no banco ("01" na lição, "1" na resolução…). */
  aulaReal: string
  conteudo: string | null
  tema: string | null
  /** slug da plataforma → url. */
  urls: Record<string, string>
  /** IDs das questões anexadas a esta aula — viram `meta_questoes` ao montar (chip "N questões"). */
  questaoIds: string[]
  /** Videoaula da aula — vira link sob a plataforma "Vídeo" na grade. */
  videoUrl: string | null
}
export type ConteudoBanco = { id: string; disciplina: string; disciplina_id: string | null; nome: string; aulas: AulaConteudoBanco[] }

const chaveAulaSrv = (a: string | null) => {
  const t = (a ?? '').trim()
  if (!t) return ''
  return /^\d+$/.test(t) ? String(Number(t)) : t.toLowerCase()
}

/** Dados completos dos conjuntos escolhidos, prontos para o montador. */
export async function buscarConteudosParaMontar(conjuntoIds: string[]): Promise<{ ok: boolean; conteudos?: ConteudoBanco[]; error?: string }> {
  const g = await guard('cronogramas:view')
  if (!g.ok) return { ok: false, error: g.error }
  if (!conjuntoIds.length) return { ok: true, conteudos: [] }
  const svc = createAdminClient()

  const conjuntos = await fetchAllByIn<any>(conjuntoIds, (chunk) =>
    svc.from('simulado_cronograma_conjuntos').select('id, nome, disciplina, disciplina_id').eq('tenant_id', g.tenantId).eq('deletado', false).in('id', chunk).order('id') as any,
  )
  const aulas = await fetchAllByIn<any>(conjuntoIds, (chunk) =>
    svc.from('simulado_cronograma_conjunto_aulas').select('id, conjunto_id, tipo, aula, conteudo, tema, video_url, ordem').eq('tenant_id', g.tenantId).in('conjunto_id', chunk).order('ordem').order('id') as any,
  )
  const aulaIds = aulas.map((a) => a.id)
  const urlsPorAula = new Map<string, Record<string, string>>()
  if (aulaIds.length) {
    const { data: plats } = await svc.from('simulado_cronograma_plataformas').select('id, slug').eq('tenant_id', g.tenantId)
    const slugDe = new Map<string, string>((plats ?? []).map((p: any) => [p.id, p.slug]))
    const urls = await fetchAllByIn<any>(aulaIds, (chunk) => svc.from('simulado_cronograma_conjunto_aula_urls').select('aula_id, plataforma_id, url').eq('tenant_id', g.tenantId).in('aula_id', chunk).order('id') as any)
    for (const u of urls) {
      const slug = slugDe.get(u.plataforma_id)
      if (!slug) continue
      const m = urlsPorAula.get(u.aula_id) ?? {}
      m[slug] = u.url
      urlsPorAula.set(u.aula_id, m)
    }
  }

  // Questões anexadas por aula → seguem a aula até virar meta_questoes ao montar (mesma fonte do editor).
  const questoesPorAula = new Map<string, string[]>()
  if (aulaIds.length) {
    const qs = await fetchAllByIn<any>(aulaIds, (chunk) =>
      svc.from('simulado_cronograma_conjunto_aula_questoes').select('aula_id, questao_id, ordem').eq('tenant_id', g.tenantId).in('aula_id', chunk).order('ordem') as any,
    )
    for (const x of qs) {
      const l = questoesPorAula.get(x.aula_id) ?? []
      l.push(x.questao_id)
      questoesPorAula.set(x.aula_id, l)
    }
  }

  const aulasPorConjunto = new Map<string, any[]>()
  for (const a of aulas) {
    const l = aulasPorConjunto.get(a.conjunto_id) ?? []
    l.push(a)
    aulasPorConjunto.set(a.conjunto_id, l)
  }

  const conteudos: ConteudoBanco[] = conjuntos.map((c) => ({
    id: c.id,
    disciplina: c.disciplina,
    disciplina_id: c.disciplina_id ?? null,
    nome: c.nome,
    aulas: (aulasPorConjunto.get(c.id) ?? []).map((a) => ({
      chave: chaveAulaSrv(a.aula),
      tipo: a.tipo,
      aulaReal: (a.aula ?? '').trim(),
      conteudo: a.conteudo ?? null,
      tema: a.tema ?? null,
      urls: urlsPorAula.get(a.id) ?? {},
      questaoIds: questoesPorAula.get(a.id) ?? [],
      videoUrl: a.video_url ?? null,
    })),
  }))
  return { ok: true, conteudos }
}

// ── Conjuntos (CRUD) ─────────────────────────────────────────────────────────
export async function criarConjunto(entrada: {
  nome: string
  disciplina: string
  disciplina_id: string | null
  descricao?: string | null
  pastaId?: string | null
  tipo?: string
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const g = await guard('cronogramas:update')
  if (!g.ok) return { ok: false, error: g.error }
  const nome = entrada.nome.trim()
  if (nome.length < 2) return { ok: false, error: 'Informe um nome (mín. 2 letras).' }
  const tipo = entrada.tipo === 'legproc' ? 'legproc' : 'disciplina'
  // LegProc não tem disciplina; conjuntos de disciplina exigem uma.
  if (tipo === 'disciplina' && !entrada.disciplina.trim()) return { ok: false, error: 'Escolha a disciplina do conjunto.' }
  const svc = createAdminClient()
  const base = {
    tenant_id: g.tenantId,
    nome,
    disciplina: entrada.disciplina.trim() || (tipo === 'legproc' ? 'LegProc' : ''),
    disciplina_id: entrada.disciplina_id || null,
    descricao: entrada.descricao?.trim() || null,
    pasta_id: entrada.pastaId || null,
  }
  // Tolerante à coluna `tipo` ainda não migrada: tenta com, cai para sem.
  let ins = await svc.from('simulado_cronograma_conjuntos').insert({ ...base, tipo }).select('id').single()
  if (ins.error && /tipo|column/i.test(ins.error.message)) {
    ins = await svc.from('simulado_cronograma_conjuntos').insert(base).select('id').single()
  }
  if (ins.error) return { ok: false, error: ins.error.message }
  await registrarAudit({ operacao: 'INSERT', entidade: 'simulado_cronograma_conjuntos', entidadeId: (ins.data as any).id, depois: { nome, disciplina: base.disciplina, tipo }, atorId: g.atorId, tenantId: g.tenantId })
  revalidatePath('/admin/cronogramas/conteudos')
  return { ok: true, id: (ins.data as any).id }
}

export async function atualizarConjunto(
  id: string,
  entrada: { nome: string; disciplina: string; disciplina_id: string | null; descricao?: string | null; cor?: string | null },
): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('cronogramas:update')
  if (!g.ok) return { ok: false, error: g.error }
  const nome = entrada.nome.trim()
  if (nome.length < 2) return { ok: false, error: 'Informe um nome (mín. 2 letras).' }
  const svc = createAdminClient()
  const { error } = await svc
    .from('simulado_cronograma_conjuntos')
    .update({
      nome,
      disciplina: entrada.disciplina.trim(),
      disciplina_id: entrada.disciplina_id || null,
      descricao: entrada.descricao?.trim() || null,
      cor: entrada.cor ?? null,
      atualizado_em: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('tenant_id', g.tenantId)
  if (error) return { ok: false, error: error.message }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_cronograma_conjuntos', entidadeId: id, depois: { nome }, atorId: g.atorId, tenantId: g.tenantId })
  revalidatePath('/admin/cronogramas/conteudos')
  return { ok: true }
}

export async function excluirConjunto(id: string): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('cronogramas:delete')
  if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  // Soft-delete inline (a tabela não está no whitelist do lib/soft-delete).
  const { error } = await svc
    .from('simulado_cronograma_conjuntos')
    .update({ deletado: true, deletado_em: new Date().toISOString(), deletado_por: g.atorId })
    .eq('id', id)
    .eq('tenant_id', g.tenantId)
  if (error) return { ok: false, error: error.message }
  await registrarAudit({ operacao: 'DELETE', entidade: 'simulado_cronograma_conjuntos', entidadeId: id, atorId: g.atorId, tenantId: g.tenantId })
  revalidatePath('/admin/cronogramas/conteudos')
  return { ok: true }
}

export async function moverConjuntoParaPasta(id: string, pastaId: string | null): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('cronogramas:update')
  if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const { error } = await svc.from('simulado_cronograma_conjuntos').update({ pasta_id: pastaId }).eq('id', id).eq('tenant_id', g.tenantId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/admin/cronogramas/conteudos')
  return { ok: true }
}

/** Duplica um conjunto com todas as aulas, URLs e refs de questão. */
export async function duplicarConjunto(id: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  const g = await guard('cronogramas:update')
  if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const { data: c } = await svc.from('simulado_cronograma_conjuntos').select('*').eq('id', id).eq('tenant_id', g.tenantId).maybeSingle()
  if (!c) return { ok: false, error: 'Conjunto não encontrado.' }
  const { data: novo, error: eNovo } = await svc
    .from('simulado_cronograma_conjuntos')
    .insert({
      tenant_id: g.tenantId,
      nome: `${(c as any).nome} (cópia)`,
      disciplina: (c as any).disciplina,
      disciplina_id: (c as any).disciplina_id,
      descricao: (c as any).descricao,
      pasta_id: (c as any).pasta_id,
      cor: (c as any).cor,
    })
    .select('id')
    .single()
  if (eNovo || !novo) return { ok: false, error: eNovo?.message ?? 'Falha ao duplicar.' }
  const novoId = (novo as any).id

  const aulas = await fetchAll<any>(() => svc.from('simulado_cronograma_conjunto_aulas').select('*').eq('tenant_id', g.tenantId).eq('conjunto_id', id).order('ordem') as any)
  for (const a of aulas) {
    const { data: na } = await svc
      .from('simulado_cronograma_conjunto_aulas')
      .insert({ tenant_id: g.tenantId, conjunto_id: novoId, tipo: a.tipo, aula: a.aula, conteudo: a.conteudo, duracao: a.duracao, video_url: a.video_url, tema: a.tema, ordem: a.ordem })
      .select('id')
      .single()
    if (!na) continue
    const [urls, qs] = await Promise.all([
      svc.from('simulado_cronograma_conjunto_aula_urls').select('plataforma_id, url').eq('tenant_id', g.tenantId).eq('aula_id', a.id),
      svc.from('simulado_cronograma_conjunto_aula_questoes').select('questao_id, ordem').eq('tenant_id', g.tenantId).eq('aula_id', a.id),
    ])
    if ((urls.data ?? []).length) await svc.from('simulado_cronograma_conjunto_aula_urls').insert((urls.data as any[]).map((u) => ({ tenant_id: g.tenantId, aula_id: (na as any).id, plataforma_id: u.plataforma_id, url: u.url })))
    if ((qs.data ?? []).length) await svc.from('simulado_cronograma_conjunto_aula_questoes').insert((qs.data as any[]).map((q) => ({ tenant_id: g.tenantId, aula_id: (na as any).id, questao_id: q.questao_id, ordem: q.ordem ?? 0 })))
  }
  await registrarAudit({ operacao: 'INSERT', entidade: 'simulado_cronograma_conjuntos', entidadeId: novoId, depois: { duplicado_de: id }, atorId: g.atorId, tenantId: g.tenantId })
  revalidatePath('/admin/cronogramas/conteudos')
  return { ok: true, id: novoId }
}

// ── Pastas desta área (helpers locais — não tocam banco-questoes/actions.ts) ──
export async function criarPastaConteudo(nome: string, paiId?: string | null): Promise<{ ok: boolean; id?: string; error?: string }> {
  const g = await guard('cronogramas:update')
  if (!g.ok) return { ok: false, error: g.error }
  const titulo = nome.trim()
  if (!titulo) return { ok: false, error: 'Informe um nome.' }
  const svc = createAdminClient()
  const { data, error } = await svc
    .from('simulado_pastas')
    .insert({ tenant_id: g.tenantId, nome: titulo, is_folder: true, pai_id: paiId ?? null, folder_area: AREA })
    .select('id')
    .single()
  if (error || !data) return { ok: false, error: error?.message ?? 'Erro ao criar pasta.' }
  revalidatePath('/admin/cronogramas/conteudos')
  return { ok: true, id: (data as any).id }
}

export async function renomearPastaConteudo(id: string, nome: string): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('cronogramas:update')
  if (!g.ok) return { ok: false, error: g.error }
  const titulo = nome.trim()
  if (!titulo) return { ok: false, error: 'Informe um nome.' }
  const svc = createAdminClient()
  const { error } = await svc.from('simulado_pastas').update({ nome: titulo }).eq('id', id).eq('tenant_id', g.tenantId).eq('folder_area', AREA)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/admin/cronogramas/conteudos')
  return { ok: true }
}

export async function excluirPastaConteudo(id: string): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('cronogramas:delete')
  if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  // Só apaga pasta VAZIA (sem subpastas nem conjuntos), para não perder conteúdo por engano.
  const [{ data: filhas }, { data: dentro }] = await Promise.all([
    svc.from('simulado_pastas').select('id').eq('tenant_id', g.tenantId).eq('pai_id', id).eq('folder_area', AREA).limit(1),
    svc.from('simulado_cronograma_conjuntos').select('id').eq('tenant_id', g.tenantId).eq('pasta_id', id).eq('deletado', false).limit(1),
  ])
  if ((filhas ?? []).length || (dentro ?? []).length) return { ok: false, error: 'A pasta não está vazia. Mova os conjuntos/subpastas antes de excluir.' }
  const { error } = await svc.from('simulado_pastas').delete().eq('id', id).eq('tenant_id', g.tenantId).eq('folder_area', AREA)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/admin/cronogramas/conteudos')
  return { ok: true }
}

// ── Detalhe do conjunto (aulas + urls + questões + plataformas) ──────────────
export async function carregarConjunto(id: string): Promise<{ ok: boolean; dados?: ConjuntoDetalhe; error?: string }> {
  const g = await guard('cronogramas:view')
  if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const { data: c } = await svc
    .from('simulado_cronograma_conjuntos')
    .select('id, nome, disciplina, disciplina_id, descricao, cor, pasta_id')
    .eq('id', id)
    .eq('tenant_id', g.tenantId)
    .eq('deletado', false)
    .maybeSingle()
  if (!c) return { ok: false, error: 'Conjunto não encontrado.' }

  const aulasRaw = await fetchAll<any>(() =>
    svc.from('simulado_cronograma_conjunto_aulas').select('id, tipo, aula, conteudo, duracao, video_url, tema, ordem').eq('tenant_id', g.tenantId).eq('conjunto_id', id).order('ordem').order('id') as any,
  )
  const aulaIds = aulasRaw.map((a) => a.id)

  const urlsPorAula = new Map<string, { plataforma_id: string; url: string }[]>()
  const questoesPorAula = new Map<string, { id: string; external_id: string | null; enunciado: string }[]>()
  if (aulaIds.length) {
    const [urls, refs] = await Promise.all([
      fetchAllByIn<any>(aulaIds, (chunk) => svc.from('simulado_cronograma_conjunto_aula_urls').select('aula_id, plataforma_id, url').eq('tenant_id', g.tenantId).in('aula_id', chunk).order('id') as any),
      fetchAllByIn<any>(aulaIds, (chunk) => svc.from('simulado_cronograma_conjunto_aula_questoes').select('aula_id, questao_id, ordem').eq('tenant_id', g.tenantId).in('aula_id', chunk).order('ordem') as any),
    ])
    for (const u of urls) {
      const l = urlsPorAula.get(u.aula_id) ?? []
      l.push({ plataforma_id: u.plataforma_id, url: u.url })
      urlsPorAula.set(u.aula_id, l)
    }
    // Rótulos das questões referenciadas.
    const questaoIds = [...new Set(refs.map((r) => r.questao_id))]
    const porQuestao = new Map<string, { external_id: string | null; enunciado: string }>()
    if (questaoIds.length) {
      const qs = await fetchAllByIn<any>(questaoIds, (chunk) => svc.from('simulado_questoes').select('id, external_id, enunciado').eq('tenant_id', g.tenantId).in('id', chunk).order('id') as any)
      for (const q of qs) porQuestao.set(q.id, { external_id: q.external_id ?? null, enunciado: (q.enunciado ?? '').slice(0, 140) })
    }
    for (const r of refs) {
      const meta = porQuestao.get(r.questao_id)
      const l = questoesPorAula.get(r.aula_id) ?? []
      l.push({ id: r.questao_id, external_id: meta?.external_id ?? null, enunciado: meta?.enunciado ?? '' })
      questoesPorAula.set(r.aula_id, l)
    }
  }

  const { data: plats } = await svc
    .from('simulado_cronograma_plataformas')
    .select('id, nome, slug')
    .eq('tenant_id', g.tenantId)
    .eq('ativo', true)
    .order('ordem')
    .order('nome')

  const aulas: AulaBanco[] = aulasRaw.map((a) => ({
    id: a.id,
    tipo: a.tipo,
    aula: a.aula ?? null,
    conteudo: a.conteudo ?? null,
    duracao: a.duracao ?? null,
    video_url: a.video_url ?? null,
    tema: a.tema ?? null,
    ordem: a.ordem ?? 0,
    urls: urlsPorAula.get(a.id) ?? [],
    questoes: questoesPorAula.get(a.id) ?? [],
  }))

  return {
    ok: true,
    dados: {
      conjunto: { id: (c as any).id, nome: (c as any).nome, disciplina: (c as any).disciplina, disciplina_id: (c as any).disciplina_id ?? null, descricao: (c as any).descricao ?? null, cor: (c as any).cor ?? null, pasta_id: (c as any).pasta_id ?? null },
      aulas,
      plataformas: (plats ?? []) as { id: string; nome: string; slug: string }[],
    },
  }
}

// ── Aulas (CRUD) ─────────────────────────────────────────────────────────────
export type EntradaAula = { tipo: string; aula?: string | null; conteudo?: string | null; duracao?: string | null; video_url?: string | null; tema?: string | null }

async function conjuntoDoTenant(svc: ReturnType<typeof createAdminClient>, tenantId: string, conjuntoId: string) {
  const { data } = await svc.from('simulado_cronograma_conjuntos').select('id').eq('id', conjuntoId).eq('tenant_id', tenantId).eq('deletado', false).maybeSingle()
  return !!data
}

async function validarTipo(svc: ReturnType<typeof createAdminClient>, tenantId: string, slug: string): Promise<string | null> {
  const { data } = await svc.from('simulado_cronograma_tipos_meta').select('id').eq('tenant_id', tenantId).eq('slug', slug).eq('ativo', true).maybeSingle()
  return data ? null : `Tipo "${slug}" não existe ou está inativo.`
}

export async function criarAula(conjuntoId: string, e: EntradaAula): Promise<{ ok: boolean; id?: string; error?: string }> {
  const g = await guard('cronogramas:update')
  if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  if (!(await conjuntoDoTenant(svc, g.tenantId, conjuntoId))) return { ok: false, error: 'Conjunto não encontrado.' }
  const erroTipo = await validarTipo(svc, g.tenantId, e.tipo)
  if (erroTipo) return { ok: false, error: erroTipo }
  const { data: max } = await svc.from('simulado_cronograma_conjunto_aulas').select('ordem').eq('tenant_id', g.tenantId).eq('conjunto_id', conjuntoId).order('ordem', { ascending: false }).limit(1).maybeSingle()
  const ordem = ((max as any)?.ordem ?? -1) + 1
  const { data, error } = await svc
    .from('simulado_cronograma_conjunto_aulas')
    .insert({ tenant_id: g.tenantId, conjunto_id: conjuntoId, tipo: e.tipo, aula: e.aula?.trim() || null, conteudo: e.conteudo?.trim() || null, duracao: e.duracao?.trim() || null, video_url: e.video_url?.trim() || null, tema: e.tema?.trim() || null, ordem })
    .select('id')
    .single()
  if (error) return { ok: false, error: error.message }
  revalidatePath('/admin/cronogramas/conteudos')
  return { ok: true, id: (data as any).id }
}

export async function atualizarAula(aulaId: string, e: EntradaAula): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('cronogramas:update')
  if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const erroTipo = await validarTipo(svc, g.tenantId, e.tipo)
  if (erroTipo) return { ok: false, error: erroTipo }
  const { error } = await svc
    .from('simulado_cronograma_conjunto_aulas')
    .update({ tipo: e.tipo, aula: e.aula?.trim() || null, conteudo: e.conteudo?.trim() || null, duracao: e.duracao?.trim() || null, video_url: e.video_url?.trim() || null, tema: e.tema?.trim() || null, atualizado_em: new Date().toISOString() })
    .eq('id', aulaId)
    .eq('tenant_id', g.tenantId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/admin/cronogramas/conteudos')
  return { ok: true }
}

export async function excluirAula(aulaId: string): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('cronogramas:update')
  if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const { error } = await svc.from('simulado_cronograma_conjunto_aulas').delete().eq('id', aulaId).eq('tenant_id', g.tenantId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/admin/cronogramas/conteudos')
  return { ok: true }
}

export async function reordenarAulas(conjuntoId: string, ids: string[]): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('cronogramas:update')
  if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  for (let i = 0; i < ids.length; i++) {
    await svc.from('simulado_cronograma_conjunto_aulas').update({ ordem: i }).eq('id', ids[i]).eq('tenant_id', g.tenantId).eq('conjunto_id', conjuntoId)
  }
  revalidatePath('/admin/cronogramas/conteudos')
  return { ok: true }
}

/** Substitui as URLs por plataforma da aula (delete + insert), espelhando gravarUrls dos links. */
export async function salvarUrlsAula(aulaId: string, urls: { plataforma_id: string; url: string }[]): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('cronogramas:update')
  if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  await svc.from('simulado_cronograma_conjunto_aula_urls').delete().eq('tenant_id', g.tenantId).eq('aula_id', aulaId)
  const limpas = urls.filter((u) => u.plataforma_id && u.url.trim())
  if (limpas.length) {
    const { error } = await svc.from('simulado_cronograma_conjunto_aula_urls').insert(limpas.map((u) => ({ tenant_id: g.tenantId, aula_id: aulaId, plataforma_id: u.plataforma_id, url: u.url.trim() })))
    if (error) return { ok: false, error: error.message }
  }
  revalidatePath('/admin/cronogramas/conteudos')
  return { ok: true }
}

/**
 * PDF da aula: gravado como um link sob a plataforma "PDF" (upsert dirigido — não apaga QC/TEC).
 * Devolve o `plataformaId` para o cliente atualizar `aula.urls` sem recarregar.
 */
export async function salvarPdfAula(aulaId: string, url: string): Promise<{ ok: boolean; plataformaId?: string; error?: string }> {
  const g = await guard('cronogramas:update')
  if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const pdfId = await garantirPlataformaPdf(svc, g.tenantId)
  if (!pdfId) return { ok: false, error: 'Não foi possível preparar a plataforma PDF.' }
  await svc.from('simulado_cronograma_conjunto_aula_urls').delete().eq('tenant_id', g.tenantId).eq('aula_id', aulaId).eq('plataforma_id', pdfId)
  const u = url.trim()
  if (u) {
    const { error } = await svc.from('simulado_cronograma_conjunto_aula_urls').insert({ tenant_id: g.tenantId, aula_id: aulaId, plataforma_id: pdfId, url: u })
    if (error) return { ok: false, error: error.message }
  }
  revalidatePath('/admin/cronogramas/conteudos')
  return { ok: true, plataformaId: pdfId }
}

// ── Questões anexadas ────────────────────────────────────────────────────────
export async function anexarQuestoes(aulaId: string, questaoIds: string[]): Promise<{ ok: boolean; adicionadas?: number; error?: string }> {
  const g = await guard('cronogramas:update')
  if (!g.ok) return { ok: false, error: g.error }
  if (!questaoIds.length) return { ok: true, adicionadas: 0 }
  const svc = createAdminClient()
  const { data: max } = await svc.from('simulado_cronograma_conjunto_aula_questoes').select('ordem').eq('tenant_id', g.tenantId).eq('aula_id', aulaId).order('ordem', { ascending: false }).limit(1).maybeSingle()
  let ordem = ((max as any)?.ordem ?? -1) + 1
  const linhas = questaoIds.map((qid) => ({ tenant_id: g.tenantId, aula_id: aulaId, questao_id: qid, ordem: ordem++ }))
  const { error } = await svc.from('simulado_cronograma_conjunto_aula_questoes').upsert(linhas, { onConflict: 'aula_id,questao_id', ignoreDuplicates: true })
  if (error) return { ok: false, error: error.message }
  revalidatePath('/admin/cronogramas/conteudos')
  return { ok: true, adicionadas: linhas.length }
}

export async function removerQuestao(aulaId: string, questaoId: string): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('cronogramas:update')
  if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const { error } = await svc.from('simulado_cronograma_conjunto_aula_questoes').delete().eq('tenant_id', g.tenantId).eq('aula_id', aulaId).eq('questao_id', questaoId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/admin/cronogramas/conteudos')
  return { ok: true }
}

// ── Propagação: empurrar o conteúdo do banco para as metas já compostas ───────
// Snapshot + push: as metas continuam cópias, mas ao editar uma aula no banco dá para
// atualizar as metas que representam a MESMA aula (mesma chave natural disciplina+aula+tipo,
// a mesma que os links já usam). Sem coluna nova — casa metas existentes na hora.
export type PropagacaoAlvo = { cronograma_id: string; nome: string; status: string; metas: number }

/** Metas do tenant que representam a mesma aula (disciplina + tipo + aula normalizada "01"~"1"). */
async function metasDaAula(
  svc: ReturnType<typeof createAdminClient>,
  tenantId: string,
  disciplina: string,
  tipo: string,
  aulaNorm: string,
  cronogramaIds?: string[],
): Promise<{ id: string; cronograma_id: string; aula: string | null; conteudo: string | null }[]> {
  const metas = await fetchAll<any>(() => {
    let q = svc
      .from('simulado_cronograma_metas')
      .select('id, cronograma_id, aula, conteudo')
      .eq('tenant_id', tenantId)
      .eq('tipo', tipo)
      .eq('disciplina', disciplina)
    if (cronogramaIds?.length) q = q.in('cronograma_id', cronogramaIds)
    return q as any
  })
  return metas.filter((m) => chaveAulaSrv(m.aula) === aulaNorm)
}

export async function contarPropagacao(
  entrada: { disciplina: string; aula: string; tipo: string },
): Promise<{ ok: boolean; alvos?: PropagacaoAlvo[]; total?: number; error?: string }> {
  const g = await guard('cronogramas:view')
  if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const aulaNorm = chaveAulaSrv(entrada.aula)
  if (!aulaNorm || !entrada.disciplina.trim()) return { ok: true, alvos: [], total: 0 }
  const metas = await metasDaAula(svc, g.tenantId, entrada.disciplina.trim(), entrada.tipo, aulaNorm)
  const porCron = new Map<string, number>()
  for (const m of metas) porCron.set(m.cronograma_id, (porCron.get(m.cronograma_id) ?? 0) + 1)
  const ids = [...porCron.keys()]
  if (!ids.length) return { ok: true, alvos: [], total: 0 }
  const crons = await fetchAllByIn<any>(ids, (chunk) =>
    svc.from('simulado_cronogramas').select('id, nome, status, deletado').eq('tenant_id', g.tenantId).in('id', chunk) as any,
  )
  const alvos: PropagacaoAlvo[] = crons
    .filter((c) => !c.deletado)
    .map((c) => ({ cronograma_id: c.id, nome: c.nome, status: c.status, metas: porCron.get(c.id) ?? 0 }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  return { ok: true, alvos, total: metas.length }
}

export async function propagarConteudoAula(
  entrada: { disciplina: string; aula: string; tipo: string; conteudo: string | null; cronogramaIds: string[] },
): Promise<{ ok: boolean; atualizadas?: number; error?: string }> {
  const g = await guard('cronogramas:update')
  if (!g.ok) return { ok: false, error: g.error }
  if (!entrada.cronogramaIds.length) return { ok: true, atualizadas: 0 }
  const svc = createAdminClient()
  const aulaNorm = chaveAulaSrv(entrada.aula)
  if (!aulaNorm || !entrada.disciplina.trim()) return { ok: true, atualizadas: 0 }
  const metas = await metasDaAula(svc, g.tenantId, entrada.disciplina.trim(), entrada.tipo, aulaNorm, entrada.cronogramaIds)
  const novo = entrada.conteudo?.trim() || null
  // Só as que realmente mudam — evita gravar linha à toa (e o audit fica honesto).
  const ids = metas.filter((m) => (m.conteudo ?? null) !== novo).map((m) => m.id)
  if (!ids.length) return { ok: true, atualizadas: 0 }
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200)
    const { error } = await svc.from('simulado_cronograma_metas').update({ conteudo: novo }).eq('tenant_id', g.tenantId).in('id', chunk)
    if (error) return { ok: false, error: error.message }
  }
  await registrarAudit({
    operacao: 'UPDATE',
    entidade: 'simulado_cronograma_metas',
    entidadeId: `propagacao:${entrada.disciplina.trim()}|${aulaNorm}|${entrada.tipo}`,
    depois: { conteudo: novo, metas: ids.length, cronogramas: entrada.cronogramaIds.length },
    atorId: g.atorId,
    tenantId: g.tenantId,
  })
  revalidatePath('/admin/cronogramas')
  return { ok: true, atualizadas: ids.length }
}

// ── Vínculo meta ↔ banco: achar (e atualizar) a aula do BANCO da mesma chave ──
export type BancoAulaRef = { aula_id: string; conjunto_id: string; conjunto_nome: string; conteudo: string | null }

/** Aulas do banco (conjunto_aulas) da mesma chave natural — o "molde" daquela meta. */
async function bancoAulasMatch(
  svc: ReturnType<typeof createAdminClient>,
  tenantId: string,
  disciplina: string,
  tipo: string,
  aulaNorm: string,
): Promise<BancoAulaRef[]> {
  const conjuntos = await fetchAll<any>(() =>
    svc.from('simulado_cronograma_conjuntos').select('id, nome').eq('tenant_id', tenantId).eq('deletado', false).eq('disciplina', disciplina) as any,
  )
  if (!conjuntos.length) return []
  const nomePorConj = new Map<string, string>(conjuntos.map((c) => [c.id, c.nome]))
  const aulas = await fetchAllByIn<any>(conjuntos.map((c) => c.id), (chunk) =>
    svc.from('simulado_cronograma_conjunto_aulas').select('id, conjunto_id, aula, conteudo').eq('tenant_id', tenantId).eq('tipo', tipo).in('conjunto_id', chunk) as any,
  )
  return aulas
    .filter((a) => chaveAulaSrv(a.aula) === aulaNorm)
    .map((a) => ({ aula_id: a.id, conjunto_id: a.conjunto_id, conjunto_nome: nomePorConj.get(a.conjunto_id) ?? '', conteudo: a.conteudo ?? null }))
}

export async function bancoAulasDaChave(
  entrada: { disciplina: string; aula: string; tipo: string },
): Promise<{ ok: boolean; aulas?: BancoAulaRef[]; error?: string }> {
  const g = await guard('cronogramas:view')
  if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const aulaNorm = chaveAulaSrv(entrada.aula)
  if (!aulaNorm || !entrada.disciplina.trim()) return { ok: true, aulas: [] }
  return { ok: true, aulas: await bancoAulasMatch(svc, g.tenantId, entrada.disciplina.trim(), entrada.tipo, aulaNorm) }
}

/** Atualiza o conteúdo da(s) aula(s) do BANCO da mesma chave — mantém o molde em dia. */
export async function atualizarBancoConteudo(
  entrada: { disciplina: string; aula: string; tipo: string; conteudo: string | null },
): Promise<{ ok: boolean; atualizadas?: number; error?: string }> {
  const g = await guard('cronogramas:update')
  if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const aulaNorm = chaveAulaSrv(entrada.aula)
  if (!aulaNorm || !entrada.disciplina.trim()) return { ok: true, atualizadas: 0 }
  const refs = await bancoAulasMatch(svc, g.tenantId, entrada.disciplina.trim(), entrada.tipo, aulaNorm)
  const novo = entrada.conteudo?.trim() || null
  const ids = refs.filter((r) => (r.conteudo ?? null) !== novo).map((r) => r.aula_id)
  if (!ids.length) return { ok: true, atualizadas: 0 }
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200)
    const { error } = await svc.from('simulado_cronograma_conjunto_aulas').update({ conteudo: novo, atualizado_em: new Date().toISOString() }).eq('tenant_id', g.tenantId).in('id', chunk)
    if (error) return { ok: false, error: error.message }
  }
  await registrarAudit({
    operacao: 'UPDATE',
    entidade: 'simulado_cronograma_conjunto_aulas',
    entidadeId: `propagacao-banco:${entrada.disciplina.trim()}|${aulaNorm}|${entrada.tipo}`,
    depois: { conteudo: novo, aulas: ids.length },
    atorId: g.atorId,
    tenantId: g.tenantId,
  })
  revalidatePath('/admin/cronogramas/conteudos')
  return { ok: true, atualizadas: ids.length }
}
