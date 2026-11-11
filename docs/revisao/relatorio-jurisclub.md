# Relatório — JurisClub (Pedagógico › JurisClub) — Plataforma Revisão

Escopo: `/admin/revisao/jurisclub` (pastas e edições), `/admin/revisao/jurisclub/nova` (passo a passo de 6 etapas) e `/admin/revisao/jurisclub/[id]` (8 abas).
Legenda de origem: **R** = lido do banco real (tabela.coluna) · **C** = calculado no servidor de dados reais · **F** = fixo/constante (estrutura, enum ou texto do protótipo) · **X** = fictício/exemplo/placeholder.
"Antes" = primeira entrega; "Depois" = esta auditoria. Não foi aberto navegador: tudo abaixo foi conferido por leitura de código, `tsc` e comparação com os PNGs.

## a) Inventário (tela / aba / etapa / janela → elemento → origem)

| Tela | Elemento | Antes | Depois | Fonte |
|---|---|---|---|---|
| Lista | KPI "edições e dias no ar" | C | C | count `jurisclub_edicoes.status='publicado'` |
| Lista | KPI "em rascunho" | C | C | `jurisclub_edicoes.status='rascunho'` |
| Lista | KPI "julgados e temas publicados" | C | C | soma `jurisclub_edicoes.n_julgados` (publicadas) |
| Lista | KPI "questões V/F publicadas" | C | C | soma `jurisclub_edicoes.n_questoes` (publicadas) |
| Lista | Nome, cor e unidade das 3 pastas (Mensal, 1 Ano em 7 Dias, Trimestral) | F | F | `lib/revisao/jurisclub-tipos.ts` (estrutura do produto) |
| Lista | Contagem de edições por pasta | C | C | `jurisclub_edicoes` por `pasta` e situação |
| Lista | Contagem da pasta Simulado Trimestral | C | C | `simulado_simulados.titulo ilike 'Simulado Trimestral%'` |
| Lista | Cartão de edição: título, situação, nº julgados, nº questões, "no ar desde", "falta" | R | R | `jurisclub_edicoes.*` |
| Lista | Capa do cartão (cor/imagem) | R | R | `jurisclub_edicoes.cor/imagem_url` |
| Lista | Cartões dos simulados trimestrais (título, situação, link) | R | R | `simulado_simulados` |
| Lista | Nota "hoje há N questões nas últimas edições" | C | C | `jurisclub_edicoes.n_questoes` das 3 últimas mensais no ar |
| Lista | Linhas (DataTable): todas as colunas, busca, ordenação, paginação | R | R | `jurisclub_edicoes` (.range()+count) |
| Lista | Seletores Pastas/Linhas e Todos/Rascunho/Agendado/No ar | F | F | enums |
| Lista | Caixa "A partir de uma já pronta" (opções de base) | R | R | `jurisclub_edicoes.titulo` (100 últimas da pasta) |
| Lista | Botões Abrir / Duplicar (ícone, como no print) / Nova | F | F | links |
| Lista | Textos de título/subtítulo/estados vazios | F | F | texto do protótipo |
| Nova · Etapa 1 | Chips de pasta | F | F | enum |
| Nova · Etapa 1 | Mês de referência (padrão) | C | C | mês atual em BRT |
| Nova · Etapa 1 | Nome, imagem (upload), cor | R | R | grava `jurisclub_edicoes.titulo/imagem_url/cor` |
| Nova · Etapa 1 | Amostras de cor | F | F | `JC_COR` (opções) |
| Nova · Etapa 1 | Prévia do card | C | C | estado do formulário |
| Nova · Etapa 2 | Documento (FilePicker da Biblioteca JurisClub) | R | R | `simulado_conteudo_documentos` |
| Nova · Etapa 2 | Julgados extraídos do documento | R | R | `simulado_conteudo_trechos` (tipo titulo/capitulo) |
| Nova · Etapa 2 | Select de tribunal | F | F | enum STF/STJ/TST/TSE/TCU |
| Nova · Etapa 2 | Disciplina (sem lista de apoio, texto livre) | X | R | `simulado_disciplinas.nome` (datalist) |
| Nova · Etapa 2 | Placeholder da lista colada (exemplo "ADI 7.886/GO…") | X | F | formato neutro, sem exemplo de conteúdo |
| Nova · Etapa 2 | Contagem de disciplinas / não conferidos | C | C | estado |
| Nova · Etapa 3 | 7 filtros automáticos (chips) | F | F | `JC_FILTROS_AUTO` |
| Nova · Etapa 3 | 8 selos por julgado | F | F | `JC_SELOS` |
| Nova · Etapa 3 | "N com interesse da Fazenda / RG ou repetitivo" | C | C | estado |
| Nova · Etapa 4 | Textarea de questões C/E (placeholder com exemplos de enunciado) | X | F | formato neutro; 6º campo "nº do julgado" liga a questão ao julgado |
| Nova · Etapa 4 | "Ligada a" (vínculo com julgado) | X | R | `jurisclub_questoes.julgado_id` |
| Nova · Etapa 4 | Tabela de questões (busca, página) | C | C | estado |
| Nova · Etapa 5 | Chips de grupos | R | R | `simulado_grupos` |
| Nova · Etapa 5 | "N alunos vão ver" com "Todos" (texto sem número) | X | C | alunos com assinatura ativa em produto JurisClub + membros de grupos do produto (`simulado_assinaturas`, `simulado_produto_itens`, `simulado_grupo_membros`) |
| Nova · Etapa 5 | "N alunos vão ver" com grupos | C | C | alunos distintos de `simulado_grupo_membros` |
| Nova · Etapa 5 | Chips de versão | F | F | enum |
| Nova · Etapa 6 | Resumo por etapa, pendências | C | C | estado |
| Nova · Etapa 6 | Data/hora do agendamento (padrão amanhã 08:00 BRT) | C | C | `@/lib/brt` |
| Nova · Etapa 6 | Publicar agora / agendar / rascunho | R | R | grava edição, grupos, julgados, questões, aviso (novidades) |
| Nova · Etapa 6 | Agendado entra no ar sozinho | X | C | cron `/api/cron/jurisclub-publicar` + worker (300s) + visão do aluno trata vencido como no ar |
| Nova · Janela FilePicker | Biblioteca/upload | R | R | Biblioteca existente |
| Nova | Rascunho em `sessionStorage` | F | F | só convenience |
| Edição · cabeçalho | Título, pasta, situação | R | R | `jurisclub_edicoes` |
| Edição · cabeçalho | "Ver como aluno" | F | F | link `/aluno/nova/cursos/central/jurisclub` (agora lista as edições reais) |
| Edição · cabeçalho | Duplicar / Publicar / Tirar do ar (confirmação) | R | R | actions |
| Edição · Visão geral | KPI "% dos alunos abriram" | X ("—") | C | alunos distintos em `simulado_conteudo_leitura_progresso` (documento ligado) ÷ alunos com acesso |
| Edição · Visão geral | KPI "concluíram a leitura" | X ("—") | X ("—") | LACUNA: o leitor da Biblioteca não registra conclusão |
| Edição · Visão geral | KPI "questões respondidas" | X ("—") | C | `simulado_respostas_avulsas` das questões do banco com `external_id='jurisclub-<id>'` |
| Edição · Visão geral | KPI "% de acerto médio" | X ("—") | C | mesma fonte (`correta`) |
| Edição · Visão geral | KPIs de rascunho (julgados/questões prontas) | C | C | `n_julgados/n_questoes` |
| Edição · Visão geral | Cartões Situação / No ar desde / Versão | R | R | `jurisclub_edicoes` |
| Edição · Visão geral | Cartão "Quem vê" (só "grupos escolhidos") | R (sem número) | R | `todos` ou nº de linhas de `jurisclub_edicao_grupos` |
| Edição · Visão geral | 5 liberações (estado e confirmação) | R | R | `jurisclub_edicoes.liberacoes` |
| Edição · Julgados | Lista, busca, filtro disciplina, ordenação, paginação | R | R | `jurisclub_julgados` |
| Edição · Julgados | Setas de ordem (agora na coluna Ordem, como no print) | R | R | `jurisclub_julgados.ordem` |
| Edição · Julgados | Conferido (switch) | R | R | `jurisclub_julgados.conferido` |
| Edição · Julgados | Selos | R | R | `jurisclub_julgados.selos` |
| Edição · Julgados | Opções do filtro de disciplina | R | R | `jurisclub_julgados.disciplina` (distintas) |
| Edição · Julgados | Janela Editar/Adicionar (campos, selos) | R | R | actions; disciplina agora com lista real |
| Edição · Julgados | Janela Trocar o .docx (FilePicker) | R | R | `trocarDocumento` |
| Edição · Questões | Tabela (enunciado, gabarito, disciplina, assunto) | R | R | `jurisclub_questoes` |
| Edição · Questões | "Ligada a" | R (sempre "—" ao colar) | R | `jurisclub_questoes.julgado_id` |
| Edição · Questões | Mandar ao banco | R | R | `confirmarImportQuestoes` |
| Edição · Questões | Janela Adicionar questões | R | R | `adicionarQuestoes` |
| Edição · Estudantes | Switch todos / grupos | R | R | `jurisclub_edicoes.todos`, `jurisclub_edicao_grupos` |
| Edição · Estudantes | "N alunos veem esta edição" (print: 8.410) | X | C | ver Etapa 5 |
| Edição · Material | 6 cartões; documento/PDF ligados | R | R | `documento_id`, `pdf_doc_id` + nome em `simulado_conteudo_documentos` |
| Edição · Material | Botões "Editar" com ícone (4 colunas, como no print) | F | F | links |
| Edição · Material | Índice do vade mecum | X | F | marcado "Em breve" (sem fonte) |
| Edição · Prévia | 5 quadros wireframe | F | F | wireframes do protótipo; cor da edição e acento da pasta por dado |
| Edição · Erratas | Julgado (select; print: 1º julgado selecionado) | R | R | `jurisclub_julgados.titulo` |
| Edição · Erratas | Lista de erratas (data dd/mm, caixa com barra) | R | R | `jurisclub_erratas` |
| Edição · Erratas | Publicar errata → Central de Atualizações | R | R | `criarNovidade` (categoria jurisclub) |
| Edição · Configurações | Nome, cor, imagem, ordem, filtros, versão | R | R | `jurisclub_edicoes` |
| Edição · Configurações | Opções de ordem/filtros/versão | F | F | enums |
| Edição · Configurações | Prévia do card | C | C | estado |
| Aluno (integração) | Lista "Edições do JurisClub" na área do aluno | X (não existia) | R | `jurisclub_edicoes` + visibilidade por produto/grupo |

