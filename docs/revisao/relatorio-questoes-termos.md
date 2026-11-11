# Biblioteca › Questões › Unificar › Termos da taxonomia

Tela: `/admin/revisao/biblioteca?aba=questoes&modo=unificar` → aba de sublinhado "Termos da taxonomia" (componente `UnificarTermos`, importado por `questoes-unificar.tsx`).

## 1. Mapa dos campos (tenant Revisão, dados reais)

| Tipo | Origem | Como a questão referencia | Mesclar = | Termos em uso |
|---|---|---|---|---|
| Disciplina | tabela `simulado_disciplinas` | `simulado_questoes.disciplina_id` (FK) + `simulado_assuntos`, `simulado_pastas` (Biblioteca), `simulado_cronograma_{conjuntos,links,metas}` (FK SET NULL), `simulado_duvidas`, `simulado_respostas_avulsas` (sem FK) | RPC atômica **existente** `simulado_unificar_disciplinas` (repõe todos os vínculos, grava alias e log) | 48 |
| Assunto | tabela `simulado_assuntos` (`disciplina_id`, `pai_id`) | `assunto_id` (FK); filhos por `pai_id` | repontar FK + subassuntos; só dentro da MESMA disciplina | 703 |
| Banca | tabela `simulado_bancas` | `banca_id` (FK, sem cascade) | repontar FK, remover variante | 33 |
| Órgão | tabela `simulado_orgaos` | `orgao_id` (FK, sem cascade) | idem | 98 |
| Cargo | **texto livre** `simulado_questoes.cargo` | valor na questão (`simulado_cargos` / `simulado_questao_cargos` EXISTEM mas têm 0 linhas, não usadas) | trocar o texto | 19 |
| Assunto específico | **texto livre** `assunto_detalhe` | valor na questão | trocar o texto | 1.444 |
| Ano | inteiro `ano` | valor numérico | não mescla (só consulta; destaca anos implausíveis) | 8 |

## 2. Números reais encontrados (limiar padrão 85%)

| Tipo | Termos | Grupos candidatos | Exemplos reais |
|---|---|---|---|
| Disciplina | 48 | 6 | Direito Processual Civil × Processo Civil; Direito Eleitoral × Eleitoral; Previdenciário Público × Direito Previdenciário Público |
| Assunto | 703 | 4 | "Cumprimento da Sentença (arts. 513 a 538)" × "Do Cumprimento…"; "Gratuidade da Justiça" × "Gratuidade de justiça." |
| Banca | 33 | 1 | Instituto Consulplan × CONSULPLAN (8+8 questões) |
| Órgão | 98 | 3 | AGU (507) × Advocacia-Geral da União (80); PGE-RS × PGE/RS |
| Cargo | 19 | 1 | Procurador do Município (680) × Procurador Municipal (50) |
| Assunto específico | 1.444 | 13 (12 média, 1 baixa) | "Lei nº 6.830/1980 - Lei de Execução Fiscal" × "… - Execução Fiscal"; "Princípios Orçamentários" × "Princípios orçamentários" |

Normalização de formato (texto livre): 26 propostas em Assunto específico (pontuação final etc.), 0 em Cargo. A base já foi limpa antes (61 unificações de disciplinas no log), por isso há poucos grupos. Falsos positivos evitados de propósito: "Procurador do Estado" × "Procurador do Estado de Alagoas" (palavra só de um lado), cargos de estados diferentes, numerais/romanos diferentes.

## 3. Como funciona

