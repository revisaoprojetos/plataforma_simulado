import 'server-only'
import { createHash } from 'crypto'
import { cache } from 'react'
import { headers } from 'next/headers'
import { after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { remember, esquecer } from '@/lib/cache/relatorio-cache'
import { parseUserAgent } from './user-agent'
import { detectarRajada } from './alertas'

/**
 * REGISTRO DE ACESSOS DO ALUNO (backend-first, fire-and-forget).
 * - Nunca lança e nunca bloqueia: qualquer falha é engolida (login/rota seguem normalmente).
 * - Sem a migração 20261118010000 aplicada, as gravações viram no-op (o erro de tabela ausente
 *   desliga a gravação por 10 min para não martelar o banco).
 * - IP/UA são dados pessoais (LGPD): só leitura por admin com `acessos:view`; nunca devolvidos ao aluno.
 */

export type MetodoAcesso = 'senha' | 'email' | 'email_cpf' | 'email_telefone' | 'otp' | 'curseduca' | 'impersonacao' | 'outro'
export type OrigemAcesso = 'portal' | 'embed' | 'curseduca-iframe'
export type TipoAtividade =
  | 'leitura_aberta' | 'leitura_concluida' | 'grifo_criado' | 'grifo_removido' | 'nota_editada'
  | 'quiz_tentativa' | 'simulado_iniciado' | 'simulado_finalizado' | 'jogo_progresso' | 'pagina_vista' | 'outro'

const T_ACESSOS = 'simulado_aluno_acessos'
const T_ATIV = 'simulado_aluno_atividades'
const HEARTBEAT_MS = 5 * 60_000
const JANELA_AGRUPAR_MS = 60_000

// ───────────────────────── contexto da requisição ─────────────────────────

/** IP "de exibição": 1º do x-forwarded-for (Traefik/nginx) ou x-real-ip. Spoofável — NUNCA usar p/ decisão de acesso. */
export function ipDeHeaders(h: { get(n: string): string | null }): string | null {
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip')?.trim() || null
  return ip ? ip.slice(0, 64) : null
}

export interface CtxReq { ip: string | null; ua: string | null }
export async function contextoReq(): Promise<CtxReq> {
  try {
    const h = await headers()
    return { ip: ipDeHeaders(h), ua: h.get('user-agent')?.slice(0, 400) ?? null }
  } catch { return { ip: null, ua: null } }
}

/** Agenda trabalho pós-resposta (after) ou, fora de request, dispara solto. Nunca lança. */
function depois(fn: () => Promise<void>) {
  const seguro = async () => { try { await fn() } catch { /* best-effort */ } }
  try { after(seguro) } catch { void seguro() }
}

// Tabela ausente (migração pendente) → pausa as gravações por 10 min.
let pausadoAte = 0
function tabelaAusente(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false
  const m = String(err.message ?? '')
  if (err.code === '42P01' || err.code === 'PGRST205' || /does not exist|Could not find the table|schema cache/i.test(m)) {
    pausadoAte = Date.now() + 10 * 60_000
    return true
  }
  return false
}
const ativo = () => Date.now() >= pausadoAte

// ───────────────────────── sessões de acesso ─────────────────────────

export const hashRef = (seed: string) => createHash('sha256').update(seed).digest('hex').slice(0, 40)

export interface NovoAcesso {
  /** id da linha (= jti do JWT do portal). Omitir p/ gerar. */
  id?: string
  tenantId: string
  estudanteId: string
  metodo: MetodoAcesso
  origem: OrigemAcesso
  impersonadoPor?: string | null
  /** Para sessões sem JWT próprio (embed): referência estável (ex.: id da sessão de prova). */
  refSeed?: string
  ctx: CtxReq
}

/** Registra o início de uma sessão de acesso. Fire-and-forget (via after()). */
export function registrarAcesso(a: NovoAcesso): void {
  if (!ativo()) return
  depois(async () => {
    const ua = parseUserAgent(a.ctx.ua)
    const svc = createAdminClient()
    const ref = hashRef(a.refSeed ?? a.id ?? `${a.estudanteId}:${Date.now()}`)
    const agora = new Date().toISOString()
    if (a.refSeed) {
      // Sessão de embed: o identify roda a cada retomada → reaproveita a linha (só atualiza o "visto").
      const { data, error } = await svc.from(T_ACESSOS).select('id').eq('tenant_id', a.tenantId).eq('sessao_ref', ref).maybeSingle()
      if (tabelaAusente(error)) return
      if (data) { await svc.from(T_ACESSOS).update({ ultimo_visto_em: agora }).eq('id', (data as { id: string }).id).eq('tenant_id', a.tenantId); return }
    }
    const { error } = await svc.from(T_ACESSOS).insert({
      ...(a.id ? { id: a.id } : {}),
      tenant_id: a.tenantId, estudante_id: a.estudanteId, metodo: a.metodo, origem: a.origem,
      ip: a.ctx.ip, user_agent: a.ctx.ua, navegador: ua.navegador, so: ua.so, dispositivo: ua.dispositivo,
      iniciado_em: agora, ultimo_visto_em: agora, sessao_ref: ref, impersonado_por: a.impersonadoPor ?? null,
    })
    tabelaAusente(error)
  })
}

const ultimoToque = new Map<string, number>()

/** Heartbeat THROTTLED (≤ 1 escrita / sessão / 5 min por processo): atualiza `ultimo_visto_em` e `ultimo_acesso_em`. */
export function tocarAcesso(acessoId: string, tenantId: string, estudanteId: string): void {
  if (!ativo()) return
  const agora = Date.now()
  const ult = ultimoToque.get(acessoId) ?? 0
  if (agora - ult < HEARTBEAT_MS) return
  if (ultimoToque.size > 5000) ultimoToque.clear()
  ultimoToque.set(acessoId, agora)
  depois(async () => {
    const svc = createAdminClient()
    const iso = new Date(agora).toISOString()
    const { error } = await svc.from(T_ACESSOS).update({ ultimo_visto_em: iso }).eq('id', acessoId).eq('tenant_id', tenantId).is('encerrado_em', null)
    if (tabelaAusente(error)) return
    try { await svc.from('simulado_estudantes').update({ ultimo_acesso_em: iso }).eq('id', estudanteId).eq('tenant_id', tenantId) } catch { /* coluna ausente */ }
  })
}

/** Marca a sessão como encerrada (logout). */
export function encerrarAcesso(acessoId: string, tenantId: string, motivo: string): void {
  if (!ativo()) return
  depois(async () => {
    const { error } = await createAdminClient().from(T_ACESSOS)
      .update({ encerrado_em: new Date().toISOString(), motivo_encerramento: motivo }).eq('id', acessoId).eq('tenant_id', tenantId).is('encerrado_em', null)
    tabelaAusente(error)
  })
}

// ───────────────────────── revogação de sessões ─────────────────────────

const chaveRevog = (estudanteId: string) => `aluno-revog:${estudanteId}`

/** Instante (ms) a partir do qual os tokens do aluno valem; null = sem revogação. Cache 60 s; tolerante a coluna ausente. */
export const revogadasEm = cache(async (estudanteId: string): Promise<number | null> => {
  try {
    const v = await remember<number>(chaveRevog(estudanteId), 60, async () => {
      const r = await createAdminClient().from('simulado_estudantes').select('sessoes_revogadas_em').eq('id', estudanteId).maybeSingle()
      const t = !r.error ? (r.data as { sessoes_revogadas_em?: string | null } | null)?.sessoes_revogadas_em : null
      return t ? new Date(t).getTime() : 0
    })
    return v || null
  } catch { return null }
})
export async function esquecerRevogacao(estudanteId: string): Promise<void> {
  try { await esquecer(chaveRevog(estudanteId)) } catch { /* ignore */ }
}
/** Token emitido (iat, em segundos) antes da revogação? Tolerância de 1 s (iat é truncado). */
export function tokenRevogado(iatSeg: number | undefined, revogadaEmMs: number | null): boolean {
  if (!revogadaEmMs) return false
  if (!iatSeg) return true // sem iat não dá p/ provar que é posterior → trata como revogado
  return (iatSeg + 1) * 1000 <= revogadaEmMs
}

// ───────────────────────── atividades ─────────────────────────

export interface AtorAluno {
  tenantId: string
  estudanteId: string
  acessoId?: string
  impersonation?: { por: string }
}
export interface EventoAtividade {
  tipo: TipoAtividade
  refTipo?: string
  refId?: string
  titulo?: string
  meta?: Record<string, unknown>
}

const throttleMap = new Map<string, number>()
function passouThrottle(chave: string, ms: number): boolean {
  const agora = Date.now()
  if ((throttleMap.get(chave) ?? 0) + ms > agora) return false
  if (throttleMap.size > 5000) throttleMap.clear()
  throttleMap.set(chave, agora)
  return true
}

interface Buffer { ator: AtorAluno; ev: EventoAtividade; ip: string | null; qtd: number; ts: number[]; primeiro: number }
const buffers = new Map<string, Buffer>()

async function inserirAtividade(ator: AtorAluno, ev: EventoAtividade, ip: string | null, meta: Record<string, unknown>) {
  if (!ativo()) return
  const svc = createAdminClient()
  const row = {
    tenant_id: ator.tenantId, estudante_id: ator.estudanteId, acesso_id: ator.impersonation ? null : (ator.acessoId ?? null),
    tipo: ev.tipo, ref_tipo: ev.refTipo ?? null, ref_id: ev.refId ?? null, titulo: ev.titulo?.slice(0, 200) ?? null,
    meta: ator.impersonation ? { ...meta, impersonado_por: ator.impersonation.por } : meta, ip,
  }
  let { error } = await svc.from(T_ATIV).insert(row)
  if (error?.code === '23503' && row.acesso_id) ({ error } = await svc.from(T_ATIV).insert({ ...row, acesso_id: null })) // acesso ainda não gravado
  tabelaAusente(error)
}

function descarregar(chave: string) {
  const b = buffers.get(chave)
  if (!b) return
  buffers.delete(chave)
  const { rajada, max } = detectarRajada(b.ts)
  const meta: Record<string, unknown> = { ...(b.ev.meta ?? {}), qtd: b.qtd, janela_seg: Math.round((Date.now() - b.primeiro) / 1000) }
  if (rajada) { meta.rajada = true; meta.rajada_max_10s = max } // vira alerta "rajada anormal"
  void inserirAtividade(b.ator, b.ev, b.ip, meta).catch(() => {})
}

/**
 * Helper ÚNICO de atividade. Fire-and-forget; deduplica para não inflar a tabela:
 *  - grifo_criado / grifo_removido: agrupados em lote (1 evento por aluno+documento a cada 60 s, com meta.qtd;
 *    marca meta.rajada se > 30 em < 10 s);
 *  - leitura_aberta / jogo_progresso: no máx. 1 por aluno+item a cada 5 min;
 *  - nota_editada: 1 por aluno+item a cada 60 s.
 */
export async function registrarAtividade(ator: AtorAluno, ev: EventoAtividade): Promise<void> {
  try {
    if (!ativo()) return
    const chaveItem = `${ator.estudanteId}:${ev.tipo}:${ev.refId ?? ''}`
    if (ev.tipo === 'leitura_aberta' || ev.tipo === 'jogo_progresso') { if (!passouThrottle(chaveItem, 5 * 60_000)) return }
    else if (ev.tipo === 'nota_editada') { if (!passouThrottle(chaveItem, 60_000)) return }

    const ctx = await contextoReq()
    if (ev.tipo === 'grifo_criado' || ev.tipo === 'grifo_removido') {
      const b = buffers.get(chaveItem)
      if (b) { b.qtd++; if (b.ts.length < 400) b.ts.push(Date.now()); return }
      buffers.set(chaveItem, { ator, ev, ip: ctx.ip, qtd: 1, ts: [Date.now()], primeiro: Date.now() })
      const t = setTimeout(() => descarregar(chaveItem), JANELA_AGRUPAR_MS)
      ;(t as unknown as { unref?: () => void }).unref?.()
      return
    }
    depois(() => inserirAtividade(ator, ev, ctx.ip, ev.meta ?? {}))
  } catch { /* nunca quebra a rota */ }
}
