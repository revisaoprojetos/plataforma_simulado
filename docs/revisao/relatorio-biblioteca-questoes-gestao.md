# Biblioteca › Questões — shell das sub-abas + "grow up" do Banco

Escopo deste relatório: (1) shell da aba Questões; (2) Banco de questões. Classificação, Etiquetas e Unificar têm relatórios próprios (outros agentes).

## O que existia × novo

| Item | Antes | Agora |
|---|---|---|
| Sub-abas | Banco · Conjuntos de questões | Banco de questões · Unificar · Classificação · Etiquetas (sublinhado `border-b-2`), URL `?aba=questoes&modo=banco\|unificar\|classificacao\|etiquetas` (banco = sem `modo`) |
| Conjuntos | tela de documentos `tipo_origem='questoes'` dentro da aba | removida da aba; menu Novo do Drive e rotas/tabelas intactos nas outras abas |
| Visões rápidas | — | 15 chips com contagem real (SQL agregado, cache 60 s): sem classificação, sem disciplina/assunto/banca/órgão/ano/dificuldade/cargo/etiqueta, assunto de outra disciplina, rascunhos, arquivadas, anuladas, com erro reportado, duplicadas suspeitas |
| Colunas | fixas | seletor "Colunas" (13 colunas, salvo em localStorage) |
| Abrir questão | link para o editor | painel lateral (Sheet): classificação editável, etiquetas (toggle otimista), enunciado/alternativas/gabarito, uso (simulados, respostas, favoritos…), reportes pendentes, aviso de duplicada; atalho "editor completo" |
| Ações em massa | status, mover, etiquetas, excluir | + "Classificar…" (disciplina/assunto/banca/órgão/ano/dificuldade/cargo, com "só preencher vazios"), + "Comparar / unificar" |
| Atalhos | — | `/` busca · `N`/`P` páginas · `X` seleciona a página · `Esc` limpa seleção |
| Pré-carga | árvore/página | + painel pré-carregado ao pairar em "Abrir" |

## Dados reais (tenant Revisão, 5.689 questões)
Sem classificação 221 · sem disciplina 3 · sem assunto 105 · sem banca 186 · sem órgão 2.133 · sem ano 82 · sem dificuldade 538 · sem cargo 2.131 · sem etiqueta 5.587 · assunto de outra disciplina 370 · rascunhos 4 · anuladas 33 · com erro reportado 70 · duplicadas suspeitas 58 (20 grupos de enunciado idêntico).

## Verificado no navegador real (Playwright)
Sub-abas (sem "Conjuntos"), as 4 sub-abas abrem com URL correta e alturas iguais (798/798 px), chips com contagens, visões Sem banca (186) / Duplicadas (58) / Erro reportado (70) em ~1,2–1,9 s (1ª vez, sem cache), seletor de colunas, painel lateral (4 seções), atalhos `/` e `N`, sem erro de console/JS nem HTTP ≥ 400, nenhum POST disparado. `npx tsc --noEmit`: só os 2 erros pré-existentes de `.next/types`.
Só por código: salvar classificação no painel, "Classificar…" em massa, etiqueta no painel (não executados para não gravar).

## Arquitetura (arquivos)
`app/admin/revisao/biblioteca/{biblioteca-app,questoes-banco,questao-painel,classificar-dialog,questoes-api,gestao-ui}.tsx|ts`, `page.tsx`; `components/admin/questoes-tabela-base.tsx` (props opcionais: colunas ocultas, coluna extra, abrir no painel); `lib/admin-revisao/biblioteca-questoes{,-tipos,-vis}.ts`; rota `app/api/admin/revisao/biblioteca/questoes/gestao/route.ts` (resumo, ficha, classificar, etiqueta_massa — também usada pelos outros agentes); libs de apoio `biblioteca-questoes-{gestao,gestao-tipos,acoes,duplicadas}.ts` criadas antes da divisão de escopo (detecção de duplicadas em cache de 5 min, termos, etiquetas, sugestões) e disponíveis para reuso.

## Decisões / lacunas
- Editor completo continua sendo `/admin/questoes/[id]/editar` (reuso exato); o painel só edita classificação/etiquetas.
- "Duplicadas suspeitas" depende da detecção em memória (5 min); sem SQL direto, visões com subconsulta caem no modo reduzido.
- Migration: nenhuma nova minha; índices opcionais já em `20261113020000`.
- Backup das versões iniciais de Classificação/Etiquetas/Unificar que escrevi antes da divisão ficou fora do repositório (scratchpad).
