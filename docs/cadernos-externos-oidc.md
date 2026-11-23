# Cadernos externos: plataforma como Provedor OIDC (SSO do aluno)

A plataforma funciona como IdP OpenID Connect mínimo para BookStack e AFFiNE (containers próprios). O aluno já logado na plataforma entra sem 2ª senha. Cada app é um *client*. Código em `apps/web/lib/oidc/**` e `apps/web/app/oidc/**`.

Endpoints (sob o issuer): `/.well-known/openid-configuration`, `/jwks`, `/authorize`, `/token`, `/userinfo`, `/end-session`.

## Variáveis de ambiente (serviço `web`)

| Variável | Descrição |
|---|---|
| `CADERNOS_OIDC_ISSUER` | Issuer https, sem barra final. Ex.: `https://simulado.revisaopge.com.br/oidc` |
| `CADERNOS_OIDC_PRIVATE_KEY` | PEM RSA (>= 2048) privada; aceita `\n` literais. Sem ela, rotas respondem 503 (em dev gera chave efêmera com aviso). |
| `CADERNOS_OIDC_CLIENTS` | JSON dos clients (abaixo). |
| `CADERNOS_OIDC_FRAME_ANCESTORS` | Opcional. Hosts extras (espaço/vírgula) que podem embedar `/oidc/**`. Padrão: só a própria plataforma (`'self'`). |
| `CADERNOS_OIDC_LOGOUT_ENCERRA_SESSAO` | Opcional. `1` = o logout do caderno também encerra a sessão do aluno na plataforma (padrão: não encerra). |

Gerar o par RSA (guarde só a privada no env; a pública sai no `/jwks`):

```bash
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -out oidc-private.pem
# para colocar em uma linha no env/Portainer:
awk 'NF {sub(/\r/, ""); printf "%s\\n",$0;}' oidc-private.pem
```

Clients (secret >= 16 caracteres; `redirectUris` comparadas por IGUALDADE EXATA):

```json
[
  {"id":"bookstack","secret":"<segredo-longo-aleatorio>","redirectUris":["https://cadernos.exemplo.com/oidc/callback"],"postLogoutUris":["https://cadernos.exemplo.com/"],"pkce":"required"},
  {"id":"affine","secret":"<outro-segredo-longo>","redirectUris":["https://affine.exemplo.com/oauth/callback"],"postLogoutUris":["https://affine.exemplo.com/"],"pkce":"optional"}
]
```

Gerar secret: `openssl rand -base64 36`.

## BookStack (>= 24.02, `.env`)

```
AUTH_METHOD=oidc
OIDC_NAME="Plataforma"
OIDC_DISPLAY_NAME_CLAIMS=name
OIDC_CLIENT_ID=bookstack
OIDC_CLIENT_SECRET=<segredo-longo-aleatorio>
OIDC_ISSUER=https://simulado.revisaopge.com.br/oidc
OIDC_ISSUER_DISCOVER=true
OIDC_EXTERNAL_ID_CLAIM=sub
OIDC_END_SESSION_ENDPOINT=true
OIDC_USER_TO_GROUPS=false
```

Redirect URI a cadastrar no client: `https://<bookstack>/oidc/callback`. O BookStack identifica o usuário por `sub` e usa `email`/`name` das claims.

## AFFiNE (self-host, config do provider OIDC)

```json
{
  "oauth": {
    "providers": {
      "oidc": {
        "issuer": "https://simulado.revisaopge.com.br/oidc",
        "clientId": "affine",
        "clientSecret": "<outro-segredo-longo>",
        "args": { "scope": "openid email profile", "claim_id": "sub", "claim_email": "email", "claim_name": "name" }
      }
    }
  }
}
```

Redirect URI: `https://<affine>/oauth/callback` (confira na tela de login/logs do AFFiNE a URI exata que ele envia e registre-a idêntica).

## Comportamento

- Fluxo authorization code (+ PKCE S256; `required` ou `optional` por client). `plain` é recusado.
- `/authorize` usa a sessão de aluno da plataforma; sem sessão, redireciona para `/aluno/entrar?redirectTo=/oidc/authorize?...` e volta após o login. Só alunos liberados pelo Caderno (beta) (`cadernoBetaLiberado`) entram; os demais veem a mensagem `access_denied`. Visualização de admin (impersonation) é recusada.
- `sub` = `{tenantId}:{estudanteId}`; claims: `iss, aud, sub, iat, exp, nonce, auth_time, email, email_verified=true, name, preferred_username`.
- `code` = JWE stateless (60 s, uso único best-effort); access_token = JWT RS256 de 10 min; id_token 10 min; sem refresh token.
- Auth no `/token`: `client_secret_basic` e `client_secret_post` (comparação em tempo constante).
- `/oidc/**` é isento do CSRF por Origin e do tenant do host; não envia `X-Frame-Options`, e `frame-ancestors` = `'self'` (+ extras). Todas as respostas `Cache-Control: no-store`.
- Rate limit por IP (Redis se `REDIS_URL`, senão memória) e auditoria (`simulado_audit_logs`, entidade `oidc_sso`, operações LOGIN/BLOQUEAR).

## Limitações conhecidas

- **Replay do code**: protegido via Redis (`REDIS_URL`); sem Redis é por processo (o TTL de 60 s limita a janela entre réplicas).
- **Revogação**: access/id tokens são stateless; bloqueio posterior do aluno só vale na próxima autenticação (até 10 min de userinfo).
- A sessão do BookStack/AFFiNE é independente após o login: sair da plataforma não derruba o caderno (e vice-versa, salvo `CADERNOS_OIDC_LOGOUT_ENCERRA_SESSAO=1`).
- Trocar `CADERNOS_OIDC_PRIVATE_KEY` invalida codes/tokens em voo e muda o `kid`; os apps rebuscam o `/jwks`. Sem rotação de múltiplas chaves.
- Authorize em iframe depende do cookie `aluno_session` (SameSite=None; Partitioned) estar disponível no contexto do iframe; se o navegador bloquear, abra em janela/aba.
- Não testado contra BookStack/AFFiNE reais (só testes unitários + tsc).
