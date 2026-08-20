# Módulo Cronograma — plano de implementação

> **Documento de trabalho da branch `feat/modulo-cronograma`.**
> Par técnico da especificação funcional [ESPECIFICACAO_CRONOGRAMA.md](ESPECIFICACAO_CRONOGRAMA.md):
> a spec diz **o que** a aplicação faz; este plano diz **como** ela entra nesta plataforma e
> **onde cada regra vive no código**. As regras são referenciadas pelo número (R1–R21) da spec.
> Criado em 20/08/2026, a partir da `main` em `d003b20`.

## Context

Existe hoje um **gerador de cronogramas legado**, fora desta plataforma: um `index.html` sem login, onde
qualquer visitante escolhe um cronograma pronto, informa a data de início e baixa dois DOCX e um CSV.
Nada é persistido — o próprio aviso em tela diz que, se o aluno não baixar o arquivo, perde o trabalho.
Não há controle de quem usou, nem de quem pode usar.

Este plano traz esse gerador para dentro da plataforma de simulados, resolvendo as três lacunas que
motivaram a migração:

1. **Autenticação** — o aluno passa a gerar logado, pela sessão que a plataforma já tem.
2. **Permissão** — nem todo aluno terá acesso; a liberação espelha exatamente o mecanismo já usado
   para simulados (grupo → matrícula), para a equipe não precisar aprender um segundo modelo.
3. **Rastreio** — toda emissão fica registrada: quem emitiu, quando, o que emitiu e sob que forma.

Some-se a isso um **CRUD** para a equipe pedagógica manter o catálogo (hoje ele vive congelado dentro
do HTML) e a correção de duas armadilhas que a própria especificação aponta.

A especificação funcional completa está em [docs/ESPECIFICACAO_CRONOGRAMA.md](docs/ESPECIFICACAO_CRONOGRAMA.md)
— 529 linhas, com as regras de negócio numeradas R1–R21. Este plano não a repete: referencia as regras
pelo número e descreve **onde cada uma vive no código**.

### Decisões tomadas com o usuário

| Tema | Decisão |
|---|---|
| Escopo | Módulo inteiro nesta branch (CRUD + gerador + 3 exportações + importador + RBAC + auditoria) |
| Liberação ao aluno | Vínculo por grupo **+** matrícula por aluno como portão final (espelha o simulado) |
| Válvulas de escape | As três do simulado: cronograma gratuito, acesso avulso com prazo, testadores |
| Quem emite | Aluno liberado (para si) **e** equipe com permissão (em nome de um aluno) |
| Meta tipo `simulado` | Aponta para simulado **interno** (vínculo real) **ou** **externo** (nome + URL) |
| Sem matrícula no simulado interno | Meta aparece na grade, com aviso de sem acesso (reusa `SemAcessoModal`) |
| DOCX | Fiel, **com as artes originais** (copiadas para `apps/web/public/cronograma/`) |
| Dados seed | **Encontrados** em `~/.claude/www/revisao/cronograma/seed/dados/` — 24/16.697/405, conferidos. Importador primeiro; a carga roda por ele |
| Persistência | O aluno **guarda vários** cronogramas emitidos e reabre qualquer um |
| Catálogo | **Por tenant** — `tenant_id` em toda tabela, como o resto do sistema |

### O gerador legado e seus dados (achado em 20/08)

O gerador antigo está **rodando na máquina do usuário** e o repositório dele tem o que faltava:

| Onde | O quê |
|---|---|
| `~/.claude/www/revisao/cronograma/` | O gerador legado (nginx :8082) — `index.html`, `assets/`, `seed/` |
| `~/.claude/www/revisao/cronograma_v2/` | Uma segunda tentativa de reescrita (Postgres :5439) |
| `.../cronograma/seed/dados/*.json` | **24 cronogramas · 16.697 metas · 405 links** — contagens batem com a spec §10 |
| `.../cronograma/assets/*.png|jpg` | Capa, cabeçalho, rodapé e capa da ficha — copiados para `apps/web/public/cronograma/` |

**Formato dos JSONs, já conferido contra o modelo de dados:**

- `cronogramas.json` — `slug, nome, subtitulo, total_semanas, dias_curso, dias_nome, semanas_revisao, carga_horaria, fonte` → mapeamento direto para `simulado_cronogramas`.
- `atividades.json` — `cronograma_slug, semana, dia, tipo, disciplina, aula, conteudo, duracao, ordem`.
- `aulas-links.json` — `disciplina, aula, tema, url_qc, url_tec`.

Dois pontos que mudam o risco do importador:

1. **`aula` já vem como string** (`"01"`, `"1"`, `"1.1"`), com **zero** valores numéricos nos 16.697
   registros. O risco nº 2 da seção 8 não se materializa na carga inicial — mas continua valendo para
   planilhas que a equipe subir depois, então a validação permanece.
