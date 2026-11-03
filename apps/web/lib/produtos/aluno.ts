import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import { ITENS_PASTA } from './tipos'
import { curriculoDoAluno, type ModuloAluno } from './curriculo-aluno'

/**
 * Catálogo do ALUNO — os produtos/extensivos que o aluno TEM (assinaturas ativas) e o que cada um
 * libera. Base do hub "Meus Extensivos" (Fase 2) e das páginas branded por produto. Só leitura.
 */

export interface ExtensivoCard {
  id: string
  slug: string
  nome: string
  tipo: string
  descricao: string | null
  cor: string | null
  capa_url: string | null
  itens: number
  expira_em: string | null
}

/** Junta expirações: null (sem prazo) vence; senão a mais distante. */
function maiorExpira(a: string | null | undefined, b: string | null | undefined): string | null {
  if (a === undefined) return b ?? null // ainda não havia valor
  if (b === undefined) return a
  if (a === null || b === null) return null // alguma fonte sem prazo → sem prazo
  return a > b ? a : b
}

/**
 * Produtos que o aluno recebe POR GRUPO DE ACESSO: o produto tem o grupo vinculado (item `grupo` ativo,
 * aba "Grupos de acesso" do produto) e o aluno é membro desse grupo (participação sem prazo ou não
 * vencida). Sem isto, vincular um grupo não liberava nada para quem JÁ estava nele — só assinaturas
 * criadas por concessão (venda/manual) davam acesso. Retorna produto_id → expira_em da participação.
 */
async function produtosPorGrupo(svc: any, tenantId: string, estudanteId: string, soProduto?: string): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>()
  const agora = new Date().toISOString()
  const { data: gm } = await svc.from('simulado_grupo_membros').select('grupo_id, expira_em')
    .eq('tenant_id', tenantId).eq('estudante_id', estudanteId).or(`expira_em.is.null,expira_em.gt.${agora}`)
  const expGrupo = new Map<string, string | null>()
  for (const r of (gm ?? []) as any[]) expGrupo.set(r.grupo_id, maiorExpira(expGrupo.get(r.grupo_id), r.expira_em ?? null))
  const grupos = [...expGrupo.keys()]
  if (!grupos.length) return out
  for (let i = 0; i < grupos.length; i += 100) {
    let q = svc.from('simulado_produto_itens').select('produto_id, item_id')
      .eq('tenant_id', tenantId).eq('tipo_item', 'grupo').eq('ativo', true).in('item_id', grupos.slice(i, i + 100))
    if (soProduto) q = q.eq('produto_id', soProduto)
    const { data: its } = await q
    for (const it of (its ?? []) as any[]) out.set(it.produto_id, maiorExpira(out.get(it.produto_id), expGrupo.get(it.item_id) ?? null))
  }
  return out
}

/**
 * Produtos ATIVOS liberados para TODOS os alunos do tenant ("Liberar para todos os alunos da plataforma",
 * coluna `acesso_gratuito` — mesmo recurso do simulado). Tolerante: sem a coluna (migração ainda não
 * aplicada) a query falha e devolve vazio, ou seja, ninguém ganha acesso por engano.
 */
async function produtosGratuitos(svc: any, tenantId: string, soProduto?: string): Promise<Set<string>> {
  try {
    let q = svc.from('simulado_produtos').select('id').eq('tenant_id', tenantId).eq('ativo', true).eq('acesso_gratuito', true)
    if (soProduto) q = q.eq('id', soProduto)
    const { data, error } = await q
    if (error) return new Set()
    return new Set(((data ?? []) as any[]).map((r) => r.id as string))
  } catch { return new Set() }
}

/** Acesso do aluno a UM produto: assinatura ativa, grupo vinculado OU produto liberado para todos. null = não tem. */
export async function acessoAoProduto(svc: any, tenantId: string, estudanteId: string, produtoId: string): Promise<{ expira_em: string | null } | null> {
  const { data: ass } = await svc.from('simulado_assinaturas').select('expira_em').eq('tenant_id', tenantId).eq('estudante_id', estudanteId).eq('produto_id', produtoId).eq('status', 'ativo').limit(1).maybeSingle()
  if (ass) return { expira_em: (ass as any).expira_em ?? null }
  const viaGrupo = await produtosPorGrupo(svc, tenantId, estudanteId, produtoId)
  if (viaGrupo.has(produtoId)) return { expira_em: viaGrupo.get(produtoId) ?? null }
  // Liberado para todos os alunos da plataforma → acesso sem prazo.
  return (await produtosGratuitos(svc, tenantId, produtoId)).has(produtoId) ? { expira_em: null } : null
}

