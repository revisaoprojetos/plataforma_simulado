# Biblioteca › aba Questões — banco de questões de verdade

Tela: `/admin/revisao/biblioteca?aba=questoes`

## 1. O que existia e por que a aba aparecia vazia

- A aba "Questões" da Biblioteca listava só **documentos** `simulado_conteudo_documentos` com `tipo_origem='questoes'` ("Conjunto de questões", criado pelo menu Novo). Esses conjuntos são só um card que aponta para questões do banco (`simulado_conteudo_quiz_questoes`).
- No tenant Revisão / Ensino Jurídico (`02195fa6-…`) **não há nenhum conjunto** (consulta real: 0). Por isso "Nenhum material de Questões encontrado…". O painel de pastas à esquerda era o das pastas do Drive (disciplina = pasta), sem relação com as questões.
- O banco real (`simulado_questoes`) tem, nesse tenant, **5.689 questões ativas** (5.685 publicadas, 4 rascunho; + 36 na lixeira). Outros tenants: MEQ 219, Você na Defensoria 695, Mentoria Além do Corte 100. Antes ele só aparecia em `/admin/questoes` (lista com 12 por página, sem árvore) e nos editores do simulado.

## 2. Mapa da taxonomia usada (campos reais)

| Conceito | Origem | Obs. (tenant Revisão) |
|---|---|---|
| Disciplina | `simulado_questoes.disciplina_id` → `simulado_disciplinas` (nome, cor) | 48 cadastradas, 38 em uso |
| Assunto | `assunto_id` → `simulado_assuntos` (`disciplina_id`, `pai_id`) | 703; `pai_id` hoje não usado (0), mas a árvore já aceita subassuntos |
| Assunto específico | `assunto_detalhe` (texto livre) | 1.444 valores distintos: coluna + busca, não nó da árvore |
| Banca / Órgão | `banca_id`, `orgao_id` → `simulado_bancas`, `simulado_orgaos` | 33 / 98 |
| Ano | `ano` (int) | 8 anos |
| Cargo | `cargo` (texto livre; **não existe** `simulado_questao_cargos` nesta base) | 19 |
| Dificuldade | `nivel_dificuldade` (facil/medio/dificil) | 538 sem dificuldade |
| Status | `status` (publicada/rascunho/arquivada) | |
| Tipo | `tipo` (objetiva/discursiva); Certo/Errado derivado de "2 alternativas" (a coluna `formato` não existe) | |
| Nº alternativas | `count(simulado_alternativas)` | |
| Versão / anulada | `versao`, `anulada` | |
| Etiqueta | N:N `simulado_questao_etiquetas` × `simulado_etiquetas` | 53 etiquetas, 138 vínculos |
| Bancos (pastas) | N:N `simulado_questao_pasta` | **não** usado como agrupamento (lacuna) |

Observação de dados: 370 questões têm `assunto.disciplina_id` diferente da disciplina da questão. A árvore usa a **disciplina da questão** e aninha só os assuntos usados por ela (nó `a:<disc>:<assunto>`), para a contagem do nó bater exatamente com o filtro.

## 3. O que foi implementado

**Aba Questões = duas sub-abas (sublinhado):** "Banco de questões [5.689]" (padrão) e "Conjuntos de questões [n]" (a tela antiga de documentos, intacta: pastas, "Novo", Importar planilha, metadados). `?modo=conjuntos` na URL. O contador da aba Questões agora é o total real do banco (`resumo.bancoQuestoes`); os KPIs gerais não mudaram.

**Painel esquerdo (mesmo `PastasPainel`, com props opcionais novas):** "Organização das questões", seletor **Agrupar por**: Disciplina › Assunto (com "Sem assunto" e "Sem disciplina"), Banca, Órgão, Ano, Cargo, Dificuldade, Status, Tipo, Etiqueta. Contagem real por nó (SQL agregado, cache 30 s), "Todas as questões", "Ocultar itens sem questões" (ligado por padrão). Pré-carga ao pairar nos nós e no seletor.

**Lista à direita:** `QuestoesTabelaBase` em **modo servidor** (nova prop opcional `servidor`; os usos antigos seguem idênticos). Colunas: código copiável + "Abrir" (editor existente `/admin/questoes/[id]/editar`), enunciado resumido, tipo, disciplina, assunto, assunto específico, banca, órgão, cargo, ano, dificuldade, status (+ "Anulada"), nº de alternativas, versão, atualizada. Expandir a linha mostra enunciado, alternativas e comentário (rota de API). Busca (enunciado, código `Q-XXXXXXXX`, assunto específico), filtros (status, dificuldade, tipo, banca, órgão, ano), ordenação por qualquer coluna (server-side), paginação 14 (10/14/25/50/100) com o novo `PaginacaoBib`, usado também nas tabelas de documentos. Exportar e "Nova Questão" (componentes existentes) ficam na barra.

**Ações em massa** (barra flutuante, seleção persiste entre páginas, máx. 500):
- Publicar / Arquivar / Voltar p/ rascunho — rota nova; aviso de uso (banco/simulado/respostas) reutilizando `verificarUsoQuestoes` ao arquivar/rascunho.
- Mover p/ disciplina/assunto — valida disciplina/assunto do tenant e que o assunto pertence à disciplina.
- Etiquetas (aplicar/remover) — upsert em `simulado_questao_etiquetas`.
- Excluir → Lixeira — reutiliza `excluirQuestoes` (soft delete) com aviso de uso.
- Tudo com `registrarAudit` (UPDATE/DELETE) e invalidação do cache.

