# Onboarding — Tenant MAC (Mentoria Além do Corte)

4º tenant da plataforma (após **Revisão**, **VND / Você na Defensoria** e **MEQ**).
Base = playbook validado no MEQ (`docs/levantamento-tenant-meq.md`) + memória `onboarding-tenant-multidominio`.
A MAC é **o VND com outra marca** (bordô): reaproveita 100% dos componentes do VND via a marca `mac` em código (já implementada — ver "Parte 1" no relatório). Aqui ficam só os passos de **dado** (tenant/tema) e **infra** (DNS/Traefik).

Legenda: ✅ pronto · ❓ definir/receber · ⏳ a executar.

---

## 1. Identidade do tenant (`simulado_tenants`)
| Campo | Valor | Status |
|---|---|---|
| `id` | gerado ao criar | ⏳ |
| `nome` / `nome_site` | **Mentoria Além do Corte** | ⏳ |
| `slug` | `mac` | ⏳ (bate com `inferirMarca` e com o acesso local `mac.localhost:3000`) |
| `dominio` (host COMPLETO, explícito) | **`simulado.mentoriaalemdocorte.com.br`** (SEM www — o www é NXDOMAIN) | ✅ gravado no tenant |
| `ativo` | `true` | ⏳ |
| `tema.somente_super` | `true` no setup → liberar `todos` ao final | ⏳ |

> ⚠️ `dominio` = host completo explícito: `getCurrentTenant` casa `tenants.dominio == host` (via `x-forwarded-host`) antes do fallback por slug. Sem isso a troca de plataforma monta URL errada (landmine do VND/MEQ).
> ⚠️ **Diagnóstico DNS (2026-10-29, via Google DoH):**
> - `www.simulado.mentoriaalemdocorte.com.br` → **NXDOMAIN** (não existe). NÃO usar www.
> - `simulado.mentoriaalemdocorte.com.br` → `104.21.16.36`/`172.67.166.19` = **IPs da Cloudflare (proxy LARANJA ligado)** — NÃO aponta pro VPS.
> - Os 3 domínios que FUNCIONAM (revisaopge/meqconcursos/vocenadefensoria) apontam **direto** para `46.224.161.181` (DNS only / cinza).
> **Ação (Cloudflare):** no registro **A** de `simulado` → `46.224.161.181`, **desligar o proxy (nuvem CINZA / DNS only)**, igual aos outros 3. Só assim o Traefik/Let's Encrypt do VPS atende o host. `tenants.dominio` já = `simulado.mentoriaalemdocorte.com.br` (host exato que chega via `x-forwarded-host`).

## 2. Infra / apontamento (DNS + Traefik)
| Item | Ação | Status |
|---|---|---|
| DNS | registro **A** do host → `46.224.161.181` (Cloudflare **DNS only / cinza**) | ⏳ |
| Traefik | Portainer → serviço `plataforma_simulado_web` → **env da stack** `APP_CUSTOM_HOSTS_RULE` → acrescentar `\|\| Host(\`<host-mac>\`)` à regra existente (hoje já tem `vocenadefensoria` + `meqconcursos`); certresolver `letsencryptresolver`, porta 3000, rede `network_swarm_public` | ⏳ |
| TLS | Let's Encrypt sai sozinho ~1min após o Host rule | ⏳ |
| Server Actions | adicionar o host ao `SERVER_ACTION_ORIGINS` (env), senão server actions no domínio custom são rejeitadas (landmine `server-actions-rejeitadas-dominio-custom`) | ⏳ |
| Deploy | a imagem com a marca `mac` (Parte 1) precisa estar no ar; deploy por `<SHA>` (nunca `:latest`) | ⏳ |

## 3. Acesso administrativo
- ⚠️ **LANDMINE (corrige a doc do MEQ):** o "super admin global" NÃO é implícito. A RLS de todas as tabelas é `tenant_id IN (SELECT user_tenant_ids())`, que lê `simulado_tenant_acessos`. **Todo tenant precisa de uma linha `super_admin` para o admin** — senão dá "new row violates RLS policy" ao criar aluno/conteúdo. `createTenantAction` cria isso automaticamente; **repurpose manual (ex-Teste) NÃO** → foi preciso inserir à mão. ✅ Feito p/ `admin@teste.com` no MAC (2026-10-29).
- Admins próprios do MAC (equipe deles): ❓ criar via `tenant_acessos` (quantos / e-mails?).

## 4. Marca / white-label (`simulado_tenants.tema`) — valores MAC
Aplicar no **super-admin** (`/super/plataformas/[id]` ou `/admin/tenants` → editar) ou colar o bloco `tema` abaixo. O "M" e os textos "Mentoria Além do Corte"/"SIMULA MAC" das telas branded já vêm do **código** (marca `mac`); estes campos cobrem logo/favicon/cores do portal clássico e do admin.

