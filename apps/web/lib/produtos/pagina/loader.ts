import 'server-only'
// LOADER UNIFICADO da página do extensivo (aluno + modo edição). Backend-first: tudo é lido/calculado aqui; renderers só desenham.
//  carregarPaginaProduto → PaginaV1 (versão persistida; sem linha/tabela ⇒ derivação legada = blocosIniciais)
//  carregarDadosPagina   → DadosPagina (módulos, progresso, resumo do cronograma, seções resolvidas) — com ou sem aluno
//  montarItensPagina     → lista ordenada pronta p/ render (reusa montarPaginaExtensivo p/ módulos/“outros”)
import { createAdminClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { avisosDoProduto, curriculoDoExtensivo, hrefDoItem, progressoExtensivo, type VitrineAluno, type VitrineItem, type VitrineSecao } from '../aluno'
import { ITENS_PASTA, type VitrineLayout } from '../tipos'
import type { ModuloAluno } from '../curriculo-aluno'
import { resumoCronogramaDoAluno, type ResumoCronograma } from '../resumo-cronograma'
import { montarPaginaExtensivo, type BlocoAluno } from '../pagina-extensivo'
import { RESUMO_EXEMPLO } from '@/components/produtos/bloco-cronograma'
import type { AvisoPagina, DadosPagina, ProdutoPagina } from './dados'
import { blocosIniciais, linhaV0DeBloco, normalizarPagina, type LinhaV0 } from './normalizar'
import type { BlocoAny, PaginaV1 } from './tipos'

export type EstadoPagina = 'publicado' | 'rascunho'
export interface PaginaCarregada {
  pagina: PaginaV1
  /** 'versao' = linha em simulado_produto_pagina_versoes; 'legado' = derivada de simulado_produto_secoes (blocosIniciais). */
  origem: 'versao' | 'legado'
  versaoId: string | null
  estado: EstadoPagina | 'seed'
  /** Houve fallback do rascunho para o publicado/legado (não existe rascunho ainda). */
  semRascunho?: boolean
}

const tabelaAusente = (e: any) => !!e && (e.code === '42P01' || e.code === 'PGRST205' || /does not exist|schema cache/i.test(e.message ?? ''))

/** Linhas v0 (simulado_produto_secoes) na ordem — base da derivação legada. */
export async function estruturaLegada(tenantId: string, produtoId: string): Promise<LinhaV0[]> {
  const svc = createAdminClient()
  const { data } = await svc.from('simulado_produto_secoes').select('id, ordem, tipo, nome, tamanho, config, ativo')
    .eq('tenant_id', tenantId).eq('produto_id', produtoId).order('ordem', { ascending: true }).limit(300)
  return ((data ?? []) as any[]).map((s) => ({ id: s.id, tipo: s.tipo, nome: s.nome ?? null, ativo: s.ativo !== false, config: s.config ?? {}, tamanho: s.tamanho ?? 'vertical_small' }))
}

/** Última versão do estado pedido, ou null (também quando a migração não foi aplicada). */
export async function lerVersao(tenantId: string, produtoId: string, estado: 'rascunho' | 'publicado'): Promise<{ id: string; blocos: unknown; tema: unknown; rotulo: string | null; criado_em: string; publicado_em: string | null } | null> {
  try {
    const { data, error } = await createAdminClient().from('simulado_produto_pagina_versoes')
      .select('id, blocos, tema, rotulo, criado_em, publicado_em')
      .eq('tenant_id', tenantId).eq('produto_id', produtoId).eq('estado', estado)
      .order('criado_em', { ascending: false }).limit(1).maybeSingle()
    if (error) { if (!tabelaAusente(error)) console.error('[pagina] lerVersao:', error.message); return null }
    return (data as any) ?? null
  } catch { return null }
}

/**
 * Página do produto. `publicado` (aluno): versão publicada → senão derivação legada.
 * `rascunho` (editor): rascunho → senão publicado → senão derivação legada (nunca grava; P4/actions-base persiste).
 * `estrutura` evita reler as seções quando o chamador já as tem (ex.: vit.estrutura no page do aluno).
 */
export async function carregarPaginaProduto(produtoId: string, o: { estado: EstadoPagina; tenantId: string; estrutura?: LinhaV0[] }): Promise<PaginaCarregada> {
  const publicado = o.estado === 'publicado'
  const rasc = publicado ? null : await lerVersao(o.tenantId, produtoId, 'rascunho')
  if (rasc) return { pagina: normalizarPagina(rasc.blocos, rasc.tema), origem: 'versao', versaoId: rasc.id, estado: 'rascunho' }
  const pub = await lerVersao(o.tenantId, produtoId, 'publicado')
  if (pub) return { pagina: normalizarPagina(pub.blocos, pub.tema), origem: 'versao', versaoId: pub.id, estado: 'publicado', semRascunho: !publicado }
  const estrutura = o.estrutura ?? await estruturaLegada(o.tenantId, produtoId).catch(() => [])
  return { pagina: blocosIniciais({ estrutura }), origem: 'legado', versaoId: null, estado: publicado ? 'publicado' : 'seed', semRascunho: !publicado }
}

/** Seções (banner/carrossel) ATIVAS resolvidas por id de bloco: nomes/links dos itens em lote por tipo (sem N+1). */
export async function resolverSecoes(tenantId: string, blocos: BlocoAny[]): Promise<Record<string, VitrineSecao>> {
  const svc = createAdminClient()
  const ativos = blocos.filter((b) => b.ativo && (b.tipo === 'banner' || b.tipo === 'carrossel'))
  const sim = new Set<string>(), pasta = new Set<string>(), crono = new Set<string>()
  for (const b of ativos) if (b.tipo === 'carrossel') for (const it of b.conteudo.itens) {
    if (it.tipo_item === 'simulado') sim.add(it.item_id)
    else if (it.tipo_item === 'cronograma') crono.add(it.item_id)
    else if ((ITENS_PASTA as string[]).includes(it.tipo_item)) pasta.add(it.item_id)
  }
  const [sims, pastas, cronos] = await Promise.all([
    sim.size ? svc.from('simulado_simulados').select('id, titulo').eq('tenant_id', tenantId).in('id', [...sim]) : Promise.resolve({ data: [] }),
    pasta.size ? svc.from('simulado_pastas').select('id, nome, folder_area').eq('tenant_id', tenantId).in('id', [...pasta]) : Promise.resolve({ data: [] }),
    crono.size ? svc.from('simulado_cronogramas').select('id, nome').eq('tenant_id', tenantId).in('id', [...crono]) : Promise.resolve({ data: [] }),
  ])
  const nSim = new Map<string, string>((((sims as any).data) ?? []).map((r: any): [string, string] => [r.id, r.titulo]))
  const nCro = new Map<string, string>((((cronos as any).data) ?? []).map((r: any): [string, string] => [r.id, r.nome]))
  const nPas = new Map<string, { nome: string; area: string | null }>((((pastas as any).data) ?? []).map((r: any): [string, { nome: string; area: string | null }] => [r.id, { nome: r.nome, area: r.folder_area ?? null }]))
  const out: Record<string, VitrineSecao> = {}
  for (const b of ativos) {
    if (b.tipo === 'banner') {
      out[b.id] = { id: b.id, tipo: 'banner', nome: b.nome ?? null, tamanho: 'vertical_small', imagem: b.conteudo.imagem || null, imagem_mobile: b.conteudo.imagem_mobile || null, link: b.conteudo.link || null, itens: [] }
    } else if (b.tipo === 'carrossel') {
      const itens = b.conteudo.itens.map((it): VitrineItem | null => {
        if (it.tipo_item === 'simulado') { const n = nSim.get(it.item_id); return n ? { tipo: 'simulado', id: it.item_id, nome: n, area: null, href: hrefDoItem('simulado', null) } : null }
        if (it.tipo_item === 'cronograma') { const n = nCro.get(it.item_id); return n ? { tipo: 'cronograma', id: it.item_id, nome: n, area: null, href: hrefDoItem('cronograma', null) } : null }
        const p = nPas.get(it.item_id); return p ? { tipo: it.tipo_item, id: it.item_id, nome: p.nome, area: p.area, href: hrefDoItem(it.tipo_item, p.area) } : null
      }).filter(Boolean) as VitrineItem[]
      out[b.id] = { id: b.id, tipo: 'carrossel', nome: b.nome ?? null, tamanho: b.conteudo.tamanho, imagem: null, imagem_mobile: null, link: null, itens }
    }
  }
  return out
}

/** Currículo AGREGADO (sem aluno): módulos de topo do produto, sem progresso/aulas — para a prévia do editor. */
async function curriculoAmostra(tenantId: string, produtoId: string): Promise<ModuloAluno[]> {
  try {
    const mods = await fetchAll<any>(() => createAdminClient().from('simulado_produto_modulos').select('*')
      .eq('tenant_id', tenantId).eq('produto_id', produtoId).eq('deletado', false)
      .order('ordem', { ascending: true }).order('id', { ascending: true }) as any, 1000, 'pagina:amostra')
    return mods.filter((m) => !m.pai_id).map((m): ModuloAluno => ({
      id: m.id, titulo: m.titulo, descricao: m.descricao ?? null, imagemUrl: m.imagem_url ?? null, ocultarTitulo: !!m.ocultar_titulo,
      aberto: m.exibicao !== 'recolhido', liberado: true, liberaEm: null, exclusivo: false, aulas: [], submodulos: [],
    }))
  } catch { return [] }
}

async function produtoDaPagina(tenantId: string, produtoId: string): Promise<ProdutoPagina | null> {
  const svc = createAdminClient()
  const { data: p } = await svc.from('simulado_produtos')
    .select('id, slug, nome, descricao, cor, cor_secundaria, tema, logo_url, banner_url, banner_mobile_url').eq('tenant_id', tenantId).eq('id', produtoId).maybeSingle()
  if (!p) return null
  let vitrine_layout: VitrineLayout = 'netflix'
  try { const r: any = await svc.from('simulado_produtos').select('vitrine_layout').eq('tenant_id', tenantId).eq('id', produtoId).maybeSingle(); if (!r.error && r.data?.vitrine_layout) vitrine_layout = r.data.vitrine_layout } catch { /* coluna ausente */ }
  const q = p as any
  return { id: q.id, slug: q.slug, nome: q.nome, descricao: q.descricao ?? null, cor: q.cor ?? null, cor_secundaria: q.cor_secundaria ?? null, logo_url: q.logo_url ?? null,
    banner_url: q.banner_url ?? null, banner_mobile_url: q.banner_mobile_url ?? null, tema: q.tema ?? 'claro', vitrine_layout, expira_em: null }
}

export interface OpcoesDados {
  tenantId: string
  /** Aluno real (página do aluno) — ou omitido ⇒ modo AMOSTRA (edição): currículo agregado, progresso/resumo de exemplo, sem exigir sessão. */
  estudanteId?: string | null
  /** Se já tem o produto/vitrine carregados (page do aluno), evita reler o produto. */
  vit?: VitrineAluno | null
  /** Leituras já disparadas em paralelo pelo chamador (evita cascata): se vierem, não são relidas. */
  pre?: { avisos?: AvisoPagina[]; progressoSimulados?: DadosPagina['progressoSimulados']; curriculo?: ModuloAluno[] }
  expiraEm?: string | null
  voltar?: { href: string; rotulo: string }
  /** Slug (para links dos módulos) — default: o do produto. */
  slug?: string
}

export async function carregarDadosPagina(produtoId: string, pagina: PaginaV1, o: OpcoesDados): Promise<DadosPagina | null> {
  const { tenantId } = o
  const aluno = !!o.estudanteId
  const produto: ProdutoPagina | null = o.vit
    ? { id: o.vit.id, slug: o.vit.slug, nome: o.vit.nome, descricao: o.vit.descricao, cor: o.vit.cor, cor_secundaria: o.vit.cor_secundaria, logo_url: o.vit.logo_url,
        banner_url: o.vit.banner_url, banner_mobile_url: o.vit.banner_mobile_url, tema: o.vit.tema, vitrine_layout: o.vit.vitrine_layout, expira_em: o.vit.expira_em }
    : await produtoDaPagina(tenantId, produtoId)
  if (!produto) return null
  if (o.expiraEm !== undefined) produto.expira_em = o.expiraEm
  const slug = o.slug ?? produto.slug
  const cor = produto.cor || 'var(--brand-primary, var(--primary))'
  const cor2 = produto.cor_secundaria || cor

  const precisaAvisos = pagina.blocos.some((b) => b.ativo && b.tipo === 'avisos')
  const precisaContinuar = pagina.blocos.some((b) => b.ativo && b.tipo === 'continuar')
  const croBlocos = pagina.blocos.filter((b) => b.ativo && b.tipo === 'cronograma')

  const [avisos, progressoSimulados, curriculo, secoes, resumos] = await Promise.all([
    o.pre?.avisos ? Promise.resolve(o.pre.avisos) : precisaAvisos ? avisosDoProduto(tenantId, produtoId).catch(() => []) : Promise.resolve([]),
    o.pre?.progressoSimulados ? Promise.resolve(o.pre.progressoSimulados) : precisaContinuar
      ? (aluno ? progressoExtensivo(tenantId, o.estudanteId!, produtoId).catch(() => ({ total: 0, feitos: 0, proximo: null })) : Promise.resolve({ total: 3, feitos: 1, proximo: { id: 'amostra', titulo: 'Simulado de exemplo' } }))
      : Promise.resolve({ total: 0, feitos: 0, proximo: null }),
    o.pre?.curriculo ? Promise.resolve(o.pre.curriculo) : aluno ? curriculoDoExtensivo(tenantId, o.estudanteId!, produtoId, slug) : curriculoAmostra(tenantId, produtoId),
    resolverSecoes(tenantId, pagina.blocos),
    Promise.all(croBlocos.map(async (b): Promise<[string, ResumoCronograma | null]> => {
      if (b.tipo !== 'cronograma') return [b.id, null]
      const c = b.conteudo
      if (!(c.mostrar_metas || c.mostrar_progresso || c.mostrar_hoje || c.mostrar_atrasadas)) return [b.id, null]
      if (!aluno) return [b.id, RESUMO_EXEMPLO]
      const r = await resumoCronogramaDoAluno(createAdminClient(), tenantId, o.estudanteId!, c.cronograma_id ? [c.cronograma_id] : [], c.qtd_metas).catch(() => null)
      return [b.id, r]
    })),
  ])
  return {
    produto, origem: aluno ? 'aluno' : 'amostra', slug, cor, cor2, avisos, progressoSimulados, curriculo,
    resumosCronograma: Object.fromEntries(resumos), secoes: secoes as Record<string, VitrineSecao>, instrutores: [],
    voltar: o.voltar ?? { href: '#', rotulo: 'Voltar' },
  }
}

/** Item pronto p/ render: `aluno` presente nos tipos resolvidos por montarPaginaExtensivo (progresso/modulos/cronograma/banner/carrossel). */
export interface ItemPagina { bloco: BlocoAny; aluno?: BlocoAluno }

/**
 * Lista ordenada e filtrada (ativos, com conteúdo) da página. Módulos “restantes”/“Outros módulos”, progresso sem currículo e
 * seções vazias seguem as MESMAS regras do legado porque a resolução é a de montarPaginaExtensivo.
 */
export async function montarItensPagina(pagina: PaginaV1, dados: DadosPagina, tenantId: string, estudanteId: string | null): Promise<ItemPagina[]> {
  const linhas = pagina.blocos.map(linhaV0DeBloco).filter(Boolean) as NonNullable<ReturnType<typeof linhaV0DeBloco>>[]
  const resolvidos = await montarPaginaExtensivo(createAdminClient(), {
    tenantId, estudanteId: estudanteId ?? '', vit: { vitrine_layout: dados.produto.vitrine_layout }, curriculo: dados.curriculo,
    linhas, secoes: Object.values(dados.secoes), resumos: dados.resumosCronograma,
  })
  const porKey = new Map(resolvidos.map((r) => [r.key, r]))
  const usados = new Set<string>()
  const out: ItemPagina[] = []
  let ultimoModulos = -1
  for (const b of pagina.blocos) {
    if (!b.ativo) continue
    if (['progresso', 'modulos', 'cronograma', 'banner', 'carrossel'].includes(b.tipo)) {
      const r = porKey.get(b.id); if (!r) continue
      usados.add(b.id); out.push({ bloco: b, aluno: r }); if (b.tipo === 'modulos') ultimoModulos = out.length - 1
    } else out.push({ bloco: b })
  }
  // Blocos que o legado cria sozinho (rede de segurança “Outros módulos”) — após a última seção de módulos.
  for (const r of resolvidos) {
    if (usados.has(r.key)) continue
    const sintetico = { id: r.key, v: 1, tipo: 'modulos', variacao: 'herdar', ativo: true, conteudo: { modulo_ids: [], restantes: false, recolhivel: false, recolhida: false, agrupar_prefixo: false }, estilo: {}, visib: { desktop: true, tablet: true, mobile: true } } as BlocoAny
    out.splice(ultimoModulos >= 0 ? ultimoModulos + 1 : out.length, 0, { bloco: sintetico, aluno: r })
    ultimoModulos = ultimoModulos >= 0 ? ultimoModulos + 1 : out.length - 1
  }
  return out
}