/** Produtos ativos do aluno (assinatura ativa, grupo de acesso vinculado OU liberado para todos), ordenados por `ordem`. */
export async function produtosDoAluno(tenantId: string, estudanteId: string): Promise<ExtensivoCard[]> {
  const svc = createAdminClient()
  const [{ data: ass }, viaGrupo, gratuitos] = await Promise.all([
    svc.from('simulado_assinaturas')
      .select('produto_id, expira_em')
      .eq('tenant_id', tenantId).eq('estudante_id', estudanteId).eq('status', 'ativo')
      .not('produto_id', 'is', null),
    produtosPorGrupo(svc, tenantId, estudanteId),
    produtosGratuitos(svc, tenantId),
  ])
  const expira = new Map<string, string | null>()
  for (const a of (ass ?? []) as any[]) if (a.produto_id) expira.set(a.produto_id, maiorExpira(expira.get(a.produto_id), a.expira_em ?? null))
  for (const [pid, exp] of viaGrupo) expira.set(pid, maiorExpira(expira.get(pid), exp))
  for (const pid of gratuitos) expira.set(pid, null) // liberado para todos = sem prazo
  const uniq = [...expira.keys()]
  if (!uniq.length) return []
  const [{ data: prods }, { data: itens }] = await Promise.all([
    svc.from('simulado_produtos').select('id, slug, nome, tipo, descricao, cor, capa_url, ordem').eq('tenant_id', tenantId).eq('ativo', true).in('id', uniq).order('ordem', { ascending: true }),
    svc.from('simulado_produto_itens').select('produto_id').eq('tenant_id', tenantId).eq('ativo', true).in('produto_id', uniq),
  ])
  const cont = new Map<string, number>()
  for (const it of (itens ?? []) as any[]) cont.set(it.produto_id, (cont.get(it.produto_id) ?? 0) + 1)
  return ((prods ?? []) as any[]).map((p) => ({
    id: p.id, slug: p.slug, nome: p.nome, tipo: p.tipo, descricao: p.descricao ?? null,
    cor: p.cor ?? null, capa_url: p.capa_url ?? null, itens: cont.get(p.id) ?? 0, expira_em: expira.get(p.id) ?? null,
  }))
}

/**
 * Progresso do aluno NO extensivo (Fase 2.2): simulados do produto (itens diretos + simulados que
 * herdam das pastas/bancos via `regras->>banco_base_id`) × sessões FINALIZADAS do aluno (não-teste).
 */
export async function progressoExtensivo(tenantId: string, estudanteId: string, produtoId: string): Promise<{ total: number; feitos: number; proximo: { id: string; titulo: string } | null }> {
  const svc = createAdminClient()
  const { data: itens } = await svc.from('simulado_produto_itens').select('tipo_item, item_id').eq('tenant_id', tenantId).eq('produto_id', produtoId).eq('ativo', true)
  const simIds = new Set<string>()
  const pastas: string[] = []
  for (const it of (itens ?? []) as any[]) {
    if (it.tipo_item === 'simulado') simIds.add(it.item_id)
    else if (ITENS_PASTA.includes(it.tipo_item)) pastas.push(it.item_id)
  }
  for (const pastaId of [...new Set(pastas)]) {
    const { data: sims } = await svc.from('simulado_simulados').select('id').eq('tenant_id', tenantId).eq('deletado', false).filter('regras->>banco_base_id', 'eq', pastaId)
    for (const s of (sims ?? []) as any[]) simIds.add(s.id)
  }
  const ids = [...simIds]
  if (!ids.length) return { total: 0, feitos: 0, proximo: null }
  const feitos = new Set<string>()
  for (let i = 0; i < ids.length; i += 100) {
    const { data } = await svc.from('simulado_sessoes_prova').select('simulado_id').eq('tenant_id', tenantId).eq('estudante_id', estudanteId).eq('status', 'finalizada').eq('is_teste', false).in('simulado_id', ids.slice(i, i + 100))
    for (const r of (data ?? []) as any[]) feitos.add(r.simulado_id)
  }
  // Fase 2.4 — "continuar de onde parou": 1º simulado do extensivo ainda não finalizado (publicado).
  let proximo: { id: string; titulo: string } | null = null
  const pendentes = ids.filter((id) => !feitos.has(id))
  if (pendentes.length) {
    const { data: sim } = await svc.from('simulado_simulados').select('id, titulo').eq('tenant_id', tenantId).eq('status', 'publicado').in('id', pendentes.slice(0, 100)).order('data_inicio', { ascending: true, nullsFirst: false }).limit(1).maybeSingle()
    if (sim) proximo = { id: (sim as any).id, titulo: (sim as any).titulo }
  }
  return { total: ids.length, feitos: feitos.size, proximo }
}

