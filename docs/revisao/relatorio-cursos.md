# Relatório — Montagem de curso › Cursos (auditoria de dados reais)

Rotas: `/admin/revisao/cursos`, `/admin/revisao/cursos/novo`, `/admin/revisao/cursos/[id]?aba=…` (10 abas).
Legenda: R = lido do banco; C = calculado no servidor a partir de dado real; F = constante de UI copiada do protótipo; X = fictício/exemplo.

## Resumo em números (100 elementos inventariados)

| | R | C | F | X |
|---|---|---|---|---|
| Antes da auditoria | 37 | 18 | 22 | 23 |
| Depois | 54 | 24 | 22 | 0 |

Obs.: "Msg · prévia 18:00" foi removido; está contado como C só para fechar a soma. O inventário cobre todas as telas e abas, as janelas (pedir nome de módulo/aula, confirmar exclusão, painel "Escolher aulas"), as prévias e os estados vazios. Hover/tooltips nativos (aria-label) não têm dado próprio.

## b) O que foi trocado

- Prévia "Como o aluno vê" (criar curso e aba Como o aluno vê): deixou de usar matérias, etapas, metas, temas e encontros inventados. Agora usa módulos, aulas e materiais reais do produto principal (`simulado_produto_modulos`, `simulado_produto_modulo_itens`), encontros reais do Calendário (`simulado_eventos_calendario`, dos grupos do curso ou de todos), dias até a prova calculados de `cfg.prova` e datas das semanas de `cfg.inicio`. Sem dado: estado vazio honesto.
- Prévias de mensagens e e-mails: remetente e cabeçalho vêm de `simulado_tenants.nome`; o nome de exemplo é o primeiro nome de quem edita; removido o horário "18:00".
- Cores do curso novo (prévia, curso e produto criados): vêm de `simulado_tenants.tema` (`cor_primaria`, `cor_accent`); o hex só é usado se o tenant não tiver tema.
- Textos de mensagens e e-mails automáticos: ligado/texto vêm de `simulado_curso_automacoes`, com o padrão do protótipo só como fallback.
- Etapa 4 "Vincular à vitrine": deixou de ser a lista fixa "Área de membros · …" e passou a ser o formato real de exibição (`VITRINE_LAYOUTS`), gravado em `simulado_produtos.vitrine_layout` de todos os produtos do curso.
- Passaporte: removidos exemplos específicos (órgão "PGE/RS", "ICMS no RS"); placeholders neutros.
- Ligado ao lado do aluno: a janela "Abre para os alunos em / Fecha em" agora esconde o curso do menu do aluno (`lib/produtos/aluno.ts` › `produtosDoAluno`, filtro por `simulado_cursos.abre_em/fecha_em`, data de Brasília, tolerante se a tabela não existir). Ativar/desativar, capa/cores e grupos já refletiam nos produtos.

## c) Lacunas restantes (e por quê)