2. **O tipo `simulado` não aparece em nenhuma das 16.697 linhas**, confirmando a armadilha da spec §7.
   Como a decisão foi mantê-lo e ligá-lo aos simulados da plataforma, ele nasce vazio e passa a ser
   preenchido pelo CRUD.

As artes ficam em `apps/web/public/cronograma/` (3,4 MB) e são lidas do disco na geração do DOCX —
não em base64, que inflaria o bundle em ~4,5 MB. O `Dockerfile` do web já copia `public/` para a
imagem (linha 43), então funcionam em produção sem mudança de build.

### Correções deliberadas ao comportamento legado

A spec marca essas três como "corrigir ao recriar" — o plano as adota:

- **R18** — `carga_horaria` deixa de ser deduzida do nome e vira **campo explícito obrigatório**.
  Hoje renomear "12 Matérias (6 horas)" para "12 Matérias – 6h" muda silenciosamente o grupo do cronograma.
- **R19** — a faixa semanal passa a ser lida de `dias_curso`, onde a informação realmente está.
- **Filtros** — filtram **ao vivo**, sem exigir novo clique em "Gerar" e sem apagar o resultado.

---

## 1. Modelo de dados

Uma migration nova: `supabase/migrations/20260820000010_cronograma.sql`.

Segue o padrão das tabelas recentes ([20260710000004_relatorio_eventos.sql](supabase/migrations/20260710000004_relatorio_eventos.sql)):
prefixo `simulado_`, `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`, `tenant_id uuid NOT NULL` (sem FK),
`criado_em`/`atualizado_em timestamptz NOT NULL DEFAULT now()`, tudo `IF NOT EXISTS`, RLS ligada com policy
de isolamento por tenant aplicada em bloco `DO $$ FOREACH` (padrão de [20260715000001_integracoes.sql](supabase/migrations/20260715000001_integracoes.sql)),
e `NOTIFY pgrst, 'reload schema';` no fim.

### Catálogo

**`simulado_cronogramas`** — a unidade do catálogo e do CRUD.
```
id, tenant_id, slug, nome, subtitulo, total_semanas int, dias_curso int[], dias_nome text[],
semanas_revisao int[], carga_horaria numeric NOT NULL, ordem int, fonte jsonb,
status text CHECK (status IN ('rascunho','liberado')) DEFAULT 'rascunho',
regras jsonb DEFAULT '{}',            -- abriga acesso_gratuito (padrão do simulado)
liberado_em timestamptz, liberado_por uuid,   -- spec §8 exige guardar quem liberou
deletado bool DEFAULT false, deletado_em, deletado_por,
criado_em, atualizado_em
UNIQUE (tenant_id, slug)
```
`carga_horaria` é **coluna**, não derivação (R18). `acesso_gratuito` vai em `regras` (jsonb) porque é
exatamente assim que o simulado faz — ver [lib/simulado/gratuito.ts](apps/web/lib/simulado/gratuito.ts),
que documenta a escolha de flag sem migração.

**`simulado_cronograma_metas`** — uma linha da grade (16.697 no total).
```
id, tenant_id, cronograma_id, semana int, dia int, tipo text, disciplina text,
aula text, conteudo text, duracao text, ordem int,
simulado_id uuid,              -- meta que aponta simulado INTERNO
simulado_externo_nome text,    -- meta que aponta simulado EXTERNO
simulado_externo_url text,
criado_em
INDEX (tenant_id, cronograma_id, semana, dia)
CHECK (tipo IN ('pdfull','quest','legproc','flash','juris','simulado'))
```
Duas observações que valem código:
- **`aula` é TEXT, nunca número.** Convivem `"01"`, `"1"` e `"1.1"`, e o casamento com os links é exato
  (R11) — `"01"` não encontra `"1"`. Qualquer normalização numérica quebra 405 links.
- **`dia` é índice dentro de `dias_curso`**, não o dia da semana (R3). `dia = 0` é "o primeiro dia de
  curso". Num cronograma `[1,2,3,4,5,6,0]` o domingo é o **último** dia, não o primeiro.

**`simulado_cronograma_links`** — tabela global por tenant (não por cronograma).
```
id, tenant_id, disciplina, aula, tema, url_qc, url_tec, criado_em, atualizado_em
UNIQUE (tenant_id, disciplina, aula)
```

### Liberação — espelha o simulado

**`simulado_cronograma_matriculas`** — o portão final, igual a `simulado_matriculas`.
```
id, tenant_id, estudante_id, cronograma_id, liberado bool DEFAULT true,
status text CHECK (status IN ('ativa','expirada','cancelada')) DEFAULT 'ativa', criado_em
UNIQUE (tenant_id, estudante_id, cronograma_id)
```

**`simulado_cronograma_grupos`** — vínculo grupo → cronograma, espelhando `simulado_pasta_grupos`.
```
id, tenant_id, cronograma_id, grupo_id, criado_em
UNIQUE (cronograma_id, grupo_id)
```
> **Divergência deliberada:** o simulado propaga por uma cadeia de quatro saltos
> (`grupo_membros` → `pasta_grupos` → `pasta_estudantes` → `matriculas`), porque o simulado herda do
> "banco" (pasta). Cronograma **não pertence a banco nenhum**, então o vínculo é direto:
> grupo → cronograma → matrícula. Dois saltos em vez de quatro, mesmo resultado e mesma semântica
> para a equipe.

