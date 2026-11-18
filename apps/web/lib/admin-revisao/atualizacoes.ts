import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { carregarPastasResolvidas, sanear } from './biblioteca'
import { TIPOS_BIB, type TipoAtualizacao } from './biblioteca-tipos'
import { comFallbackFlags, montarTagAtualizacao } from '@/lib/conteudo/atualizacoes-tipos'
import { fetchAllByIn } from '@/lib/supabase/fetch-all'
import { sqlQuery } from '@/lib/data/sql'
import { periodoBrtParaIso, type FiltroHistorico } from './atualizacoes-filtros'

// CENTRAL DE ATUALIZAÇÕES (Plataforma Revisão) — só leitura. Cada registro vira o selo "Atualizado em" e as
// "Novidades da versão" no topo do PDF do aluno (ver `novidadesDoDocumento`, usado pelo leitor do aluno).
// Fila "Para atualizar" = reportes de alunos tipo 'desatualizado' em aberto (simulado_material_reportes) + pedidos
// da equipe (simulado_conteudo_atualizacao_pedidos). Tolerante às tabelas novas ausentes (migração 20261112010000).

export interface ItemFila {
  chave: string
  fonte: 'reporte' | 'pedido'
  id: string
  documentoId: string
  material: string
  texto: string
  origem: string
  quando: string
}
export interface LinhaHistorico {
  id: string; documentoId: string; material: string; tipo: TipoAtualizacao; texto: string; quando: string; avisou: boolean
  /** Campos ADITIVOS (migrações 20261119010000 / 20261126000000): ausentes → null/false. */
  ocorridaEm: string | null; rotulo: string | null; disciplina: string | null; registradoPor: string | null
  fonteOrigem: string | null; fonteUrl: string | null; trechoAfetado: string | null; avisarJaBaixou: boolean
}
export interface OpcaoMaterial { id: string; rotulo: string }

const SCHEMA_AUSENTE = /relation .* does not exist|could not find the table|schema cache|does not exist/i
export const AVISO_MIGRACAO_ATUALIZACOES = 'Aplique a migração 20261112010000 (Central de Atualizações) para registrar e listar atualizações.'

export const AVISO_MIGRACAO_ESPEC = 'Aplique a migração 20261126000000 (especificação das atualizações) para ver fonte, trecho afetado, “quem registrou” e o filtro por pessoa.'

const NOME_TIPO_MAT =Object.fromEntries(TIPOS_BIB.map((t) => [t.id, t.nome])) as Record<string, string>

/** "PDFull · Aula 19 – …" — rótulo do material (tipo pela subpasta + título) e a disciplina herdada. Só dos documentos pedidos. */
export async function detalhesDeMateriais(svc: SupabaseClient, tenantId: string, ids: string[]): Promise<Map<string, { rotulo: string; disciplina: string | null }>> {
  const out = new Map<string, { rotulo: string; disciplina: string | null }>()
  const unicos = [...new Set(ids.filter(Boolean))]
  if (!unicos.length) return out
  const docs: any[] = []
  for (let i = 0; i < unicos.length; i += 80) {
    const { data } = await svc.from('simulado_conteudo_documentos').select('id, titulo, pasta_id, categoria, tipo_origem').eq('tenant_id', tenantId).in('id', unicos.slice(i, i + 80))
    docs.push(...((data ?? []) as any[]))
  }
  const pastas = await carregarPastasResolvidas(svc, tenantId)
  for (const d of docs) {
    const t = d.categoria === 'jurisclub' ? 'jurisclub' : d.tipo_origem === 'questoes' ? 'questoes' : (d.pasta_id ? pastas.get(d.pasta_id)?.tipo : null) ?? (d.tipo_origem === 'video' ? null : 'pdfull')
    out.set(d.id, { rotulo: `${t ? NOME_TIPO_MAT[t] ?? t : 'Videoaula'} · ${d.titulo ?? 'Sem título'}`, disciplina: (d.pasta_id ? pastas.get(d.pasta_id)?.disciplina : null) ?? null })
  }
  return out
}

