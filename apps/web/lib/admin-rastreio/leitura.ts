import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import { sanearBusca } from '@/lib/seguranca/postgrest-safe'
import { rotuloCargo } from '@/lib/rbac-cargos'
import { rotuloAparelho } from '@/lib/acessos/user-agent'
import { rotuloIp } from '@/lib/acessos/ip'
import { horaBrt, type Alerta } from '@/lib/acessos/alertas'
import { T_SESSOES, T_ATIV } from './registro'

/**
 * LEITURA do rastreio da EQUIPE (admin). Tudo calculado no servidor, SEMPRE com service role real e
 * `.eq('tenant_id', …)`. O chamador (page/rota) faz o accessCan('acessos:view'). Sem a migração aplicada,
 * as funções devolvem `indisponivel: true` (a UI mostra o aviso, sem 500).
 */

export const MSG_NAO_ATIVADO_ADMIN = 'Rastreio da equipe ainda não ativado — aplicar a migração 20261121100000_admin_rastreio.sql.'
/** Heartbeat a cada ~60 s: sem sinal há mais que isto = offline. */
export const ONLINE_MS = 3 * 60_000
const D = 86_400_000

export function tabelaIndisponivel(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false
  return err.code === '42P01' || err.code === 'PGRST205' || /does not exist|Could not find the table|schema cache/i.test(String(err.message ?? ''))
}

export const ROTULO_TIPO_ADMIN: Record<string, string> = {
  pagina_vista: 'Página vista', tempo_pagina: 'Tempo na página', acao_api: 'Ação (API)', login: 'Login', logout: 'Logout',
}
export const TIPOS_ADMIN = ['pagina_vista', 'tempo_pagina', 'acao_api', 'login', 'logout'] as const

export const PERIODOS_ADMIN: Record<string, { label: string; ms: number }> = {
  '24h': { label: 'Últimas 24 horas', ms: D },
  '7d': { label: 'Últimos 7 dias', ms: 7 * D },
  '30d': { label: 'Últimos 30 dias', ms: 30 * D },
  '90d': { label: 'Últimos 90 dias', ms: 90 * D },
}
export const desdePeriodoAdmin = (p: string | undefined, padrao = '7d') => new Date(Date.now() - (PERIODOS_ADMIN[p ?? ''] ?? PERIODOS_ADMIN[padrao]).ms).toISOString()

// ───────────────────────── formatação (servidor) ─────────────────────────

/** "agora", "há 24s", "há 5 min", "há 3 h", "há 2 d". */
export function tempoRelativo(iso: string | null | undefined, agora = Date.now()): string {
  if (!iso) return '—'
  const s = Math.max(0, Math.round((agora - new Date(iso).getTime()) / 1000))
  if (s < 10) return 'agora'
  if (s < 60) return `há ${s}s`
  if (s < 3600) return `há ${Math.floor(s / 60)} min`
  if (s < 86_400) return `há ${Math.floor(s / 3600)} h`
  return `há ${Math.floor(s / 86_400)} d`
}
/** Duração curta: "42s", "5 min", "2 h 10 min". */
export function fmtSeg(s: number | null | undefined): string {
  if (s == null) return '—'
  if (s < 60) return `${Math.round(s)}s`
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60), r = m % 60
  return r ? `${h} h ${r} min` : `${h} h`
}
/** "Chrome · Windows" (sem o tipo de aparelho, como na referência). */
export const aparelhoCurto = (i: { navegador?: string | null; so?: string | null }) => [i.navegador, i.so].filter(Boolean).join(' · ') || 'Desconhecido'

type SessaoRow = {
  id: string; user_id: string; ip: string | null; navegador: string | null; so: string | null; dispositivo: string | null
  rota_atual: string | null; tempo_ativo_seg: number; iniciado_em: string; ultimo_visto_em: string; encerrado_em: string | null; motivo: string | null
}
export const COLS_SESSAO = 'id, user_id, ip, navegador, so, dispositivo, rota_atual, tempo_ativo_seg, iniciado_em, ultimo_visto_em, encerrado_em, motivo'
export const sessaoOnline = (s: { encerrado_em: string | null; ultimo_visto_em: string }, agora: number) => !s.encerrado_em && agora - new Date(s.ultimo_visto_em).getTime() <= ONLINE_MS