**`simulado_cronograma_acessos`** (avulso com prazo) e **`simulado_cronograma_testadores`** — cópias
estruturais de `simulado_acessos` e `simulado_testadores`.

### Emissões — duas tabelas, duas perguntas diferentes

O módulo precisa responder a duas coisas que **não são a mesma**: *"que cronogramas este aluno tem?"*
(para ele reabrir) e *"o que foi emitido, por quem, quando?"* (auditoria). O projeto já separa exatamente
assim em outro lugar — `simulado_audit_logs` guarda **quem fez o quê**, e `simulado_relatorio_eventos`
guarda **telemetria de visualizou/baixou**. Seguimos o mesmo corte.

**`simulado_cronograma_emissoes`** — **é o cronograma salvo do aluno**, e ao mesmo tempo o registro de
quem o criou. O aluno mantém vários e reabre qualquer um.
```
id, tenant_id, cronograma_id,
estudante_id uuid,                  -- para QUEM é o cronograma
ator_tipo text CHECK (ator_tipo IN ('estudante','usuario')),
ator_id uuid,                       -- QUEM emitiu (o próprio aluno ou um membro da equipe)
titulo text,                        -- rótulo editável, p/ o aluno distinguir os seus
formulario jsonb NOT NULL,          -- nome, carga, data início, revisões, recesso, paleta
resumo jsonb,                       -- semanas, atividades, data de conclusão (os 4 números do topo)
is_teste bool DEFAULT false,        -- emissão de testador fica fora das estatísticas
arquivada bool DEFAULT false,
criado_em, atualizado_em
INDEX (tenant_id, estudante_id, criado_em DESC), INDEX (tenant_id, cronograma_id)
```
Guardamos **o formulário, não a grade montada**. A grade tem milhares de linhas e é 100% derivável:
`montarGrade(cronograma, metas, formulario)` reconstrói igual, e — vantagem real — se a equipe corrigir
uma meta no catálogo, o cronograma do aluno reflete a correção ao reabrir, em vez de ficar congelado
num retrato velho.

`ator_tipo = 'estudante'` com `ator_id = estudante_id` é emissão própria; `ator_tipo = 'usuario'` com
`estudante_id` de outra pessoa é emissão pela equipe em nome do aluno. Um só registro cobre os dois casos.

**`simulado_cronograma_downloads`** — uma linha por clique de exportação, para a auditoria fina.
```
id, tenant_id, emissao_id, botao text CHECK (botao IN ('docx','ficha','csv')),
ator_tipo, ator_id, criado_em
INDEX (tenant_id, emissao_id), INDEX (tenant_id, criado_em DESC)
```
Espelha `registrarRelatorioEvento` de [lib/relatorio-eventos.ts](apps/web/lib/relatorio-eventos.ts):
best-effort, recebe o client por parâmetro, nunca derruba o download.

