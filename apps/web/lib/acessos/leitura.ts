import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import { remember } from '@/lib/cache/relatorio-cache'
import { calcularAlertas, sessaoAtiva, JANELA_ATIVA_MS, type Alerta, type AcessoMin } from './alertas'

/**
 * LEITURA do registro de acessos (admin). Tudo calculado no servidor, SEMPRE com service role real
 * (createAdminClient) e `.eq('tenant_id', …)`. O chamador (page/rota/ação) é quem faz o checkPermission.
 * Sem a migração aplicada, as funções devolvem `indisponivel: true` (a UI mostra o aviso, sem 500).
 */

export const T_ACESSOS = 'simulado_aluno_acessos'
export const T_ATIV = 'simulado_aluno_atividades'
const MIN = 60_000
const H = 3_600_000
const D = 86_400_000

export type AcessoRow = AcessoMin & {
  tenant_id: string
  estudante_id: string
  metodo: string
  origem: string
  user_agent?: string | null
  motivo_encerramento: string | null
}
export type AtividadeRow = {
  id: string; estudante_id: string; acesso_id: string | null; tipo: string; ref_tipo: string | null; ref_id: string | null
  titulo: string | null; meta: Record<string, unknown> | null; ip: string | null; criado_em: string
}

const COLS_ACESSO = 'id, tenant_id, estudante_id, metodo, ip, navegador, so, dispositivo, origem, iniciado_em, ultimo_visto_em, encerrado_em, motivo_encerramento, impersonado_por'

export function tabelaIndisponivel(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false
  return err.code === '42P01' || err.code === 'PGRST205' || /does not exist|Could not find the table|schema cache/i.test(String(err.message ?? ''))
}

export const MSG_NAO_ATIVADO = 'Registro de acessos ainda não ativado — aplicar a migração 20261118010000_aluno_registro_acessos.sql.'

export const METODOS = ['senha', 'email', 'email_cpf', 'email_telefone', 'otp', 'curseduca', 'impersonacao', 'outro'] as const
export const ROTULO_METODO: Record<string, string> = {
  senha: 'Senha', email: 'E-mail', email_cpf: 'E-mail + CPF', email_telefone: 'E-mail + telefone', otp: 'Código (OTP)',
  curseduca: 'Curseduca', impersonacao: 'Visualização (admin)', outro: 'Outro',
}
export const ROTULO_ORIGEM: Record<string, string> = { portal: 'Portal', embed: 'Simulado embutido', 'curseduca-iframe': 'Curseduca (iframe)' }
export const TIPOS_ATIVIDADE = [
  'leitura_aberta', 'leitura_concluida', 'grifo_criado', 'grifo_removido', 'nota_editada', 'quiz_tentativa',
  'simulado_iniciado', 'simulado_finalizado', 'jogo_progresso', 'pagina_vista', 'outro',
] as const
export const ROTULO_ATIVIDADE: Record<string, string> = {
  leitura_aberta: 'Leitura', leitura_concluida: 'Leitura concluída', grifo_criado: 'Grifo criado', grifo_removido: 'Grifo removido',
  nota_editada: 'Nota editada', quiz_tentativa: 'Quiz respondido', simulado_iniciado: 'Simulado iniciado', simulado_finalizado: 'Simulado finalizado',
  jogo_progresso: 'Jogo (progresso)', pagina_vista: 'Página vista', outro: 'Outro',
}

export const PERIODOS: Record<string, { label: string; ms: number }> = {
  '24h': { label: 'Últimas 24 horas', ms: D },
  '7d': { label: 'Últimos 7 dias', ms: 7 * D },
  '30d': { label: 'Últimos 30 dias', ms: 30 * D },
  '90d': { label: 'Últimos 90 dias', ms: 90 * D },
  '180d': { label: 'Últimos 180 dias', ms: 180 * D },
}
export const desdePeriodo = (p: string | undefined, padrao = '30d') => new Date(Date.now() - (PERIODOS[p ?? ''] ?? PERIODOS[padrao]).ms).toISOString()

export function duracaoMin(a: { iniciado_em: string; ultimo_visto_em: string }): number {
  return Math.max(0, Math.round((new Date(a.ultimo_visto_em).getTime() - new Date(a.iniciado_em).getTime()) / MIN))
}
export function fmtDuracao(min: number): string {
  if (min < 1) return '< 1 min'
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60), m = min % 60
  return m ? `${h} h ${m} min` : `${h} h`
}

