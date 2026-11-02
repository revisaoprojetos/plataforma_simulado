# Blueprint — Estúdio de Conteúdo (reorganização do admin, self-service para professores)

**Status:** proposta / escopo (nenhum código escrito ainda).
**Objetivo da reunião:** tirar a criação e o gerenciamento de conteúdo da dependência de dev/super-admin. Hoje qualquer alteração passa por uma pessoa — os professores ficam "de mão abanando". Meta: um **Estúdio de Conteúdo** self-service, com a arquitetura de informação inspirada na Curseduca/Waid, onde professor cria questão, monta simulado, sobe material, publica e libera acesso **sozinho e com segurança**.
**Abordagem combinada:** construir a área **por fora** primeiro (módulo autocontido, rota nova), validar o fluxo, e **depois adaptar o visual** para dentro do admin — substituindo os itens de menu espalhados.

> Fontes desta análise: varredura do admin atual (`apps/web/app/admin/**` + `lib/**`), modelo de referência da Curseduca/Waid (central de ajuda `help.waid.io` + APIs "WAID Contents"/"WAID Members" + nossa integração em `lib/curseduca/**`), e auditoria de RBAC (`lib/rbac-catalogo.ts`, `lib/auth/permissions.ts`).

---

## 1. Diagnóstico do caos atual (as-is)

O código vivo é **Next.js (App Router) + Supabase (Postgres/RLS)** em `apps/web` — não o NestJS do `CLAUDE.md` (aquele é um plano greenfield que não existe). Tudo usa prefixo `simulado_`. São ~194 migrations e ~94 scripts `.mjs` operacionais.

### 1.1 As cinco dores estruturais

1. **Uma tabela faz-tudo: `simulado_pastas`.** É banco de questões, pasta, caderno, módulo de Lei Seca, jurisprudência, maratona, biblioteca, conteúdo de cronograma… discriminada por `is_folder` (false=banco, true=pasta) + `folder_area` (10+ valores). "Banco" e "pasta" são **a mesma coisa** no banco; "pasta" significa coisas diferentes em cada tela. A regra de o que é banco vive numa allowlist frágil (`lib/simulado/pasta-area.ts`).

2. **Banco × Simulado embaralhados.** O conteúdo (questões, caderno, HUD, capa) mora no **banco** (`simulado_pastas`), mas é editado na tela do **simulado**, via a ponte `regras.banco_base_id`. Um mesmo banco pode alimentar **vários** simulados → editar um afeta os outros (existe aviso de "desmembrar/fork"). O professor não sabe se está editando "o simulado" ou "o banco".

3. **Cinco caminhos de acesso ao mesmo simulado, sem visão unificada:**
   - `simulado_matriculas.liberado` (gate direto)
   - grupo → banco (`simulado_pasta_grupos`) → sync → matrícula
   - `regras.acesso_gratuito` (bypassa tudo — e **nasce `true` no wizard**, liberando todo simulado para todos os alunos do tenant)
   - Produtos (`simulado_access_grants` / `simulado_assinaturas` → `simulado_produto_itens`)
   - `simulado_acessos` (avulso/prazo relativo)
   
   Descobrir "por que fulano vê / não vê" exige cruzar 5 tabelas. (Foi exatamente a dor que resolvemos no caso ENAP — ver [[simulado-grupo-banco-propagacao]].)

4. **Roster do banco ≠ matrícula no simulado.** A matrícula automática só roda **na criação** do simulado. Aluno adicionado ao banco **depois** não entra nos simulados já existentes sem rodar `matricularEmSimuladosDoBanco`/reconciliação. É a causa raiz da "diferença de alunos" entre simulados do mesmo grupo.

5. **Taxonomia texto-livre "get-or-create".** Banca/órgão/disciplina/assunto são criados por nome ao salvar a questão (`ilike`), gerando duplicatas ("Dir. Civil" vs "Direito Civil"). As ferramentas de "unificar" existem — são o sintoma, não a cura.

### 1.2 Por que o professor não consegue operar sozinho (RBAC)

- **Não existe papel `professor`.** O mais próximo é `admin_conteudo`, semeado **pobre**: só `questoes:*` + `simulados:*` + alguns `:view`.
- **Permissões-chave nem existem no catálogo do banco:** `produtos`, `liberacao`, `correcao`, `armazenamento` estão no `rbac-catalogo.ts` (app) mas **não** são semeadas em `simulado_permissions` (o `scripts/seed-rbac.mjs` diverge do catálogo). Como a matriz RBAC é montada a partir das linhas do banco, **não há como marcá-las** — só papéis de acesso total (`admin`/`admin_geral`/`super_admin`) as exercem.
- **Biblioteca gateada por `configuracoes`** (permissão de dono do sistema), não por uma permissão de conteúdo. Idem Lei Seca/Jurisprudência (exigem `leitura:*`, fora do seed).
- **`grupos` só tem `view`** — e `view` é tratado como "controle total" (criar grupo, adicionar membro, conceder acesso). Sem granularidade.
- **Zero escopo/ownership.** Todo admin vê e edita 100% do conteúdo do tenant. `criado_por` é gravado mas **nunca** filtra listagem.
- **Áreas "nascem bloqueadas"** por uma allowlist de manutenção-por-área (por e-mail), liberada só em Sistema → Páginas em manutenção. Um professor não abre Biblioteca/Correção até alguém com `configuracoes` liberar.
- Para tenants **pré-existentes** (ex.: Revisão PGE), o seed de papéis só rodou na criação do tenant → `admin_conteudo` pode **nem existir** em `simulado_roles` (resolve `permissions: []`).

### 1.3 O que só dá para fazer via dev/script/DB hoje

Correção do estado de **um aluno** (scripts `_breno-*`, `_luiza-*`…), reconciliar grupos↔bancos, recomputar ranking/streak/snapshots, aplicar migration, **ligar features** que estão desligadas por schema drift ("rode a migration X no banco"), mexer em Tenants/Aparência/Importar-de-outra-plataforma/Armazenamento (super-admin only). ~101 arquivos têm fallback "tolerante" removendo coluna que faltou — features ficam **silenciosamente desligadas**.