- **Detecção (servidor, cache 5 min por tenant/tipo/limiar)** — `lib/admin-revisao/questoes-termos-deteccao.ts` (pura): igual após normalizar (100) · mesmas palavras com ordem/artigos/plural/abreviações (94) · mesma matéria (disciplina, chave semântica existente, 92) · sigla × nome por extenso por aliases e iniciais (88) · erro de digitação por Levenshtein+trigramas ≥ limiar ajustável (62–98%), com guardas de numerais e de palavras exclusivas. Assuntos só dentro da mesma disciplina. Canônico sugerido = mais usado, depois melhor escrito (acento, caixa). Id do grupo = hash dos nomes normalizados (estável).
- **API** `app/api/admin/revisao/biblioteca/questoes-termos/route.ts` — GET `s=resumos|grupos|anos|exemplos|norm|historico` (questoes:view); POST `previa` (view), `mesclar|ignorar|normalizar|desfazer` (questoes:update). Busca, filtro de confiança, ordenação, paginação (20/pág) no servidor.
- **Prévia do impacto** (antes de gravar): questões, assuntos movidos/colididos, simulados, bancos, respostas (10.073 para AGU), outras tabelas que apontam para a disciplina, cadastros removidos, avisos (lixeira, "sem desfazer"). Conferida no navegador para órgão, disciplina, assunto e cargo.
- **Mesclagem** — `lib/admin-revisao/questoes-termos.ts`: Banca/Órgão/Assunto/texto livre em UMA transação SQL (pool próprio `pg`, `BEGIN/COMMIT`, `statement_timeout` 60 s, `SELECT … FOR UPDATE`, todo comando filtrado por `tenant_id`). Reaponta também questões da **lixeira**; a variante só é removida se o DELETE passar (savepoint; FK desconhecida → mantém e informa). Assunto: subassuntos movidos. Disciplina: delega ao `unificarDisciplinas` existente (RPC atômica + log + alias) e depois une em transações próprias os assuntos que ficaram com o mesmo nome. Nome final editável (renomeia o cadastro / vira o texto final); nome já existente é recusado.
- **Desfazer / auditoria** — `registrarAudit` com estado anterior (variantes, contagens; sem a tabela de log guarda até 5.000 ids de questão por variante no `antes`). Com a migration, `simulado_termos_mesclagens` guarda a linha completa da variante, ids das questões e filhos; Desfazer recria a variante com o MESMO id, reaponta de volta só onde o valor ainda é o da mesclagem (não sobrescreve edição posterior). Disciplinas: Desfazer reusa `desfazerUnificacao` (RPC existente).
- **São termos diferentes** — `simulado_termos_ignorados` (tenant, tipo, chave); sem a tabela cai em `localStorage` (chave `bib-termos-ignorados:v1`, enviado ao servidor no filtro) e o aviso explica. "Ver ignorados" + "Voltar a sugerir".
- **Normalização em lote** (Cargo / Assunto específico): propostas seguras (espaços, pontuação final de frase — preserva "etc.", "art." —, TUDO MAIÚSCULO/minúsculo → Título pt-BR). O servidor RECALCULA a proposta de cada valor ao aplicar (o cliente só diz quais). Uma transação, com log para desfazer.
- **UI**: abas de sublinhado por tipo (com nº de grupos), lista de grupos à esquerda e revisão à direita (`xl:h-[calc(100vh-9.5rem)]`, rolagem interna), variantes lado a lado com "ver exemplos" (3 questões reais), "não é igual" por variante, estados vazio/erro/loading, cache cliente 60 s + prefetch ao pairar e da próxima página. Só tokens de cor; sem Sparkles.

## 4. Decisões de segurança

Somente `questoes:update` grava; prévia/leitura `questoes:view`. Tenant em toda instrução (o pool ignora RLS). Inputs validados (UUID, máx. 40 variantes, nome ≤ 200, tipo whitelisted, nomes de tabela/coluna só de constantes do código). Falha = ROLLBACK total, mensagem "nada foi alterado". Sem `DATABASE_URL` a mesclagem de tabela/texto é recusada com mensagem clara (disciplina continua via RPC). Nada é removido se ainda referenciado.

## 5. Verificado no navegador × só por código

- **Navegador real (Playwright, tenant Revisão)**: sub-aba abre; 7 abas de tipo com contagens (6/4/1/3/1/13/–); lista, revisão, "ver exemplos", troca de tipo (~0,4–0,9 s sem cache), prévia de impacto para Órgão, Disciplina, Assunto e Cargo (apenas POST `previa`; cancelado), Normalização (26 propostas) e Histórico (só leitura; mostra as unificações de disciplina) e Ano; sem erros de JS/console. Nenhum POST de escrita foi disparado.
- **Só por código/planejamento**: `mesclar`, `ignorar`, `normalizar`, `desfazer` (não executados, para não gravar). As instruções SQL das transações foram validadas com `EXPLAIN` em transação `READ ONLY` contra o banco real (colunas/tipos OK). Uma tentativa de rodar a transação completa com ROLLBACK foi bloqueada pelo ambiente e não foi repetida. Confirmado que nada mudou (nenhuma escrita feita; as tabelas novas continuam ausentes).
- `npx tsc --noEmit` sem erros nos arquivos novos.

## 6. Migration pendente (o usuário aplica)

`supabase/migrations/20261113060000_questoes_termos_mesclagens.sql` (idempotente): `simulado_termos_mesclagens` (log/desfazer) e `simulado_termos_ignorados` (RLS ligada, acesso só pelo servidor). O código é tolerante à ausência de ambas.

## 7. Lacunas honestas

- Desfazer de mesclagens fora de disciplina só existe depois da migration; as mesclagens e a normalização rodam antes, só sem botão (estado fica na auditoria).
- "Assunto" só compara dentro da mesma disciplina; assuntos com o mesmo nome em disciplinas diferentes não são tratados (370 questões têm assunto de outra disciplina — assunto do relatório anterior, fora do escopo).
- Textos livres em outras tabelas (`simulado_cronograma_*.disciplina`, `simulado_flashcards.disciplina` — nome em texto) não são reescritos quando uma disciplina é renomeada/mesclada; a prévia lista só os vínculos por id.
- Ano não é mesclável (número); só destaque de valores suspeitos.
- Aliases de sigla são uma lista curta no código (FCC, CEBRASPE, FGV, AGU, STF, STJ, OAB, PGE…); o resto vem da regra das iniciais.
- Nomes de assunto usam a mesma árvore plana (`pai_id` ainda não usado no tenant).