/** "PDFull · Aula 19 – …" — rótulo do material: tipo (pela subpasta) + título. Só dos documentos pedidos. */
export async function rotulosDeMateriais(svc: SupabaseClient, tenantId: string, ids: string[]): Promise<Map<string, string>> {
  const d = await detalhesDeMateriais(svc, tenantId, ids)
  return new Map([...d].map(([k, v]) => [k, v.rotulo]))
}

/** Início do mês corrente em Brasília (ISO UTC) e o nome do mês — p/ o KPI "atualizações em <mês>". */
function mesBrt(): { iniIso: string; nome: string } {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).formatToParts(new Date())
  const y = f.find((p) => p.type === 'year')!.value, m = f.find((p) => p.type === 'month')!.value
  const nome = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', month: 'long' }).format(new Date())
  return { iniIso: new Date(`${y}-${m}-01T00:00:00-03:00`).toISOString(), nome }
}

export async function resumoAtualizacoes(svc: SupabaseClient, tenantId: string): Promise<{ fila: number; noMes: number; mes: string; avisadas: number; semTabela: boolean }> {
  const mes = mesBrt()
  const head = (t: string) => svc.from(t).select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId)
  const [rep, ped, mesQ, avis] = await Promise.all([
    head('simulado_material_reportes').eq('status', 'aberto').eq('tipo', 'desatualizado'),
    head('simulado_conteudo_atualizacao_pedidos').eq('status', 'pendente'),
    head('simulado_conteudo_atualizacoes').gte('criado_em', mes.iniIso),
    head('simulado_conteudo_atualizacoes').eq('avisar_alunos', true),
  ])
  const semTabela = [ped, mesQ, avis].some((r) => r.error && SCHEMA_AUSENTE.test(r.error.message))
  return { fila: (rep.error ? 0 : rep.count ?? 0) + (ped.error ? 0 : ped.count ?? 0), noMes: mesQ.error ? 0 : mesQ.count ?? 0, mes: mes.nome, avisadas: avis.error ? 0 : avis.count ?? 0, semTabela }
}

/** Fila paginada: reportes 'desatualizado' em aberto primeiro, depois os pedidos pendentes (janela real por fonte). */
export async function listarFila(svc: SupabaseClient, tenantId: string, pagina: number, porPagina: number): Promise<{ rows: ItemFila[]; total: number }> {
  const off = (Math.max(1, pagina) - 1) * porPagina
  const qRep = (sel: string, head?: boolean) => svc.from('simulado_material_reportes').select(sel, head ? { count: 'exact', head: true } : { count: 'exact' }).eq('tenant_id', tenantId).eq('status', 'aberto').eq('tipo', 'desatualizado').order('criado_em', { ascending: false }).order('id', { ascending: true })
  const qPed = (sel: string, head?: boolean) => svc.from('simulado_conteudo_atualizacao_pedidos').select(sel, head ? { count: 'exact', head: true } : { count: 'exact' }).eq('tenant_id', tenantId).eq('status', 'pendente').order('criado_em', { ascending: false }).order('id', { ascending: true })
  const [cr, cp] = await Promise.all([qRep('id', true), qPed('id', true)])
  const nRep = cr.error ? 0 : cr.count ?? 0, nPed = cp.error ? 0 : cp.count ?? 0
  const itens: ItemFila[] = []
  const brutosRep: any[] = [], brutosPed: any[] = []
  if (off < nRep) {
    const { data } = await qRep('id, documento_id, pagina, descricao, estudante_id, criado_em').range(off, Math.min(nRep - 1, off + porPagina - 1))
    brutosRep.push(...((data ?? []) as any[]))
  }
  const restante = porPagina - brutosRep.length
  if (restante > 0 && off + brutosRep.length >= nRep) {
    const de = Math.max(0, off - nRep)
    if (de < nPed) {
      const { data } = await qPed('id, documento_id, texto, origem, criado_em').range(de, Math.min(nPed - 1, de + restante - 1))
      brutosPed.push(...((data ?? []) as any[]))
    }
  }
  const estIds = [...new Set(brutosRep.map((r) => r.estudante_id).filter(Boolean))] as string[]
  const [rotulos, nomes] = await Promise.all([
    rotulosDeMateriais(svc, tenantId, [...brutosRep, ...brutosPed].map((r) => r.documento_id)),
    estIds.length ? svc.from('simulado_estudantes').select('id, nome').eq('tenant_id', tenantId).in('id', estIds) : Promise.resolve({ data: [] as any[] }),
  ])
  const nm = new Map(((nomes.data ?? []) as any[]).map((e) => [e.id, e.nome as string]))
  for (const r of brutosRep) itens.push({ chave: `r-${r.id}`, fonte: 'reporte', id: r.id, documentoId: r.documento_id, material: rotulos.get(r.documento_id) ?? 'Material', texto: `${r.descricao}${r.pagina ? ` (p. ${r.pagina})` : ''}`, origem: `Reportado por aluno · ${nm.get(r.estudante_id) ?? 'Aluno'}`, quando: r.criado_em })
  for (const r of brutosPed) itens.push({ chave: `p-${r.id}`, fonte: 'pedido', id: r.id, documentoId: r.documento_id, material: rotulos.get(r.documento_id) ?? 'Material', texto: r.texto, origem: r.origem, quando: r.criado_em })
  return { rows: itens, total: nRep + nPed }
}