| Token | Valor MAC | Status |
|---|---|---|
| `aparencia_auth.brand` | `mac` | ⏳ (ou deixar `inferirMarca` resolver pelo slug/nome) |
| `aparencia_auth.loginStyle` | `mac-login-centralizado` | ⏳ |
| `aparencia_auth.loadingStyle` | `mac-loading-classico` | ⏳ |
| `aparencia_auth.defaultTheme` | `claro` | ⏳ |
| `aparencia_auth.loginAtivo` | `true` (liga o novo login branded) | ⏳ |
| `aparencia_auth.internoAtivo` | `true` (liga as telas internas branded) | ⏳ |
| Logo (light) | `/brand/mac/mac-logo-completo-bordo.svg` | ✅ asset copiado |
| Logo (dark) | `/brand/mac/mac-logo-completo-branco.svg` | ✅ asset copiado |
| Favicon | `/brand/mac/mac-favicon.svg` | ✅ asset copiado |
| Cor primária (`cor_primaria`/brand) | **bordô `#580000`** (claro `#640C11`, escuro `#D37A7F`) | ⏳ |
| Accent | **dourado `#D8B45A`** (igual VND — NÃO mudar) | ✅ |
| `theme-color` (meta) | `#580000` | ⏳ |
| Modo padrão | `claro` | ⏳ |
| Fonte | Plus Jakarta Sans (igual VND) | ✅ |

> ⚠️ Tema precisa de especificidade `html:root`/`html.dark` p/ vencer o `:root` roxo do globals — já no código. As cores bordô das telas branded já saem dos tokens `mac` (brand-tokens.ts / sim-tokens.ts) + do conversor `corMarca`; aqui é só a marca do portal clássico/admin.

### Estado estrutural a copiar do VND (como o MEQ fez do Revisão)
Copiar do VND (mantendo a marca MAC): `card_view, card_fade, card_fade_pastas, banners_desempenho, gam_trilha_admin, gam_trilha_simbolos, trilha_formato, personalizacao_aluno, animacao_entrada, sidebar_rotulos, mobile_nav`.
Gamificação: copiar a config do VND/Revisão (ativo, público `todos`, níveis, missões, conquistas).

## 5. Login do aluno (`embed_config` / `simulados.metodo_identificacao`)
- `metodo_identificacao`: **só e-mail** (menor atrito) — ou `email_cpf` se quiserem 2º fator leve. ❓
- `otp_email`: ❓
- `origens_permitidas[]` (frame-ancestors, se embedar em Curseduca/LMS do MAC): ❓

## 6. Mensagens & contatos
- Usar os **defaults** do código (como Revisão/MEQ) ou textos próprios? ❓
- `tenant_contatos`: WhatsApp / e-mail suporte / telefone / link ajuda / horário. ❓

## 7. Integrações (`simulado_integracao_config`)
- Curseduca / Guru: ❓ credenciais (base URL + API key + grupos / token webhook + produtos). A MAC começa sem integração até receber.

## 8. Conteúdo (cross-tenant via linhagem)
- Tenant começa **vazio**; admin puxa de outra plataforma (cópia + `linhagem_id`), aluno não percebe. Área sugerida p/ começar: **questões**. (Ver §8 do playbook MEQ.)

## 9. Checklist anti-landmine
- [ ] `dominio` explícito no tenant (resolução por host).
- [ ] Cookie de sessão **por host** (já no código).
- [ ] SSO handoff entre domínios (testar **vindo de outra plataforma**, aba anônima).
- [ ] Handoff usa `x-forwarded-host`.
- [ ] `APP_CUSTOM_HOSTS_RULE` inclui o host MAC (senão 404 no Traefik).
- [ ] `SERVER_ACTION_ORIGINS` inclui o host MAC (senão server actions rejeitadas).
- [ ] Tema não fica verde nem roxo (bordô MAC vencendo): conferir login, prova, home, shell, ligas, Lei Seca.
- [ ] `somente_super=false` / visibilidade `todos` ao liberar (senão loop /login↔/admin p/ admins não-super).

## 10. Estado
- Código (marca `mac`): ✅ Parte 1 (ver relatório). Acesso local: **`http://mac.localhost:3000`**.
- Assets de marca: ✅ em `apps/web/public/brand/mac/`.
- Criação do tenant (dado): ⏳ via super-admin.
- Tema/gamificação/estrutural copiados do VND: ⏳.
- DNS + Traefik + TLS + envs: ⏳ (infra, Portainer).
- Liberação (`somente_super=false`): ⏳.
