import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import { fetchAll, fetchAllByIn } from '@/lib/supabase/fetch-all'
import { gruposDoProduto } from '@/lib/produtos/estudio'
import {
  etapasFeitas, flagsDoItem, mesclarCfg, mesclarEdital, BLK_PADRAO, ETAPAS_PAD_PADRAO,
  type AulaResumo, type AutomacaoRow, type CursoCfg, type EditalData, type EtapasData, type ModuloResumo, type MsgCfg, MSG_CFG_PADRAO,
} from './cursos-defs'

// Leitura de Montagem de curso › Cursos. Tudo calculado AQUI (servidor): as páginas só LÊEM dados prontos.
// Paginação .range()+count; .in() sempre em lotes de 80 (fetchAllByIn); fetchAll sempre com .order() por coluna única.
// Tolerante à migração 20261112020000 ainda não aplicada: devolve { ok:false, motivo:'migracao' }.

export interface CursoBase {
  id: string; nome: string; sub: string | null; tipo: string; ativo: boolean; modelo: string
  cfg: CursoCfg; blk: string[]
  cor_principal: string; cor_destaque: string
  img_horizontal: string | null; img_vertical: string | null; img_banner: string | null; galeria: string[]
  abre_em: string | null; fecha_em: string | null; cronograma_adaptativo: boolean
  pasta_id: string | null; produto_id: string | null; trilha_id: string | null
  etapas: EtapasData; edital: EditalData; msg_cfg: MsgCfg
  atualizado_em: string
}

const COLS = 'id, nome, sub, tipo, ativo, modelo, cfg, blk, cor_principal, cor_destaque, img_horizontal, img_vertical, img_banner, galeria, abre_em, fecha_em, cronograma_adaptativo, pasta_id, produto_id, trilha_id, etapas, edital, msg_cfg, atualizado_em'

export const migracaoAusente = (msg?: string | null) => /simulado_curso|relation .* does not exist|schema cache|Could not find/i.test(msg ?? '')

function normalizar(r: any): CursoBase {
  return {
    ...r,
    cfg: mesclarCfg(r.cfg),
    blk: Array.isArray(r.blk) ? r.blk : BLK_PADRAO,
    galeria: Array.isArray(r.galeria) ? r.galeria : [],
    etapas: { pad: { ...ETAPAS_PAD_PADRAO }, ...(r.etapas ?? {}), } as EtapasData,
    edital: mesclarEdital(r.edital),
    msg_cfg: { ...MSG_CFG_PADRAO, ...(r.msg_cfg ?? {}) },
  }
}

// ═════════ LISTA ═════════
export interface CursoCard extends CursoBase { alunos: number; aulas: number; etFeitas: number }
export type ListaCursos =
  | { ok: true; rows: CursoCard[]; total: number; totais: { todos: number; ativos: number; inativos: number } }
  | { ok: false; motivo: 'migracao' | 'erro' }