const TAB = 'simulado_conteudo_atualizacoes'
const COLS_BASE = 'id, documento_id, tipo, texto, avisar_alunos, criado_em'
const TABELA_AUSENTE = /relation .* does not exist|could not find the table/i
/** Níveis de leitura, do mais completo ao legado: cada um só é usado se o anterior falhar por COLUNA ausente. */
const NIVEIS = [
  { cols: `${COLS_BASE}, ocorrida_em, rotulo, criado_por, fonte_origem, fonte_url, trecho_afetado, avisar_ja_baixou, registrado_por`, deletado: true, ocorrida: true, espec: true },
  { cols: `${COLS_BASE}, ocorrida_em, rotulo, criado_por`, deletado: true, ocorrida: true, espec: false },
  { cols: COLS_BASE, deletado: false, ocorrida: false, espec: false },
] as const
type Nivel = (typeof NIVEIS)[number]
const LIMITE_VARREDURA = 20000

export interface OpcoesHistorico extends Partial<FiltroHistorico> { pagina: number; porPagina: number; documentoId?: string | null }
export interface ResultadoHistorico { rows: LinhaHistorico[]; total: number; semTabela: boolean; /** colunas da migração 20261126000000 ausentes */ semEspec: boolean; /** filtro "quem registrou" pedido mas sem a coluna */ registradorIgnorado: boolean }

function aplicarFiltros(svc: SupabaseClient, tenantId: string, f: OpcoesHistorico, nv: Nivel, cols: string, contar: boolean) {
  let b = svc.from(TAB).select(cols, contar ? { count: 'exact' } : undefined).eq('tenant_id', tenantId)
  if (f.documentoId) b = b.eq('documento_id', f.documentoId)
  const q = sanear(f.q ?? '')
  if (q) b = nv.espec ? b.or(`texto.ilike.%${q}%,fonte_origem.ilike.%${q}%,trecho_afetado.ilike.%${q}%`) : b.ilike('texto', `%${q}%`)
  if (f.tipo) b = b.eq('tipo', f.tipo)
  const { ini, fim } = periodoBrtParaIso(f.de ?? null, f.ate ?? null)
  const colData = nv.ocorrida ? 'ocorrida_em' : 'criado_em'
  if (ini) b = b.gte(colData, ini)
  if (fim) b = b.lt(colData, fim)
  if (f.registrador && nv.espec) b = b.or(`registrado_por.eq.${f.registrador},and(registrado_por.is.null,criado_por.eq.${f.registrador})`)
  if (nv.deletado) b = b.eq('deletado', false)
  const asc = f.dir === 'asc'
  if (f.sort === 'tipo') b = b.order('tipo', { ascending: asc }).order(colData, { ascending: false })
  else b = b.order(colData, { ascending: asc })
  return b.order('id', { ascending: true })
}

/** Documentos (não excluídos) das pastas de uma disciplina (herdada pela árvore de pastas). */
async function documentosDaDisciplina(svc: SupabaseClient, tenantId: string, disciplina: string): Promise<Set<string>> {
  const pastas = await carregarPastasResolvidas(svc, tenantId)
  const pastaIds = [...pastas.values()].filter((p) => p.disciplina === disciplina).map((p) => p.id)
  if (!pastaIds.length) return new Set()
  const rows = await fetchAllByIn<{ id: string }>(pastaIds, (ch) => svc.from('simulado_conteudo_documentos').select('id').eq('tenant_id', tenantId).eq('deletado', false).in('pasta_id', ch).order('id', { ascending: true }), { chunk: 80 })
  return new Set(rows.map((r) => r.id))
}