export type StatusSessao = 'ativa' | 'inativa' | 'encerrada'
export function statusSessao(a: { encerrado_em: string | null; ultimo_visto_em: string }, agora = Date.now()): StatusSessao {
  if (a.encerrado_em) return 'encerrada'
  return sessaoAtiva(a, agora) ? 'ativa' : 'inativa'
}

// ─────────────────────────── ficha do aluno ───────────────────────────

export interface ResumoAluno {
  ultimoAcesso: string | null
  sessoes7d: number
  sessoes30d: number
  ipsDistintos30d: number
  aparelhosDistintos30d: number
  tempoTotalMin30d: number
  sessoesAtivas: number
  alertas: Alerta[]
}

/** Resumo + alertas do aluno (sessões dos últimos 90 dias, até 600). */
export async function resumoAluno(tenantId: string, estudanteId: string): Promise<{ indisponivel: boolean; resumo: ResumoAluno | null }> {
  const svc = createAdminClient()
  const desde90 = new Date(Date.now() - 90 * D).toISOString()
  const [ra, rv] = await Promise.all([
    svc.from(T_ACESSOS).select(COLS_ACESSO).eq('tenant_id', tenantId).eq('estudante_id', estudanteId).gte('iniciado_em', desde90)
      .order('iniciado_em', { ascending: false }).range(0, 599),
    svc.from(T_ATIV).select('tipo, criado_em, meta').eq('tenant_id', tenantId).eq('estudante_id', estudanteId).eq('tipo', 'grifo_criado')
      .gte('criado_em', new Date(Date.now() - 30 * D).toISOString()).order('criado_em', { ascending: false }).range(0, 199),
  ])
  if (tabelaIndisponivel(ra.error)) return { indisponivel: true, resumo: null }
  const rows = (ra.data ?? []) as unknown as AcessoRow[]
  const agora = Date.now()
  const reais = rows.filter((r) => !r.impersonado_por)
  const r30 = reais.filter((r) => agora - new Date(r.iniciado_em).getTime() <= 30 * D)
  const r7 = r30.filter((r) => agora - new Date(r.iniciado_em).getTime() <= 7 * D)
  const alertas = calcularAlertas(rows, ((rv.data ?? []) as { tipo: string; criado_em: string; meta: Record<string, unknown> | null }[]), agora)
  return {
    indisponivel: false,
    resumo: {
      ultimoAcesso: reais[0]?.ultimo_visto_em ?? null,
      sessoes7d: r7.length,
      sessoes30d: r30.length,
      ipsDistintos30d: new Set(r30.map((r) => r.ip).filter(Boolean)).size,
      aparelhosDistintos30d: new Set(r30.map((r) => `${r.so}|${r.dispositivo}|${r.navegador}`)).size,
      tempoTotalMin30d: r30.reduce((s, r) => s + Math.min(duracaoMin(r), 12 * 60), 0),
      sessoesAtivas: reais.filter((r) => sessaoAtiva(r, agora)).length,
      alertas,
    },
  }
}

export interface FiltroSessoes { page: number; pp: number; sort: string; dir: 'asc' | 'desc'; q: string; periodo?: string; metodo?: string }
const SORT_SESSOES = new Set(['iniciado_em', 'ultimo_visto_em', 'ip', 'metodo', 'origem'])

export async function listarSessoesAluno(tenantId: string, estudanteId: string, f: FiltroSessoes) {
  const svc = createAdminClient()
  const sort = SORT_SESSOES.has(f.sort) ? f.sort : 'iniciado_em'
  let q = svc.from(T_ACESSOS).select(COLS_ACESSO, { count: 'exact' }).eq('tenant_id', tenantId).eq('estudante_id', estudanteId)
    .gte('iniciado_em', desdePeriodo(f.periodo, '180d'))
  if (f.metodo && (METODOS as readonly string[]).includes(f.metodo)) q = q.eq('metodo', f.metodo)
  if (f.q) q = q.or(`ip.ilike.%${f.q.replace(/[,()%]/g, '')}%,navegador.ilike.%${f.q.replace(/[,()%]/g, '')}%,so.ilike.%${f.q.replace(/[,()%]/g, '')}%`)
  const { data, count, error } = await q.order(sort, { ascending: f.dir === 'asc' }).order('id').range((f.page - 1) * f.pp, f.page * f.pp - 1)
  if (tabelaIndisponivel(error)) return { indisponivel: true, rows: [] as AcessoRow[], total: 0 }
  return { indisponivel: false, rows: (data ?? []) as unknown as AcessoRow[], total: count ?? 0 }
}

