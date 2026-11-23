# Cadernos externos (teste): BookStack e AFFiNE

Aba **Meus Cadernos > OneNote (teste)** (so quem passa em `cadernoBetaLiberado`). A barra e o tema sao os do portal; o editor abre em iframe de largura cheia. Sub-abas `?aba=onenote&sub=bookstack|affine`.
Login unico por OIDC: a plataforma e o IdP (`CADERNOS_OIDC_ISSUER`, outro modulo). O `sub` emitido deve ser `<tenantId>:<estudanteId>`, igual ao `external_auth_id` que o provisionamento grava no BookStack.

## Subir em producao (Portainer)
1. **DNS** (A para o IP da VPS), no mesmo dominio registravel da plataforma: `BOOKSTACK_HOST` (default `cadernos-bs.revisaopge.com.br`) e `AFFINE_HOST` (default `cadernos-affine.revisaopge.com.br`).
2. **Envs novas** (stack da plataforma):
   - Servicos: `BOOKSTACK_HOST`, `AFFINE_HOST`, `BOOKSTACK_VERSION` (fixar tag), `AFFINE_VERSION`, `BOOKSTACK_APP_KEY`, `BOOKSTACK_DB_PASSWORD`, `BOOKSTACK_DB_ROOT_PASSWORD`, `BOOKSTACK_OIDC_CLIENT_SECRET`, `AFFINE_DB_PASSWORD`, `CADERNOS_OIDC_ISSUER`, `CADERNOS_FRAME_ANCESTORS` (default `https://simulado.revisaopge.com.br https://*.revisaopge.com.br`).
   - Web (derivadas no compose): `NEXT_PUBLIC_BOOKSTACK_URL`, `NEXT_PUBLIC_AFFINE_URL`, `BOOKSTACK_INTERNAL_URL` (default `http://bookstack`), `BOOKSTACK_API_TOKEN_ID`, `BOOKSTACK_API_TOKEN_SECRET`, `BOOKSTACK_ROLE_ALUNO_ID`.
3. **APP_KEY do BookStack**: `docker run --rm lscr.io/linuxserver/bookstack php /app/www/artisan key:generate --show` (formato `base64:...`).
4. Suba a stack. `affine_migration` e one-shot: se rodou antes do Postgres e falhou, reinicie-o (`docker service update --force <stack>_affine_migration`) e depois o `affine`.
5. **BookStack** (primeiro acesso: troque `admin@admin.com`/`password`; use `/login?prevent_auto_init=true` para entrar sem OIDC):
   - Settings > Roles: crie a role **aluno** com permissoes de criar/editar/excluir **"Own"** de shelves, books, chapters, pages, anexos e imagens; **nenhuma** de "All" e sem Settings/Users. Anote o id (URL `/settings/roles/<id>`) = `BOOKSTACK_ROLE_ALUNO_ID`. Em Settings > Registration deixe o registro desligado e default role = aluno.
   - Perfil do admin > API Tokens: crie o token (o admin precisa da permissao "Access system API"); ID = `BOOKSTACK_API_TOKEN_ID`, Secret = `BOOKSTACK_API_TOKEN_SECRET`.
6. **AFFiNE**: abra `https://<AFFINE_HOST>/admin`, crie o admin; em Settings > Auth > OAuth/OIDC adicione o provider com issuer = `CADERNOS_OIDC_ISSUER`, client id/secret emitidos pela plataforma e redirect `https://<AFFINE_HOST>/oauth/callback`. Nao ha provisionamento: o OIDC cria a conta e o aluno cria o proprio workspace privado.
7. Libere os alunos de teste no grupo `caderno_beta_grupos` do tenant.

Local: `docker-compose.cadernos-teste.yml` (BookStack :6875, AFFiNE :3010, BookStack com login nativo, sem OIDC).

## Provisionamento BookStack (`lib/cadernos-externos/bookstack.ts`)
Ao abrir a sub-aba, o servidor chama `ensureAlunoBookStack`: acha/cria o usuario (`external_auth_id`), a estante "Meus cadernos" e o livro "Meu caderno" (tag `aluno:<sub>`), e aplica `content-permissions` (owner = aluno, fallback tudo negado). Idempotente, cache de 10 min, timeout 8 s, nunca derruba a pagina (so mostra aviso). E-mail ja existente com outro `external_auth_id` = conflito reportado, sem duplicar. Limite da API: 180/min.

## Checklist (2 alunos, A e B)
- [ ] Aba so aparece para liberados; aluno nao liberado com `?aba=onenote` cai em Cadernos.
- [ ] A abre BookStack/AFFiNE sem segunda tela de login e ve apenas "Meu caderno".
- [ ] B nao ve estante/livro/paginas de A (busca global, URL direta de pagina, API de busca).
- [ ] A cria pagina; B nao a encontra. Anexos/imagens idem.
- [ ] AFFiNE: workspace de A invisivel para B; confirmar que A nao consegue convidar/compartilhar (nao ha como desligar).
- [ ] Iframe carrega em Chrome, e em Safari/Firefox (cookies de terceiros); senao o aviso "Abrir em nova aba" aparece apos 10 s.
- [ ] Logout da plataforma encerra a sessao (OIDC end session no BookStack).

## Limitacoes conhecidas
- **AFFiNE**: backend sob licenca EE (teste/dev ok; producao exige confirmacao por escrito); sem flag para esconder compartilhamento/convites; cookie `SameSite=Lax` exige host same-site da plataforma; sem white-label.
- **BookStack**: sem tela livre/caneta; ha bug aberto de isolamento das permissoes "own" (testar com o checklist); OIDC so com RS256 e issuer HTTPS (nao funciona em `http://localhost`).