Além disso, toda emissão e todo download chamam `registrarAudit`
([lib/audit.ts:35](apps/web/lib/audit.ts#L35)) — assim aparecem no painel `/admin/auditoria` junto com o
resto do sistema, com ator, IP e user-agent.

> **Sobre o rastreio anônimo da spec (§11):** os identificadores *visitante* e *visita* (cookies de 1 ano
> e de sessão) existiam porque não havia login. Com autenticação, perdem a função e ficam de fora — a
> identidade agora é o próprio aluno. O encaminhamento externo (n8n/webhook) também fica fora desta
> branch: a plataforma já tem um módulo de Conexões, e ligar as emissões a ele é trabalho próprio.

---

## 2. O motor do gerador

**`apps/web/lib/cronograma/motor.ts`** — módulo **puro, sem I/O**, espelhando
[lib/simulado/liberacao.ts](apps/web/lib/simulado/liberacao.ts), que já é função pura e por isso testável
sem banco. É aqui que moram as regras R1–R19, e é o arquivo mais importante do módulo.

```ts
export function normalizarInicio(d: Date): Date                    // R1 — empurra p/ a segunda seguinte
export function faixaSemanal(diasCurso: number[]): string          // R19 — lida de dias_curso, não do nome
export function montarGrade(c: Cronograma, metas: Meta[], opts: OpcoesGeracao): Grade
export function ordenarMetasDaSemana(metas: Meta[]): Meta[]        // R10 — dia, depois tipo (ordem fixa)
export function linksDaMeta(m: Meta, links: MapaLinks): LinksMeta | null   // R11 — só em `quest`
export function rotuloConteudo(m: Meta): ConteudoFormatado          // R12–R15
export function contarAtividades(g: Grade): number                  // R16 — exclui simulado e juris
```

`montarGrade` é o coração, e a ordem das etapas importa:

1. **R5 — descarta as semanas de revisão originais.** Só as semanas com metas sobrevivem, e são
   **renumeradas de 1 a N sem buracos**. Um cronograma de 34 semanas com revisões na 12 e na 24 vira
   32 semanas numeradas 1…32.
2. **R6 — insere revisão periódica** a cada K semanas de conteúdo (K ∈ {4,6,8,10,12}), *depois* de cada
   bloco, ocupando posição própria na numeração.
3. **R7/R8 — aplica recesso no calendário, não na grade.** Percorre semana a semana; se a semana do
   calendário cai num período de recesso, ela é marcada e **não recebe conteúdo** — o conteúdo é
   empurrado para a seguinte. Efeito: o cronograma **fica mais longo** e a conclusão é adiada.
4. **R2/R3/R4 — data cada meta.** Semana N começa em `segunda base + (N-1)×7`; a data da meta sai de
   `dias_curso[dia]`, avançando da segunda até o dia-alvo.

Sendo puro, o motor roda igual no servidor (DOCX/CSV) e no cliente (tabela ao vivo, filtros da spec §3),
o que elimina a divergência de resultado entre tela e documento.

**`apps/web/lib/cronograma/paletas.ts`** — as 10 paletas, cada uma com quatro cores (primária, revisão,
cabeçalho, célula). Consumidas pela tabela na tela e pelo DOCX.

---

## 3. Acesso do aluno

**`apps/web/lib/cronograma/acesso.ts`** — espelha o gate do simulado.

```ts
export async function verificarAcessoCronograma(svc, estudanteId, cronogramaId): Promise<boolean>
export async function idsCronogramasGratuitos(svc, tenantId): Promise<string[]>
export async function isTestadorCronograma(svc, estudanteId, cronogramaId): Promise<boolean>
export async function cronogramasDoAluno(svc, tenantId, estudanteId): Promise<Cronograma[]>
```

Duas regras herdadas que **não** são detalhe de estilo:

- `verificarAcessoCronograma` busca **todas** as linhas de matrícula e usa
  `.some(m => (!m.status || m.status === 'ativa') && m.liberado !== false)` — **nunca `.maybeSingle()`**.
  No simulado isso é cicatriz de duplicatas históricas que faziam a query lançar erro; a tabela nova tem
  `UNIQUE`, mas o padrão tolerante custa nada e sobrevive a importações mal-comportadas.
- `cronogramasDoAluno` monta a lista pela **união de IDs em memória** (matrícula + acesso avulso +
  gratuitos), como faz [app/aluno/(portal)/page.tsx](apps/web/app/aluno/\(portal\)/page.tsx), e busca com
  `fetchAllByIn` de [lib/supabase/fetch-all.ts](apps/web/lib/supabase/fetch-all.ts) para furar o teto de
  1000 linhas do PostgREST. Só entram cronogramas com `status = 'liberado'` e `deletado = false`.

**Propagação por grupo** — `propagarGrupoAosCronogramas(svc, tenantId, grupoId, estudanteIds)`, no mesmo
arquivo, espelhando [lib/simulado/matricular-banco.ts](apps/web/lib/simulado/matricular-banco.ts):
upsert com `{ onConflict: 'tenant_id,estudante_id,cronograma_id', ignoreDuplicates: true }`, em lotes de
500, com checagem prévia em chunks de 300, e fallback para `insert` puro quando o índice único ainda não
existe no banco.

O ponto de entrada é único: [lib/simulado/propagar-grupo.ts](apps/web/lib/simulado/propagar-grupo.ts) já é
chamado sempre que alguém entra num grupo (de `admin/grupos/actions.ts`, `banco-questoes/estudantes-actions.ts`
e do importador da Curseduca). **Basta acrescentar a chamada lá dentro**, mantendo o `try/catch`
best-effort — propagação nunca derruba o fluxo que adicionou o membro.

---

## 4. Árvore de arquivos

### Criar

| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/20260820000010_cronograma.sql` | As 9 tabelas, índices, RLS + policies, RPC de importação, permissões RBAC |
| `apps/web/lib/cronograma/motor.ts` | **Regras R1–R19**, puro e testável |
| `apps/web/lib/cronograma/paletas.ts` | As 10 paletas de cor |
| `apps/web/lib/cronograma/acesso.ts` | Gate do aluno + propagação por grupo |
| `apps/web/lib/cronograma/tipos.ts` | Tipos compartilhados (Cronograma, Meta, Grade, OpcoesGeracao) |
| `apps/web/lib/cronograma/exportar-docx.ts` | Os dois DOCX (`import 'server-only'`) |
| `apps/web/lib/cronograma/importar.ts` | Validação + prévia + substituição das metas |
| `apps/web/app/admin/cronogramas/page.tsx` | Lista do catálogo |
| `apps/web/app/admin/cronogramas/actions.ts` | CRUD, liberar/rascunho, vincular grupo, matricular |
| `apps/web/app/admin/cronogramas/[id]/page.tsx` | Detalhe: metadados, metas, grupos, alunos, emissões |
| `apps/web/app/admin/cronogramas/importar/page.tsx` | Importação com prévia |
| `apps/web/app/admin/cronogramas/links/page.tsx` | CRUD dos 405 links de aula |
| `apps/web/components/admin/cronograma-*.tsx` | Client components do admin |
| `apps/web/app/aluno/(portal)/cronograma/page.tsx` | "Meus cronogramas": emissões salvas + catálogo liberado |
| `apps/web/app/aluno/(portal)/cronograma/novo/page.tsx` | Gerar um novo |
| `apps/web/app/aluno/(portal)/cronograma/[emissaoId]/page.tsx` | Reabre uma emissão salva |
| `apps/web/components/aluno/cronograma-gerador.tsx` | Formulário de 7 passos + tabela + filtros ao vivo |
| `apps/web/app/api/cronograma/exportar/route.ts` | GET que devolve DOCX/CSV e registra o download |

### Modificar

| Arquivo | Mudança |
|---|---|
| [lib/rbac-catalogo.ts](apps/web/lib/rbac-catalogo.ts) | `cronogramas: view/create/update/delete/liberar` + rótulo |
| [scripts/seed-rbac.mjs](scripts/seed-rbac.mjs) | Espelhar as tuplas novas (o array é cópia manual) |
| [app/admin/layout.tsx](apps/web/app/admin/layout.tsx) | `AREA_PERM`: `{ prefix: '/admin/cronogramas', perm: 'cronogramas:view' }` |
| [components/admin/sidebar.tsx](apps/web/components/admin/sidebar.tsx) | Item de menu com `perm: 'cronogramas:view'` |
| [lib/admin/sidebar-counts.ts](apps/web/lib/admin/sidebar-counts.ts) | Badge de contagem |
| [lib/simulado/propagar-grupo.ts](apps/web/lib/simulado/propagar-grupo.ts) | Chamar `propagarGrupoAosCronogramas` |
| [lib/flags.ts](apps/web/lib/flags.ts) | `OCULTAR_CRONOGRAMA = true` enquanto em construção |
| [lib/auditoria/resumo.ts](apps/web/lib/auditoria/resumo.ts) | `LABELS` + `SUBSTANTIVO` + ramo para ler bem em `/admin/auditoria` |
| [lib/soft-delete.ts](apps/web/lib/soft-delete.ts) | `'simulado_cronogramas'` na allowlist (Lixeira) |

---

## 5. RBAC e guards

Permissões novas: `cronogramas:view`, `:create`, `:update`, `:delete`, `:liberar`.
A separação de `liberar` existe porque a spec §8 reserva **liberar/voltar a rascunho** e **excluir** só
para admin — `liberar` é o que decide se o aluno vê.

Registrar uma permissão exige **quatro lugares** — o catálogo TS é só rótulo/documentação; a fonte de
verdade em runtime é a tabela `simulado_permissions`:

1. `RBAC_CATALOGO` em [lib/rbac-catalogo.ts](apps/web/lib/rbac-catalogo.ts)
2. `RBAC_RECURSO_LABEL` no mesmo arquivo (`cronogramas: 'Cronogramas'`)
3. `INSERT INTO simulado_permissions ... ON CONFLICT (resource, action) DO NOTHING` na migration
   (a UNIQUE já existe) — e espelhar no array `CATALOGO` de [scripts/seed-rbac.mjs](scripts/seed-rbac.mjs),
   que é cópia manual
4. `AREA_PERM` em [app/admin/layout.tsx](apps/web/app/admin/layout.tsx) — o gate de rota

Esquecer o item 3 é o erro silencioso: a permissão aparece na matriz do RBAC mas não existe no banco,
então marcar a caixinha não tem efeito.

**Guards, em profundidade:**

- **Admin** — [proxy.ts](apps/web/proxy.ts) exige sessão; `AREA_PERM` no layout barra a rota inteira;
  e cada server action começa com o helper `guard(perm)` de
  [admin/etiquetas/actions.ts:10](apps/web/app/admin/etiquetas/actions.ts#L10), que devolve
  `{ ok, tenantId, atorId }`. Actions **nunca lançam** — retornam `{ ok: false, error }`.
- **Aluno** — `getSessaoAluno()` de [lib/aluno-session.ts](apps/web/lib/aluno-session.ts); o layout
  `app/aluno/(portal)/layout.tsx` já redireciona quem não tem sessão, e o route handler de exportação
  repete o guard devolvendo 401. **Não existe middleware** — a proteção é página a página.
- **Tenant** — toda query com `.eq('tenant_id', tenantId ?? SEM_TENANT)`, onde `SEM_TENANT` é o uuid
  nulo sentinela (fail-closed). Cliente: `createAdminClient()`, nunca `createServiceClient()` (este não
  bypassa RLS quando há usuário logado).

---

## 6. Fluxos

### Aluno

1. `/aluno/cronograma` — lista **as emissões salvas dele** e, abaixo, o catálogo liberado
   (`cronogramasDoAluno`). Sem nenhum cronograma liberado, mostra o `SemAcessoModal` com os contatos do
   tenant, como o portal já faz com pastas.
2. `/aluno/cronograma/novo` — preenche os 7 passos (spec §4). A data é empurrada para a segunda seguinte
   com aviso (R1).
3. "Gerar" → `montarGrade` roda **no cliente** (motor puro) e a tabela aparece; filtros de semana e tipo
   funcionam **ao vivo**. Uma server action grava a emissão e devolve o `emissaoId`.
4. `/aluno/cronograma/[emissaoId]` — reabre: carrega o `formulario` salvo, remonta a grade e mostra igual.
   O aluno renomeia, regenera com outros parâmetros (nova emissão) ou arquiva.
5. Exportações → `GET /api/cronograma/exportar?emissao=...&formato=docx|ficha|csv` devolve o arquivo e
   registra o download.
6. Metas do tipo `simulado`: interno vira link para a prova se houver matrícula, e aviso de sem acesso se
   não houver; externo vira link para a URL cadastrada.

### Equipe

1. `/admin/cronogramas` — lista com status, carga, semanas e contagem de metas.
2. Detalhe: metadados, metas (com edição avulsa, spec §8), grupos vinculados, alunos liberados,
   testadores, e o **histórico de emissões**.
3. Liberar exige `cronogramas:liberar` e grava `liberado_em`/`liberado_por`.
4. Emitir em nome de um aluno: mesma tela do aluno, com seletor de aluno; a emissão fica com
   `ator_tipo: 'usuario'`.
5. Importar: envia as três listas, vê a **prévia** (quantas entram, saem, mudam) e confirma.

---

## 7. Ordem de execução

Cada fatia compila e é testável sozinha.

1. **Migration + RBAC + flag** — tabelas, permissões, `OCULTAR_CRONOGRAMA = true`, item de menu escondido.
2. **Motor** (`motor.ts` + `paletas.ts` + `tipos.ts`) — regras R1–R19, sem UI. É a fatia que mais merece
   teste, e a única que dá para validar sem banco.
3. **CRUD admin** — catálogo, metas, links; molde de `app/admin/etiquetas/`.
4. **Liberação** — matrículas, grupos, avulso, testadores + gancho em `propagar-grupo.ts`.
5. **Tela do aluno** — catálogo liberado, formulário, tabela, filtros ao vivo, metas de simulado.
6. **Emissões** — salvar/reabrir/renomear/arquivar, "Meus cronogramas", histórico no admin.
7. **Exportações** — os dois DOCX e o CSV.
8. **Importador** — validação, prévia, substituição.
9. **Ligar a flag** (`OCULTAR_CRONOGRAMA = false`) e carregar os dados seed quando chegarem.

---

## 7-A. Restrição de execução — nenhuma matrícula em massa por enquanto

**Decisão do usuário (20/08):** construir as TELAS primeiro; liberações e funcionalidades de acesso
são testadas depois, deliberadamente. O módulo começa **sem nenhuma matrícula**.

O que isso implica, em concreto:

- **NÃO ligar o gancho em [lib/simulado/propagar-grupo.ts](apps/web/lib/simulado/propagar-grupo.ts).**
  Ele roda toda vez que alguém entra num grupo. Com 24.773 vínculos de grupo e 94.053 matrículas de
  simulado já no banco, vincular um cronograma a um grupo grande criaria milhares de linhas num
  disparo só — em produção, e sem ninguém ter validado a tela ainda.
- `propagarGrupoAosCronogramas` pode ser **escrita**, mas fica sem chamador até a fatia de liberação.
- A tela de acesso do cronograma pode listar grupos e alunos; o botão que efetiva a matrícula entra
  depois, junto com o teste da liberação.
- Para desenvolver e testar as telas, usar **matrícula individual** de um aluno de teste, ou a válvula
  `acesso_gratuito`, que não escreve linha nenhuma.

Ordem revista: as fatias **3 (CRUD admin)** e **5 (tela do aluno)** vêm antes da **4 (liberação)**.

---

## 8. Riscos e armadilhas

| Risco | Mitigação |
|---|---|
| **O teto de 1000 do PostgREST já estoura hoje** — "Extensivo 5 Dias + Revisão (6 horas)" tem **1.142 metas** (spec §10). Um `.select()` cru devolve 1.000 e **trunca em silêncio**: o aluno recebe um cronograma sem as últimas semanas, sem erro nenhum | `fetchAll`/`fetchAllByIn` ([lib/supabase/fetch-all.ts](apps/web/lib/supabase/fetch-all.ts)) em **toda** leitura de metas, sem exceção |
| **Fuso horário desloca o cronograma inteiro em um dia** — `new Date('2026-09-24')` é meia-noite UTC, `new Date(2026,8,24)` é meia-noite local; misturados no BRT (UTC−3) a grade escorrega | `datas.ts` opera só com `'YYYY-MM-DD'` + `Date.UTC`, e formata pelos componentes UTC. Proibido `toLocaleDateString` e `lib/brt.ts` (que é para instantes, não datas civis) dentro de `lib/cronograma/` |
| **Recesso "Outras" pode virar laço infinito** — um intervalo longo (ou `ate` no ano errado) faz o alocador nunca consumir uma semana de conteúdo | Teto `MAX_SEMANAS_CALENDARIO = 520` → erro amigável em vez de servidor travado |
| **FK em `simulado_id` com `ON DELETE SET NULL` bloquearia excluir simulado** — o SET NULL é um UPDATE, que re-avalia o CHECK da meta e falha | **Sem FK**: resolve em leitura com `.eq('deletado', false)`; o não-encontrado vira aviso na aba Metas, não erro em produção |
| **`aula` é texto e o casamento com links é exato** — planilha que converta `"01"` em `1` quebra os 405 links | Coluna `text`; normalizar na entrada do importador; validar e avisar quando uma meta `quest` não achar link |
| **`dia` é índice, não dia da semana** — quem exportar pensando "1 = segunda" desloca o cronograma inteiro | Documentar na coluna; o importador valida `dia < length(dias_curso)` e recusa fora do intervalo |
| **Importação sem transação** — o PostgREST não dá transação, e a spec §9 exige "ou entra tudo, ou nada" | Fazer a substituição por **função Postgres (RPC)** chamada numa só ida, com `DELETE` + `INSERT` dentro dela |
| **Grafia da disciplina é a chave dos links** — já houve "Consitucional", "Prev. Púb." corrigidos em tempo de exibição | Normalizar na entrada e manter lista fechada de disciplinas (as 24 da spec §10) |
| **Grade de ~90 semanas no cliente** | Motor puro e sem I/O; `useMemo` na grade; filtros operam sobre o resultado já calculado |
| **Reduzir `total_semanas` órfã metas** | O CRUD bloqueia a redução enquanto houver metas nas semanas que deixariam de existir |

### Risco de conflito com a `main` e com as branches abertas

Medido cruzando os arquivos que este plano altera com o que cada branch aberta já mudou
(`git diff --name-only origin/main...origin/<branch>`):

| Branch | Arquivos em comum |
|---|---|
| `feat/discursivas-correcao-ocr` (55 commits, ativa hoje) | `admin/layout.tsx`, `sidebar.tsx`, `flags.ts`, `rbac-catalogo.ts` |
| `feat/construtor-cadernos-diagnostico` | os mesmos quatro |
| `feat/liberacoes-e-portal-aluno` | nenhum |

**A boa notícia:** ~90% do módulo são **arquivos novos** (`lib/cronograma/*`, `app/admin/cronogramas/*`,
`app/aluno/(portal)/cronograma/*`, a migration) — arquivo novo não conflita. O atrito se concentra em
quatro arquivos de **registro**, e em todos eles as duas mudanças são **acréscimos a uma lista**, que o
git resolve mantendo os dois lados. Inspecionando os diffs reais:

- `rbac-catalogo.ts` — a outra branch acrescenta `correcao:view/corrigir`; eu acrescento `cronogramas:*`.
  Somar, não escolher.
- `flags.ts` — a outra branch **troca a mecânica**: `OCULTAR_DISCURSIVA` deixa de ser constante e passa a
  ser `process.env.NEXT_PUBLIC_DISCURSIVA_ATIVA !== 'true'`. Eu só acrescento uma constante nova.
- `admin/layout.tsx` — a outra branch **muda o tipo** de `AREA_PERM` (adiciona `ou?: string`) e a lógica
  do check. Eu só acrescento uma entrada — e ela já é compatível com o tipo novo, porque `ou` é opcional.
- `sidebar.tsx` — a outra branch move o item "Correção" de grupo; eu acrescento um item novo.

**Três medidas concretas para o atrito ficar perto de zero:**

1. **Acrescentar sempre no fim das listas**, nunca no meio. Se os dois lados editam regiões distantes do
   arquivo, o git nem marca conflito.
2. **`git merge origin/main` com frequência** (passo 4 do [guia de branches](docs/FLUXO-GIT-BRANCHES.md)) —
   com três branches abertas e uma delas muito ativa, conflitos pequenos e cedo são triviais; um conflito
   de duas semanas não é.
3. **Se `feat/discursivas-correcao-ocr` entrar na main primeiro**, alinhar o idioma da flag: o padrão do
   projeto vira `process.env.NEXT_PUBLIC_*` em vez de constante, e `OCULTAR_CRONOGRAMA` deve seguir o
   mesmo formato em vez de criar um terceiro estilo.

A migration `20260820000010_cronograma.sql` foi conferida contra as quatro branches — o número está livre
(a branch discursiva usa `20260820000001` a `...0003`). Migration é arquivo novo: não conflita.

### Bloqueio para a verificação end-to-end

O Supabase deste ambiente **não resolve**: `tlaxvhcqswiotzibulyo.supabase.co` retorna NXDOMAIN (o domínio
`supabase.co` resolve normalmente, então não é rede). A mesma URL está no `.env`, no `docs/env simulado.txt`
e em [next.config.ts:20](apps/web/next.config.ts#L20). Enquanto isso não for resolvido, as fatias 3 em
diante não podem ser testadas contra banco — só o **motor** (fatia 2) é verificável, por ser puro.

---

## 9. Verificação

**Motor (sem banco, vale desde a fatia 2):**
- R1 — data numa quarta → resultado cai na segunda seguinte, nunca para trás.
- R5 — cronograma de 34 semanas com revisões na 12 e 24 → 32 semanas numeradas 1…32, sem buracos.
- R6 — 32 semanas de conteúdo com K=12 → revisões inseridas após a 12ª e a 24ª de conteúdo.
- R7 — recesso de Natal → semana marcada, conteúdo empurrado, **data de conclusão adiada**.
- R3 — cronograma `[1,2,3,4,5,6,0]` → meta com `dia = 6` cai no **domingo ao fim** da semana.
- R16 — contagem de atividades ignora `simulado` e `juris`.

**Aplicação (depende do banco voltar):**
- Aluno sem matrícula não vê o cronograma na lista, e o acesso direto pela URL é barrado.
- Vincular um grupo ao cronograma matricula todos os membros; adicionar um membro novo ao grupo
  matricula só ele.
- Revogar a matrícula tira o cronograma da lista.
- As três válvulas funcionam isoladamente: gratuito aparece para todos; avulso expira na data; testador
  atravessa e sua emissão fica com `is_teste = true`.
- Gerar salva uma emissão; o aluno fecha o navegador, volta e **reabre a grade idêntica**.
- O aluno mantém várias emissões lado a lado, renomeia e arquiva sem perder as outras.
- Corrigir uma meta no catálogo aparece ao reabrir a emissão (a grade é derivada, não congelada).
- Emissão pela equipe fica com `ator_tipo = 'usuario'` e `estudante_id` do aluno; cada exportação gera
  uma linha em `simulado_cronograma_downloads` e um registro em `/admin/auditoria`.
- Usuário sem `cronogramas:view` não vê o menu **e** é barrado ao acessar `/admin/cronogramas` direto.
- DOCX abre no Word sem aviso de corrupção; CSV abre no Excel pt-BR com acentuação correta.

**Local:** `pnpm --filter web dev` (a porta 3000 está ocupada pelo projeto `eduprice`; use `-p 3200`).

---

## 10. Progresso

Marcar aqui conforme cada fatia fecha. A ordem é a da seção 7.

- [x] **0** — Branch `feat/modulo-cronograma` criada a partir da `main` (`d003b20`)
- [ ] **2** — Motor puro (`lib/cronograma/`): regras R1–R21, sem I/O
  - [x] `datas.ts` — aritmética de data civil (base de R1–R4)
  - [x] `tipos.ts` — tipos, `ORDEM_TIPO` (R10), rótulos, constantes das regras
  - [x] `formato-meta.ts` — R12, R13, R14, R15 + `chaveLink()`
  - [x] `recesso.ts` — R8
  - [x] `faixa.ts` — R19 + R9
  - [x] `gerador.ts` — R1–R7, R10, R11, R16, R17, R21
  - [x] `scripts/verificar-cronograma.ts` — **36 verificações, todas passando**
  - [ ] `paletas.ts` — as 10 paletas × 4 cores (só é preciso na fatia da tela)

> **Como rodar a verificação do motor** (não precisa de banco):
> ```
> pnpm --filter api exec tsx ../../scripts/verificar-cronograma.ts
> ```
> O repositório não tem runner de teste configurado (só Playwright), então a verificação
> segue o idioma da pasta `scripts/`: um script executável que imprime OK/FALHA e sai com
> código 1 se algo quebrar — pronto para entrar num `pr-check` no futuro.
- [ ] **1** — Migration + RBAC + flag
- [ ] **3** — CRUD admin (catálogo, metas, links)
- [ ] **4** — Liberação (matrículas, grupos, avulso, testadores) + gancho em `propagar-grupo.ts`
- [ ] **5** — Tela do aluno
- [ ] **6** — Emissões (salvar/reabrir/renomear/arquivar)
- [ ] **7** — Exportações (2 DOCX + CSV)
- [ ] **8** — Importador
- [ ] **9** — Ligar a flag + carga dos dados seed

> **Nota de ordem:** as fatias 1 e 2 trocaram de posição em relação ao plano original. O motor vem
> primeiro por dois motivos: é a peça de maior risco (21 regras de negócio, e o legado já erra em
> algumas), e é a **única verificável enquanto o Supabase estiver fora do ar** — por ser pura, testa
> sem banco. A migration entra assim que houver banco para aplicá-la.
