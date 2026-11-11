# Biblioteca › Questões › Unificar › Questões duplicadas

## Arquivos
- `apps/web/app/admin/revisao/biblioteca/questoes-unificar.tsx` — raiz da aba (abas de sublinhado "Questões duplicadas · Termos da taxonomia"; props além de `podeEditar` opcionais, compatíveis com o shell). Renderiza `UnificarTermos` do outro agente.
- `apps/web/app/admin/revisao/biblioteca/unificar-duplicadas.tsx` — UI (lista de grupos à esquerda, comparador à direita, prévia/confirmação, histórico/desfazer).
- `apps/web/app/api/admin/revisao/biblioteca/questoes-unificar/route.ts` — rota de API (GET `questoes:view`, POST `questoes:update`).
- `apps/web/lib/admin-revisao/questoes-unificar.ts` e `questoes-unificar-tipos.ts` — detecção, prévia, execução atômica, desfazer, "não é duplicada".
- `supabase/migrations/20261113050000_questoes_unificar.sql` — **PENDENTE (usuário aplica)**.
- Não editei `biblioteca-app.tsx`, `questoes-banco.tsx`, nem libs de outros agentes; reuso `membrosDoGrupo`/`usoDeQuestoes`/`chavesDe` de `biblioteca-questoes-duplicadas.ts` e `unificarQuestoes` (só como fallback sem SQL direto).

## Números reais (tenant Revisão, 5.689 questões; medidos pela API no navegador)
| Similaridade mínima | grupos | questões envolvidas | idênticas | mesmo enunciado/alt. diferentes | semelhantes | gabarito divergente |
|---|---|---|---|---|---|---|
| 100% | 18 | 36 | 17 | 1 | 0 | 1 |
| 90% (padrão) | 26 | 52 | 17 | 1 | 8 | 1 |
| 75% | 31 | 62 | 17 | 1 | 13 | 1 |
| 60% | 41 | 88 | 17 | 1 | 23 | 7 |
- Mesmo `external_id`: 0 grupos (106 questões têm código externo, todos únicos).
- Em todos os limiares, 100% dos grupos têm pelo menos uma questão em simulado e com respostas de alunos (ex.: mestre com 58 e 82 respostas; a cópia tem 0). Ou seja, a cópia "sem uso" é a candidata a arquivar.
- Há 1 grupo real com **gabarito divergente** (mesmo enunciado, C × B): a tela bloqueia a unificação completa e mostra alerta.
- Detecção ~3,3 s a frio (carga + shingles), depois cache de 5 min; mudar limiar/filtro/página ~0,6 s no servidor (memo) e < 100 ms com cache do cliente.
- `pg_trgm` NÃO está instalado neste banco: a similaridade é Jaccard de shingles de 3 palavras em Node, com prefix-filter exato (não perde pares) + alternativas ≥ 50% iguais.

## Decisões de segurança — o que é seguro unificar
Seguro e implementado (modo "Unificar na mestre", só se enunciado + alternativas + gabarito + anulada forem idênticos):
- copiar etiquetas e bancos (pastas) da duplicada para a mestre (cópia, sem remover da duplicada);
- mover favoritos (sem repetir aluno), comentários e reportes de erro para a mestre;
- completar campos vazios da mestre (disciplina, assunto, banca, órgão, ano, dificuldade, cargo, assunto específico, comentário do professor) — nunca sobrescreve;
- opcional (marcado por padrão): trocar duplicada→mestre em `simulado_prova_questoes` **somente de simulados sem nenhuma sessão de aluno** e que ainda não contêm a mestre;
- arquivar (nunca apagar) as duplicadas.
Tudo isso roda em **um único comando SQL com CTEs de escrita (atômico)**; antes dele é tirado um snapshot do estado anterior.

