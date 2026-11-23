import 'server-only'
import { getSessaoAluno } from '@/lib/aluno-session'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { getCurrentTenantId } from '@/lib/tenant'
import { verificarRenderToken } from '@/lib/pdf/render-token'
import { verificarSat } from '@/lib/aluno/sat'

/**
 * Ramo 5 (TRANSIÇÃO): aceita requisição sem cookie e sem `sat` desde que o tenant do HOST bata com o da sessão
 * (comportamento legado do embed). Mantido ligado até medir o log `sessao_pdf_sem_sat` em produção; depois,
 * trocar para `false` (ou ler de env) para exigir `sat`/cookie.
 */
export const PERMITIR_SESSAO_PDF_SEM_SAT_TRANSICAO = true

export type ViaAutorizacao = 'dono' | 'admin' | 'token' | 'render' | 'host_transicao'
export type ResultadoAutorizacao = { ok: true; via: ViaAutorizacao } | { ok: false }

export interface SessaoAutorizar { id: string; tenant_id?: string | null; estudante_id?: string | null; is_teste?: boolean | null }
export interface OptsAutorizar {
  /** Token `sat` do embed (query `sat`). */
  sat?: string | null
  /** Token de render (pdftoken) apresentado pelo Chromium. Exige `cadernoId` p/ conferir o recurso. */
  renderToken?: string | null
  cadernoId?: string | null
  /** Rota chamadora (só p/ o log de transição). */
  rota?: string
  /** Reservado: exige credencial forte (sem ramo de transição). */
  exigirDados?: boolean
}

const PERMS_ADMIN = ['estudantes:view', 'relatorios:view', 'resultados:view', 'resultados:manage', 'resultados:export']

/** Fecha o IDOR de sessão nos PDFs do aluno. Falha fechada. Ordem: render-token → cookie do aluno → admin → sat → transição. */
export async function autorizarSessao(sessao: SessaoAutorizar | null | undefined, opts: OptsAutorizar = {}): Promise<ResultadoAutorizacao> {
  const NEGA: ResultadoAutorizacao = { ok: false }
  const st = sessao?.tenant_id
  if (!sessao?.id || !st) return NEGA

  // (1) render-token do Chromium (assinado pelo servidor p/ ESTA sessão + caderno).
  if (opts.renderToken) {
    const tok = verificarRenderToken(opts.renderToken)
    if (tok && tok.r === 'caderno-teste' && !!opts.cadernoId && tok.id === opts.cadernoId && tok.s === sessao.id && tok.t === st) return { ok: true, via: 'render' }
    return NEGA // token apresentado e inválido: sem fallback
  }

  // (2) aluno com cookie (inclui impersonation): tenant E dono. Cookie presente e não bate → nega sem fallback.
  const aluno = await getSessaoAluno().catch(() => null)
  if (aluno?.tenantId) {
    if (aluno.tenantId === st && !!sessao.estudante_id && sessao.estudante_id === aluno.estudanteId) return { ok: true, via: 'dono' }
    return NEGA
  }

  // (3) admin/corretor do mesmo tenant com permissão de ver dados de alunos/resultados.
  const acc = await getCurrentAccess().catch(() => null)
  if (acc?.userId && acc.tenantId && acc.tenantId === st) {
    const ok = acc.isAdmin || acc.permissions.includes('*') || PERMS_ADMIN.some((p) => acc.permissions.includes(p))
    if (ok) return { ok: true, via: 'admin' }
  }

  // (4) token de embed `sat` (HMAC {sid,tid,exp}).
  if (opts.sat) {
    const p = verificarSat(opts.sat)
    if (p && p.sid === sessao.id && p.tid === st) return { ok: true, via: 'token' }
    return NEGA // sat apresentado e inválido: sem fallback
  }

  // (5) TRANSIÇÃO: sem cookie e sem sat → só confere o tenant do host + log estruturado p/ medir.
  if (PERMITIR_SESSAO_PDF_SEM_SAT_TRANSICAO && !opts.exigirDados) {
    const tid = await getCurrentTenantId().catch(() => null)
    if (tid && tid === st) {
      console.warn(JSON.stringify({ evento: 'sessao_pdf_sem_sat', rota: opts.rota ?? null, tenant: st, sessao: sessao.id.slice(0, 8) }))
      return { ok: true, via: 'host_transicao' }
    }
  }
  return NEGA
}