---

## 2. Modelo de referência (Curseduca/Waid) — o que vale copiar

A Curseduca separa o mundo em **3 camadas limpas**, e a navegação é por **função**, não por hierarquia:

```
CONTEÚDO (pedagógico)      ACESSO (operacional)        COMERCIAL
Produto → Módulo →         Grupo de acesso ↔           Oferta (preço, checkout,
  Aula → Conteúdo            Membro ↔ Matrícula           order bump, combo) → link de pagto
   ├ Biblioteca (reuso)       (hasAccess = verdade
   └ Banco de Questões         única de acesso)
      (reuso N:N)
Trilha = sequência ordenada de produtos
Classificação = Tipo (formato) × Categoria (tema) + Pastas
```

Navegação do admin deles (abas de "Conteúdos"): **Produtos | Materiais (Aulas · Biblioteca · Banco de Questões · Arquivos) | Flashcards | Trilhas | Oferta | Classificação**. Grupos/Membros moram na área **Membros**.

**Princípios bons a herdar:**
- **3 camadas desacopladas** (conteúdo × acesso × comercial) com o **Grupo de acesso** como unidade central de liberação.
- **Grupo com "tempo de acesso" embutido** (período relativo / vitalício / expiração fixa) — espelha nossos modos prazo_relativo / aberto / janela_fixa.
- **`hasAccess` como verdade única** — nunca inferir acesso de datas (`expiresAt=null` ≠ tem acesso).
- **Reuso transversal** (Biblioteca + Banco de Questões reaproveitáveis entre produtos, com contador de vínculos).
- **Drip / "entrega de conteúdo"** granular (sempre / data / X dias após matrícula / ambos), herdável do módulo e sobrescrevível na aula.
- **Situação multidimensional** (visibilidade × disponibilização × turmas × abertura comercial) em vez de um flag único.
- **Classificação em 2 facetas** (Tipo=formato, Categoria=tema) + Pastas hierárquicas.

**Limitações deles a NÃO repetir:**
- Dualidade "matrícula via grupo × matrícula direta em conteúdo" → ninguém sabe por que o aluno tem acesso. **Nós já temos 5 caminhos — esse é justamente o problema a matar.**
- Banco de questões **sem matéria/assunto** (só título) → classificação pobre para concurso. **Aqui nós superamos: taxonomia estruturada é nosso diferencial.**
- Config não herdável entre produtos (retrabalho). Preferir defaults herdáveis + override.

---

## 3. Arquitetura-alvo

### 3.1 Princípios

1. **O professor nunca vê "pasta/folder_area".** Ele vê conceitos de negócio: *Simulado, Banco de Questões, Material, Caderno, Produto, Turma*. A tabela física continua `simulado_pastas` por ora (migração de split é cara), mas o **domínio/UI esconde isso** atrás de nomes e telas dedicadas.
2. **Uma fonte de verdade de acesso.** Toda nova liberação passa por **um** fluxo (Produto/Grupo). Os 5 caminhos antigos continuam legíveis (compatibilidade), mas o admin ganha **um painel "Quem tem acesso e por quê"** (lê `lib/acesso/aluno-efetivo.ts`) e novos acessos não criam mais ambiguidade.
3. **Reconciliação automática, não manual.** Mudou membro de grupo → reconcilia roster↔matrícula na hora + cron de segurança + botão "reconciliar agora". Fim do "rode o script".
4. **Taxonomia é um cadastro, não efeito colateral.** Classificação vira tela de 1ª classe com autocomplete + "criar novo" explícito + merge. Acaba o get-or-create silencioso.
5. **Self-service seguro por permissão e (opcional) por escopo.** Professor opera tudo de conteúdo; coordenador/dono controla acesso comercial e tenant.
6. **Nada nasce perigoso.** `acesso_gratuito` deixa de ser `true` por padrão no wizard.

### 3.2 Árvore de navegação do Estúdio (espelha a Curseduca, no nosso domínio)

```
ESTÚDIO DE CONTEÚDO            (substitui os itens espalhados de hoje)
├─ Produtos                    pacotes que o aluno compra/acessa      → simulado_produtos (+itens)
├─ Materiais
│   ├─ Simulados               aplicações (o "core")                  → simulado_simulados
│   ├─ Banco de Questões       bancos reutilizáveis + questões        → simulado_pastas(is_folder=false) + simulado_questoes
│   ├─ Biblioteca              PDFs/docs/aulas (reuso transversal)    → simulado_conteudo_documentos
│   └─ Cadernos / Modelos      designer de blocos + OnlyOffice        → simulado_cadernos_designer / modelos
├─ Flashcards                  baralhos (FASE 2 — hoje em manutenção) → (novo)
├─ Trilhas / Jornadas          sequências de simulados/conteúdo       → cronogramas (adjacente) / novo
├─ Oferta & Liberação          preço + regras de venda + integrações  → liberacao_regras / produtos / integracoes
└─ Classificação               banca/órgão/cargo/ano/disciplina/      → simulado_bancas/orgaos/disciplinas/
                               assunto + etiquetas + dificuldade         assuntos/cargos + etiquetas

ALUNOS & ACESSO                (área irmã — operacional, não conteúdo)
├─ Estudantes                                                         → simulado_estudantes
├─ Turmas (Grupos)             grupos + hierarquia mestre/sub         → simulado_grupos / grupo_membros
└─ Acesso                      "quem tem acesso e por quê" (unificado)→ matrículas + grants + assinaturas + avulso
```

### 3.3 Mapa de equivalência (Curseduca → nosso domínio → tabelas reais)

