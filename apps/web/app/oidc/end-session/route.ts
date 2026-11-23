import { limparSessaoAluno } from '@/lib/aluno-session'
import { contextoOidc, ipDe, NO_STORE, paginaErro } from '@/lib/oidc/http'
import { resolverLogout } from '@/lib/oidc/protocolo'
import { urlRetorno } from '@/lib/oidc/protocolo'
import { verificarIdTokenHint } from '@/lib/oidc/tokens'
import { rateLimit } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Logout RP-initiated. Por padrão NÃO encerra a sessão do aluno na plataforma (o logout do caderno
 * não deve derrubar o portal); CADERNOS_OIDC_LOGOUT_ENCERRA_SESSAO=1 também encerra a sessão da plataforma.
 */
async function tratar(req: Request, params: URLSearchParams) {
  const rl = await rateLimit(`oidc:end:${ipDe(req)}`, 60, 60_000)
  if (!rl.ok) return paginaErro('Muitas tentativas', 'Aguarde alguns instantes e tente novamente.', 429)
  const ctx = await contextoOidc(req, 'html')
  if (ctx instanceof Response) return ctx

  let clientHint: string | null = params.get('client_id')
  const hint = params.get('id_token_hint')
  if (hint) {
    const h = await verificarIdTokenHint(ctx.keys, ctx.issuer, hint)
    if (!h) return paginaErro('Solicitação inválida', 'id_token_hint inválido.', 400)
    clientHint = h.aud
  }
  const r = resolverLogout(ctx.clients, { clientIdHint: clientHint, postLogoutUri: params.get('post_logout_redirect_uri') })
  if (r.erro) return paginaErro('Solicitação inválida', r.erro, 400)

  if (process.env.CADERNOS_OIDC_LOGOUT_ENCERRA_SESSAO === '1') await limparSessaoAluno()

  if (r.destino) {
    return new Response(null, { status: 302, headers: { Location: urlRetorno(r.destino, { state: params.get('state') ?? undefined }), ...NO_STORE } })
  }
  return paginaErro('Sessão encerrada', 'Você saiu do caderno. Pode fechar esta janela.', 200)
}

export async function GET(req: Request) { return tratar(req, new URL(req.url).searchParams) }
export async function POST(req: Request) { return tratar(req, new URLSearchParams(await req.text())) }