// ───────────────────────── identidade (nome/e-mail) ─────────────────────────

async function perfis(userIds: string[]): Promise<Map<string, { nome: string | null; email: string | null }>> {
  const svc = createAdminClient()
  const out = new Map<string, { nome: string | null; email: string | null }>()
  for (let i = 0; i < userIds.length; i += 80) {
    const { data } = await svc.from('simulado_users').select('id, nome, email').in('id', userIds.slice(i, i + 80))
    for (const u of (data ?? []) as { id: string; nome: string | null; email: string | null }[]) out.set(u.id, { nome: u.nome ?? null, email: u.email ?? null })
  }
  // Quem não está em simulado_users: busca no Auth (poucos; limite 40).
  await Promise.all(userIds.filter((id) => !out.has(id)).slice(0, 40).map(async (id) => {
    try {
      const { data } = await svc.auth.admin.getUserById(id)
      const u = data?.user
      if (u) out.set(id, { nome: ((u.user_metadata as Record<string, unknown> | undefined)?.nome as string) ?? ((u.user_metadata as Record<string, unknown> | undefined)?.full_name as string) ?? null, email: u.email ?? null })
    } catch { /* identidade é opcional */ }
  }))
  return out
}

// ───────────────────────── Equipe online ─────────────────────────

export interface EquipeLinha {
  userId: string; nome: string | null; email: string | null; papel: string; voce: boolean
  online: boolean; sessoes: number; paginas: string[]; conectadoHa: string; tempoAtivo: string; ultimaAtividade: string; ultimaIso: string | null; dispositivos: string[]
}
export interface FiltroEquipe { page: number; pp: number; sort: string; dir: 'asc' | 'desc'; q: string; status?: string; papel?: string }
export interface ResumoEquipe { online: number; total: number; sessoesAtivas: number }

async function sessoesRecentes(tenantId: string, desde: string): Promise<{ indisponivel: boolean; rows: SessaoRow[] }> {
  const svc = createAdminClient()
  const rows: SessaoRow[] = []
  for (let i = 0; i < 4; i++) {
    const { data, error } = await svc.from(T_SESSOES).select(COLS_SESSAO).eq('tenant_id', tenantId).gte('ultimo_visto_em', desde)
      .order('ultimo_visto_em', { ascending: false }).order('id').range(i * 1000, i * 1000 + 999)
    if (tabelaIndisponivel(error)) return { indisponivel: true, rows: [] }
    rows.push(...((data ?? []) as unknown as SessaoRow[]))
    if ((data ?? []).length < 1000) break
  }
  return { indisponivel: false, rows }
}