## b) O que foi trocado

- **Número de alunos** ("8.410" do print): calculado de verdade — `alunosComJurisclub` (assinaturas ativas em produtos tipo `jurisclub` + membros dos grupos vinculados a esses produtos, cache 300s) e `alunosDosGrupos`.
- **Métricas da Visão geral**: "abriram", "respondidas" e "acerto" derivadas de dados existentes (`simulado_conteudo_leitura_progresso`, `simulado_respostas_avulsas`), cache 120s, sem número inventado; sem base mostra "—" com nota explicando o motivo.
- **Disciplinas**: lista de apoio real da taxonomia (`simulado_disciplinas`) no passo a passo e no editor de julgado.
- **Questões "Ligada a"**: o 6º campo (nº do julgado) liga questão e julgado.
- **Agendamento**: rota `app/api/cron/jurisclub-publicar/route.ts` + `lib/revisao/jurisclub-publicar.ts`; uma linha adicionada em `apps/worker/src/main.ts` (intervalo 300s). Edição agendada vencida também já aparece ao aluno antes do cron rodar.
- **Integração com o aluno**: `lib/revisao/jurisclub-aluno-edicoes.ts` + seção "Edições do JurisClub" em `app/aluno/(portal)/nova/cursos/central/jurisclub/page.tsx` (edição FORA da minha pasta; só adiciona a seção, não altera as existentes). Leitura abre o documento ligado em `/aluno/biblioteca/[id]`.
- Placeholders de exemplo (títulos e enunciados fictícios) trocados por formato neutro.