1. Pop-ups por curso (`simulado_curso_popups`) ainda não são exibidos ao aluno: exigem um componente no portal do aluno (arquivos de outras frentes). Dados e admin estão prontos.
2. Modelo de curso (trilha, matéria, contagem…) e blocos extras: gravados, mas a área do aluno ainda não renderiza esses modelos.
3. Prévia "Temas mais cobrados": não existe estatística de incidência por banca no sistema; mostra estado vazio.
4. "Metas de hoje" (modelo contagem): vêm do cronograma de cada aluno; a prévia mostra só um texto explicativo.
5. Envio de mensagens (WhatsApp) e e-mails automáticos: só a configuração existe; não há job de disparo. "Enviar teste" avisa isso. A chave do serviço fica no servidor.
6. Passaporte e edital: as escolhas dos alunos (`simulado_curso_edital_escolhas`) só serão preenchidas quando o lado do aluno gravar (KPIs conciliaram/seguem zerados até lá). "Alunos do Passaporte" conta assinaturas, não alunos distintos. A regra do edital (peso, revisão final, volta) está salva, mas nenhum motor a lê.
7. Padrões da etapa 3 (comentários, certificado, marca d'água), "Curso Sprint Final" e "Pasta de passaportes" só ficam gravados; só "Capa" tem efeito.
8. Assinatura "Equipe Revisão" nos textos padrão e o link do briefing são constantes do protótipo.
9. "Entra no Cronograma Adaptativo" é salvo, sem efeito.
10. As constantes F (rótulos, listas de tipos, modelos, bancas, abas, provedores, quando/frequência dos pop-ups, textos de ajuda) permanecem como constantes de UI legítimas.

## d) Divergências tela real × print (re-comparados 02, 03, 20 a 29) e correções

- 02 Cursos: acrescentei busca e ordenação (regra do projeto: toda lista tem busca/filtro/ordenação); o print não tem. Cards, pills, contagens e botões batem.
- 03 Novo curso: a prévia do print mostra "Etapa 3 de 5" com etapas concluídas inventadas; a real mostra os módulos reais (ou estado vazio). Intencional.
- 20 Passo a passo: estrutura, textos, ordem e estados batem; a vitrine passou a listar formatos reais.
- 22 Como o aluno vê: omitido o botão "Ver todos os modelos em tela cheia" (aponta para artefato externo do claude.ai) e substituído por uma nota; a prévia usa dados reais.
- 23 Passaporte: os cartões de cobertura mostram as disciplinas reais do Extensivo em vez das 6 de exemplo.
- 24 Aulas: o print mostra "Módulo 1 / Aula 1" de exemplo; a real mostra o currículo real ou o estado vazio. Acrescentei paginação de módulos.
- 21, 25, 26, 27, 28, 29: estrutura batendo; os textos de exemplo das prévias (nome "Camila", remetente, hora) foram trocados por dado real.
- Não verificado: não abri as telas no navegador nem comparei pixel a pixel (só código × print). Também não rodei `next build` nem eslint. `npx tsc --noEmit` não tem erro nos meus arquivos; sobram 2 erros em `.next/types/validator.ts` (arquivos de vídeo, fora da minha área).

## a) Inventário completo

| Tela/aba | Elemento | Antes | Depois | Fonte (tabela.coluna) |
|---|---|---|---|---|
| Lista | Cards de cursos (nome, tipo, status) | R | R | simulado_cursos.nome/tipo/ativo |
| Lista | Pill do modelo | R | R | simulado_cursos.modelo |
| Lista | Pill "N de 6 etapas" | C | C | etapasFeitas(simulado_cursos.etapas + curso_produtos + produto_itens grupo) |
| Lista | Alunos do card | C | C | count simulado_assinaturas (produto principal, status ativo) |
| Lista | Aulas do card | C | C | count simulado_produto_modulo_itens |
| Lista | "editado dd/mm" | R | R | simulado_cursos.atualizado_em (BRT) |
| Lista | Contagens Todos/Ativos/Desativados | C | C | count simulado_cursos |
| Lista | Capa do card / card gerado | R | R | simulado_cursos.img_horizontal + cor_principal/cor_destaque |
| Lista | Interruptor ativo | R | R | simulado_cursos.ativo (+ simulado_produtos.ativo) |
| Lista | Busca, ordenação, paginação | C | C | simulado_cursos (ilike nome, range+count) |
| Lista | Título, subtítulo, rótulos Criar curso/Editar | F | F | constantes de UI |
| Lista | Estado vazio / aviso de migração | X | C | texto honesto conforme o estado |
| Novo | Nome do curso (placeholder) | X | F | placeholder neutro (antes "Reta Final PGE/RS") |
| Novo | Opções do select Tipo | F | F | TIPOS_NOVO (lista do protótipo) |
| Novo | Galeria de 7 modelos (nome, descrição, Bom para) | F | F | constantes do protótipo |
| Novo | Ajustes do modelo (bancas, abas, abertura) | F | F | listas do protótipo |
| Novo | Prévia: nome do curso | R | R | digitado |
| Novo | Prévia: cores | X | R | simulado_tenants.tema.cor_primaria/cor_accent |
| Novo | Prévia: conteúdo (etapas, matérias, metas, temas, encontros) | X | C | prévia mostra estado vazio honesto (curso novo não tem módulos) |
| Novo | Cores gravadas no curso/produto criado | X | R | simulado_tenants.tema |
| Novo | Nome do tenant na prévia | X | R | simulado_tenants.nome |
| Curso | Cabeçalho: nome, interruptor, Ver como aluno | R | R | simulado_cursos + simulado_produtos.slug |
| Curso | Rótulos das 10 abas e contagem N/6 | C | C | etapasFeitas |
| Etapas | Nota "N de 6 feitas" | C | C | etapasFeitas |
| Etapas | E1 nome da pasta | R | R | simulado_cursos.nome / simulado_pastas |
| Etapas | E2 lista de produtos | R | R | simulado_curso_produtos + simulado_produtos.nome |
| Etapas | E2 link Abrir o briefing | F | F | URL do protótipo (LIGACOES.md) |
| Etapas | E2 conferi o briefing | R | R | simulado_cursos.etapas.prodOk |
| Etapas | E3 tabela de padrões (4 linhas, rótulos) | F | F | rótulos do protótipo |
| Etapas | E3 estado dos padrões | R | R | simulado_cursos.etapas.pad |
| Etapas | E3 Vale para N produtos | C | C | count simulado_curso_produtos |
| Etapas | E3 chips de grupos | R | R | simulado_grupos.nome |
| Etapas | E3 grupos marcados | R | R | simulado_produto_itens (tipo_item=grupo) |
| Etapas | E3 sprint / pastaPass / gOk | R | R | simulado_cursos.etapas |
| Etapas | E4 nome da trilha | R | R | simulado_cursos.nome |
| Etapas | E4 opções de Vincular à vitrine | F | R | VITRINE_LAYOUTS -> simulado_produtos.vitrine_layout |
| Etapas | E5 sem1 / guia / WhatsApp | R | R | simulado_cursos.etapas |
| Etapas | E6 estado publicado / aviso de falta | C | C | etapasFeitas |
| Etapas | Estados Feito/Pendente | C | C | etapasFeitas |
| Info | Nome, tipo, frase, abre/fecha, ativo, cronograma | R | R | simulado_cursos.* |
| Info | Opções do select Tipo | F | F | TIPOS_CURSO |
| Modelo | Modelo, ajustes, blocos extras | R | R | simulado_cursos.modelo/cfg/blk |
| Modelo | Opções (blocos extras, bancas, abas) | F | F | constantes do protótipo |
| Modelo | Prévia: etapas da trilha | X | R | simulado_produto_modulos.titulo |
| Modelo | Prévia: matérias | X | R | simulado_produto_modulos.titulo |
| Modelo | Prévia: progresso por matéria | X | C | 0% (aluno novo) |
| Modelo | Prévia: dias para a prova e faixa D-n | X | C | cfg.prova menos hoje |
| Modelo | Prévia: metas de hoje | X | F | texto explicativo (sem fonte) |
| Modelo | Prévia: semanas e datas | X | C | cfg.inicio + 7n dias |
| Modelo | Prévia: aulas da semana | X | R | simulado_produto_modulos (submódulos) |
| Modelo | Prévia: temas mais cobrados | X | F | estado vazio honesto (lacuna) |
| Modelo | Prévia: materiais por tipo | X | R | simulado_produto_modulo_itens.titulo |
| Modelo | Prévia: encontros | X | R | simulado_eventos_calendario |
| Modelo | Prévia: cores, tipo e nome | R | R | simulado_cursos |
| Modelo | Nota do Extensivo | F | F | texto do protótipo |
| Passaporte | KPI alunos do Passaporte | C | C | count simulado_assinaturas (produtos tier=passaporte) |
| Passaporte | KPIs conciliaram / seguem / não escolheram | C | C | simulado_curso_edital_escolhas |
| Passaporte | Alunos avulsos | C | C | count simulado_assinaturas do produto principal |
| Passaporte | Edital (passa, órgão, datas) | R | R | simulado_cursos.edital |
| Passaporte | Placeholder do órgão | X | F | neutro |
| Passaporte | Escolhas do aluno (3 textos) | F | F | EDITAL_MODOS |
| Passaporte | Peso e limites 30-80 | R | R | simulado_cursos.edital |
| Passaporte | Cards de cobertura por disciplina | C | C | módulos do extensivo + simulado_curso_edital_aulas |
| Passaporte | Painel Escolher aulas | R | R | simulado_produto_modulos + simulado_curso_edital_aulas |
| Passaporte | Texto "Constituição do Estado, ICMS no RS" | X | F | texto genérico |
| Passaporte | Link ver área do aluno | R | R | simulado_produtos.slug |
| Aulas | Módulos e aulas | R | R | simulado_produto_modulos |
| Aulas | Etiquetas PDF/Vídeo/LegProc/Questões | C | C | simulado_produto_modulo_itens.subtipo/tipo_ref |
| Aulas | Contagem N aulas, paginação | C | C | módulos |
| Aulas | Criar módulo / aula (janela de nome) | R | R | salvarModuloAction |
| Aulas | Escolher da Biblioteca | R | R | editor de conteúdos do produto |
| Aulas | Estado vazio | C | C | honesto |
| Arte | 3 artes e galeria | R | R | simulado_cursos.img_*/galeria |
| Arte | Cores | R | R | simulado_cursos.cor_* |
| Arte | Rótulos e dimensões | F | F | do protótipo |
| Arte | Prévia banner/card | R | R | simulado_cursos |
| Pop | Formulário (campos) | R | R | simulado_curso_popups |
| Pop | Opções quando/frequência | F | F | POP_QUANDO/POP_FREQ |
| Pop | Tabela de pop-ups | R | R | simulado_curso_popups |
| Pop | Galeria para escolher imagem | R | R | simulado_cursos.galeria |
| Pop | Prévia (título, texto, botão, imagem, cores) | R | R | digitado + simulado_cursos |
| Pop | Placeholders | F | F | do protótipo |
| Msg | Serviço/número/conectado | R | R | simulado_cursos.msg_cfg |
| Msg | Provedores | F | F | MSG_PROVEDORES |
| Msg | 5 mensagens: rótulo e ligada | F | R | MSG_AUTO padrão + simulado_curso_automacoes.ativo |
| Msg | Texto das mensagens | F | R | padrão + simulado_curso_automacoes.texto |
| Msg | Prévia: nome do aluno Camila | X | R | 1º nome de quem edita (auth) |
| Msg | Prévia: remetente Revisão Ensino Jurídico | X | R | simulado_tenants.nome |
| Msg | Prévia: horário 18:00 | X | C | removido |
| Msg | Prévia: nome do curso | R | R | simulado_cursos.nome |
| Msg | Nota sobre chave no servidor | F | F | texto do protótipo |
| Mail | 6 e-mails: rótulo e ligado | F | R | MAIL_AUTO + simulado_curso_automacoes.ativo |
| Mail | Assunto e texto | F | R | padrão + simulado_curso_automacoes |
| Mail | Prévia: nome Camila | X | R | 1º nome de quem edita |
| Mail | Prévia: cabeçalho Revisão Ensino Jurídico | X | R | simulado_tenants.nome |
| Mail | Rodapé aluno do curso | R | R | simulado_cursos.nome |
| Mail | Assinatura Equipe Revisão nos textos padrão | F | F | lacuna (texto fixo) |
| Acesso | Chips e marcados | R | R | simulado_grupos + produto_itens |
| Acesso | N alunos têm acesso | C | C | count simulado_grupo_membros |
| Acesso | Link Criar grupo | F | F | /admin/grupos |

## Dependências do banco verificadas

Script Node somente SELECT (service role, `select(colunas).limit(1)`) contra o banco real, para todas as tabelas e colunas que as telas de Cursos usam. Resultado: tudo existe.

| Tabela | Colunas conferidas | Situação | Migration que resolve |
|---|---|---|---|
| simulado_cursos | todas (nome, sub, tipo, ativo, modelo, cfg, blk, cores, imagens, galeria, abre_em, fecha_em, cronograma_adaptativo, pasta_id, produto_id, trilha_id, etapas, edital, msg_cfg, deletado…) | existe | 20261112020000_revisao_cursos |
| simulado_curso_produtos, _popups, _automacoes, _edital_escolhas, _edital_aulas | todas | existem | 20261112020000_revisao_cursos |
| simulado_produtos | nome, slug, tipo, ativo, cor, cor_secundaria, capa_url, banner_url, pasta_id, tier, ordem, vitrine_layout | existe | 20261030*, 20261031030000, 20261104000000 |
| simulado_produto_itens / _modulos / _modulo_itens | colunas usadas (tipo_item, item_id, pai_id, subtipo, tipo_ref, deletado…) | existem | 20261030000000, 20261031030000 |
| simulado_assinaturas, simulado_grupos, simulado_grupo_membros, simulado_pastas, simulado_trilhas, simulado_trilha_itens | colunas usadas | existem | migrations anteriores |
| simulado_eventos_calendario | titulo, data, hora, grupo_id | existe | 20261112040000 |
| simulado_tenants | nome, tema | existe | base |

Nenhuma coluna faltando. Tolerância já existente no código, caso algo seja revertido ou outro ambiente esteja atrasado:
- Sem as tabelas de curso: lista e página do curso mostram aviso com o nome da migration (`20261112020000_revisao_cursos`), sem erro.
- Sem `simulado_produtos.pasta_id`: a criação do produto refaz o insert sem a coluna.
- Sem `vitrine_layout`: o update é ignorado.
- Sem `simulado_eventos_calendario` ou sem `simulado_trilhas`: prévia sem encontros / curso sem trilha, sem erro.
- Filtro de janela abre/fecha no aluno (`produtosDoAluno`): não filtra nada se `simulado_cursos` não existir.
Não consegui exercitar esses caminhos de fallback contra um banco atrasado (o banco real já tem tudo).