export interface FiltroAtividades { page: number; pp: number; sort: string; dir: 'asc' | 'desc'; q: string; periodo?: string; tipo?: string }

export async function listarAtividadesAluno(tenantId: string, estudanteId: string, f: FiltroAtividades) {
  const svc = createAdminClient()
  const sort = f.sort === 'tipo' || f.sort === 'ip' ? f.sort : 'criado_em'
  let q = svc.from(T_ATIV).select('id, estudante_id, acesso_id, tipo, ref_tipo, ref_id, titulo, meta, ip, criado_em', { count: 'exact' })
    .eq('tenant_id', tenantId).eq('estudante_id', estudanteId).gte('criado_em', desdePeriodo(f.periodo, '30d'))
  if (f.tipo && (TIPOS_ATIVIDADE as readonly string[]).includes(f.tipo)) q = q.eq('tipo', f.tipo)
  if (f.q) q = q.or(`titulo.ilike.%${f.q.replace(/[,()%]/g, '')}%,ip.ilike.%${f.q.replace(/[,()%]/g, '')}%`)
  const { data, count, error } = await q.order(sort, { ascending: f.dir === 'asc' }).order('id').range((f.page - 1) * f.pp, f.page * f.pp - 1)
  if (tabelaIndisponivel(error)) return { indisponivel: true, rows: [] as (AtividadeRow & { itemTitulo: string | null })[], total: 0 }
  const rows = (data ?? []) as unknown as AtividadeRow[]
  const titulos = await resolverTitulos(tenantId, rows)
  return { indisponivel: false, rows: rows.map((r) => ({ ...r, itemTitulo: r.titulo ?? titulos.get(`${r.ref_tipo}:${r.ref_id}`) ?? null })), total: count ?? 0 }
}

