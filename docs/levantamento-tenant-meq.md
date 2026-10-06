# Levantamento & Apontamento — Tenant MEQ (MEQ Concursos, área jurídica)

3º tenant da plataforma (após **Revisão** e **VND / Você na Defensoria**). Base = playbook multi-domínio
já validado no VND (ver memória `onboarding-tenant-multidominio`). Legenda: ✅ pronto · ❓ preciso definir/receber · ⏳ a executar.

---

## 1. Identidade do tenant (`simulado_tenants`)
| Campo | Valor | Status |
|---|---|---|
| `id` | `737ed838-ba07-49e3-a34f-f7d25c3cf53c` | ✅ criado |
| `nome` / `nome_site` | **MEQ Concursos** | ✅ |
| `slug` | `meq` | ✅ |
| `dominio` (host COMPLETO, explícito) | `simulado.meqconcursos.com.br` | ✅ |
| `ativo` | `true` | ✅ |
| `tema.somente_super` | `true` (setup) → liberar `todos` ao final | ⏳ liberar |

> ⚠️ `dominio` tem que ser o host completo e explícito — a resolução (`getCurrentTenant`) casa `tenants.dominio == host` antes do fallback por slug. Sem isso, a troca de plataforma monta URL errada.

## 2. Infra / apontamento (DNS + Traefik + deploy)
| Item | Ação | Status |
|---|---|---|
| DNS | registro **A** do host → `46.224.161.181` (Cloudflare **DNS only / cinza**) | ⏳ |
| Traefik | Portainer → `plataforma_simulado_web` → **Service labels** → acrescentar `\|\| Host(\`host-meq\`)` na regra do router (mantém os existentes); certresolver `letsencryptresolver`, porta 3000, rede `network_swarm_public` | ⏳ |
| TLS | Let's Encrypt sai sozinho ~1min após o Host rule | ⏳ |
| Deploy | imagem já no ar cobre o tenant novo (multi-tenant) — só se faltar código | ⏳ |

## 3. Acesso administrativo
- `admin@teste.com` (super_admin global) já administra **todos os tenants**, inclusive o MEQ — sem precisar de `tenant_acessos`.
- Admins próprios do MEQ (equipe deles): ❓ criar via `tenant_acessos` (quantos / e-mails?) — ❓.

## 4. Marca / white-label (`simulado_tenants.tema`)
| Token | Valor | Status |
|---|---|---|
| Logo (light) | ❓ arquivo/URL | ❓ |
| Logo (dark) | ❓ arquivo/URL | ❓ |
| Favicon | ❓ | ❓ |
| Cor primária / accent | **azul `#1d4ed8`** (design claro/branco, títulos azuis) — 1ª versão, ajustável no editor | ✅ (refinar c/ logo) |
| Modo padrão | `light` (design claro) | ✅ |
| Fonte | default do sistema | ✅ |
| Login branded (`/aluno/entrar`) | usa a cor do tenant direto no config | ⏳ |

> ⚠️ Tema precisa de especificidade `html:root`/`html.dark` p/ vencer o `:root` roxo do globals — já corrigido no código; só definir as cores do MEQ.

## 5. Login do aluno (`embed_config` / `simulados.metodo_identificacao`)
- `metodo_identificacao`: ✅ **só e-mail** (menor atrito).
- `otp_email`: ❓ ligar reforço por código?
- `origens_permitidas[]` (frame-ancestors, se embedar em Curseduca/LMS do MEQ): ❓ domínios.

## 6. Mensagens & contatos (personalizáveis por tenant)
- Defaults seedados; no VND foram **10 mensagens + 1 contato**. Para o MEQ: ❓ usar os defaults ou textos próprios?
- `tenant_contatos`: ❓ WhatsApp / e-mail de suporte / telefone / link de ajuda / horário.

## 7. Integrações (`simulado_integracao_config`)
| Integração | Precisa | Status |
|---|---|---|
| **Curseduca** | ✅ **sim** — preciso: base URL + API key + **grupos** a sincronizar (config canônica `integracao_config`) | ❓ credenciais |
| **Guru** | ✅ **sim** — preciso: token do webhook + produtos → liberação | ❓ credenciais |

> Referência de comportamento real: memórias `curseduca-api-forma-real` e `integracoes-curseduca-guru-rodada`.

## 8. Conteúdo & Compartilhamento CROSS-TENANT (feature nova — decisão central)