// ─────────── VITRINE do aluno (rebuild Curseduca): produto + seções (banner/carrossel) ───────────
export interface VitrineItem { tipo: string; id: string; nome: string; area: string | null; href: string }
export interface VitrineSecao {
  id: string; tipo: 'banner' | 'carrossel'; nome: string | null; tamanho: string
  imagem: string | null; imagem_mobile: string | null; link: string | null
  itens: VitrineItem[]
}
export interface VitrineAluno {
  id: string; slug: string; nome: string; tipo: string; descricao: string | null
  cor: string | null; cor_secundaria: string | null; tema: string; logo_url: string | null
  capa_url: string | null; banner_url: string | null; banner_mobile_url: string | null
  expira_em: string | null; secoes: VitrineSecao[]
}

function hrefDoItem(tipo: string, area: string | null): string {
  if (tipo === 'simulado') return '/aluno/simulados'
  if (tipo === 'cronograma') return '/aluno/cronograma'
  if (area === 'maratona') return '/aluno/maratona'
  if (area === 'jurisprudencia') return '/aluno/jurisprudencia'
  if (area === 'leitura') return '/aluno/leitura'
  return '/aluno/biblioteca'
}

/** Vitrine (branding + seções) de um extensivo do aluno. null se não existe OU o aluno não o tem. */
export async function vitrineDoAluno(tenantId: string, estudanteId: string, slug: string): Promise<VitrineAluno | null> {
  const svc = createAdminClient()
  const { data: p } = await svc.from('simulado_produtos')
    .select('id, slug, nome, tipo, descricao, cor, cor_secundaria, tema, logo_url, capa_url, banner_url, banner_mobile_url')
    .eq('tenant_id', tenantId).eq('slug', slug).eq('ativo', true).maybeSingle()
  if (!p) return null
  const prod = p as any
  const ass = await acessoAoProduto(svc, tenantId, estudanteId, prod.id)
  if (!ass) return null
  const { data: secoes } = await svc.from('simulado_produto_secoes').select('id, ordem, tipo, nome, tamanho, config').eq('tenant_id', tenantId).eq('produto_id', prod.id).eq('ativo', true).order('ordem', { ascending: true })

  // Resolve nomes dos itens dos carrosséis em lote por tipo.
  const simIds = new Set<string>(), pastaIds = new Set<string>(), cronoIds = new Set<string>()
  for (const s of (secoes ?? []) as any[]) for (const it of (s.config?.itens ?? [])) {
    if (it.tipo_item === 'simulado') simIds.add(it.item_id)
    else if (it.tipo_item === 'cronograma') cronoIds.add(it.item_id)
    else if (ITENS_PASTA.includes(it.tipo_item)) pastaIds.add(it.item_id)
  }
  const inList = (s: Set<string>) => [...s]
  const [sims, pastas, cronos] = await Promise.all([
    simIds.size ? svc.from('simulado_simulados').select('id, titulo').eq('tenant_id', tenantId).in('id', inList(simIds)) : Promise.resolve({ data: [] }),
    pastaIds.size ? svc.from('simulado_pastas').select('id, nome, folder_area').eq('tenant_id', tenantId).in('id', inList(pastaIds)) : Promise.resolve({ data: [] }),
    cronoIds.size ? svc.from('simulado_cronogramas').select('id, nome').eq('tenant_id', tenantId).in('id', inList(cronoIds)) : Promise.resolve({ data: [] }),
  ])
  const nomeSim = new Map<string, string>((((sims as any).data) ?? []).map((r: any): [string, string] => [r.id, r.titulo]))
  const pastaInfo = new Map<string, { nome: string; area: string | null }>((((pastas as any).data) ?? []).map((r: any): [string, { nome: string; area: string | null }] => [r.id, { nome: r.nome, area: r.folder_area ?? null }]))
  const nomeCron = new Map<string, string>((((cronos as any).data) ?? []).map((r: any): [string, string] => [r.id, r.nome]))

  const secoesOut: VitrineSecao[] = ((secoes ?? []) as any[]).map((s) => {
    const cfg = s.config ?? {}
    const itens: VitrineItem[] = (cfg.itens ?? []).map((it: any): VitrineItem | null => {
      if (it.tipo_item === 'simulado') { const n = nomeSim.get(it.item_id); return n ? { tipo: 'simulado', id: it.item_id, nome: n, area: null, href: hrefDoItem('simulado', null) } : null }
      if (it.tipo_item === 'cronograma') { const n = nomeCron.get(it.item_id); return n ? { tipo: 'cronograma', id: it.item_id, nome: n, area: null, href: hrefDoItem('cronograma', null) } : null }
      const pi = pastaInfo.get(it.item_id); return pi ? { tipo: it.tipo_item, id: it.item_id, nome: pi.nome, area: pi.area, href: hrefDoItem(it.tipo_item, pi.area) } : null
    }).filter(Boolean) as VitrineItem[]
    return { id: s.id, tipo: s.tipo === 'banner' ? 'banner' : 'carrossel', nome: s.nome ?? null, tamanho: s.tamanho ?? 'vertical_small', imagem: cfg.imagem ?? null, imagem_mobile: cfg.imagem_mobile ?? null, link: cfg.link ?? null, itens }
  })

  return {
    id: prod.id, slug: prod.slug, nome: prod.nome, tipo: prod.tipo, descricao: prod.descricao ?? null,
    cor: prod.cor ?? null, cor_secundaria: prod.cor_secundaria ?? null, tema: prod.tema ?? 'claro', logo_url: prod.logo_url ?? null,
    capa_url: prod.capa_url ?? null, banner_url: prod.banner_url ?? null, banner_mobile_url: prod.banner_mobile_url ?? null,
    expira_em: (ass as any).expira_em ?? null, secoes: secoesOut,
  }
}