/** Resolve o título legível dos itens (só da página atual, ≤ 50 ids por tabela). */
async function resolverTitulos(tenantId: string, rows: AtividadeRow[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const svc = createAdminClient()
  const grupos: [string, string, string][] = [
    ['leitura_doc', 'simulado_documentos', 'titulo'],
    ['conteudo_doc', 'simulado_conteudo_documentos', 'titulo'],
    ['simulado', 'simulado_simulados', 'titulo'],
  ]
  await Promise.all(grupos.map(async ([ref, tabela, col]) => {
    const ids = [...new Set(rows.filter((r) => r.ref_tipo === ref && r.ref_id && !r.titulo).map((r) => r.ref_id as string))].slice(0, 80)
    if (!ids.length) return
    try {
      const { data } = await svc.from(tabela).select(`id, ${col}`).eq('tenant_id', tenantId).in('id', ids)
      for (const d of (data ?? []) as unknown as Record<string, string>[]) out.set(`${ref}:${d.id}`, d[col])
    } catch { /* título é opcional */ }
  }))
  return out
}

/** Linhas do CSV do aluno (limite duro 5000; paginado em blocos de 1000). */
export async function sessoesParaCsv(tenantId: string, estudanteId: string) {
  const svc = createAdminClient()
  const acessos: AcessoRow[] = []
  const atividades: AtividadeRow[] = []
  for (let i = 0; i < 5; i++) {
    const { data, error } = await svc.from(T_ACESSOS).select(COLS_ACESSO + ', user_agent').eq('tenant_id', tenantId).eq('estudante_id', estudanteId)
      .order('iniciado_em', { ascending: false }).order('id').range(i * 1000, i * 1000 + 999)
    if (tabelaIndisponivel(error)) return { indisponivel: true, acessos, atividades }
    acessos.push(...((data ?? []) as unknown as AcessoRow[]))
    if ((data ?? []).length < 1000) break
  }
  for (let i = 0; i < 5; i++) {
    const { data } = await svc.from(T_ATIV).select('id, estudante_id, acesso_id, tipo, ref_tipo, ref_id, titulo, meta, ip, criado_em').eq('tenant_id', tenantId).eq('estudante_id', estudanteId)
      .order('criado_em', { ascending: false }).order('id').range(i * 1000, i * 1000 + 999)
    atividades.push(...((data ?? []) as unknown as AtividadeRow[]))
    if ((data ?? []).length < 1000) break
  }
  return { indisponivel: false, acessos, atividades }
}

// ─────────────────────────── painel global ───────────────────────────

export interface ResumoGlobal { sessoesAtivas: number; sessoes24h: number; ips24h: number; alunosComAlerta: number; alertaIds: string[]; alertasPorAluno: Record<string, string[]> }

/**
 * Contadores do painel + alunos com alerta. Varre as sessões dos últimos 7 dias (teto 6000) agrupadas por aluno e
 * aplica as MESMAS regras da ficha. Cache de 2 min por tenant (backend-first).
 */
export async function resumoGlobal(tenantId: string): Promise<{ indisponivel: boolean; resumo: ResumoGlobal | null }> {
  const r = await remember(`acessos-global:${tenantId}`, 120, async () => {
    const svc = createAdminClient()
    const agora = Date.now()
    const desde7 = new Date(agora - 7 * D).toISOString()
    const rows: AcessoRow[] = []
    for (let i = 0; i < 6; i++) {
      const { data, error } = await svc.from(T_ACESSOS).select(COLS_ACESSO).eq('tenant_id', tenantId).gte('iniciado_em', desde7)
        .order('iniciado_em', { ascending: false }).order('id').range(i * 1000, i * 1000 + 999)
      if (tabelaIndisponivel(error)) return { indisponivel: true, resumo: null as ResumoGlobal | null }
      rows.push(...((data ?? []) as unknown as AcessoRow[]))
      if ((data ?? []).length < 1000) break
    }
    const { data: rajadas } = await svc.from(T_ATIV).select('estudante_id, tipo, criado_em, meta').eq('tenant_id', tenantId).eq('tipo', 'grifo_criado')
      .gte('criado_em', desde7).filter('meta->>rajada', 'eq', 'true').range(0, 999)
    const porAluno = new Map<string, AcessoRow[]>()
    for (const a of rows) { const l = porAluno.get(a.estudante_id) ?? []; l.push(a); porAluno.set(a.estudante_id, l) }
    const rajPorAluno = new Map<string, { tipo: string; criado_em: string; meta: Record<string, unknown> | null }[]>()
    for (const x of (rajadas ?? []) as { estudante_id: string; tipo: string; criado_em: string; meta: Record<string, unknown> | null }[]) {
      const l = rajPorAluno.get(x.estudante_id) ?? []; l.push(x); rajPorAluno.set(x.estudante_id, l)
    }
    const alertasPorAluno: Record<string, string[]> = {}
    for (const id of new Set([...porAluno.keys(), ...rajPorAluno.keys()])) {
      const al = calcularAlertas(porAluno.get(id) ?? [], rajPorAluno.get(id) ?? [], agora).filter((a) => a.nivel !== 'baixo')
      if (al.length) alertasPorAluno[id] = al.map((a) => a.codigo)
    }
    const reais = rows.filter((a) => !a.impersonado_por)
    const r24 = reais.filter((a) => agora - new Date(a.iniciado_em).getTime() <= D)
    const resumo: ResumoGlobal = {
      sessoesAtivas: reais.filter((a) => sessaoAtiva(a, agora)).length,
      sessoes24h: r24.length,
      ips24h: new Set(r24.map((a) => a.ip).filter(Boolean)).size,
      alunosComAlerta: Object.keys(alertasPorAluno).length,
      alertaIds: Object.keys(alertasPorAluno).slice(0, 300),
      alertasPorAluno,
    }
    return { indisponivel: false, resumo }
  })
  return r
}

export interface FiltroGlobal {
  page: number; pp: number; sort: string; dir: 'asc' | 'desc'; q: string
  ip?: string; periodo?: string; metodo?: string; dispositivo?: string; alerta?: boolean; ativas?: boolean
  alertaIds?: string[]
}

export async function listarAcessosGlobal(tenantId: string, f: FiltroGlobal) {
  const svc = createAdminClient()
  const sort = SORT_SESSOES.has(f.sort) ? f.sort : 'iniciado_em'
  let q = svc.from(T_ACESSOS).select(COLS_ACESSO, { count: 'exact' }).eq('tenant_id', tenantId).gte('iniciado_em', desdePeriodo(f.periodo, '7d'))
  if (f.ip) q = q.eq('ip', f.ip)
  if (f.metodo && (METODOS as readonly string[]).includes(f.metodo)) q = q.eq('metodo', f.metodo)
  if (f.dispositivo && ['desktop', 'celular', 'tablet'].includes(f.dispositivo)) q = q.eq('dispositivo', f.dispositivo)
  if (f.ativas) q = q.is('encerrado_em', null).gte('ultimo_visto_em', new Date(Date.now() - JANELA_ATIVA_MS).toISOString())
  if (f.alerta) q = q.in('estudante_id', f.alertaIds?.length ? f.alertaIds : ['00000000-0000-0000-0000-000000000000'])

  // Busca livre: IP (prefixo) ou aluno (nome/e-mail → ids).
  const termo = f.q.replace(/[,()%]/g, '').trim()
  if (termo) {
    if (/^[0-9a-f:.]+$/i.test(termo) && /[.:]/.test(termo)) q = q.ilike('ip', `${termo}%`)
    else {
      const { data: ests } = await svc.from('simulado_estudantes').select('id').eq('tenant_id', tenantId).eq('deletado', false)
        .or(`nome.ilike.%${termo}%,email.ilike.%${termo}%`).limit(80)
      const ids = (ests ?? []).map((e: { id: string }) => e.id)
      q = q.in('estudante_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000'])
    }
  }
  const { data, count, error } = await q.order(sort, { ascending: f.dir === 'asc' }).order('id').range((f.page - 1) * f.pp, f.page * f.pp - 1)
  if (tabelaIndisponivel(error)) return { indisponivel: true, rows: [] as (AcessoRow & { nome: string | null; email: string | null })[], total: 0 }
  const rows = (data ?? []) as unknown as AcessoRow[]
  const ids = [...new Set(rows.map((r) => r.estudante_id))]
  const nomes = new Map<string, { nome: string | null; email: string | null }>()
  if (ids.length) {
    const { data: es } = await svc.from('simulado_estudantes').select('id, nome, email').eq('tenant_id', tenantId).in('id', ids)
    for (const e of (es ?? []) as { id: string; nome: string | null; email: string | null }[]) nomes.set(e.id, { nome: e.nome, email: e.email })
  }
  return { indisponivel: false, rows: rows.map((r) => ({ ...r, nome: nomes.get(r.estudante_id)?.nome ?? null, email: nomes.get(r.estudante_id)?.email ?? null })), total: count ?? 0 }
}

