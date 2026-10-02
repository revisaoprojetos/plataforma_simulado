# Novo "Desafio de Jurisprudência" — área paralela ao Desafio de Lei Seca

Objetivo: criar uma nova área (admin + aluno) **idêntica em funcionamento ao Desafio de Lei Seca**
(mesmo leitor, trilha, quiz, pontuação, ranking, desafios, gamificação, análise), com **outro nome e
conteúdo próprio**. Conteúdo entra depois (o usuário fornece).

## O que o "Lei Seca" é hoje (inventário)
Subsistema de **Leitura/LegProc**, grande: 8 rotas admin, 3 aluno, 15 rotas de API, 27 arquivos
`lib/leitura/`, 15 componentes, **14 tabelas**, flag `LEITURA_ATIVA`, crons (`leitura-publicar`,
`leitura-engajamento`), webhooks e entradas de sidebar. Áreas separadas por **`folder_area='leitura'`**
nas pastas (`simulado_pastas`); documentos pertencem a uma pasta; respostas/progresso/XP são **por
documento** (`simulado_leitura_respostas/progresso`, `simulado_xp_eventos origem='leitura'`). Nome
"Desafio de Lei Seca" **hardcoded** em ~5 telas.

## Estratégia: GENERALIZAR o motor (recomendado) — NÃO duplicar
- **Duplicar** (copiar ~70 arquivos + 14 tabelas + crons/webhooks com nomes `jurisprudencia_*`) = **inviável**
  de manter: todo fix/feature futuro teria que ser feito em dobro, e divergiriam.
- **Generalizar**: o mesmo motor serve N áreas via um **discriminador `area`**. Como os dados já são
  namespaced por `folder_area` (pastas) e as respostas são por documento, **não precisa de tabelas novas** —
  basta `folder_area='jurisprudencia'` e passar o `area` onde hoje está fixo `'leitura'`.
- **Resultado visível é idêntico ao "copiar"**: duas áreas na sidebar, cada uma com sua biblioteca, trilha,
  ranking e análise — mas um código só.

### Modelo (sem tabelas novas)
- Config central `lib/leitura/areas.ts`: `{ leitura: {key:'leitura', nome:'Desafio de Lei Seca', basePathAdmin:'/admin/leitura', basePathAluno:'/aluno/leitura', origem:'leitura', icone, flag}, jurisprudencia: {key:'jurisprudencia', nome:'Desafio de Jurisprudência', basePathAdmin:'/admin/jurisprudencia', basePathAluno:'/aluno/jurisprudencia', origem:'jurisprudencia', icone, flag} }`.
- Funções de `lib/leitura/*` e as páginas recebem `area` (default `'leitura'` → **zero risco** pro Lei Seca atual).
- Rotas novas `/admin/jurisprudencia/*` e `/aluno/jurisprudencia/*` = **wrappers finos** que reaproveitam os MESMOS componentes passando `area='jurisprudencia'`.
- Pastas/documentos da nova área nascem com `folder_area='jurisprudencia'`. Respostas/progresso/XP reaproveitam as tabelas (área derivada do documento).
- Sidebar (admin + aluno): 2ª entrada. Flag própria (`JURISPRUDENCIA_ATIVA`) p/ ligar sem afetar o Lei Seca.
- Crons/webhooks (`leitura-publicar`, `leitura-engajamento`): varrem por área → passar a varrer as áreas ativas.

## Decisões (RESOLVIDAS com o usuário 2026-09-30)
1. **Arquitetura:** ✅ **generalizar o motor** (um código, `area`=folder_area; sem tabelas novas).
2. **XP / nível / liga:** ✅ **pool compartilhado (global)** — Jurisprudência soma no mesmo nível/liga/XP do aluno (como o Lei Seca já soma com simulados). `origem='jurisprudencia'` nos eventos, mas o pool de nível é o global.
3. **Ranking/leaderboard:** ✅ **próprio por desafio** (por módulo, como hoje) — cada desafio tem seu ranking.
4. **ESCOPO — SÓ QUIZ:** ⭐ Jurisprudência **NÃO tem leitura/leitor** — é **somente o quiz interativo**. Capacidade da área `temLeitura: false`:
   - **Aluno:** trilha de "quizzes" → responde o quiz → pontos/ranking. **Sem** leitor de documento.
   - **Admin:** área **toda configurável** (módulos + quizzes + pontuação + ranking + desafios), igual ao Lei Seca mas sem o editor de conteúdo de leitura (o "documento" vira só o container do quiz).

## Fases (após as decisões)
- **F1 — Motor multi-área:** `areas.ts` + threading do `area` nas funções `lib/leitura/*` (default 'leitura'). Sem mudança visível.
- **F2 — Rotas + sidebar + flag:** `/admin/jurisprudencia/*` e `/aluno/jurisprudencia/*` reusando componentes; sidebar 2ª entrada; `JURISPRUDENCIA_ATIVA`.
- **F3 — Crons/webhooks/análise por área** + nome hardcoded → vem do `areas.ts`.
- **F4 — Ligar e popular** (conteúdo que o usuário fornecer).

## Landmines
- Não quebrar o Lei Seca atual: `area` com default `'leitura'` em tudo; rotas novas isoladas.
- Respostas/XP são por documento (área derivada) → nada de coluna de área nas tabelas de atividade.
- Se XP for separado, precisa distinguir `origem` ('jurisprudencia') e o pool de nível — decisão #1.
