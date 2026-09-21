import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import { fetchAll, fetchAllByIn } from '@/lib/supabase/fetch-all'
import { resolverProviderCfg } from '@/lib/integracoes/config'
import { getAdapter } from '@/lib/integracoes/registry'
import { aplicarEntitlement } from '@/lib/integracoes/engine'
import type { Provider, EventoNormalizado, PessoaEntitlement } from '@/lib/integracoes/tipos'

const soDig = (s?: string | null) => (s ? s.replace(/\D/g, '') : '')

/**
 * Análise das divergências de CONCESSÃO (dry-run): por produto, quantos já TÊM o acesso do mapeamento
 * (aplicar seria no-op) vs quantos GANHARIAM de fato (aluno existe mas sem o acesso, ou cadastro novo).
 * Tudo via lote no banco — não chama a API do provedor.
 */
async function analisarConcederia(svc: any, tenantId: string, provider: Provider, pes: PessoaEntitlement[]) {
  // 1) Mapeamentos produto→destino (grupo/pasta/classificacao).
  const refs = [...new Set(pes.map((p) => p.entitlement.produtoRef))]
  const mapPorRef = new Map<string, { grupoId: string | null; pastaId: string | null; classificacao: string | null } | null>()
  if (refs.length) {
    const maps = await fetchAllByIn<any>(refs, (chunk) =>
      svc.from('simulado_integracao_mapeamentos').select('fonte_ref, grupo_id, pasta_id, classificacao, ativo').eq('tenant_id', tenantId).eq('provider', provider).in('fonte_ref', chunk).order('fonte_ref', { ascending: true }))
    for (const m of maps) if (m.ativo) mapPorRef.set(String(m.fonte_ref), { grupoId: m.grupo_id ?? null, pastaId: m.pasta_id ?? null, classificacao: m.classificacao ?? null })
  }

  // 2) Resolve estudante de cada pessoa (por email/cpf/matricula_externa) — sem criar.
  const emails = [...new Set(pes.map((p) => (p.pessoa.email ?? '').trim().toLowerCase()).filter(Boolean))]
  const cpfs = [...new Set(pes.map((p) => soDig(p.pessoa.cpf)).filter(Boolean))]
  const exts = [...new Set(pes.map((p) => p.pessoa.externalId).filter(Boolean))]
  const idPorEmail = new Map<string, string>(), idPorCpf = new Map<string, string>(), idPorExt = new Map<string, string>()
  const classifPorId = new Map<string, string | null>()
  const registrar = (rows: any[]) => {
    for (const e of rows) {
      classifPorId.set(e.id, e.classificacao ?? null)
      if (e.email) idPorEmail.set(String(e.email).toLowerCase(), e.id)
      for (const se of (e.emails_secundarios ?? [])) if (se) idPorEmail.set(String(se).toLowerCase(), e.id)
      if (e.cpf) idPorCpf.set(soDig(e.cpf), e.id)
      if (e.matricula_externa) idPorExt.set(String(e.matricula_externa), e.id)
    }
  }
  if (emails.length) registrar(await fetchAllByIn<any>(emails, (c) => svc.from('simulado_estudantes').select('id, email, emails_secundarios, cpf, matricula_externa, classificacao').eq('tenant_id', tenantId).eq('deletado', false).in('email', c).order('id', { ascending: true })))
  if (cpfs.length) registrar(await fetchAllByIn<any>(cpfs, (c) => svc.from('simulado_estudantes').select('id, email, emails_secundarios, cpf, matricula_externa, classificacao').eq('tenant_id', tenantId).eq('deletado', false).in('cpf', c).order('id', { ascending: true })))
  if (exts.length) registrar(await fetchAllByIn<any>(exts, (c) => svc.from('simulado_estudantes').select('id, email, emails_secundarios, cpf, matricula_externa, classificacao').eq('tenant_id', tenantId).eq('deletado', false).in('matricula_externa', c).order('id', { ascending: true })))
  const resolver = (p: PessoaEntitlement): string | null =>
    idPorExt.get(p.pessoa.externalId) || (p.pessoa.email ? idPorEmail.get(p.pessoa.email.trim().toLowerCase()) : null) || (soDig(p.pessoa.cpf) ? idPorCpf.get(soDig(p.pessoa.cpf)) : null) || null

  // 3) Acesso atual dos estudantes resolvidos (membros de grupo + pastas).
  const idsResolvidos = [...new Set(pes.map(resolver).filter(Boolean))] as string[]
  const grupoDe = new Set<string>(), pastaDe = new Set<string>()
  if (idsResolvidos.length) {
    for (const r of await fetchAllByIn<any>(idsResolvidos, (c) => svc.from('simulado_grupo_membros').select('estudante_id, grupo_id').in('estudante_id', c).order('estudante_id', { ascending: true }))) grupoDe.add(`${r.estudante_id}|${r.grupo_id}`)
    for (const r of await fetchAllByIn<any>(idsResolvidos, (c) => svc.from('simulado_pasta_estudantes').select('estudante_id, pasta_id').in('estudante_id', c).order('estudante_id', { ascending: true }))) pastaDe.add(`${r.estudante_id}|${r.pasta_id}`)
  }

  // 4) Agrega por produto.
  const agg = new Map<string, { produto: string; total: number; semEstudante: number; semMapeamento: number; jaTem: number; ganharia: number }>()
  for (const p of pes) {
    const ref = p.entitlement.produtoRef
    const nome = p.entitlement.produtoNome ?? ref
    const a = agg.get(ref) ?? { produto: nome, total: 0, semEstudante: 0, semMapeamento: 0, jaTem: 0, ganharia: 0 }
    a.total++
    const estId = resolver(p)
    const map = mapPorRef.get(ref)
    if (!estId) { a.semEstudante++; a.ganharia++ }        // cadastro novo → ganha acesso
    else if (!map) { a.semMapeamento++; a.ganharia++ }     // sem mapeamento → auto-cria grupo e concede
    else {
      const temGrupo = map.grupoId ? grupoDe.has(`${estId}|${map.grupoId}`) : false
      const temPasta = map.pastaId ? pastaDe.has(`${estId}|${map.pastaId}`) : false
      const temClassif = (map.classificacao === 'passaporte' && ['passaporte', 'vitalicio'].includes(classifPorId.get(estId) ?? '')) || (map.classificacao === 'vitalicio' && classifPorId.get(estId) === 'vitalicio')
      // "já tem" só quando o mapeamento define um destino e o aluno já o possui.
      const temDestino = !!(map.grupoId || map.pastaId || map.classificacao)
      if (temDestino && (temGrupo || temPasta || temClassif)) a.jaTem++
      else a.ganharia++
    }
    agg.set(ref, a)
  }
  const porProduto = [...agg.values()].sort((x, y) => y.ganharia - x.ganharia)
  const tot = porProduto.reduce((s, p) => ({ total: s.total + p.total, semEstudante: s.semEstudante + p.semEstudante, semMapeamento: s.semMapeamento + p.semMapeamento, jaTem: s.jaTem + p.jaTem, ganharia: s.ganharia + p.ganharia }), { total: 0, semEstudante: 0, semMapeamento: 0, jaTem: 0, ganharia: 0 })
  return { totais: tot, porProduto }
}