/** Nomes (user_metadata.nome ou e-mail) de até 40 usuários distintos. */
async function nomesDeUsuarios(svc: SupabaseClient, ids: string[]): Promise<Map<string, string>> {
  const nomes = new Map<string, string>()
  await Promise.all([...new Set(ids.filter(Boolean))].slice(0, 40).map(async (uid) => {
    try { const { data } = await svc.auth.admin.getUserById(uid); const u = data?.user; if (u) nomes.set(uid, ((u.user_metadata as any)?.nome as string) || u.email || uid.slice(0, 8)) } catch { /* sem nome */ }
  }))
  return nomes
}

/** Lê UMA janela (offset/limite) do histórico no nível dado. Paginação server-side (.range + count); com disciplina, varre ids e fatia. */
async function lerNivel(svc: SupabaseClient, tenantId: string, f: OpcoesHistorico, nv: Nivel, off: number, lim: number): Promise<{ error: any } | { error: null; data: any[]; total: number }> {
  if (f.disciplina) {
    const docs = await documentosDaDisciplina(svc, tenantId, f.disciplina)
    if (!docs.size) return { error: null, data: [], total: 0 }
    const ordem: string[] = []
    for (let de = 0; de < LIMITE_VARREDURA; de += 1000) {
      const { data, error } = await aplicarFiltros(svc, tenantId, f, nv, 'id, documento_id', false).range(de, de + 999)
      if (error) return { error }
      for (const r of (data ?? []) as any[]) if (docs.has(r.documento_id)) ordem.push(r.id)
      if (!data || data.length < 1000) break
    }
    const ids = ordem.slice(off, off + lim)
    const rows: any[] = []
    if (ids.length) {
      const { data, error } = await svc.from(TAB).select(nv.cols).eq('tenant_id', tenantId).in('id', ids.slice(0, 80)).limit(80)
      if (error) return { error }
      const por = new Map(((data ?? []) as any[]).map((r) => [r.id, r]))
      for (const id of ids) if (por.has(id)) rows.push(por.get(id))
      // janelas > 80 (exportação): demais ids em chunks de 80
      for (let i = 80; i < ids.length; i += 80) {
        const { data: d2, error: e2 } = await svc.from(TAB).select(nv.cols).eq('tenant_id', tenantId).in('id', ids.slice(i, i + 80)).limit(80)
        if (e2) return { error: e2 }
        for (const r of (d2 ?? []) as any[]) por.set(r.id, r)
        for (const id of ids.slice(i, i + 80)) if (por.has(id)) rows.push(por.get(id))
      }
    }
    return { error: null, data: rows, total: ordem.length }
  }
  const data: any[] = []
  let total = 0
  for (let de = off; de < off + lim; de += 1000) {
    const ate = Math.min(de + 999, off + lim - 1)
    const r = await aplicarFiltros(svc, tenantId, f, nv, nv.cols, de === off).range(de, ate)
    if (r.error) return { error: r.error }
    if (de === off) total = r.count ?? 0
    data.push(...((r.data ?? []) as any[]))
    if (!r.data || r.data.length < ate - de + 1) break
  }
  return { error: null, data, total }
}