NÃO é feito (por segurança):
- respostas de alunos (`simulado_respostas_objetivas`, com `snapshot_gabarito`) nunca são movidas; simulados com sessões/respostas continuam apontando para a duplicada arquivada — notas, ranking e re-correção intactos;
- vínculos de conteúdos (quiz, cronograma, conjuntos, caderno do aluno etc.) ficam na duplicada (a prévia informa a contagem);
- **gabarito divergente** (texto da correta diferente) bloqueia a unificação completa ("Gabarito divergente — revisar"); só "Arquivar" com checkbox de confirmação explícita;
- enunciado igual com alternativas diferentes, ou semelhantes não idênticas: só "Arquivar" com confirmação extra;
- mestre arquivada é recusada; máx. 12 duplicadas por vez; tudo filtrado por `tenant_id`.

## Desfazer / vínculo mestre↔duplicada
- Tabela `simulado_questoes_unificacoes` (mestre, duplicadas, modo, snapshot, resumo, executado_por, desfeito_em) guarda a relação e o estado anterior; botão **Histórico** lista as últimas 30 e desfaz (restaura status, devolve favoritos/comentários/reportes — inclusive linhas repetidas removidas —, remove etiquetas/bancos adicionados, restaura campos preenchidos só se ainda tiverem o valor colocado, devolve simulados trocados se ainda sem sessões). Também há toast "Desfazer" logo após a ação.
- Sem a migration: unifica normalmente, audita (`registrarAudit` na mestre e em cada duplicada, com `antes`), e o desfazer só vale logo após a ação (snapshot devolvido ao cliente, validado por tenant no servidor).

## "Não é duplicada"
- Tabela `simulado_questoes_nao_duplicadas` (pares a<b). A detecção ignora os pares (edge-aware): "Não é duplicada" no grupo marca todos os pares; "Não é duplicada das outras" (por questão) marca só aquela contra as demais. Vista "Ignoradas" lista e permite "Voltar a tratar como duplicada". Auditado.
- Sem a migration: a ação responde `servidor:false` e o cliente guarda a chave do grupo em `localStorage` (`bib-unificar-ignorados-v1`) com aviso na tela.

## Verificado no navegador real (Playwright, sem gravar dado)
Aba carrega (26 pendentes), contagens e resumo, abrir grupo (2 cards, ~100 ms), mestre sugerida ("a mais respondida"), prévia de Unificar e de Arquivar (com contagens reais, ~150 ms com pré-carga), filtro gabarito divergente + alerta + botão Unificar desabilitado, confirmação de "Não é duplicada" (cancelada), Histórico, altura do trilho `xl:h-[calc(100vh-9.5rem)]`, sem erros de JS/HTTP. Nenhum POST de mutação foi enviado; no banco: 0 questões arquivadas, 0 linhas novas de auditoria, favoritos/comentários inalterados.
## Verificado só por código / SQL
- Os comandos SQL de unificar (completa/arquivar) e desfazer foram executados contra o banco real em transação com **ROLLBACK** (sintaxe e contagens OK, incluindo 2 favoritos movidos e restaurados); nada gravado.
- Não executados de verdade: confirmar unificação, desfazer, ignorar/restaurar, histórico com a tabela (depende da migration), fallback localStorage, layout mobile (screenshot gerado, não inspecionado), vista "Ignoradas/Resolvidas" com dados.

## Migrations pendentes
- `supabase/migrations/20261113050000_questoes_unificar.sql` (2 tabelas + RLS por tenant; idempotente). Tela funciona sem ela.

## Lacunas / observações
- `idsDuplicadas`/"Duplicadas suspeitas" do Banco usam a detecção antiga (`biblioteca-questoes-duplicadas.ts`, fixa em 90%) e não conhecem "não é duplicada"; as contagens do Banco podem divergir levemente desta tela. Corrigir exigiria editar arquivo de outro agente.
- Grupos grandes (> 12 questões) mostram só as 12 primeiras no comparador.
- Re-pontar simulado não invalida caches de simulado existentes (não há tag conhecida); a troca só ocorre em simulados nunca iniciados.
- O antigo `Termos` inline foi removido de `questoes-unificar.tsx`; a prop `termoInicial` só alterna para a aba (o `UnificarTermos` atual aceita apenas `podeEditar`).
