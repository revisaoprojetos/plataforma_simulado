import { getSessaoAluno } from '@/lib/aluno-session'
import { cadernoBetaLiberado } from '@/lib/aluno/caderno-beta-acesso'
import { createAdminClient } from '@/lib/supabase/server'
import { registrarAudit } from '@/lib/audit'
import { rateLimit } from '@/lib/rate-limit'
import { contextoOidc, ipDe, NO_STORE, paginaErro } from '@/lib/oidc/http'
import { urlRetorno, validarAuthorize } from '@/lib/oidc/protocolo'
import { emitirCode } from '@/lib/oidc/tokens'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function redirecionar(location: string): Response {
  // Location pode ser relativo (evita depender do host interno atrás do proxy).
  return new Response(null, { status: 302, headers: { Location: location, ...NO_STORE } })
}

export async function GET(req: Request) {
  const rl = await rateLimit(`oidc:authorize:${ipDe(req)}`, 60, 60_000)
  if (!rl.ok) return paginaErro('Muitas tentativas', 'Aguarde alguns instantes e tente novamente.', 429)
  const ctx = await contextoOidc(req, 'html')
  if (ctx instanceof Response) return ctx

  const url = new URL(req.url)
  const v = validarAuthorize(url.searchParams, ctx.clients)
  if (v.tipo === 'erro_pagina') return paginaErro('Não foi possível entrar', v.mensagem, 400)
  if (v.tipo === 'erro_redirect') {
    return redirecionar(urlRetorno(v.redirectUri, { error: v.error, error_description: v.descricao, state: v.state }))
  }

  const sessao = await getSessaoAluno()
  if (!sessao) {
    if (v.promptNone) return redirecionar(urlRetorno(v.redirectUri, { error: 'login_required', state: v.state }))
    // Volta para este mesmo authorize (caminho fixo + query original) após o login do aluno.
    return redirecionar(`/aluno/entrar?redirectTo=${encodeURIComponent(`/oidc/authorize${url.search}`)}`)
  }
  // Visualização por admin (impersonation) não pode emitir SSO como o aluno.
  if (sessao.impersonation) return paginaErro('Acesso negado', 'Não é possível abrir o caderno externo durante a visualização de um aluno.', 403)

  const svc = createAdminClient()
  const { data: est } = await svc
    .from('simulado_estudantes')
    .select('id, nome, email, deletado')
    .eq('tenant_id', sessao.tenantId)
    .eq('id', sessao.estudanteId)
    .maybeSingle()
  const email = (est?.email ?? sessao.email ?? '').trim().toLowerCase()
  if (!est || est.deletado || !email) return paginaErro('Acesso negado', 'Não encontramos seu cadastro de aluno. Fale com o suporte.', 403)

  const liberado = await cadernoBetaLiberado({ tenantId: sessao.tenantId, estudanteId: sessao.estudanteId, email })
  if (!liberado) {
    void registrarAudit({ operacao: 'BLOQUEAR', entidade: 'oidc_sso', tenantId: sessao.tenantId, atorTipo: 'estudante', depois: { client: v.client.id, estudante_id: sessao.estudanteId, motivo: 'caderno_beta_nao_liberado' } })
    return paginaErro('Acesso negado (access_denied)', 'O Caderno ainda não está liberado para a sua conta. Se acredita que deveria ter acesso, fale com o suporte.', 403)
  }

  const nome = (est.nome ?? sessao.nome ?? '').trim() || email
  const code = await emitirCode(ctx.keys, ctx.issuer, {
    sub: `${sessao.tenantId}:${sessao.estudanteId}`,
    email, name: nome,
    clientId: v.client.id, redirectUri: v.redirectUri,
    nonce: v.nonce, challenge: v.challenge, scope: v.scope,
    authTime: Math.floor(Date.now() / 1000),
  })
  void registrarAudit({ operacao: 'LOGIN', entidade: 'oidc_sso', tenantId: sessao.tenantId, atorTipo: 'estudante', depois: { client: v.client.id, estudante_id: sessao.estudanteId } })
  return redirecionar(urlRetorno(v.redirectUri, { code, state: v.state }))
}
