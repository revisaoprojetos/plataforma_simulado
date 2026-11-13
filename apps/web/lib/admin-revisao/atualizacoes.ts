import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { carregarPastasResolvidas, sanear } from './biblioteca'
import { TIPOS_BIB, type TipoAtualizacao } from './biblioteca-tipos'
import { comFallbackFlags, montarTagAtualizacao } from '@/lib/conteudo/atualizacoes-tipos'

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
export interface LinhaHistorico { id: string; documentoId: string; material: string; tipo: TipoAtualizacao; texto: string; quando: string; avisou: boolean }
export interface OpcaoMaterial { id: string; rotulo: string }

const SCHEMA_AUSENTE = /relation .* does not exist|could not find the table|schema cache|does not exist/i
export const AVISO_MIGRACAO_ATUALIZACOES = 'Aplique a migração 20261112010000 (Central de Atualizações) para registrar e listar atualizações.'

const NOME_TIPO_MAT = Object.fromEntries(TIPOS_BIB.map((t) => [t.id, t.nome])) as Record<string, string>

/** "PDFull · Aula 19 – …" — rótulo do material: tipo (pela subpasta) + título. Só dos documentos pedidos. */
export async function rotulosDeMateriais(svc: SupabaseClient, tenantId: string, ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
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
    out.set(d.id, `${t ? NOME_TIPO_MAT[t] ?? t : 'Videoaula'} · ${d.titulo ?? 'Sem título'}`)
  }
  return out
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

export async function listarHistorico(
  svc: SupabaseClient, tenantId: string, opts: { q: string; tipo: TipoAtualizacao | null; pagina: number; porPagina: number },
): Promise<{ rows: LinhaHistorico[]; total: number; semTabela: boolean }> {
  const off = (Math.max(1, opts.pagina) - 1) * opts.porPagina
  let b = svc.from('simulado_conteudo_atualizacoes').select('id, documento_id, tipo, texto, avisar_alunos, criado_em', { count: 'exact' }).eq('tenant_id', tenantId)
  const q = sanear(opts.q)
  if (q) b = b.ilike('texto', `%${q}%`)
  if (opts.tipo) b = b.eq('tipo', opts.tipo)
  // Registros excluídos (soft) do novo registro de versões não aparecem; antes da migração 20261119010000 o filtro falha → refaz sem ele.
  let res = await b.eq('deletado', false).order('criado_em', { ascending: false }).order('id', { ascending: true }).range(off, off + opts.porPagina - 1)
  if (res.error && /deletado/.test(res.error.message)) {
    let b2 = svc.from('simulado_conteudo_atualizacoes').select('id, documento_id, tipo, texto, avisar_alunos, criado_em', { count: 'exact' }).eq('tenant_id', tenantId)
    if (q) b2 = b2.ilike('texto', `%${q}%`)
    if (opts.tipo) b2 = b2.eq('tipo', opts.tipo)
    res = await b2.order('criado_em', { ascending: false }).order('id', { ascending: true }).range(off, off + opts.porPagina - 1)
  }
  const { data, count, error } = res
  if (error) return { rows: [], total: 0, semTabela: SCHEMA_AUSENTE.test(error.message) }
  const rotulos = await rotulosDeMateriais(svc, tenantId, (data ?? []).map((r: any) => r.documento_id))
  return {
    total: count ?? 0, semTabela: false,
    rows: ((data ?? []) as any[]).map((r) => ({ id: r.id, documentoId: r.documento_id, material: rotulos.get(r.documento_id) ?? 'Material', tipo: r.tipo, texto: r.texto, quando: r.criado_em, avisou: !!r.avisar_alunos })),
  }
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