| Curseduca/Waid | No nosso Estúdio | Tabela(s) reais |
|---|---|---|
| Produto (Pasta/Curso) | **Produto** | `simulado_produtos`, `simulado_produto_itens` |
| Módulo → Aula → Conteúdo | **Simulado** (+ questões/caderno) | `simulado_simulados`, `simulado_prova_questoes` |
| Banco de Questões | **Banco de Questões** | `simulado_pastas(is_folder=false)`, `simulado_questao_pasta`, `simulado_questoes` |
| Biblioteca | **Biblioteca** | `simulado_conteudo_documentos`, `_versoes`, `_documento_conteudos` |
| Arquivos complementares | anexos do simulado/aula | (storage + `arquivos`) |
| Flashcards | **Flashcards** (fase 2) | novo |
| Trilhas | **Trilhas/Jornadas** | cronogramas / novo |
| Oferta | **Oferta & Liberação** | `simulado_liberacao_regras`, ofertas |
| Grupo de acesso | **Turma + regra de acesso** | `simulado_grupos`, `simulado_pasta_grupos`, `simulado_matriculas`, `simulado_access_grants` |
| Membro / Matrícula | **Estudante / Acesso** | `simulado_estudantes`, `simulado_matriculas`, `simulado_assinaturas` |
| Classificação (Tipo×Categoria) | **Classificação** (taxonomia concurso) | `simulado_bancas/orgaos/cargos/disciplinas/assuntos`, `simulado_etiquetas` |
| Situação / disponibilização (drip) | **Situação + Liberação** | `simulados.status` + `regras.liberar_*` + `simulado_acessos` |
| `hasAccess` | **Acesso efetivo** (booleano server-side) | `lib/acesso/aluno-efetivo.ts` |

### 3.4 Modelo de acesso unificado (matar a ambiguidade dos 5 caminhos)

- **Leitura:** um único read-model `acessoEfetivoDoEstudante(estudante, simulado)` → `{ temAcesso: boolean, origem: 'matricula'|'grupo'|'produto'|'avulso'|'gratuito', detalhe }`. Já existe parcialmente; promover a **fonte oficial** usada por admin e pelo gate de início de sessão.
- **Escrita:** toda nova concessão feita pelo professor passa por **Turma→Produto** (ou avulso, quando sob medida). `acesso_gratuito` vira opção explícita e visível, **off por padrão**.
- **Painel "Acesso" por simulado/produto:** tabela com aluno × via (badges) × expira × origem rastreável — e botão **"Reconciliar acesso"** (roda `reconciliarGruposBancos` no escopo).
- **Reconciliação automática:** ao adicionar/remover membro de grupo vinculado a banco → `matricularEmSimuladosDoBanco` inline + cron de segurança. Fim do script manual.

### 3.5 Classificação (nosso diferencial sobre a Curseduca)

Tela própria com cadastros de **banca, órgão, cargo, ano, disciplina, assunto (árvore), etiquetas, dificuldade**. Ao criar questão: **autocomplete** sobre o cadastro + ação explícita "criar nova" (nunca duplicar por digitação). Ferramenta de **merge** integrada (reaproveita `disciplinas-actions.ts`/`taxonomia-actions.ts`). Isso é o que permite filtros ricos no banco e relatórios por matéria/assunto — coisa que a Curseduca não tem.

---

## 4. Controle de acesso self-service (RBAC + escopo)

Ordem do mais barato/urgente ao mais estrutural:

**Camada 0 — consertar o catálogo (pré-requisito, barato):**
- Alinhar `scripts/seed-rbac.mjs` ao `lib/rbac-catalogo.ts`: semear `produtos`, `liberacao`, `correcao`, `armazenamento`.
- Dar à **Biblioteca** permissão própria (`biblioteca:view/create/update/publicar`) em vez de `configuracoes`.
- Quebrar `grupos` em `view/create/update/manage`.
- Adicionar `/admin/biblioteca` e `/admin/leitura` ao `AREA_PERM` (gate de rota) — fim da armadilha "abre mas não salva".
- Backfill: rodar o seed de papéis em tenants **já existentes** (Revisão PGE), não só na criação.

**Camada 1 — papel `professor` de verdade (resolve "operar sozinho" sem escopo):**
Papel semente com: `questoes:*`, `simulados:*`, `biblioteca:*`, `leitura:*` (se fizer conteúdo de desafio), `estudantes:create/update`, `matriculas:create/update`, `grupos:create/update`, `produtos:manage`, `liberacao:view`. (Coordenador/dono fica com `liberacao:manage`, `integracoes`, `rbac`, `configuracoes`, tenant.)

**Camada 2 — escopo/ownership (FORA do MVP — decidido: professor mexe em TUDO do tenant; fica como fase futura opcional):**
- Nova tabela `simulado_acesso_escopos(user_id, tenant_id, dimensao['disciplina'|'produto'|'pasta'], ref_id)`.
- Estender `Access` (em `lib/auth/permissions.ts`) para carregar escopos; helper `accessScopeFilter(resource)` aplicado nas listagens/mutações de conteúdo (`.in('disciplina_id', escopos)` etc.).
- Usar `criado_por` como ownership implícito ("meus rascunhos").

**Observação de segurança:** o app roda com **service role (bypassa RLS)** e o isolamento de tenant é **manual** (`.eq('tenant_id')` em cada query). Logo o escopo tem de ser garantido **em código** em cada action de conteúdo. RLS "de verdade" (cliente autenticado + policies) é refatoração grande — fica como fase futura opcional.

---

## 5. Plano de construção faseado ("por fora → adapta ao admin")

> **Decidido (31/10/2026):** escopo **completo** (todas as áreas) e construção em **`/estudio`** no mesmo app, reusando as `actions.ts`/tabelas atuais. As fases abaixo são **ordem de construção**, não corte de escopo. A **Seção 8** traz a especificação detalhada de cada área (telas, campos, ações a reusar, mapa de dados) para o designer encaixar rápido no backend.

### Fase 0 — Fundação de acesso (destrava o resto, baixo risco)
- Catálogo RBAC alinhado + papel `professor` + backfill de papéis nos tenants existentes (Camadas 0–1 acima).
- `acesso_gratuito` default **off** no wizard.
- Reconciliação automática roster↔matrícula (inline + cron + botão).
- Painel unificado "Acesso" (read-model `acessoEfetivoDoEstudante` como fonte oficial).
> Entregável: professores já conseguem **mexer** no que existe hoje, e o acesso para de ser caixa-preta.