**Arquivos novos/alterados** (todos em `apps/web`):
- `lib/admin-revisao/biblioteca-questoes-tipos.ts`, `lib/admin-revisao/biblioteca-questoes.ts` (SQL agregado + fallback PostgREST)
- `app/api/admin/revisao/biblioteca/questoes/route.ts` (GET lista/árvore/assuntos/detalhe; POST uso/status/mover/etiqueta/excluir)
- `app/admin/revisao/biblioteca/questoes-banco.tsx`, `paginacao-bib.tsx` (novos); `biblioteca-app.tsx`, `page.tsx`, `pastas-painel.tsx` (props opcionais)
- `app/api/admin/revisao/biblioteca/route.ts` (contador), `lib/admin-revisao/biblioteca-tipos.ts`
- `components/admin/questoes-tabela-base.tsx` (modo servidor opcional)
- `supabase/migrations/20261113020000_questoes_indices_biblioteca.sql`

## 4. Verificado no navegador (Playwright, dev em localhost:3000) × só por código

Verificado no navegador real:
- Aba abre com 5.689 questões, contador 5.689, 14 linhas, rodapé "1–14 de 5.689", 407 páginas.
- Árvore: expandir disciplina (Direito Administrativo → 736, assuntos com contagem), clicar em disciplina (736) e assunto (12), voltar (cache: 4 ms), "Sem disciplina" (3).
- Todos os 9 agrupamentos carregam (Banca, Órgão, Ano, Cargo, Dificuldade, Status, Tipo, Etiqueta com 52 itens + "Sem etiqueta"). Troca de agrupamento ~170–400 ms após a pré-carga.
- Busca ("tributário" → 462), por código (`Q-00036919` → 1), ordenação por Ano/Alt./Versão/Disciplina/Cargo/Código, filtros (difícil 1.375; difícil + discursiva 3), limpar, paginação (pág. 2, 25/pág), URL compartilhável.
- Seleção por checkbox, barra de massa, **diálogos de confirmação de Publicar, Arquivar (com aviso de uso real: 1 questão em banco/simulado, 73 respostas), Excluir**, diálogos Mover (assuntos de Direito Civil carregados: 72) e Etiquetas (54 opções) — todos só até abrir e cancelar. Nenhum POST de escrita foi disparado (só `uso`).
- Expandir questão (enunciado + alternativas com gabarito), link "Abrir" para o editor (HTTP 200).
- Sub-aba "Conjuntos" (vazia, com Novo e painel de pastas) e volta; abas PDFull/PDFlash/PDFight/LegProc/JurisClub/Flashcards/Simulados continuam com linhas e painéis.
- Rota POST: validações rejeitam ids vazios, status/ação/etiqueta/disciplina inválidos (400) e assunto sem disciplina.
- Sem erros de console/JS. `npx tsc --noEmit` sem erros novos (só os `.next/types` pré-existentes).

Só por código (não executado de propósito, para não gravar dado real): o efeito real de Publicar/Arquivar/Mover/Etiquetar/Excluir (UPDATE/UPSERT/soft delete + auditoria).

## 5. Desempenho

- Cada request leva ~0,8 s no dev local: ~180 ms de ida e volta ao banco remoto (medido) + autenticação. Respostas em cache cliente (60 s) respondem em 4–35 ms; pré-carga por hover (nós da árvore, próxima página, seletor de agrupamento, aba) cobre a maior parte dos cliques.
- Ordenar por "Alt." levava ~40 s (subconsulta por linha, sem índice em `simulado_alternativas.questao_id`). Corrigido com agregação única (~0,8 s).
- A lista usa uma CTE (página de ids + `count(*) over()`) e só então monta resumo e alternativas para as 14–100 linhas. A árvore agrega `group by` em SQL.

## 6. Migrations pendentes (o usuário aplica)

`supabase/migrations/20261113020000_questoes_indices_biblioteca.sql` — índices idempotentes: `simulado_alternativas(questao_id)`, `simulado_questoes(tenant_id, disciplina_id, assunto_id) WHERE deletado=false`, `simulado_questao_etiquetas(etiqueta_id)`. Opcional: a tela funciona sem (a árvore leva ~0,5 s sem o índice). Nenhuma outra coluna/tabela nova.

## 7. Lacunas honestas

- Não existia ação em massa de status/mover no sistema (só excluir e etiqueta por questão). As rotas novas aplicam o mesmo UPDATE de colunas que o editor faz (`status`, `disciplina_id`, `assunto_id`) + auditoria, **sem** passar por `updateQuestaoAction` (que exige o formulário inteiro). Não há versionamento de gabarito nelas (não mexem em alternativas).
- Mover substitui disciplina **e** assunto (assunto vazio = "sem assunto"); não há "só trocar o assunto mantendo a disciplina".
- Seleção em massa só das linhas visíveis/paginadas (não há "selecionar todas as N do filtro").
- "Nova Questão" usa o componente existente, que ao concluir redireciona para `/admin/questoes` (sai da Biblioteca). O menu Novo do Drive só aparece na sub-aba Conjuntos; no banco ficam Exportar e Nova Questão.
- Não há agrupamento por Bancos (pastas de `simulado_questao_pasta`) nem gestão (criar/renomear) de disciplina/assunto pela árvore; isso segue em Questões › Classificação/Unificação.
- Assunto específico e Cargo são texto livre (sem árvore); cargo agrupa por valor exato.
- Etiqueta como agrupamento é N:N (a soma passa do total, avisado na tela). Fallback PostgREST (sem `DATABASE_URL`) não cobre etiqueta no filtro de nó, a ordenação por colunas de nome nem a busca por código.
- Em dev (React Strict Mode) a 1ª carga busca duas vezes; em produção não.
- Cores de disciplina/etiqueta vêm do cadastro (dados), como já ocorre no painel de pastas.