## c) Lacunas restantes e por quê

1. **"Concluíram a leitura"**: `simulado_conteudo_leitura_progresso` só guarda "abriu / última leitura"; não existe conclusão no leitor da Biblioteca. Sem fonte → "—".
2. **Respondidas/acerto**: só aparecem depois de "Mandar ao banco" e contam a prática do Banco de Questões (`simulado_respostas_avulsas`); respostas dentro de simulados (`simulado_respostas_objetivas`) e sessões de teste não entram. Não há tela do aluno respondendo as V/F direto da edição.
3. **Alunos "com JurisClub"**: não inclui produtos "liberados para todos" nem segmentos de acesso (só assinatura ativa e grupos vinculados).
4. **Leitor do aluno**: a edição abre o documento da Biblioteca ligado; o aluno não vê ainda selos, filtros automáticos, versão Essencial/Completo, "Teste o que leu", PDF/Gabarito (as liberações `vf/pdf/cad/gab` são gravadas mas ainda não consumidas). Também depende de o documento `categoria='jurisclub'` ser aceito por `/aluno/biblioteca/[id]` — **não testado** (sem navegador).
5. **Extração do .docx**: usa os títulos estruturados do documento; tribunal por regex, órgão/disciplina/selos manuais. Não separa automaticamente selos e filtros por texto.
6. **Questões**: entrada por colagem (não lê `.docx` de questões). "Mandar ao banco" exige permissão `questoes:view`.
7. **Pendência antiga (produto JurisClub abrir na área JurisClub com metas "ler julgado" + questões)**: investigado. Hoje o atalho de extensivos exclui produtos `jurisclub` ("tem área própria", `lib/nova/extensivos-aluno.ts`), a área do aluno mostra desafios + materiais do produto (subtipo `jurisclub`) e agora as edições. Falta: (a) o card/entrada do produto levar direto à área JurisClub, e (b) o cronograma adaptativo (`lib/cronograma/adaptativo/conteudo-banco.ts`, metas tipo `jurisclub`/`questoes`) gerar metas "ler julgado" apontando para `jurisclub_julgados`/edições e para as V/F. Ambos mexem em arquivos de outras frentes e não foram alterados.
8. **E-mail em Disparo de Campanha** (`preparar_email`): só gravado; não cria rascunho de campanha.
9. **Índice do vade mecum**: sem fonte; botão "Em breve".
10. Cores do card (`JC_COR`) são hex de dado (escolha do admin), não tema.