export async function listarCursos(
  tenantId: string,
  o: { q: string; f: 'todos' | 'ativos' | 'inativos'; sort: 'recentes' | 'nome'; page: number; perPage: number },
): Promise<ListaCursos> {
  const svc = createAdminClient()
  const base = () => svc.from('simulado_cursos').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('deletado', false)
  const [t0, t1, t2] = await Promise.all([base(), base().eq('ativo', true), base().eq('ativo', false)])
  if (t0.error) return { ok: false, motivo: migracaoAusente(t0.error.message) ? 'migracao' : 'erro' }
  const totais = { todos: t0.count ?? 0, ativos: t1.count ?? 0, inativos: t2.count ?? 0 }

  let q = svc.from('simulado_cursos').select(COLS, { count: 'exact' }).eq('tenant_id', tenantId).eq('deletado', false)
  if (o.f === 'ativos') q = q.eq('ativo', true)
  if (o.f === 'inativos') q = q.eq('ativo', false)
  const busca = o.q.replace(/[%,()]/g, ' ').trim()
  if (busca) q = q.ilike('nome', `%${busca}%`)
  q = o.sort === 'nome' ? q.order('nome', { ascending: true }) : q.order('atualizado_em', { ascending: false })
  const from = (o.page - 1) * o.perPage
  const { data, count, error } = await q.order('id', { ascending: true }).range(from, from + o.perPage - 1)
  if (error) return { ok: false, motivo: 'erro' }
  const cursos = (data ?? []).map(normalizar)
  if (!cursos.length) return { ok: true, rows: [], total: count ?? 0, totais }

  const ids = cursos.map((c) => c.id)
  const [cp, pi, cont] = await Promise.all([
    fetchAllByIn<{ curso_id: string }>(ids, (ch) => svc.from('simulado_curso_produtos').select('curso_id, id').eq('tenant_id', tenantId).in('curso_id', ch).order('id', { ascending: true })),
    fetchAllByIn<{ produto_id: string }>(cursos.map((c) => c.produto_id).filter(Boolean) as string[], (ch) => svc.from('simulado_produto_itens').select('produto_id, id').eq('tenant_id', tenantId).eq('tipo_item', 'grupo').in('produto_id', ch).order('id', { ascending: true })),
    Promise.all(cursos.map(async (c) => {
      if (!c.produto_id) return { alunos: 0, aulas: 0 }
      const [a, b] = await Promise.all([
        svc.from('simulado_assinaturas').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('produto_id', c.produto_id).eq('status', 'ativo'),
        svc.from('simulado_produto_modulo_itens').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('produto_id', c.produto_id).eq('deletado', false),
      ])
      return { alunos: a.count ?? 0, aulas: b.count ?? 0 }
    })),
  ])
  const nProd = new Map<string, number>(); for (const r of cp) nProd.set(r.curso_id, (nProd.get(r.curso_id) ?? 0) + 1)
  const nGrp = new Map<string, number>(); for (const r of pi) nGrp.set(r.produto_id, (nGrp.get(r.produto_id) ?? 0) + 1)
  const rows: CursoCard[] = cursos.map((c, i) => ({
    ...c, alunos: cont[i].alunos, aulas: cont[i].aulas,
    etFeitas: etapasFeitas(c, nProd.get(c.id) ?? 0, c.produto_id ? nGrp.get(c.produto_id) ?? 0 : 0).filter(Boolean).length,
  }))
  return { ok: true, rows, total: count ?? 0, totais }
}

// ═════════ CURSO (cabeçalho + dados comuns às abas) ═════════
export interface ProdutoDoCurso { id: string; nome: string; slug: string | null }
export interface GrupoOpcao { id: string; nome: string }
export interface CursoDetalhe {
  curso: CursoBase
  produtos: ProdutoDoCurso[]
  gruposMarcados: { id: string; nome: string; membros: number | null }[]
  etapasOk: boolean[]
  slugAluno: string | null
}

export async function getCurso(tenantId: string, id: string): Promise<CursoDetalhe | null | 'migracao'> {
  const svc = createAdminClient()
  const { data, error } = await svc.from('simulado_cursos').select(COLS).eq('tenant_id', tenantId).eq('id', id).eq('deletado', false).maybeSingle()
  if (error) return migracaoAusente(error.message) ? 'migracao' : null
  if (!data) return null
  const curso = normalizar(data)
  const { data: cp } = await svc.from('simulado_curso_produtos').select('produto_id, ordem').eq('tenant_id', tenantId).eq('curso_id', id).order('ordem', { ascending: true }).order('id', { ascending: true }).limit(100)
  const pids = (cp ?? []).map((r: any) => r.produto_id as string)
  const [prods, grupos] = await Promise.all([
    pids.length ? fetchAllByIn<any>(pids, (ch) => svc.from('simulado_produtos').select('id, nome, slug').eq('tenant_id', tenantId).in('id', ch).order('id', { ascending: true })) : Promise.resolve([] as any[]),
    curso.produto_id ? gruposDoProduto(tenantId, curso.produto_id) : Promise.resolve([]),
  ])
  const porId = new Map<string, ProdutoDoCurso>(prods.map((p: any) => [p.id, { id: p.id, nome: p.nome, slug: p.slug ?? null }]))
  const produtos = pids.map((p) => porId.get(p)).filter(Boolean) as ProdutoDoCurso[]
  const etapasOk = etapasFeitas(curso, produtos.length, grupos.length)
  return { curso, produtos, gruposMarcados: grupos, etapasOk, slugAluno: curso.produto_id ? porId.get(curso.produto_id)?.slug ?? null : null }
}

