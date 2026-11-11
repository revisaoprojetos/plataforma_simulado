# Biblioteca › Questões › Classificação

## O que existe (reuso)
- Rota `GET/POST /api/admin/revisao/biblioteca/questoes/gestao` (já existente, authz `questoes:view`/`questoes:update`, auditoria nas actions reutilizadas).
- Lib `lib/admin-revisao/biblioteca-questoes-gestao.ts` (resumo, taxonomia, sugestões) e `biblioteca-questoes-acoes.ts` (classificação em massa).
- Actions reutilizadas: Estúdio › Classificação (criar/renomear/reparentar/excluir item), `unificarTaxonomia`, `atualizarDisciplinaClassificacao`.
- Tabela da fila = `QuestoesBanco modo="fila"` (mesma `QuestoesTabelaBase`, com coluna "Sugestão" e diálogo de classificar em massa).

## Novo nesta passada
- `app/admin/revisao/biblioteca/questoes-classificacao.tsx` recriado (o shell havia removido o arquivo) com a assinatura do shell `{ podeEditar }`; permissões finas e atalhos para outras sub-abas são props OPCIONAIS (sem elas, os botões "Ver no Banco"/"Unificar" ficam ocultos; o servidor valida tudo).
- Nova visão "Dificuldade, tipo e status" (barras + % reais): `lib/admin-revisao/questoes-classificacao.ts` (SQL agregado único, fallback PostgREST count, cache 45 s) + `s=distribuicao` no GET da rota.

## Dados reais (tenant Revisão, 5.689 questões)
100% classificadas (disciplina+assunto+banca+ano): 5.468 (96,1%). Sem disciplina 3; sem assunto 105; sem banca 186; sem ano 82; sem órgão 2.133; sem cargo 2.131; sem dificuldade 538; sem etiqueta 5.587; assunto de outra disciplina 370.
Cadastro: 48 disciplinas, 703 assuntos, 33 bancas, 98 órgãos, 19 cargos, 1.444 assuntos específicos, 8 anos.
Dificuldade: médio 2.974, difícil 1.375, fácil 802, sem 538. Tipo: objetiva 5.686, discursiva 3. Status: publicada 5.685, rascunho 4.

## Verificado no navegador (Playwright, sem gravar nada)
Sub-aba carrega com indicadores; troca para Disciplinas/Assuntos/Bancas ~0,9 s no 1º acesso; visão Distribuição renderiza dados reais (~0,1-0,3 s); fila "Falta algo" com 221 itens e botões "Aplicar sugestão" presentes; diálogo "Novo assunto" abre e cancela. Sem erros de página.
## Só por código
Criar/renomear/mover/excluir e classificação em massa (não executados para não gravar dado real); exclusão é bloqueada na UI quando há questões/assuntos em uso.

## Lacunas honestas
- Sem migration nova. Não há árvore disciplina › assunto única no painel (as duas listas existem separadas; a árvore está no Banco). Banca/órgão/cargo/ano por contagem estão nas listas de taxonomia.
- Na fila, o texto do enunciado sobrepõe colunas na tabela do Banco (`QuestoesBanco`, arquivo do shell) — observado nas capturas; não alterado.
- "Ver no Banco" depende de o shell passar `onAbrirBanco` (hoje não passa).