### Fase 1 — Estúdio "por fora" (módulo autocontido, rota nova `/estudio`)
Construir o novo hub como módulo isolado, sem tocar no admin atual, iterando UX livremente:
- **Produtos** e **Materiais › Simulados** e **Materiais › Banco de Questões** primeiro (o core).
- Esconder "pasta/folder_area" atrás dos conceitos de negócio.
- Reusar as `actions.ts` existentes por baixo (não reescrever a regra; só nova casca de UI e navegação). Seguir [[reuso-exato-nunca-lookalike]].
> Entregável: fluxo completo "criar questão → banco → simulado → publicar → liberar por turma/produto" numa navegação única e clara.

### Fase 2 — Completar os Materiais e Classificação
- **Biblioteca**, **Cadernos/Modelos** (unificar blocos + OnlyOffice num só lugar), **Classificação** (taxonomia 1ª classe + merge + autocomplete).
- **Arquivos complementares** por simulado/aula.

### Fase 3 — Adaptar o visual para dentro do admin
- Portar o Estúdio para dentro de `/admin`, **substituindo** os itens de menu espalhados (Questões, Simulados, Banco, Biblioteca, Produtos, Liberação, Grupos) por **Estúdio de Conteúdo** + **Alunos & Acesso**.
- Aplicar tokens/tema do admin (seguir skill `design-ui`, [[cores-sempre-via-token-personalizacao]], [[sem-faixas-laterais-largura-cheia]]).
- Depreciar as rotas antigas (redirect), como já foi feito com `/admin/banco-questoes`.

### Fase 4 — Extras (quando fizer sentido)
- **Flashcards**, **Trilhas/Jornadas** formais, **Oferta** comercial completa (checkout/combo), **escopo/ownership** por professor (Camada 2), e eventual split físico de `simulado_pastas` + RLS real.

---

## 6. Decisões confirmadas (31/10/2026)

1. **Escopo do professor:** *tudo do tenant* — sem camada de ownership/escopo por disciplina na reconstrução. Simplifica o RBAC (basta o papel `professor` amplo). Escopo por professor fica como fase futura opcional (Camada 2).
2. **Onde construir:** rota **`/estudio`** no mesmo app — reaproveita auth, tenant, tema e as `actions.ts` existentes; depois vira o menu do admin.
3. **Escopo do MVP:** **completo** — todas as áreas (Produtos, Simulados, Banco de Questões, Biblioteca, Cadernos, Classificação, Flashcards, Trilhas, Oferta & Liberação, Alunos & Acesso). As fases da Seção 5 são **ordem de construção**, não corte.
4. **`simulado_pastas`:** mantém a tabela faz-tudo, **escondida** atrás dos conceitos de negócio na UI; split físico só em fase futura.

> O usuário está mapeando todo o designer em paralelo → a **Seção 8 (Especificação detalhada por área)** existe para o encaixe designer↔backend ser mecânico.

## 7. Riscos & mitigações

- **Schema drift / migrations manuais** → antes do Estúdio, criar um checo de "migrations pendentes" visível no admin, e parar de depender de fallback "tolerante" que desliga feature em silêncio.
- **Service role sem RLS de backstop** → escopo garantido em código + testes de isolamento entre tenants.
- **Compatibilidade dos 5 caminhos de acesso** → não quebrar leitura do legado; só canalizar escrita nova por um fluxo + painel de diagnóstico.
- **Mudança de navegação confunde admin atual** → Fase 3 com redirects e um período de convivência.

---

## 8. Especificação detalhada por área (para o designer e o dev)

Cada área = rota `/estudio/<slug>`, **casca de UI nova reusando as `actions.ts`/tabelas atuais** (não reescrever regra). `/estudio` ainda não existe. "Reusar EXATO" = importar o componente/action existente, nunca recriar parecido ([[reuso-exato-nunca-lookalike]]). Nunca expor "pasta/folder_area/is_folder/categoria crua" ao professor — sempre o conceito de negócio. Abas = tab de linha sublinhada; largura cheia; cores via token.

> **Descoberta que atravessa tudo:** os "5 caminhos de acesso" **convergem por materialização** — grupo→banco e produto **não** criam gate próprio; eles gravam linhas em `simulado_matriculas`/`simulado_pasta_estudantes`. O gate de runtime (`app/api/auth/embed/identify/route.ts`) só lê: `simulado_acessos` (avulso), `ehSimuladoGratuito(regras)` (gratuito) e `simulado_matriculas` (matrícula) + desafio. **Problema central:** a matrícula **não guarda a origem** → "por que fulano tem acesso" se perde. O painel unificado (8.6c) existe para reconstruir isso.

