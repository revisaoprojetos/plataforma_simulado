# Relatório: Biblioteca > Questões > Etiquetas

Tela: `/admin/revisao/biblioteca?aba=questoes&modo=etiquetas`. Legenda: **N** = verificado no navegador (Playwright, dados reais) | **C** = só por código/tsc.

## 1. Existia x novo

Existia (reutilizado, não alterado):
- Tabelas `simulado_etiquetas` (nome, cor, funcao?) e `simulado_questao_etiquetas` (N:N, PK questao_id+etiqueta_id, sem created_at).
- Actions `criarEtiqueta / atualizarEtiqueta / excluirEtiqueta` de `app/admin/etiquetas/actions.ts` (permissão `questoes:update` + auditoria) e os componentes `PaletaCor`, `FuncaoSelect`, `CORES`, `FUNCOES` de `app/admin/etiquetas/etiquetas-client.tsx`.
- Banco (`questoes-banco.tsx`): agrupar por etiqueta, filtro `vis=sem_etiqueta`, aplicação em massa via `EtiquetaDialog`.

Novo (arquivos meus):
- `app/admin/revisao/biblioteca/questoes-etiquetas.tsx` (`QuestoesEtiquetas({ podeEditar })`).
- `app/api/admin/revisao/biblioteca/questoes-etiquetas/route.ts` (GET: lista, detalhe, candidatas, previa_excluir, previa_mesclar; POST: criar, atualizar, excluir, mesclar, massa).
- `lib/admin-revisao/questoes-etiquetas.ts` e `questoes-etiquetas-tipos.ts`.
- Sem migration (nada de schema novo).

Funções entregues:
- Grade com chip colorido, função (anular/avisar/desconsiderar ou "só rótulo"), nº de questões (contagem real, só questões não deletadas), "em simulados", última atualização (maior `updated_at` entre as questões da etiqueta), criada em. Busca (sem acento), filtros (todas, mais usadas top 10, sem uso, nome repetido, com função), ordenação por cabeçalho e por select, paginação 10-100 no servidor.
- Indicadores clicáveis: etiquetas, sem uso, questões sem etiqueta (abre o Banco com `vis=sem_etiqueta`), nomes repetidos (agrupados por nome normalizado, com faixa de sugestão "Mesclar este grupo"), com função.
- Criar / renomear / cor (paleta do sistema) / função. Nome repetido (normalizado) é recusado no servidor.
- Excluir com prévia ("N questões perdem esta etiqueta", quantas em simulados, aviso se tem função).
- Mesclar: (a) uma etiqueta para outra buscada; (b) várias marcadas, escolhendo a que fica. Prévia com total distinto resultante; recusa funções diferentes; vínculos movidos com upsert ignorando duplicata, origem removida, auditoria por origem. Limite de 20 origens.
- Painel lateral (Sheet) com abas de sublinhado: Resumo (total, só-esta-etiqueta, distribuição por disciplina e banca), Questões recentes (12 mais recentes, seleção + "Remover desta etiqueta"), Aplicar a sem etiqueta (15 mais recentes sem nenhuma etiqueta, opção "só das disciplinas desta etiqueta", busca, aplica nas marcadas; máx. 200 por vez).
- Abrir no Banco: `/admin/revisao/biblioteca?aba=questoes&modo=banco&ag=etiqueta&no=e:<id>`. Contrato real do Banco: parâmetro `ag` (não `agrupar`) e nó `e:<id>`; sem etiqueta = `vis=sem_etiqueta`.

Performance: lista completa do tenant por 1 SQL agregado (cache servidor 45 s, filtro/ordem/página em memória), detalhe em 4 SQL paralelas (cache 45 s), cliente com cache 60 s, prefetch da próxima página e do detalhe ao passar o mouse. Fallback PostgREST tolerante a coluna ausente (`deletado`, `funcao`).

## 2. Dados reais (tenant Revisão)
Ver seção de verificação abaixo.

## 3. Lacunas e notas
- A mesclagem e a aplicação em massa usam PostgREST (o pool SQL pode ser réplica de leitura), portanto **não** são uma única transação de banco. Mitigação: ordem upsert -> apagar vínculos -> apagar etiqueta; se falhar no meio a origem permanece e o upsert é idempotente (repetir é seguro). Para atomicidade real seria preciso uma função SQL (RPC) numa migration; não criada.
- Excluir/Criar/Atualizar reaproveitam as actions legadas, que fazem `revalidatePath('/admin/etiquetas')`.
- "Última atualização" é a da questão mais recente com a etiqueta (a tabela de vínculo não tem data).
- A seleção do Banco não atravessa para esta sub-aba (o contrato é só `podeEditar`); por isso o "aplicar/remover em massa" é feito dentro do painel da etiqueta.
- Cache do Banco: mutações aqui chamam `limparCacheQuestoes` (servidor), mas o cache de 60 s do cliente do Banco só expira sozinho.
- O arquivo `questoes-banco.tsx`/`biblioteca-app.tsx` não foram alterados.

## 4. Verificação e dados reais

Dados reais (tenant Revisão, medidos pela API/tela): 53 etiquetas; 1 sem uso ("Questão desconsiderada", função desconsiderar); 4 com função (Anulada 47 q., Desatualizada 19, Gabarito em revisão 5, Questão desconsiderada 0); 5.587 de 5.689 questões sem nenhuma etiqueta; 1 grupo de nomes repetidos por normalização com 3 etiquetas ("Lei nº 11.101/2005.", "Lei nº 11.101/2005", "Lei n.º 11.101/2005").

Verificado no navegador (N, Playwright, sem gravar nada): carga da sub-aba (1ª carga dev ~37-55 s por compilação; depois respostas da API 0,8-1 s no dev), KPIs, grade 14/pág com paginação 1–14 de 53, busca, filtros sem uso e mais usadas (top 10), ordenação, painel lateral (Resumo com distribuição real por disciplina e banca, 12 questões recentes, 15 candidatas sem etiqueta), diálogo de exclusão com prévia (cancelado), diálogo de mesclar 2 marcadas com prévia (cancelado), altura xl:h-[calc(100vh-9.5rem)], zero erros de página. API (GET) verificadas: lista, detalhe, candidatas, previa_excluir, previa_mesclar.
Só por código (C): criar, renomear/cor/função, excluir, mesclar (execução), aplicar/remover em massa, "Abrir no Banco" (URL montada conforme o contrato `ag=etiqueta&no=e:<id>`, não cliquei), permissões `questoes:update` negadas.
`npx tsc --noEmit -p .`: sem erros nos meus arquivos.
Dúvida de dado: "Em simulados" é igual a "Questões" em todas as linhas verificadas (consulta por `simulado_prova_questoes.questao_id`); não auditei se é coincidência do banco.