/**
 * Orquestração agnóstica de provedor. Liga adaptador (pull/push) → engine.
 * server-only e SEM 'use server' (recebe tenantId por parâmetro; não é endpoint RPC).
 * Usado pelas actions (com checagem de permissão), pelos crons (sync/reconciliação)
 * e pelo processamento de eventos de webhook.
 */

export interface ResultadoImport {
  ok: boolean
  error?: string
  total?: number
  concedidos?: number
  revogados?: number
  ignorados?: number
  erros?: number
}

/**
 * IMPORT/RECONCILIAÇÃO por PULL: coleta pessoas+direitos das fontes (grupos/produtos)
 * e aplica cada um no domínio. Idempotente. `refs` = ids de grupo (Curseduca) / produto (Guru).
 */
export async function importarViaProvider(tenantId: string, provider: Provider, refs: string[]): Promise<ResultadoImport> {
  const cfg = await resolverProviderCfg(tenantId, provider)
  if (!cfg) return { ok: false, error: 'Provedor sem credenciais/config para este tenant.' }
  const adapter = getAdapter(provider)
  if (!adapter) return { ok: false, error: `Provedor "${provider}" não suportado.` }

  let pessoas
  try {
    pessoas = await adapter.listarPessoas(cfg, refs)
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }

  let concedidos = 0, revogados = 0, ignorados = 0, erros = 0
  for (const { pessoa, entitlement } of pessoas) {
    const r = await aplicarEntitlement({ tenantId, provider, pessoa, entitlement })
    if (!r.ok) erros++
    else if (r.acao === 'concedido') concedidos++
    else if (r.acao === 'revogado') revogados++
    else ignorados++
  }
  return { ok: true, total: pessoas.length, concedidos, revogados, ignorados, erros }
}