### 8.1 Simulados — `/estudio/simulados`
- **Propósito:** criar, configurar, publicar, aplicar e acompanhar as provas (o core).
- **Telas:** board de cards por pasta (reusar `SimuladosBoard`) + abas Simulados/Desafios · wizard de 6 passos (`criar-context.tsx`: personalizar→questões→cadernos→estudantes→regras→salvar; rascunho em `sessionStorage`, salva só no fim) · detalhe com abas `visao-geral/questoes/estudantes/caderno/hud/relatorio/manutencao/configuracoes` (`[id]/page.tsx`).
- **Dados:** `simulado_simulados` (titulo, modo_aplicacao, status, data_inicio/fim em BRT, tempo_limite_min, metodo_identificacao, embed_token, pasta_id) + tudo em **`regras` jsonb** (banco_base_id, embaralhar_*, liberar_nota/gabarito/caderno, retentativas, politica_nota, acesso_gratuito…). Prova = `simulado_prova_questoes`; gate = `simulado_matriculas`.
- **Ações a reusar** (`app/admin/simulados/actions.ts` salvo nota): criar wizard → `criar/salvar.ts:criarSimuladoCompletoAction`; criar simples → `createSimuladoAction`; editar → `updateSimuladoAction` (merge de regras); publicar/encerrar/reabrir/excluir → `publishSimuladoAction`/`encerrarSimuladoAction`/`reabrirSimuladoAction`/`deleteSimuladoAction`; liberar nota/gabarito → `liberarItemAction`; habilitar abas de conteúdo → `garantirBancoSimuladoAction`; prova → `adicionar/remover/reordenar/importarQuestoesSimulado`; acompanhamento → `listarEstudantesSimulado`, `progressoEstudantesSimulado`, `resumoAoVivoSimulado`, `listarSessoesSimulado`; testadores → `listarTestadores`/`concederTestadores`/`revogarTestador`; avulso → `acesso-actions.ts`; anulação → `recorrecao-actions.ts`.
- **Regras:** publicar exige ≥1 questão e (janela_fixa) data_inicio; nasce rascunho. **Fix:** `acesso_gratuito` deve nascer `false` (hoje `criar-context.tsx:~133` nasce `true` → libera p/ todos). Gate `simulados:*`.
- **Gaps (NOVO):** referenciar banco existente (hoje wizard cria banco 1:1) → `vincularBancoAoSimulado(simuladoId,bancoId)`; "desmembrar/fork" de banco compartilhado (só há aviso "em breve"); botão "Reconciliar acesso".

### 8.2 Banco de Questões — `/estudio/banco-questoes`
- **Propósito:** acervo de questões (criar/editar/importar/classificar) + bancos reutilizáveis que alimentam simulados. **Virar 1ª classe** (hoje `banco-questoes/page.tsx` é só `redirect('/admin/simulados')`).
- **Telas:** acervo de questões (reusar **`QuestoesTabelaBase`** + `QuestoesFilters` + `PaginationControls` server-side) · **lista de bancos (NOVA casca)** lendo `simulado_pastas is_folder=false folder_area∈('','banco')` (filtro `lib/simulado/pasta-area.ts:ehPastaBanco`) com contador de simulados vinculados (`simuladosDoBanco`) · detalhe do banco (questões/estudantes/caderno/HUD/capa).
- **Dados:** `simulado_questoes` (+ `simulado_alternativas`, `simulado_competencias`), `simulado_questao_pasta` (N:N questão×banco), `simulado_questao_etiquetas`, `simulado_pastas` (banco), `simulado_pasta_estudantes`/`_grupos`.
- **Ações a reusar:** questões (`questoes/actions.ts`): `createQuestaoAction`, `updateQuestaoAction`, `excluirQuestoes`, `verificarUsoQuestoes`, `hospedarImagemQuestaoAction`. Import (`banco-questoes/actions.ts`): `analisarQuestoesImport`, `confirmarImportQuestoes`. Bancos: `criarBanco`, `renomearBanco`, `atualizarBanco`, `duplicarBanco`, `excluirBanco`, `adicionarQuestoes`/`removerQuestoes`, `reordenarQuestoesBanco`, `buscarQuestoesForaBanco`, `salvarGruposBanco`, `carregarHudBanco`/`salvarHudBanco`. Estudantes/grupos (`estudantes-actions.ts`): `vincularEstudantes`, `vincularGrupoAoBanco`, `desvincularGrupoDoBanco`, `importarEstudantesLote`, `associarCaderno`, `subirMaterialPdf`. Ponte (`lib/simulado/banco-do-simulado.ts`): `bancoDoSimulado`, `simuladosDoBanco`, `garantirBancoDoSimulado`.
- **Regras:** objetiva ≥2 alternativas, exatamente 1 correta; reimport nunca mexe no gabarito existente; soft-delete. Gate `questoes:*` (delete usa `questoes:delete`, ausente do seed).
- **Gaps (NOVO):** lista de bancos; painel "quais simulados usam este banco"; `reconciliarAcessoBancoAction(bancoId)` (botão "Reconciliar agora"); fork.

### 8.3 Classificação — `/estudio/classificacao`
- **Propósito:** cadastro de banca/órgão/cargo/ano/disciplina/assunto (árvore)/dificuldade/etiquetas — o diferencial sobre a Curseduca. Hoje espalhado em `questoes` (abas Taxonomia/Disciplinas) + `etiquetas`.
- **Telas:** 1 tela, sub-abas por tipo (Disciplinas·Assuntos·Bancas·Órgãos·Cargos·Anos·Dificuldade·Etiquetas), cada uma com tabela padrão (busca+ordenar+contagem) + "Novo" explícito + "Mesclar/Unificar". Reusar `TaxonomiaUnificacao`, `DisciplinasClassificacao`, `etiquetas-client`.
- **Dados:** entidades c/ tabela+FK: `simulado_disciplinas`, `simulado_assuntos` (pai_id=árvore), `simulado_bancas`, `simulado_orgaos`; valores em coluna de `simulado_questoes` (`cargo`, `ano`, `assunto_detalhe`, `nivel_dificuldade`); etiquetas `simulado_etiquetas` (+ função anular/avisar/desconsiderar) N:N `simulado_questao_etiquetas`.
- **Ações a reusar:** `taxonomia-actions.ts` (`listarTaxonomia`, `previewUnificacaoTax`, `unificarTaxonomia`); `disciplinas-actions.ts` (`unificarDisciplinas` RPC atômica + `desfazerUnificacao`, `atualizarDisciplinaClassificacao`, `vincularPastaDisciplina`); `etiquetas/actions.ts` (`criarEtiqueta`, `atualizarEtiqueta`, `aplicarEtiqueta`…).
- **Fim do "get-or-create" (NOVO):** hoje a taxonomia nasce por nome ao salvar/importar (`resolveByName`/`resolveAssunto`) → gera "Dir. Civil" vs "Direito Civil". Criar: `criarItemTaxonomia(tipo,nome,paiId?)`, `renomearItemTaxonomia(tipo,id,nome)`, `buscarTaxonomia(tipo,termo)` (autocomplete); o editor de questão passa a gravar `*_id` (combobox "escolher ou criar"). **Manter** o get-or-create só na **importação em massa** (planilha não tem ids). Gate sob `questoes:*` (ou criar `classificacao:*`).

