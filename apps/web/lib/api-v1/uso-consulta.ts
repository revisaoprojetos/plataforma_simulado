import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import { sanearBusca } from '@/lib/seguranca/postgrest-safe'
import { formatBrt } from '@/lib/brt'
import { parseUserAgent } from '@/lib/acessos/user-agent'

/** Leitura (SERVIDOR) do uso da API: resumo via RPC `api_uso_resumo` + últimas chamadas paginadas. Sem cálculo no render. */

export interface UsoTotais { chamadas: number; erros: number; barradas: number; p50: number; p95: number }
export interface UsoRecurso { recurso: string; chamadas: number; erros: number; p50: number; p95: number }
export interface UsoChave {
  id: string; nome: string | null; key_prefix: string | null; revogada: boolean
  chamadas: number; barradas: number; erros: number; ultimo_uso_log: string | null; ultimo_uso: string | null
}
export interface UsoResumo { dias: number; totais: UsoTotais; porRecurso: UsoRecurso[]; porChave: UsoChave[]; sugestoes: string[] }

export const DIAS_OPCOES = [7, 30, 90]

function tabelaAusente(err: { code?: string; message?: string } | null | undefined) {
  const m = String(err?.message ?? '')
  return !!err && (err.code === '42P01' || err.code === 'PGRST205' || err.code === 'PGRST202' || /does not exist|Could not find the (table|function)|schema cache/i.test(m))
}

const dFmt = (iso: string | null) => formatBrt(iso)?.slice(0, 10) ?? '—'

/** Regras simples de melhoria — geradas no servidor. */
export function gerarSugestoes(r: Omit<UsoResumo, 'sugestoes'>): string[] {
  const s: string[] = []
  for (const x of r.porRecurso) {
    if (x.chamadas >= 10 && x.p95 > 2000) s.push(`O recurso ${x.recurso} tem p95 de ${x.p95} ms em ${x.chamadas} chamadas: candidato a índice, filtro obrigatório ou visão materializada.`)
  }
  const t = r.totais
  if (t.chamadas > 0 && t.erros / t.chamadas > 0.05) s.push(`Taxa de erro de ${((t.erros / t.chamadas) * 100).toFixed(1)}% no período (${t.erros} de ${t.chamadas} chamadas): confira os recursos com mais erros.`)
  if (t.barradas > 0) s.push(`${t.barradas} chamada(s) foram barradas por limite de uso (120 req/min por chave): oriente o integrador a usar paginação maior (per_page), cache e intervalo entre chamadas.`)
  const agora = Date.now()
  for (const k of r.porChave) {
    const nome = k.nome ?? k.key_prefix ?? k.id.slice(0, 8)
    const ult = k.ultimo_uso_log ?? k.ultimo_uso
    if (!k.revogada && (!ult || agora - new Date(ult).getTime() > 30 * 86_400_000)) s.push(`A chave "${nome}" não é usada há 30 dias ou mais: considere revogá-la.`)
    if (k.revogada && k.chamadas > 0) s.push(`A chave revogada "${nome}" ainda recebeu ${k.chamadas} tentativa(s) de uso (última em ${dFmt(k.ultimo_uso_log)}): avise o integrador para trocar de chave.`)
  }
  return s
}

export async function obterUsoResumo(tenantId: string, dias: number): Promise<{ ok: true; resumo: UsoResumo } | { ok: false; ausente: boolean }> {
  try {
    const { data, error } = await createAdminClient().rpc('api_uso_resumo', { p_tenant: tenantId, p_dias: dias })
    if (error || !data) return { ok: false, ausente: tabelaAusente(error) }
    const d = data as any
    const base = {
      dias: Number(d.dias ?? dias),
      totais: { chamadas: 0, erros: 0, barradas: 0, p50: 0, p95: 0, ...(d.totais ?? {}) } as UsoTotais,
      porRecurso: (d.por_recurso ?? []) as UsoRecurso[],
      porChave: (d.por_chave ?? []) as UsoChave[],
    }
    return { ok: true, resumo: { ...base, sugestoes: gerarSugestoes(base) } }
  } catch { return { ok: false, ausente: false } }
}

export interface UsoLinha {
  id: string; quando: string; chave: string; chaveRevogada: boolean; recurso: string; metodoRota: string
  status: number; barrado: boolean; ms: number; ip: string | null; navegador: string; erro: string | null; requestId: string | null
}

export const ORDENS_ULTIMAS = ['criado_em', 'status', 'duracao_ms', 'recurso'] as const

export async function listarUltimasChamadas(tenantId: string, opts: {
  page: number; perPage: number; q: string; sort: string; dir: 'asc' | 'desc'; filtro: string; chaveId: string
}): Promise<{ rows: UsoLinha[]; total: number }> {
  try {
    const svc = createAdminClient()
    const sort = (ORDENS_ULTIMAS as readonly string[]).includes(opts.sort) ? opts.sort : 'criado_em'
    let q = svc.from('simulado_api_uso')
      .select('id, api_key_id, recurso, metodo, rota, status, duracao_ms, ip, user_agent, barrado_limite, erro, request_id, criado_em', { count: 'exact' })
      .eq('tenant_id', tenantId)
    if (opts.filtro === 'ok') q = q.lt('status', 400)
    else if (opts.filtro === 'erro') q = q.gte('status', 400).eq('barrado_limite', false)
    else if (opts.filtro === 'barrado') q = q.eq('barrado_limite', true)
    if (/^[0-9a-f-]{36}$/i.test(opts.chaveId)) q = q.eq('api_key_id', opts.chaveId)
    const b = sanearBusca(opts.q, 60)
    if (b) q = q.or(`recurso.ilike.%${b}%,ip.ilike.%${b}%,request_id.ilike.%${b}%`)
    const from = (opts.page - 1) * opts.perPage
    const { data, count, error } = await q.order(sort, { ascending: opts.dir === 'asc' }).order('id').range(from, from + opts.perPage - 1)
    if (error) return { rows: [], total: 0 }
    const ids = [...new Set((data ?? []).map((r: any) => r.api_key_id).filter(Boolean))] as string[]
    const nomes = new Map<string, { nome: string; revogada: boolean }>()
    if (ids.length) {
      const { data: ks } = await svc.from('simulado_api_keys').select('id, nome, key_prefix, revogada').eq('tenant_id', tenantId).in('id', ids)
      for (const k of (ks ?? []) as any[]) nomes.set(k.id, { nome: `${k.nome ?? 'Chave'}${k.key_prefix ? ` (${k.key_prefix}…)` : ''}`, revogada: !!k.revogada })
    }
    const rows: UsoLinha[] = (data ?? []).map((r: any) => {
      const ua = parseUserAgent(r.user_agent)
      const k = r.api_key_id ? nomes.get(r.api_key_id) : null
      return {
        id: r.id, quando: formatBrt(r.criado_em) ?? '—',
        chave: k?.nome ?? (r.api_key_id ? 'Chave removida' : 'Chave inválida/ausente'), chaveRevogada: !!k?.revogada,
        recurso: r.recurso, metodoRota: `${r.metodo} ${r.rota ?? r.recurso}`,
        status: r.status, barrado: !!r.barrado_limite, ms: r.duracao_ms, ip: r.ip,
        navegador: ua.navegador !== 'Desconhecido' ? ua.navegador : String(r.user_agent ?? '—').slice(0, 40),
        erro: r.erro, requestId: r.request_id,
      }
    })
    return { rows, total: count ?? 0 }
  } catch { return { rows: [], total: 0 } }
}