/** Painel "Equipe online": 1 linha por admin, agregada no servidor; filtro/ordenação/paginação aplicados aqui. */
export async function listarEquipe(tenantId: string, voceId: string | null, f: FiltroEquipe) {
  const svc = createAdminClient()
  const agora = Date.now()
  const [ses, ac] = await Promise.all([
    sessoesRecentes(tenantId, new Date(agora - 7 * D).toISOString()),
    svc.from('simulado_tenant_acessos').select('user_id, role').eq('tenant_id', tenantId).eq('ativo', true).neq('role', 'estudante').range(0, 999),
  ])
  if (ses.indisponivel) return { indisponivel: true, rows: [] as EquipeLinha[], total: 0, resumo: { online: 0, total: 0, sessoesAtivas: 0 } as ResumoEquipe, papeis: [] as string[] }

  const papelDe = new Map<string, string>()
  for (const a of (ac.data ?? []) as { user_id: string; role: string }[]) papelDe.set(a.user_id, a.role)
  const porUser = new Map<string, SessaoRow[]>()
  for (const s of ses.rows) { const l = porUser.get(s.user_id) ?? []; l.push(s); porUser.set(s.user_id, l) }
  const ids = [...new Set([...papelDe.keys(), ...porUser.keys()])]
  const nomes = await perfis(ids)

  const todas: EquipeLinha[] = ids.map((uid) => {
    const ss = porUser.get(uid) ?? []
    const ativas = ss.filter((s) => sessaoOnline(s, agora))
    const ultima = ss.reduce<string | null>((m, s) => (!m || s.ultimo_visto_em > m ? s.ultimo_visto_em : m), null)
    const paginas = [...new Set(ativas.map((s) => s.rota_atual).filter((x): x is string => !!x))]
    const inicioMin = ativas.reduce<string | null>((m, s) => (!m || s.iniciado_em < m ? s.iniciado_em : m), null)
    const tempo = ss.filter((s) => agora - new Date(s.iniciado_em).getTime() <= D).reduce((t, s) => t + (s.tempo_ativo_seg ?? 0), 0)
    const alvo = ativas.length ? ativas : ss.slice(0, 1)
    const papel = papelDe.get(uid)
    const p = nomes.get(uid)
    return {
      userId: uid, nome: p?.nome ?? null, email: p?.email ?? null, papel: papel ? rotuloCargo(papel) : 'Super Admin', voce: uid === voceId,
      online: ativas.length > 0, sessoes: ativas.length, paginas,
      conectadoHa: inicioMin ? tempoRelativo(inicioMin, agora).replace(/^há /, '') : '—',
      tempoAtivo: ss.length ? fmtSeg(tempo) : '—',
      ultimaAtividade: ultima ? tempoRelativo(ultima, agora) : 'sem registro', ultimaIso: ultima,
      dispositivos: [...new Set(alvo.map((s) => aparelhoCurto(s)))],
    }
  })

  const resumo: ResumoEquipe = { online: todas.filter((l) => l.online).length, total: todas.length, sessoesAtivas: todas.reduce((n, l) => n + l.sessoes, 0) }
  const papeis = [...new Set(todas.map((l) => l.papel))].sort((a, b) => a.localeCompare(b, 'pt-BR'))

  const termo = sanearBusca(f.q).trim().toLowerCase()
  let lista = todas
  if (termo) lista = lista.filter((l) => `${l.nome ?? ''} ${l.email ?? ''} ${l.paginas.join(' ')}`.toLowerCase().includes(termo))
  if (f.status === 'online') lista = lista.filter((l) => l.online)
  else if (f.status === 'offline') lista = lista.filter((l) => !l.online)
  if (f.papel) lista = lista.filter((l) => l.papel === f.papel)

  const dir = f.dir === 'asc' ? 1 : -1
  const chave: Record<string, (l: EquipeLinha) => string | number> = {
    usuario: (l) => (l.nome ?? l.email ?? '').toLowerCase(), papel: (l) => l.papel, status: (l) => Number(l.online), sessoes: (l) => l.sessoes,
    ultima: (l) => (l.ultimaIso ? new Date(l.ultimaIso).getTime() : 0),
  }
  const k = chave[f.sort] ?? chave.ultima
  lista = [...lista].sort((a, b) => {
    // Online primeiro quando ordena pela última atividade (default).
    const va = k(a), vb = k(b)
    const c = typeof va === 'string' ? va.localeCompare(String(vb), 'pt-BR') : (va as number) - (vb as number)
    return c * dir || Number(b.online) - Number(a.online)
  })
  const total = lista.length
  return { indisponivel: false, rows: lista.slice((f.page - 1) * f.pp, f.page * f.pp), total, resumo, papeis }
}

// ───────────────────────── Ficha do admin ─────────────────────────

export interface ResumoMembro {
  nome: string | null; email: string | null; papel: string | null; online: boolean
  ultimoAcesso: string | null; sessoes7d: number; sessoes30d: number; ipsDistintos30d: number; aparelhosDistintos30d: number
  tempoAtivoSeg30d: number; sessoesAtivas: number; alertas: Alerta[]
}