/** Todos os grupos do tenant (id + nome) — chips de "Grupos de acesso". Paginado por id (coluna única). */
export async function listarGruposOpcoes(tenantId: string): Promise<GrupoOpcao[]> {
  const svc = createAdminClient()
  try {
    const rows = await fetchAll<any>(() => svc.from('simulado_grupos').select('id, nome').eq('tenant_id', tenantId).eq('deletado', false).order('id', { ascending: true }) as any, 1000, 'cursos_grupos')
    return rows.map((r) => ({ id: r.id as string, nome: (r.nome as string) ?? '' })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  } catch { return [] }
}

// ═════════ ABA: Aulas e materiais (currículo do produto principal; módulo → aula → materiais) ═════════
export async function getAulasCurso(tenantId: string, produtoId: string, page: number, perPage = 10): Promise<{ modulos: ModuloResumo[]; total: number }> {
  const svc = createAdminClient()
  const from = (page - 1) * perPage
  const { data: mods, count } = await svc.from('simulado_produto_modulos').select('id, titulo', { count: 'exact' })
    .eq('tenant_id', tenantId).eq('produto_id', produtoId).eq('deletado', false).is('pai_id', null)
    .order('ordem', { ascending: true }).order('id', { ascending: true }).range(from, from + perPage - 1)
  const lista = (mods ?? []) as { id: string; titulo: string }[]
  if (!lista.length) return { modulos: [], total: count ?? 0 }
  const subs = await fetchAllByIn<any>(lista.map((m) => m.id), (ch) => svc.from('simulado_produto_modulos').select('id, pai_id, titulo, ordem')
    .eq('tenant_id', tenantId).eq('deletado', false).in('pai_id', ch).order('id', { ascending: true }))
  const modIds = [...lista.map((m) => m.id), ...subs.map((s) => s.id as string)]
  const itens = await fetchAllByIn<any>(modIds, (ch) => svc.from('simulado_produto_modulo_itens').select('id, modulo_id, titulo, subtipo, tipo_ref, ordem')
    .eq('tenant_id', tenantId).eq('deletado', false).in('modulo_id', ch).order('id', { ascending: true }))
  const porMod = new Map<string, any[]>()
  for (const it of itens) { const a = porMod.get(it.modulo_id) ?? []; a.push(it); porMod.set(it.modulo_id, a) }
  const subsPorPai = new Map<string, any[]>()
  for (const s of subs) { const a = subsPorPai.get(s.pai_id) ?? []; a.push(s); subsPorPai.set(s.pai_id, a) }
  const modulos: ModuloResumo[] = lista.map((m) => {
    const aulas: AulaResumo[] = []
    for (const s of (subsPorPai.get(m.id) ?? []).sort((a, b) => a.ordem - b.ordem)) {
      const fl: AulaResumo = { id: s.id, titulo: s.titulo, pdf: false, video: false, legproc: false, questoes: false }
      for (const it of porMod.get(s.id) ?? []) Object.assign(fl, flagsDoItem(it.subtipo, it.tipo_ref))
      aulas.push(fl)
    }
    // Itens soltos direto no módulo contam como aula própria (o currículo real aceita as duas formas).
    for (const it of (porMod.get(m.id) ?? []).sort((a, b) => a.ordem - b.ordem)) {
      aulas.push({ id: it.id, titulo: it.titulo, pdf: false, video: false, legproc: false, questoes: false, ...flagsDoItem(it.subtipo, it.tipo_ref) })
    }
    return { id: m.id, titulo: m.titulo, aulas }
  })
  return { modulos, total: count ?? 0 }
}

// ═════════ ABA: Pop-ups ═════════
export interface PopupRow { id: string; titulo: string; texto: string | null; botao_texto: string | null; quando: string; frequencia: string; no_ar_ate: string | null; ativo: boolean }
export async function listarPopups(tenantId: string, cursoId: string): Promise<PopupRow[]> {
  const svc = createAdminClient()
  const { data } = await svc.from('simulado_curso_popups').select('id, titulo, texto, botao_texto, quando, frequencia, no_ar_ate, ativo')
    .eq('tenant_id', tenantId).eq('curso_id', cursoId).order('criado_em', { ascending: false }).order('id', { ascending: true }).range(0, 99)
  return (data ?? []) as PopupRow[]
}

// ═════════ ABAS: Mensagens e E-mails ═════════
export async function listarAutomacoes(tenantId: string, cursoId: string): Promise<AutomacaoRow[]> {
  const svc = createAdminClient()
  const { data } = await svc.from('simulado_curso_automacoes').select('canal, chave, ativo, assunto, texto').eq('tenant_id', tenantId).eq('curso_id', cursoId).limit(50)
  return (data ?? []) as AutomacaoRow[]
}

// ═════════ ABA: Passaporte e edital ═════════
export interface EditalContexto {
  alunosPassaporte: number; conciliaram: number; seguem: number; naoEscolheram: number; avulsos: number
  extensivoId: string | null
  cobertura: { id: string; titulo: string; total: number; ligadas: number }[]
}
export async function getEditalContexto(tenantId: string, curso: CursoBase, produtoIds: string[]): Promise<EditalContexto> {
  const svc = createAdminClient()
  const head = async (tabela: string, f: (q: any) => any): Promise<number> => {
    try { const r = await f(svc.from(tabela).select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId)); return r.count ?? 0 } catch { return 0 }
  }
  const { data: pass } = await svc.from('simulado_produtos').select('id').eq('tenant_id', tenantId).eq('tier', 'passaporte').limit(200)
  const passIds = (pass ?? []).map((p: any) => p.id as string)
  let alunosPassaporte = 0
  for (let i = 0; i < passIds.length; i += 80) {
    alunosPassaporte += await head('simulado_assinaturas', (q) => q.eq('status', 'ativo').in('produto_id', passIds.slice(i, i + 80)))
  }
  const [conc, seg, cur, avulsos] = await Promise.all([
    head('simulado_curso_edital_escolhas', (q) => q.eq('curso_id', curso.id).eq('escolha', 'conciliar')),
    head('simulado_curso_edital_escolhas', (q) => q.eq('curso_id', curso.id).eq('escolha', 'seguir')),
    head('simulado_curso_edital_escolhas', (q) => q.eq('curso_id', curso.id).eq('escolha', 'curso')),
    produtoIds.length ? head('simulado_assinaturas', (q) => q.eq('status', 'ativo').in('produto_id', produtoIds.slice(0, 80))) : Promise.resolve(0),
  ])
  const { data: ext } = await svc.from('simulado_produtos').select('id').eq('tenant_id', tenantId).eq('tipo', 'extensivo').eq('ativo', true).order('ordem', { ascending: true }).order('id', { ascending: true }).limit(1)
  const extensivoId = (ext?.[0] as any)?.id ?? null
  let cobertura: EditalContexto['cobertura'] = []
  if (extensivoId) {
    const { data: mods } = await svc.from('simulado_produto_modulos').select('id, titulo').eq('tenant_id', tenantId).eq('produto_id', extensivoId).eq('deletado', false).is('pai_id', null).order('ordem', { ascending: true }).order('id', { ascending: true }).range(0, 59)
    const lista = (mods ?? []) as { id: string; titulo: string }[]
    if (lista.length) {
      const subs = await fetchAllByIn<any>(lista.map((m) => m.id), (ch) => svc.from('simulado_produto_modulos').select('id, pai_id').eq('tenant_id', tenantId).eq('deletado', false).in('pai_id', ch).order('id', { ascending: true }))
      const lig = await fetchAll<any>(() => svc.from('simulado_curso_edital_aulas').select('id, modulo_id').eq('tenant_id', tenantId).eq('curso_id', curso.id).order('id', { ascending: true }) as any, 1000, 'edital_aulas').catch(() => [] as any[])
      const ligSet = new Set(lig.map((r) => r.modulo_id as string))
      const tot = new Map<string, number>(), li = new Map<string, number>()
      for (const s of subs) { tot.set(s.pai_id, (tot.get(s.pai_id) ?? 0) + 1); if (ligSet.has(s.id)) li.set(s.pai_id, (li.get(s.pai_id) ?? 0) + 1) }
      cobertura = lista.map((m) => ({ id: m.id, titulo: m.titulo, total: tot.get(m.id) ?? 0, ligadas: li.get(m.id) ?? 0 }))
    }
  }
  return { alunosPassaporte, conciliaram: conc, seguem: seg, naoEscolheram: Math.max(0, alunosPassaporte - conc - seg - cur), avulsos, extensivoId, cobertura }
}