async function lerHistorico(svc: SupabaseClient, tenantId: string, f: OpcoesHistorico, off: number, lim: number): Promise<ResultadoHistorico> {
  let nivelUsado = 0
  let res: Awaited<ReturnType<typeof lerNivel>> = { error: { message: 'nenhum' } }
  for (let i = 0; i < NIVEIS.length; i++) {
    nivelUsado = i
    res = await lerNivel(svc, tenantId, f, NIVEIS[i], off, lim)
    if ('data' in res) break
    const msg = String((res.error as any)?.message ?? '')
    if (TABELA_AUSENTE.test(msg)) break // tabela não existe: níveis menores não ajudam
  }
  const vazio = { rows: [] as LinhaHistorico[], total: 0, semEspec: false, registradorIgnorado: false }
  if (!('data' in res)) return { ...vazio, semTabela: SCHEMA_AUSENTE.test(String((res.error as any)?.message ?? '')) }
  const nv = NIVEIS[nivelUsado]
  const data = res.data
  const [det, nomes] = await Promise.all([
    detalhesDeMateriais(svc, tenantId, data.map((r) => r.documento_id)),
    nv.espec || nv.ocorrida ? nomesDeUsuarios(svc, data.map((r) => r.registrado_por ?? r.criado_por).filter(Boolean)) : Promise.resolve(new Map<string, string>()),
  ])
  return {
    total: res.total, semTabela: false, semEspec: !nv.espec, registradorIgnorado: !!f.registrador && !nv.espec,
    rows: data.map((r) => {
      const uid = r.registrado_por ?? r.criado_por ?? null
      return {
        id: r.id, documentoId: r.documento_id, material: det.get(r.documento_id)?.rotulo ?? 'Material', tipo: r.tipo, texto: r.texto, quando: r.ocorrida_em ?? r.criado_em, avisou: !!r.avisar_alunos,
        ocorridaEm: r.ocorrida_em ?? null, rotulo: r.rotulo ?? null, disciplina: det.get(r.documento_id)?.disciplina ?? null, registradoPor: uid ? nomes.get(uid) ?? null : null,
        fonteOrigem: r.fonte_origem ?? null, fonteUrl: r.fonte_url ?? null, trechoAfetado: r.trecho_afetado ?? null, avisarJaBaixou: !!r.avisar_ja_baixou,
      }
    }),
  }
}

/** Histórico paginado (server-side) com filtros: busca, tipo, disciplina, período (BRT), quem registrou e ordenação. `documentoId` = linha do tempo de um material. */
export async function listarHistorico(svc: SupabaseClient, tenantId: string, opts: OpcoesHistorico): Promise<ResultadoHistorico> {
  return lerHistorico(svc, tenantId, opts, (Math.max(1, opts.pagina) - 1) * opts.porPagina, opts.porPagina)
}

/** Exportação: mesmos filtros, até `limite` linhas (varre em janelas de 1000, com .order por criado/ocorrida + id único). */
export async function listarHistoricoParaExportar(svc: SupabaseClient, tenantId: string, f: Partial<FiltroHistorico>, limite: number): Promise<ResultadoHistorico> {
  return lerHistorico(svc, tenantId, { ...f, pagina: 1, porPagina: limite }, 0, limite)
}