export async function resumoMembro(tenantId: string, userId: string): Promise<{ indisponivel: boolean; resumo: ResumoMembro | null }> {
  const svc = createAdminClient()
  const agora = Date.now()
  const [rs, ac, pf] = await Promise.all([
    svc.from(T_SESSOES).select(COLS_SESSAO).eq('tenant_id', tenantId).eq('user_id', userId).gte('iniciado_em', new Date(agora - 90 * D).toISOString())
      .order('iniciado_em', { ascending: false }).range(0, 599),
    svc.from('simulado_tenant_acessos').select('role').eq('tenant_id', tenantId).eq('user_id', userId).maybeSingle(),
    perfis([userId]),
  ])
  if (tabelaIndisponivel(rs.error)) return { indisponivel: true, resumo: null }
  const rows = (rs.data ?? []) as unknown as SessaoRow[]
  const r30 = rows.filter((r) => agora - new Date(r.iniciado_em).getTime() <= 30 * D)
  const r7 = r30.filter((r) => agora - new Date(r.iniciado_em).getTime() <= 7 * D)
  const alertas = calcularAlertasAdmin(rows, agora)
  const role = (ac.data as { role?: string } | null)?.role
  return {
    indisponivel: false,
    resumo: {
      nome: pf.get(userId)?.nome ?? null, email: pf.get(userId)?.email ?? null, papel: role ? rotuloCargo(role) : null,
      online: rows.some((r) => sessaoOnline(r, agora)),
      ultimoAcesso: rows[0]?.ultimo_visto_em ?? null, sessoes7d: r7.length, sessoes30d: r30.length,
      ipsDistintos30d: new Set(r30.map((r) => rotuloIp(r.ip)).filter((x) => x !== '—')).size,
      aparelhosDistintos30d: new Set(r30.map((r) => `${r.so}|${r.dispositivo}|${r.navegador}`)).size,
      tempoAtivoSeg30d: r30.reduce((s, r) => s + Math.min(12 * 3600, Math.max(r.tempo_ativo_seg ?? 0, Math.round((new Date(r.ultimo_visto_em).getTime() - new Date(r.iniciado_em).getTime()) / 1000))), 0),
      sessoesAtivas: rows.filter((r) => sessaoOnline(r, agora)).length, alertas,
    },
  }
}

/** Alertas p/ a equipe (heurísticas de triagem, não prova): IP novo, muitos IPs em 24 h, horário incomum (madrugada BRT). */
export function calcularAlertasAdmin(rows: Pick<SessaoRow, 'ip' | 'iniciado_em'>[], agora = Date.now()): Alerta[] {
  const out: Alerta[] = []
  const ordenadas = [...rows].sort((a, b) => (a.iniciado_em < b.iniciado_em ? 1 : -1))
  const ult = ordenadas[0]
  if (ult?.ip && agora - new Date(ult.iniciado_em).getTime() <= 24 * 3_600_000) {
    const antes = ordenadas.slice(1).filter((r) => r.ip)
    if (antes.length >= 3 && !antes.some((r) => r.ip === ult.ip)) {
      out.push({ codigo: 'ip_novo', nivel: 'medio', titulo: 'Acesso de um IP nunca usado antes', explicacao: `A sessão mais recente veio de ${ult.ip}, que não aparece nas ${antes.length} sessões anteriores (90 dias). Pode ser rede nova (casa, 4G, VPN) — confirme com a pessoa se não for esperado.` })
    }
  }
  const ips24 = new Set(ordenadas.filter((r) => r.ip && agora - new Date(r.iniciado_em).getTime() <= 24 * 3_600_000).map((r) => r.ip))
  if (ips24.size >= 4) {
    out.push({ codigo: 'ips_24h', nivel: ips24.size >= 6 ? 'alto' : 'medio', titulo: `${ips24.size} IPs diferentes em 24 horas`, explicacao: 'Muitos endereços distintos em um dia podem indicar compartilhamento de credencial, mas também redes móveis/VPN.' })
  }
  const madrugada = ordenadas.filter((r) => agora - new Date(r.iniciado_em).getTime() <= 7 * D && horaBrt(r.iniciado_em) < 5)
  if (madrugada.length >= 2) {
    out.push({ codigo: 'horario_incomum', nivel: 'baixo', titulo: `${madrugada.length} sessões na madrugada (0h–5h, BRT) nos últimos 7 dias`, explicacao: 'Horário fora do padrão de trabalho. Só é relevante se não for esperado para esta pessoa.' })
  }
  return out
}

export interface AtividadeAdminRow {
  id: string; sessao_id: string | null; tipo: string; rota: string | null; rota_api: string | null; metodo: string | null
  status: number | null; duracao_seg: number | null; ip: string | null; request_id: string | null; meta: Record<string, unknown> | null; criado_em: string
}
const COLS_ATIV = 'id, sessao_id, tipo, rota, rota_api, metodo, status, duracao_seg, ip, request_id, meta, criado_em'

export interface FiltroAtivAdmin { page: number; pp: number; sort: string; dir: 'asc' | 'desc'; q: string; periodo?: string; tipo?: string }