/** Aulas (submódulos) de um módulo do Extensivo + se já estão ligadas ao edital (painel "Escolher aulas"). */
export async function listarAulasParaEdital(tenantId: string, cursoId: string, moduloId: string): Promise<{ id: string; titulo: string; ligada: boolean }[]> {
  const svc = createAdminClient()
  const { data } = await svc.from('simulado_produto_modulos').select('id, titulo').eq('tenant_id', tenantId).eq('pai_id', moduloId).eq('deletado', false).order('ordem', { ascending: true }).order('id', { ascending: true }).range(0, 299)
  const subs = (data ?? []) as { id: string; titulo: string }[]
  if (!subs.length) return []
  const lig = await fetchAllByIn<any>(subs.map((s) => s.id), (ch) => svc.from('simulado_curso_edital_aulas').select('id, modulo_id').eq('tenant_id', tenantId).eq('curso_id', cursoId).in('modulo_id', ch).order('id', { ascending: true })).catch(() => [] as any[])
  const set = new Set(lig.map((r) => r.modulo_id as string))
  return subs.map((s) => ({ id: s.id, titulo: s.titulo, ligada: set.has(s.id) }))
}

// ═════════ PRÉVIA "Como o aluno vê" / mensagens / e-mails: dados REAIS da plataforma (sem exemplos inventados) ═════════
export interface DadosPreview {
  tenantNome: string
  modulos: string[] // módulos de 1º nível do produto principal (ordem real)
  aulas: string[] // aulas (submódulos) do 1º módulo
  materiais: string[] // títulos reais de itens do currículo
  eventos: { dia: string; mes: string; titulo: string; hora: string }[] // próximos eventos dos grupos do curso (calendário)
  nomeAdmin: string // 1º nome de quem está editando (exemplo do {nome})
}
export interface CoresTenant { c1: string | null; c2: string | null }