/** Opções dos filtros do Histórico: disciplinas (pastas-disciplina) e quem já registrou (nomes). */
export async function opcoesFiltrosHistorico(svc: SupabaseClient, tenantId: string): Promise<{ disciplinas: string[]; registradores: { id: string; nome: string }[] }> {
  const pastas = await carregarPastasResolvidas(svc, tenantId)
  const disciplinas = [...new Set([...pastas.values()].filter((p) => p.disciplinaId).map((p) => p.nome))].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  let ids: string[] = []
  const viaSql = await sqlQuery<{ id: string }>(`select distinct coalesce(registrado_por, criado_por)::text as id from simulado_conteudo_atualizacoes where tenant_id = $1 and coalesce(registrado_por, criado_por) is not null limit 100`, [tenantId])
  if (viaSql) ids = viaSql.map((r) => r.id)
  else {
    let r = await svc.from(TAB).select('registrado_por, criado_por').eq('tenant_id', tenantId).order('criado_em', { ascending: false }).limit(1000)
    if (r.error) r = await svc.from(TAB).select('criado_por').eq('tenant_id', tenantId).order('criado_em', { ascending: false }).limit(1000) as any
    ids = [...new Set(((r.data ?? []) as any[]).map((x) => x.registrado_por ?? x.criado_por).filter(Boolean))] as string[]
  }
  const nomes = await nomesDeUsuarios(svc, ids)
  const registradores = ids.map((id) => ({ id, nome: nomes.get(id) ?? id.slice(0, 8) })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  return { disciplinas, registradores }
}

/** Materiais para o seletor (busca por título; no máx. 30) + o documento pré-selecionado, se houver. */
export async function opcoesMateriais(svc: SupabaseClient, tenantId: string, busca: string, preId: string | null): Promise<OpcaoMaterial[]> {
  const q = sanear(busca)
  let b = svc.from('simulado_conteudo_documentos').select('id').eq('tenant_id', tenantId).eq('deletado', false).in('categoria', ['conteudo', 'jurisclub'])
  if (q) b = b.ilike('titulo', `%${q}%`)
  const { data } = await b.order('titulo', { ascending: true }).order('id', { ascending: true }).limit(30)
  const ids = [...new Set([...(preId ? [preId] : []), ...((data ?? []) as any[]).map((d) => d.id as string)])]
  const rot = await rotulosDeMateriais(svc, tenantId, ids)
  return ids.filter((id) => rot.has(id)).map((id) => ({ id, rotulo: rot.get(id)! }))
}

/**
 * Selo "Atualizado em" + "Novidades da versão" do aluno: última atualização do documento e as 5 mais recentes.
 * USO: leitor do aluno (painel/leitor/[materialId]/page.tsx tem TODO(dados) — trocar o texto fixo por este retorno).
 */
export interface NovidadeDoc { tipo: TipoAtualizacao; texto: string; quando: string; rotulo: string | null; itens: { texto: string; tipo?: TipoAtualizacao | null; local?: string | null }[] }
export async function novidadesDoDocumento(svc: SupabaseClient, tenantId: string, documentoId: string): Promise<{ atualizadoEm: string | null; /** data/hora do selo "Atualizado em" já com os interruptores do admin (null = oculta) */ seloData: string | null; novidades: NovidadeDoc[]; /** última atualização publicada tem ≤14 dias (indicador na aba do leitor) */ recente: boolean; /** rótulo da última atualização publicada (tooltip do selo de versão) */ ultimoRotulo: string | null }> {
  try {
    // Só PUBLICADAS e visíveis ao aluno (registro de versões). Sem a migração 20261119010000 → cai no formato legado.
    // Colunas de exibição (migração 20261120010000) são opcionais: sem elas repete a consulta sem elas (tudo visível).
    const colsN = 'tipo, texto, criado_em, ocorrida_em, rotulo, itens'
    const novo = await comFallbackFlags((f) => svc.from('simulado_conteudo_atualizacoes').select(f ? `${colsN}, exibir_data, exibir_hora, exibir_rotulo` : colsN)
      .eq('tenant_id', tenantId).eq('documento_id', documentoId).eq('status', 'publicado').eq('visivel_aluno', true).eq('deletado', false)
      .order('ocorrida_em', { ascending: false }).limit(5))
    if (!novo.error) {
      const l = (novo.data ?? []) as any[]
      const tags = l.map((r) => montarTagAtualizacao({ ocorridaEm: r.ocorrida_em ?? r.criado_em, exibirData: r.exibir_data !== false, exibirHora: r.exibir_hora !== false, exibirRotulo: r.exibir_rotulo !== false, rotulo: r.rotulo }))
      const novidades = l.map((r, i) => ({ tipo: r.tipo, texto: r.texto ?? '', quando: r.ocorrida_em ?? r.criado_em, rotulo: tags[i].rotulo, itens: Array.isArray(r.itens) ? r.itens : [] }))
      const ult = novidades[0]?.quando ?? null
      return { atualizadoEm: ult, seloData: tags[0]?.tag ?? null, novidades, recente: !!ult && Date.now() - new Date(ult).getTime() <= 14 * 86400_000, ultimoRotulo: novidades[0]?.rotulo ?? null }
    }
    const { data } = await svc.from('simulado_conteudo_atualizacoes').select('tipo, texto, criado_em').eq('tenant_id', tenantId).eq('documento_id', documentoId).order('criado_em', { ascending: false }).limit(5)
    const l = (data ?? []) as any[]
    return { atualizadoEm: l[0]?.criado_em ?? null, seloData: l[0]?.criado_em ? montarTagAtualizacao({ ocorridaEm: l[0].criado_em }).tag : null, novidades: l.map((r) => ({ tipo: r.tipo, texto: r.texto, quando: r.criado_em, rotulo: null, itens: [] })), recente: false, ultimoRotulo: null }
  } catch { return { atualizadoEm: null, seloData: null, novidades: [], recente: false, ultimoRotulo: null } }
}