/**
 * Progresso de CONTEÚDO/videoaulas (Fase 2.5): documentos publicados da Biblioteca nas pastas do
 * produto × documentos que o aluno já abriu (simulado_conteudo_leitura_progresso).
 */
export async function progressoConteudo(tenantId: string, estudanteId: string, produtoId: string): Promise<{ total: number; lidos: number }> {
  const svc = createAdminClient()
  const { data: itens } = await svc.from('simulado_produto_itens').select('tipo_item, item_id').eq('tenant_id', tenantId).eq('produto_id', produtoId).eq('ativo', true)
  const pastas = [...new Set(((itens ?? []) as any[]).filter((i) => ITENS_PASTA.includes(i.tipo_item)).map((i) => i.item_id))]
  if (!pastas.length) return { total: 0, lidos: 0 }
  const docIds: string[] = []
  for (let i = 0; i < pastas.length; i += 50) {
    const { data } = await svc.from('simulado_conteudo_documentos').select('id').eq('tenant_id', tenantId).eq('deletado', false).eq('status', 'publicado').eq('categoria', 'conteudo').in('pasta_id', pastas.slice(i, i + 50))
    for (const d of (data ?? []) as any[]) docIds.push(d.id)
  }
  if (!docIds.length) return { total: 0, lidos: 0 }
  const lidos = new Set<string>()
  for (let i = 0; i < docIds.length; i += 100) {
    const { data } = await svc.from('simulado_conteudo_leitura_progresso').select('documento_id').eq('tenant_id', tenantId).eq('aluno_id', estudanteId).in('documento_id', docIds.slice(i, i + 100))
    for (const r of (data ?? []) as any[]) lidos.add(r.documento_id)
  }
  return { total: docIds.length, lidos: lidos.size }
}