/** Contas que usaram um IP (últimos 90 dias), agregadas no servidor. */
export async function contasPorIp(tenantId: string, ip: string) {
  const svc = createAdminClient()
  const { data, error } = await svc.from(T_ACESSOS).select('estudante_id, iniciado_em, impersonado_por').eq('tenant_id', tenantId).eq('ip', ip)
    .gte('iniciado_em', new Date(Date.now() - 90 * D).toISOString()).order('iniciado_em', { ascending: false }).range(0, 999)
  if (tabelaIndisponivel(error)) return []
  const agg = new Map<string, { sessoes: number; ultimo: string }>()
  for (const r of (data ?? []) as { estudante_id: string; iniciado_em: string; impersonado_por: string | null }[]) {
    if (r.impersonado_por) continue
    const a = agg.get(r.estudante_id) ?? { sessoes: 0, ultimo: r.iniciado_em }
    a.sessoes++
    agg.set(r.estudante_id, a)
  }
  const ids = [...agg.keys()].slice(0, 80)
  if (!ids.length) return []
  const { data: es } = await svc.from('simulado_estudantes').select('id, nome, email').eq('tenant_id', tenantId).in('id', ids)
  return ((es ?? []) as { id: string; nome: string | null; email: string | null }[])
    .map((e) => ({ id: e.id, nome: e.nome, email: e.email, ...agg.get(e.id)! }))
    .sort((a, b) => b.sessoes - a.sessoes)
}