export async function listarAtividadesMembro(tenantId: string, userId: string, f: FiltroAtivAdmin) {
  const sort = f.sort === 'tipo' || f.sort === 'ip' || f.sort === 'rota' ? f.sort : 'criado_em'
  let q = createAdminClient().from(T_ATIV).select(COLS_ATIV, { count: 'exact' }).eq('tenant_id', tenantId).eq('user_id', userId).gte('criado_em', desdePeriodoAdmin(f.periodo, '7d'))
  if (f.tipo && (TIPOS_ADMIN as readonly string[]).includes(f.tipo)) q = q.eq('tipo', f.tipo)
  const t = sanearBusca(f.q).trim()
  if (t) q = q.or(`rota.ilike.%${t}%,rota_api.ilike.%${t}%,ip.ilike.%${t}%,request_id.ilike.%${t}%`)
  const { data, count, error } = await q.order(sort, { ascending: f.dir === 'asc' }).order('id').range((f.page - 1) * f.pp, f.page * f.pp - 1)
  if (tabelaIndisponivel(error)) return { indisponivel: true, rows: [] as AtividadeAdminRow[], total: 0 }
  return { indisponivel: false, rows: (data ?? []) as unknown as AtividadeAdminRow[], total: count ?? 0 }
}

export interface FiltroSessAdmin { page: number; pp: number; sort: string; dir: 'asc' | 'desc'; q: string; periodo?: string }
export async function listarSessoesMembro(tenantId: string, userId: string, f: FiltroSessAdmin) {
  const sort = ['iniciado_em', 'ultimo_visto_em', 'ip'].includes(f.sort) ? f.sort : 'iniciado_em'
  let q = createAdminClient().from(T_SESSOES).select(COLS_SESSAO, { count: 'exact' }).eq('tenant_id', tenantId).eq('user_id', userId).gte('iniciado_em', desdePeriodoAdmin(f.periodo, '30d'))
  const t = sanearBusca(f.q).trim()
  if (t) q = q.or(`ip.ilike.%${t}%,navegador.ilike.%${t}%,so.ilike.%${t}%`)
  const { data, count, error } = await q.order(sort, { ascending: f.dir === 'asc' }).order('id').range((f.page - 1) * f.pp, f.page * f.pp - 1)
  if (tabelaIndisponivel(error)) return { indisponivel: true, rows: [] as SessaoRow[], total: 0 }
  return { indisponivel: false, rows: (data ?? []) as unknown as SessaoRow[], total: count ?? 0 }
}

export type { SessaoRow }
export { rotuloAparelho }

/** CSV do membro (limite duro 5000 de cada). */
export async function membroParaCsv(tenantId: string, userId: string) {
  const svc = createAdminClient()
  const sessoes: SessaoRow[] = []
  const atividades: AtividadeAdminRow[] = []
  for (let i = 0; i < 5; i++) {
    const { data, error } = await svc.from(T_SESSOES).select(COLS_SESSAO).eq('tenant_id', tenantId).eq('user_id', userId).order('iniciado_em', { ascending: false }).order('id').range(i * 1000, i * 1000 + 999)
    if (tabelaIndisponivel(error)) return { indisponivel: true, sessoes, atividades }
    sessoes.push(...((data ?? []) as unknown as SessaoRow[]))
    if ((data ?? []).length < 1000) break
  }
  for (let i = 0; i < 5; i++) {
    const { data } = await svc.from(T_ATIV).select(COLS_ATIV).eq('tenant_id', tenantId).eq('user_id', userId).order('criado_em', { ascending: false }).order('id').range(i * 1000, i * 1000 + 999)
    atividades.push(...((data ?? []) as unknown as AtividadeAdminRow[]))
    if ((data ?? []).length < 1000) break
  }
  return { indisponivel: false, sessoes, atividades }
}

/** sessao_id → "Chrome · Windows" (só dos ids da página atual, ≤ 100). */
export async function aparelhosPorSessao(tenantId: string, ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const uniq = [...new Set(ids.filter(Boolean))].slice(0, 100)
  if (!uniq.length) return out
  const { data } = await createAdminClient().from(T_SESSOES).select('id, navegador, so').eq('tenant_id', tenantId).in('id', uniq)
  for (const s of (data ?? []) as { id: string; navegador: string | null; so: string | null }[]) out.set(s.id, aparelhoCurto(s))
  return out
}