export interface ReconcileDivergencia {
  externalId: string; produtoRef: string; produtoNome?: string | null
  statusApi: string; statusLocal: string | null; acao: 'conceder' | 'revogar'
  estudanteId: string | null; estudanteNome: string | null; estudanteEmail: string | null
}
export interface ReconcileResult {
  ok: boolean; error?: string; dry: boolean
  pull: number; concederia: number; revogaria: number; semMudanca: number
  aplicado?: { concedidos: number; revogados: number; ignorados: number; erros: number }
  divergencias: ReconcileDivergencia[]
  analiseConceder?: { totais: { total: number; semEstudante: number; semMapeamento: number; jaTem: number; ganharia: number }; porProduto: { produto: string; total: number; semEstudante: number; semMapeamento: number; jaTem: number; ganharia: number }[] }
}

/**
 * RECONCILIAÇÃO POR PULL (rede de segurança contra webhook PERDIDO): puxa as assinaturas da API do
 * provedor (fonte da verdade), compara com o estado LOCAL (`simulado_assinaturas`) e reporta/aplica
 * as divergências — inclusive REVOGAÇÕES (reembolso/cancelamento cujo webhook não chegou).
 *
 * SEGURANÇA:
 *  - `dry=true` (padrão de uso) NÃO escreve nada: só devolve o que MUDARIA (quem entraria, quem sairia
 *    e com que nome/e-mail) — para revisão humana antes de aplicar.
 *  - Só considera revogar quando a API retorna EXPLICITAMENTE status ≠ ativo. AUSÊNCIA na página puxada
 *    NÃO revoga (a paginação pode ser parcial/filtrada) — evita tirar acesso por engano.
 *  - Ao aplicar, `aplicarEntitlement` respeita `outraAtivaConcede` e `origem='integracao'` (não mexe em
 *    acesso manual). Idempotente.
 */