## d) Divergências vs print corrigidas (11 prints abertos: 19, 30, 31–39)

| Print | Divergência | Correção |
|---|---|---|
| 30 (pasta) | Botão Duplicar tinha texto | agora só ícone de cópia |
| 32 (Julgados) | Setas ▲▼ ficavam junto das ações | movidas para a coluna Ordem |
| 33 (Questões) | "Ligada a" nunca preenchido ao colar | vínculo por nº do julgado |
| 34 (Estudantes) | Sem número ("8.410 alunos veem esta edição") | número real (todos ou grupos) |
| 35 (Material) | 3 colunas, botões diferentes dos do print | grade de 4 colunas; botões "Editar" com lápis; "Trocar PDF" com upload |
| 36 (Prévia) | Havia um 6º quadro extra; 3 colunas; sem barras douradas | 5 quadros em 4 colunas, acento da pasta, celular com moldura |
| 37 (Erratas) | Formulário sem fundo âmbar; select iniciava em "Edição inteira"; data completa; itens sem caixa | fundo âmbar, 1º julgado pré-selecionado ("Edição inteira" como última opção), data dd/mm, item em caixa com barra |
| 31 (Visão geral) | KPIs sempre "—" | métricas reais (ver b) |
| 19/39/38 | sem divergência estrutural relevante | — |

## Arquivos novos/alterados nesta auditoria

- Novos: `lib/revisao/jurisclub-publicar.ts`, `lib/revisao/jurisclub-aluno-edicoes.ts`, `app/api/cron/jurisclub-publicar/route.ts`.
- Alterados (minha frente): `lib/revisao/jurisclub-dados.ts`, `lib/revisao/jurisclub-tipos.ts`, `app/admin/revisao/jurisclub/{page.tsx, actions.ts, nova/*, [id]/*}`.
- Fora da pasta: `apps/worker/src/main.ts` (1 intervalo), `apps/web/app/aluno/(portal)/nova/cursos/central/jurisclub/page.tsx` (seção de edições).
- Nenhuma migration nova (a `20261112030000_jurisclub_edicoes.sql` já cobre tudo).

## Dependências do banco verificadas

Script Node somente SELECT (`select(coluna).limit(1)` com service role, `apps/web/.env.local`), cada coluna usada por esta frente:

| Tabela | Colunas verificadas | Situação | Migration |
|---|---|---|---|
| `jurisclub_edicoes`, `_edicao_grupos`, `_julgados`, `_questoes`, `_erratas` | todas as usadas | existem | `20261112030000_jurisclub_edicoes.sql` (aplicada) |
| `simulado_novidades` | categoria, titulo, descricao, destaque, cover_url, cta_*, publicado_em, criado_por, ativo | existe | — |
| `simulado_conteudo_documentos` | id, titulo, versao_atual_id, deletado, categoria (**não usa `oculto`**) | existe | `20261019000000` |
| `simulado_conteudo_trechos` | uid, versao_id, ordem, tipo, rotulo, texto | existe | `20261019000000` |
| `simulado_conteudo_leitura_progresso` | aluno_id, documento_id | existe | `20261019000000` |
| `simulado_grupos`, `simulado_grupo_membros` | id, nome, grupo_id, estudante_id, expira_em | existem | — |
| `simulado_produtos`, `simulado_assinaturas`, `simulado_produto_itens` | ativo, tipo, status, tipo_item, item_id | existem | — |
| `simulado_simulados`, `simulado_questoes`, `simulado_respostas_avulsas`, `simulado_disciplinas` | colunas usadas | existem | — |

Nada faltando. Mesmo assim, leituras auxiliares (métricas, contagem de alunos, disciplinas, trimestrais) têm `.catch` com valor vazio, para a tela não quebrar se uma dependência sumir. Observação: `tsc` mostra 2 erros em `lib/admin-revisao/videoteca.ts` (outra frente, fora desta entrega).