### 8.4 Produtos — `/estudio/produtos`
- **Propósito:** pacote que o aluno compra/acessa; container de identidade visual + vitrine + o que libera (itens) + fontes de integração + membros + avisos. Destino recomendado de concessão nova (junto com Turma).
- **Telas:** listagem (reusar `listarProdutosAction`) · editor rico com **5 abas existentes** (reusar `ProdutoEditor`): Identidade · Vitrine · Acesso · Membros · Avisos.
- **Dados:** `simulado_produtos` (nome, slug NOT NULL, tipo, tier, validade_*, branding, ativo, ordem), `simulado_produto_itens` (tipo_item grupo|banco|simulado|biblioteca_pasta|biblioteca_doc|desafio|cronograma + permissoes jsonb), `_fontes`, `_secoes`, `_avisos`, `simulado_assinaturas`.
- **Ações a reusar** (`produtos/actions.ts`): `listarProdutosAction`, `getProdutoAction`, `salvarProdutoAction` (reescreve a linha inteira), `excluirProdutoAction`, `salvarFontesAction`, `salvarItensAction`/`salvarVitrineAction`/`salvarGruposAction`, `adicionarMembrosAction` (→ `lib/produtos/conceder.ts:concederProduto`), `removerMembroAction`, `listarRecursosAction`, avisos. Ao conceder, **materializa** em `simulado_grupo_membros`/`pasta_estudantes`/`matriculas`/`cronograma_matriculas` com carimbo `origem`.
- **Regras:** nome obrig., slug auto; `concederProduto` idempotente; tier só eleva. Gate `produtos:view/manage` — ⚠️ **não semeado** (ver §9). `biblioteca_doc` ainda não materializa acesso (TODO).

### 8.5 Oferta & Liberação — `/estudio/oferta`
- **Propósito:** regras de venda (webhooks Hotmart/Guru/Kiwify/Hubla/Curseduca…) que, ao casar um pedido, concedem Produtos com janela calculada. **Grants (`simulado_access_grants`) = fonte de verdade**; reconciliador materializa pelos itens do Produto (mesmo caminho do catálogo).
- **Telas:** Regras (listagem + `regra-editor.tsx`: filtros plataformas/produtos/ofertas/período, início immediate/after_days/fixed_date, fim lifetime/…, produtos concedidos) · Pedidos (paginada, chips por processing_state, busca) · Mapeamento de status · Simulador dry-run · **costurar** Integrações/Conexões (hoje em `/admin/integracoes` e `/admin/conexoes/webhooks`).
- **Dados:** `simulado_liberacao_regras` (+ `_regra_produtos`), `simulado_access_grants` (UNIQUE pedido+regra+produto), `simulado_liberacao_pedidos`, `simulado_status_mappings`.
- **Ações a reusar** (`liberacao/actions.ts`): `salvarRegraAction` (valida `motor.ts:validarRegra` + `engine.ts:reconciliarRegra`), `pausarRegraAction`/`retomarRegraAction`/`cancelarRegraAction`/`excluirRegraAction`, `reprocessarPendentesAction`, `simularPedidoAction`, `salvarStatusMapAction`; leituras `dados.ts:listarRegras`/`listarPedidos`/`listarProdutosParaSeletor`. Runtime: `engine.ts:aplicarPedidoComRegras`, `processarTransicoesGrants` (cron `app/api/cron/liberacao-transicoes`).
- **Regras:** casamento AND (dimensão vazia=curinga); pausar só barra concessões novas; cancelar é terminal. Gate `liberacao:view/manage` — ⚠️ **não semeado** (§9). ⚠️ `simulado_access_grants` pode faltar sem migração `20261030000001`.

### 8.6 Alunos & Acesso — `/estudio/alunos` (Estudantes · Turmas · Acesso)
**(a) Estudantes** `/estudio/alunos/estudantes`
- Listagem paginada + KPIs + busca (nome/email/CPF/tel/email secundário) + coluna "produtos ativos". Ações (`estudantes/actions.ts`): `carregarLoteEstudantes`, `kpisEstudantes`, `createEstudanteAction`, `editarEstudanteAction`, `deleteEstudanteAction`, `exportarTodosEstudantes`. Dados `simulado_estudantes` (email único por tenant; `classificacao`, `emails_secundarios[]`). Gate `estudantes:*` (único módulo granular completo).

**(b) Turmas/Grupos** `/estudio/alunos/turmas`
- Árvore mestre/sub (`simulado_grupos.is_mestre`/`pai_id`; `lib/simulado/grupos.ts`). Ações (`grupos/actions.ts`): `criarGrupo`, `criarGrupoMestre`, `moverGrupo` (anti-ciclo), `editarGrupo`, `adicionarMembros`, `importarMembros` (email/CPF/nome, .csv/.txt/.xlsx), `esvaziarGrupo`, `removerMembro`, `engajamentoGrupo`.
- **Reconciliação roster↔matrícula:** ADIÇÃO já propaga inline (`adicionarMembros`→`sincronizarBancosDoGrupo`→`propagarGrupoAosBancos`+`matricularEmSimuladosDoBanco`); rede de segurança `reconciliarGruposBancos` (cron). ⚠️ **Assimetria (NOVO):** `removerMembro`/`esvaziarGrupo` **não desmatriculam** dos simulados do banco — prever desmatrícula simétrica ou botão de reconciliação. Ver [[simulado-grupo-banco-propagacao]].
- ⚠️ Gate `grupos` só tem `view` = controle total → quebrar em `view/create/update/manage` (§9).