export async function reconciliarPull(
  tenantId: string, provider: Provider, opts: { dry: boolean; refs?: string[]; limite?: number },
): Promise<ReconcileResult> {
  const vazio = (extra: Partial<ReconcileResult>): ReconcileResult => ({ ok: false, dry: opts.dry, pull: 0, concederia: 0, revogaria: 0, semMudanca: 0, divergencias: [], ...extra })
  const cfg = await resolverProviderCfg(tenantId, provider)
  if (!cfg) return vazio({ error: 'Provedor sem credenciais/config para este tenant.' })
  const adapter = getAdapter(provider)
  if (!adapter) return vazio({ error: `Provedor "${provider}" não suportado.` })

  let pessoas: PessoaEntitlement[]
  try { pessoas = await adapter.listarPessoas(cfg, opts.refs ?? []) }
  catch (e) { return vazio({ error: (e as Error).message }) }

  const svc = createAdminClient()
  // Estado local por external_id (status + estudante).
  const locais = await fetchAll<{ external_id: string; status: string; estudante_id: string | null }>(() =>
    svc.from('simulado_assinaturas').select('external_id, status, estudante_id').eq('tenant_id', tenantId).eq('provider', provider).order('external_id', { ascending: true }))
  const localPorExt = new Map(locais.map((a) => [a.external_id, a]))

  const divergentes: { pe: PessoaEntitlement; acao: 'conceder' | 'revogar'; statusLocal: string | null; estudanteId: string | null }[] = []
  let concederia = 0, revogaria = 0, semMudanca = 0
  for (const pe of pessoas) {
    const ext = pe.entitlement.externalId
    const apiStatus = pe.entitlement.status
    const local = localPorExt.get(ext)
    const statusLocal = local?.status ?? null
    if (apiStatus === 'ativo' && statusLocal !== 'ativo') { concederia++; divergentes.push({ pe, acao: 'conceder', statusLocal, estudanteId: local?.estudante_id ?? null }) }
    else if (apiStatus !== 'ativo' && statusLocal === 'ativo') { revogaria++; divergentes.push({ pe, acao: 'revogar', statusLocal, estudanteId: local?.estudante_id ?? null }) }
    else semMudanca++
  }

  // Nomes/e-mails dos estudantes afetados (para o relatório humano).
  const estIds = [...new Set(divergentes.map((d) => d.estudanteId).filter(Boolean))] as string[]
  const nomes = new Map<string, { nome: string | null; email: string | null }>()
  if (estIds.length) {
    const ests = await fetchAll<{ id: string; nome: string | null; email: string | null }>(() =>
      svc.from('simulado_estudantes').select('id, nome, email').in('id', estIds).order('id', { ascending: true }))
    for (const e of ests) nomes.set(e.id, { nome: e.nome, email: e.email })
  }

  const limite = opts.limite ?? 200
  const divergencias: ReconcileDivergencia[] = divergentes.slice(0, limite).map((d) => ({
    externalId: d.pe.entitlement.externalId, produtoRef: d.pe.entitlement.produtoRef, produtoNome: d.pe.entitlement.produtoNome ?? null,
    statusApi: d.pe.entitlement.status, statusLocal: d.statusLocal, acao: d.acao,
    estudanteId: d.estudanteId, estudanteNome: d.estudanteId ? (nomes.get(d.estudanteId)?.nome ?? null) : null,
    estudanteEmail: d.estudanteId ? (nomes.get(d.estudanteId)?.email ?? null) : null,
  }))

  if (opts.dry) {
    // Relatório de decisão: dos que "concederia", quantos já têm o acesso vs ganhariam (por produto).
    const pesConceder = divergentes.filter((d) => d.acao === 'conceder').map((d) => d.pe)
    const analiseConceder = await analisarConcederia(svc, tenantId, provider, pesConceder)
    return { ok: true, dry: true, pull: pessoas.length, concederia, revogaria, semMudanca, divergencias, analiseConceder }
  }

  // APLICA só as divergências (idempotente; aplicarEntitlement respeita origem/outraAtiva).
  let concedidos = 0, revogados = 0, ignorados = 0, erros = 0
  for (const d of divergentes) {
    const r = await aplicarEntitlement({ tenantId, provider, pessoa: d.pe.pessoa, entitlement: d.pe.entitlement })
    if (!r.ok) erros++
    else if (r.acao === 'concedido') concedidos++
    else if (r.acao === 'revogado') revogados++
    else ignorados++
  }
  return { ok: true, dry: false, pull: pessoas.length, concederia, revogaria, semMudanca, aplicado: { concedidos, revogados, ignorados, erros }, divergencias }
}

/**
 * PROCESSA UM EVENTO já normalizado (vindo de webhook, §6.2). Aplica o entitlement.
 * A idempotência do evento (dedupe por event_id) é responsabilidade da rota de webhook,
 * que grava em simulado_integracao_eventos ANTES de chamar isto.
 */
export async function processarEvento(tenantId: string, provider: Provider, ev: EventoNormalizado): Promise<ResultadoImport> {
  const r = await aplicarEntitlement({ tenantId, provider, pessoa: ev.pessoa, entitlement: ev.entitlement })
  if (!r.ok) return { ok: false, error: r.error, erros: 1 }
  return {
    ok: true, total: 1,
    concedidos: r.acao === 'concedido' ? 1 : 0,
    revogados: r.acao === 'revogado' ? 1 : 0,
    ignorados: r.acao === 'ignorado' ? 1 : 0,
    erros: 0,
  }
}

/** Lista as fontes (grupos/produtos) de um provedor — para a UI montar a seleção. */
export async function listarFontesProvider(tenantId: string, provider: Provider): Promise<{ ok: boolean; error?: string; fontes?: { ref: string; nome: string; total?: number }[] }> {
  const cfg = await resolverProviderCfg(tenantId, provider)
  if (!cfg) return { ok: false, error: 'Provedor sem credenciais/config.' }
  const adapter = getAdapter(provider)
  if (!adapter) return { ok: false, error: `Provedor "${provider}" não suportado.` }
  try {
    return { ok: true, fontes: await adapter.listarFontes(cfg) }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