/** Avisos ATIVOS de um produto (fixados primeiro). Fase 2.3. */
export async function avisosDoProduto(tenantId: string, produtoId: string): Promise<{ id: string; titulo: string; corpo: string | null; fixado: boolean }[]> {
  const svc = createAdminClient()
  const { data } = await svc
    .from('simulado_produto_avisos')
    .select('id, titulo, corpo, fixado')
    .eq('tenant_id', tenantId).eq('produto_id', produtoId).eq('ativo', true)
    .order('fixado', { ascending: false }).order('criado_em', { ascending: false })
    .limit(10)
  return (data ?? []) as { id: string; titulo: string; corpo: string | null; fixado: boolean }[]
}

export interface ExtensivoDetalhe extends ExtensivoCard {
  grupos: string[]
  simulados: string[]
  pastas: { nome: string; area: string | null }[]
  cronogramas: string[]
}

/** Detalhe de UM extensivo do aluno (pela slug). null se não existe OU o aluno não o tem (gate). */
export async function getExtensivoDoAluno(tenantId: string, estudanteId: string, slug: string): Promise<ExtensivoDetalhe | null> {
  const svc = createAdminClient()
  const { data: p } = await svc.from('simulado_produtos').select('id, slug, nome, tipo, descricao, cor, capa_url').eq('tenant_id', tenantId).eq('slug', slug).eq('ativo', true).maybeSingle()
  if (!p) return null
  const ass = await acessoAoProduto(svc, tenantId, estudanteId, (p as any).id)
  if (!ass) return null // o aluno não tem este produto (nem assinatura nem grupo) → não vê
  const { data: itens } = await svc.from('simulado_produto_itens').select('tipo_item, item_id').eq('tenant_id', tenantId).eq('produto_id', (p as any).id).eq('ativo', true)
  const porTipo = { grupo: [] as string[], simulado: [] as string[], pasta: [] as string[], cronograma: [] as string[] }
  for (const it of (itens ?? []) as any[]) {
    if (it.tipo_item === 'grupo') porTipo.grupo.push(it.item_id)
    else if (it.tipo_item === 'simulado') porTipo.simulado.push(it.item_id)
    else if (it.tipo_item === 'cronograma') porTipo.cronograma.push(it.item_id)
    else if (ITENS_PASTA.includes(it.tipo_item)) porTipo.pasta.push(it.item_id)
  }
  const nomes = async (tabela: string, ids: string[], col = 'nome'): Promise<any[]> => {
    if (!ids.length) return []
    const { data } = await svc.from(tabela).select(`id, ${col}${tabela === 'simulado_pastas' ? ', folder_area' : ''}`).eq('tenant_id', tenantId).in('id', [...new Set(ids)])
    return data ?? []
  }
  const [gr, si, pa, cr] = await Promise.all([
    nomes('simulado_grupos', porTipo.grupo),
    nomes('simulado_simulados', porTipo.simulado, 'titulo'),
    nomes('simulado_pastas', porTipo.pasta),
    nomes('simulado_cronogramas', porTipo.cronograma),
  ])
  return {
    id: (p as any).id, slug: (p as any).slug, nome: (p as any).nome, tipo: (p as any).tipo, descricao: (p as any).descricao ?? null,
    cor: (p as any).cor ?? null, capa_url: (p as any).capa_url ?? null, itens: (itens ?? []).length, expira_em: (ass as any).expira_em ?? null,
    grupos: gr.map((r: any) => r.nome).filter(Boolean),
    simulados: si.map((r: any) => r.titulo).filter(Boolean),
    pastas: pa.map((r: any) => ({ nome: r.nome, area: r.folder_area ?? null })).filter((x: any) => x.nome),
    cronogramas: cr.map((r: any) => r.nome).filter(Boolean),
  }
}

/**
 * Currículo (módulos/submódulos/aulas do configurador) de um extensivo do aluno. Chamar SÓ depois de
 * `getExtensivoDoAluno` (que já fez o gate de acesso ao produto). `slug` monta o "voltar" do leitor.
 */
export async function curriculoDoExtensivo(tenantId: string, estudanteId: string, produtoId: string, slug: string): Promise<ModuloAluno[]> {
  const svc = createAdminClient()
  // "Voltar" do leitor → página do MÓDULO da aula (não a vitrine do extensivo).
  return curriculoDoAluno(svc, tenantId, estudanteId, produtoId, (moduloId) => `/aluno/extensivos/${slug}/modulo/${moduloId}`).catch(() => [])
}