**(c) Acesso unificado** `/estudio/alunos/acesso` 【peça central】
- **Hoje:** `lib/acesso/aluno-efetivo.ts:acessoEfetivoDoEstudante` existe mas é **só por PRODUTO** (une grants+assinaturas), já plugado na aba Acesso do aluno (`components/admin/estudante-acesso.tsx`).
- **NOVO (o coração de "matar a ambiguidade"):** um read-model **por simulado** `quemTemAcessoAoSimulado(simuladoId)` / `acessoEfetivoNoSimulado(est,sim)` que **consolida e classifica a origem** cruzando `simulado_matriculas` + grupo→banco (`pasta_grupos`+`grupo_membros`+`regras.banco_base_id`) + produto (`produto_itens`) + `simulado_acessos` (avulso) + `regras.acesso_gratuito`. Promover a **fonte oficial** usada pelo admin **e** pelo gate de runtime. Painéis: por aluno e por simulado (tabela aluno × origem[badge matrícula/grupo/produto/avulso/gratuito] × expiração × status) + botão **"Reconciliar acesso"** (`reconciliarGruposBancos`/`matricularEmSimuladosDoBanco`/`processarTransicoesGrants`).
- **Fluxo ÚNICO de concessão nova:** Turma → Produto (ou Avulso `acesso-actions.ts:concederAcesso` quando sob medida). Evitar matrícula direta sem origem e `acesso_gratuito`.

### 8.7 Biblioteca — `/estudio/biblioteca`
- **Propósito:** Drive de materiais versionados (PDF/DOCX/HTML/…) → trechos → leitor do aluno. Hoje `/admin/biblioteca` (SPA `biblioteca-client.tsx`), coleção `?tab=conteudo`.
- **Telas:** grid tipo Drive (`listarArvore`) · drawer de detalhe (prévia/versões/acesso/vínculos) · **modal "Liberar acesso" hierárquico** (reusar `DriveAcessoDialog`: `montarArvoreAcessoDrive`+`salvarAcessoNo`; papéis reader/commenter/editor, herança, toggles ler/baixar/grifar) · editor OnlyOffice (`/editar/[versaoId]`).
- **Dados:** `simulado_conteudo_documentos` (titulo, tipo_origem, categoria, status, versao_atual_id, toggles pode_ler/baixar/grifar/imprimir, janela liberado_de/ate), `simulado_conteudo_versoes`, `simulado_conteudo_trechos`, `simulado_pastas(folder_area='conteudo')`, `_documento_grupos`/`_documento_estudantes`, `_vinculos_leitor`, `_anotacoes` (grifos).
- **Ações a reusar** (`biblioteca/actions.ts` + `gestao-actions.ts`): `criarPasta`/`moverPasta`, `prepararUploadConteudo`+`importarDeStorage`, `criarDocumentoBranco`, `publicarNovaVersao`/`publicarDocumento`, `abrirEdicaoDocx`, `montarArvoreAcessoDrive`/`salvarAcessoNo`, `salvarProtecaoConteudo`/`definirVisibilidadeConteudo`, `adicionarVinculoLeitor`.
- ⚠️ **3 correções (CHAVE):** (1) `guard()` usa `configuracoes:*` → trocar por **`biblioteca:view/create/update/publicar`** (criar no catálogo + seed + papel professor); (2) nasce bloqueada por `lib/sistema/manutencao-areas.ts` (`key:'biblioteca', padraoBloqueado:true`) → `/estudio/biblioteca` padrão liberado; (3) adicionar ao `AREA_PERM` (`app/admin/layout.tsx`) — hoje "abre mas não salva".
- **Dep.:** alimenta o leitor do aluno (`lib/conteudo/leitor.ts`, leitor compartilhado `public/leitura/leitor-jus.html` — reusar EXATO). Doc/pasta pode ser item de Produto.

### 8.8 Cadernos / Modelos — `/estudio/cadernos`
- **Propósito:** designer de caderno (capa/folha/questões/gabarito/diagnóstico) entregue no PDF do simulado. **Fragmentado em 3 lugares — unificar é o ponto:**
  1. `/admin/modelos-caderno` → `simulado_caderno_modelos` (block designer "teste"), guard `questoes:view`, flag `MODELOS_CADERNO_ATIVO`.
  2. `/admin/cadernos` → `simulado_cadernos_designer` (block designer "Gutenberg", config jsonb docsV2/material/bancoId), guard `questoes:create/update`.
  3. `/admin/biblioteca?tab=modelos` → `simulado_conteudo_documentos categoria='modelo_caderno'` (OnlyOffice .docx), guard `configuracoes:view`.
- **NOVO:** hub `/estudio/cadernos` com abas "Designer de blocos" × "Modelos .docx" reusando os grids por props. Ações: `modelos-caderno/actions.ts` (`carregarModelosArea`, `abrirModelo`, `salvarModelo`, `duplicarModelo`, pastas…), `cadernos/actions.ts`, OnlyOffice da Biblioteca.
- **Dep./entrega:** blocos consomem questões do Banco; o que o aluno baixa vem de `simulado_pastas.caderno_entrega` (jsonb) via `lib/caderno-teste/entrega-aluno.ts` ([[diagnostico-entrega-wiring]]). Geometria A4 em `lib/caderno-designer/types.ts`. Gate: unificar sob `questoes:*` (ou criar `cadernos:*`).

### 8.9 Flashcards — `/estudio/flashcards`
- **Propósito:** baralhos SRS/Leitner. **Hoje incipiente:** cartões presos a um documento da Biblioteca; sem deck standalone nem UI própria; migração `20261027000000_flashcards.sql` pode não estar em prod (actions toleram).
- **Existe:** autoria no drawer do documento — `biblioteca/flashcards-actions.ts`: `listarFlashcardsDoMaterial`, `criarFlashcardMaterial`, `atualizarFlashcardMaterial`, `removerFlashcardMaterial`, `reordenarFlashcardsMaterial`. SRS puro em `lib/flashcards/tipos.ts`. Dados `simulado_flashcards` (documento_id, frente, verso, ordem, ativo) + `simulado_flashcard_revisoes` (caixa Leitner).
- **NOVO:** casca `/estudio/flashcards` (lista de baralhos + estatísticas) e, p/ deck independente de documento, tabela `simulado_flashcard_baralhos` + `baralho_id` em `simulado_flashcards`. Gate: hoje `configuracoes:*` (errado) → `biblioteca:*` ou novo `flashcards:*`.