**Requisito (MEQ e todos os futuros tenants):**
- Tenant novo começa **vazio**.
- Ao "adicionar conteúdo" (questões, simulados, leitura, cronograma) o admin pode **puxar de outra plataforma**, na área correspondente.
- Cada conteúdo tem **identidade**: de qual plataforma **origina** e em **quais** plataformas **está** — organizado no banco por um identificador.
- Ao **editar** um conteúdo compartilhado, o sistema **pergunta (secure)**: alterar **só esta** plataforma ou **também as vinculadas**.
- **O aluno NUNCA percebe** que 3 plataformas usam o mesmo conteúdo — a identificação é **só para o admin**.
- Ligação profissional entre os sistemas, com todas as ferramentas para o admin.

### Modelo RECOMENDADO — cópia + linhagem (mantém RLS limpa, não vaza pro aluno)
- Cada conteúdo compartilhável ganha `linhagem_id` (uuid) = **a identidade compartilhada** entre plataformas.
- `origem_tenant_id` = plataforma que **criou** originalmente.
- "Adicionar de outra plataforma" = **COPIA** a linha p/ o tenant destino (novo `id`, novo `tenant_id`, **mesmo `linhagem_id`**). Cada tenant **é dono da sua cópia** → RLS continua isolando (cada um só vê o seu), aluno não percebe, e cada cópia pode divergir.
- Vínculos: loader "quais tenants têm cópia de cada linhagem" → badge admin **"Origem: Revisão · também em: VND, MEQ"**.
- **Editar = LOCAL por padrão**; ação **"propagar para as vinculadas?"** (o *secure*) empurra pras irmãs da linhagem, com **preview de quem será afetado** (before/after, no espírito da re-correção). Sentido inverso ao acidente: nada vaza pras outras sem confirmação explícita.

### Alternativa — referência única (NÃO recomendada)
- Uma linha só compartilhada por N tenants (RLS por tabela de acesso). Editar afeta todos por natureza; "só esta" faria fork. RLS mais complexa e mais fácil de deixar a igualdade **na cara** do aluno.

### Escopo (linhagem genérica, reusável em todas as áreas)
`questoes` (+ `alternativas`), `simulados` (+ `prova_questoes`), Leitura (documentos/módulos), Cronograma (conteúdos).

### ❓ Decisões pendentes
1. Modelo: **cópia+linhagem [recomendado]** × referência única.
2. Área para começar (sugiro **questões** — é a base; simulados/leitura reusam a mesma linhagem depois).

### Alunos (gate de acesso, à parte do banco de conteúdo)
| Item | Origem | Status |
|---|---|---|
| Alunos | via **Curseduca** (integração definida) | ⏳ |

## 9. Checklist anti-landmine (do VND — não repetir)
- [ ] `dominio` explícito no tenant (resolução por host).
- [ ] Cookie de sessão **por host** (não fixar domínio) — já no código.
- [ ] SSO handoff entre domínios funcionando (testar **vindo de outra plataforma**, não só login fresco).
- [ ] Handoff usa `x-forwarded-host` (senão redirect p/ 0.0.0.0).
- [ ] Auto-cura do cookie host-only (proxy) — testar em **aba anônima** após deploy.
- [ ] Tema não fica roxo (cores MEQ vencendo o globals).
- [ ] `somente_super=false` / visibilidade `todos` ao liberar (senão loop /login↔/admin trava admins não-super).

## 10. Estado (a preencher conforme avança)
- Criação do tenant: ✅
- **Gamificação**: ✅ config copiada do Revisão (ativo, público `todos`, nível máx 35, 9 cargos, 3 missões, 25 conquistas) — 2026-10-04.
- **Tema estrutural**: ✅ copiadas do Revisão (mantendo a marca MEQ): `card_view, card_fade, card_fade_pastas, banners_desempenho, gam_trilha_admin, gam_trilha_simbolos, trilha_formato, personalizacao_aluno, animacao_entrada, sidebar_rotulos`. Backup: `apps/web/scripts/_backup-meq-aplicar-revisao.json`.
  - ⚠️ `gam_trilha_simbolos` e `sidebar_rotulos` vieram do Revisão — símbolos da trilha e rótulos do menu podem mostrar os do Revisão; ajustar na Personalização se quiser MEQ-específico.
- DNS + Traefik + TLS: ⏳ (infra, Portainer)
- Marca (logo/favicon/cores finais): ⏳ (hoje azul `#000a5b` provisório)
- Login: ✅ `embed_config` criado (metodo=`email`, otp off). Mensagens: ✅ usa defaults do código (como o Revisão, 0 linhas). Contatos: ⏳ (precisa WhatsApp/suporte/horário reais).
- Integrações (Curseduca + Guru): ⏳ (credenciais)
- Conteúdo (puxar do Revisão via linhagem): ⏳
- Liberação (`somente_super=false` / visibilidade `todos`): ⏳
- **Acesso local p/ ver alterações: `http://meq.localhost:3000`** (Revisão = `localhost:3000`; VND = `vnd.localhost:3000`). NÃO usar o domínio real (vai pro ar via DNS).