export function coresDoTenant(tema: Record<string, unknown> | null | undefined): CoresTenant {
  const hex = (v: unknown) => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : null)
  return { c1: hex(tema?.cor_primaria), c2: hex(tema?.cor_accent) ?? hex(tema?.cor_secundaria) }
}

const MESES = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ']
export async function getDadosPreview(tenantId: string, curso: CursoBase, grupoIds: string[], tenantNome: string, nomeAdmin: string): Promise<DadosPreview> {
  const svc = createAdminClient()
  const out: DadosPreview = { tenantNome, modulos: [], aulas: [], materiais: [], eventos: [], nomeAdmin }
  const pid = curso.produto_id
  if (pid) {
    const { data: mods } = await svc.from('simulado_produto_modulos').select('id, titulo').eq('tenant_id', tenantId).eq('produto_id', pid).eq('deletado', false).is('pai_id', null).order('ordem', { ascending: true }).order('id', { ascending: true }).range(0, 7)
    out.modulos = (mods ?? []).map((m: any) => m.titulo as string)
    const primeiro = (mods ?? [])[0] as any
    if (primeiro) {
      const { data: subs } = await svc.from('simulado_produto_modulos').select('titulo').eq('tenant_id', tenantId).eq('pai_id', primeiro.id).eq('deletado', false).order('ordem', { ascending: true }).order('id', { ascending: true }).range(0, 2)
      out.aulas = (subs ?? []).map((s: any) => s.titulo as string)
    }
    const { data: its } = await svc.from('simulado_produto_modulo_itens').select('titulo').eq('tenant_id', tenantId).eq('produto_id', pid).eq('deletado', false).order('ordem', { ascending: true }).order('id', { ascending: true }).range(0, 3)
    out.materiais = (its ?? []).map((i: any) => i.titulo as string)
  }
  try {
    const hoje = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10) // data de Brasília
    let q = svc.from('simulado_eventos_calendario').select('titulo, data, hora, grupo_id').eq('tenant_id', tenantId).gte('data', hoje)
    q = grupoIds.length ? q.or(`grupo_id.is.null,grupo_id.in.(${grupoIds.slice(0, 80).join(',')})`) : q.is('grupo_id', null)
    const { data: ev } = await q.order('data', { ascending: true }).order('id', { ascending: true }).range(0, 2)
    out.eventos = (ev ?? []).map((e: any) => ({ dia: String(e.data).slice(8, 10), mes: MESES[Number(String(e.data).slice(5, 7)) - 1] ?? '', titulo: e.titulo as string, hora: String(e.hora).slice(0, 5) }))
  } catch { /* calendário ausente: sem encontros */ }
  return out
}