### 8.10 Trilhas / Jornadas — `/estudio/trilhas`
- **Propósito:** sequência ordenada de simulados/conteúdos/produtos com pré-requisito. **Majoritariamente NOVA** — não há tabela de Trilha formal.
- **Reusar:** `simulado_produto_itens` (já é lista ordenada heterogênea com `ordem`) como base; editor de semanas/montagem do Cronograma (`cronogramas/**`, `criar/secao-montagem.tsx`); primitivo `simulado_pastas.regra_sequencial` (desbloqueio sequencial); trilha visual de gamificação (`trilha_estilo` cards/caminho) na visão do aluno.
- **NOVO:** tabelas `trilha`/`trilha_etapa` (etapa: tipo_item, item_id, ordem, regra_desbloqueio sempre|sequencial|nota_min|dias_apos, parametro) + CRUD + **motor de desbloqueio server-side** (consulta `aluno-efetivo.ts` + sessões/notas — backend-first). Gate `cronogramas:*` ou novo `trilhas:*`.

---

## 9. RBAC do Estúdio (consolidado)

**Permissões a semear em `simulado_permissions` (hoje no `rbac-catalogo.ts` mas NÃO no `seed-rbac.mjs` → impossíveis de marcar na matriz):** `produtos:view/manage`, `liberacao:view/manage`, `correcao:view/corrigir`, `armazenamento:view/manage`, e `questoes:delete` (checado por `excluirQuestoes` mas ausente do seed).
**Permissões NOVAS a criar no catálogo + seed:** `biblioteca:view/create/update/publicar`; quebrar `grupos` em `view/create/update/manage` (hoje só `view` = controle total). Opcionais: `cadernos:*`, `flashcards:*`, `trilhas:*`, `classificacao:*` (ou manter sob `questoes:*`/`cronogramas:*`).
**Papel semente `professor` (novo; hoje o mais próximo é `admin_conteudo`, semeado pobre):** `questoes:*`, `simulados:*`, `biblioteca:*`, `estudantes:create/update`, `matriculas:create/update`, `grupos:create/update`, `produtos:manage`, `liberacao:view`, `cronogramas:*`, `correcao:corrigir`. (Cadernos/Classificação ficam sob `questoes:*`.) Coordenador/dono fica com `liberacao:manage`, `integracoes:manage`, `rbac`, `configuracoes`, tenant.
**Infra de enforcement:** adicionar `/estudio/*` ao `AREA_PERM` (`app/admin/layout.tsx`); tirar a Biblioteca do `padraoBloqueado` para `/estudio`; **rodar o seed de papéis nos tenants já existentes** (ex.: Revisão PGE — hoje `admin_conteudo` pode nem existir → `permissions: []`).

## 10. NOVO vs REUSO — backlog de construção

**Reaproveitável como está** (maior parte): todas as `actions.ts` e componentes citados em §8 (board de simulados, wizard, `ProdutoEditor`, `regra-editor`, Drive de biblioteca, grids de caderno, taxonomia/disciplinas, grupos, estudantes). O Estúdio é **casca + navegação**, não reescrita.

**Precisa ser construído (NOVO):**
1. **Acesso transparente:** read-model por simulado `quemTemAcessoAoSimulado`/`acessoEfetivoNoSimulado` (classifica origem) + painéis "quem tem acesso e por quê" + botão "Reconciliar acesso" (§8.6c). Peça central.
2. **Banco 1ª classe:** lista de bancos (§8.2), `vincularBancoAoSimulado`, painel "simulados que usam este banco", fork/desmembrar.
3. **Reconciliação simétrica:** desmatrícula ao remover membro de grupo (§8.6b) + `reconciliarAcessoBancoAction`.
4. **Classificação sem get-or-create:** `criarItemTaxonomia`/`renomearItemTaxonomia`/`buscarTaxonomia` + editor de questão gravando `*_id` (§8.3).
5. **Cadernos unificados:** hub `/estudio/cadernos` sobre as 3 fontes (§8.8).
6. **Flashcards standalone:** casca + tabela de baralho (§8.9).
7. **Trilhas:** tabelas + motor de desbloqueio server-side (§8.10).
8. **RBAC §9** (catálogo + seed + papel professor + AREA_PERM + backfill).
9. **Fix:** `acesso_gratuito` default OFF no wizard (`criar-context.tsx`).

**Migrações pendentes a garantir em prod antes de ligar áreas:** `20261027000000_flashcards`, `20261030000001_liberacao_regras` (grants), `caderno_modelos`, colunas de grupo `cor/pai_id/is_mestre`. Criar um **check de "migrations pendentes" visível no admin** (parar de depender de fallback "tolerante" que desliga feature em silêncio).

---

### Apêndice — arquivos-âncora (para quem for implementar)
- Wizard/criação: `app/admin/simulados/criar/{criar-context,salvar,acoes,criar-stepper}.tsx`
- Banco/ponte: `app/admin/banco-questoes/actions.ts`, `lib/simulado/{banco-do-simulado,pasta-area,matricular-banco,reconciliar-grupos-bancos}.ts`
- Questões/taxonomia: `app/admin/questoes/{actions,taxonomia-actions,disciplinas-actions}.ts`
- Acesso: `lib/acesso/aluno-efetivo.ts`, `app/admin/{matriculas,simulados/acesso-actions}.ts`, `lib/integracoes/liberacao/{motor,tipos}.ts`
- Produtos: `app/admin/produtos/actions.ts`, `lib/produtos/*`
- RBAC: `lib/rbac-catalogo.ts`, `lib/auth/{permissions,onboard-tenant}.ts`, `scripts/seed-rbac.mjs`, `app/admin/layout.tsx` (`AREA_PERM`), `components/auth/can-provider.tsx`
- Referência Curseduca: `help.waid.io` (produtos, biblioteca, banco-de-questoes, trilhas, grupo-de-acessos); nossa integração `lib/curseduca/{client,import-core}.ts`, `lib/integracoes/providers/curseduca.ts`
