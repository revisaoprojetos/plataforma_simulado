# Relatório — Biblioteca, Videoteca e Central de Atualizações (Plataforma Revisão)

Legenda de origem: R = lido do banco; C = calculado no servidor a partir de dados reais; F = fixo (texto/rótulo do protótipo); X = fictício.
Nenhum item X ficou nas telas novas. Não executei as telas no navegador nem contra o banco real: a verificação foi `tsc --noEmit` (sem erros nos meus arquivos) e leitura do código.

## a) Inventário

### Biblioteca (`/admin/revisao/biblioteca`)
| Elemento | Origem | Fonte |
|---|---|---|
| Título, subtítulo, rótulos de colunas, descrições por aba | F | texto do protótipo |
| KPI materiais na biblioteca | C | soma das contagens por aba |
| KPI PDFs (PDFull+PDFlash+PDFight) | C | contagem SQL por tipo |
| KPI escondidos | C | simulado_conteudo_documentos.oculto = true |
| KPI e faixa de problemas reportados | R | simulado_material_reportes.status = 'aberto' |
| Contagem em cada aba (8) | C | documentos por tipo; simulado_flashcard_baralhos; simulado_simulados |
| Tipo do material | R/C | simulado_pastas.cronograma_tipo_material com herança do pai; documentos.leitura_legproc conta como LegProc; sem subpasta tipada = PDFull |
| Linha: título (editável) | R | simulado_conteudo_documentos.titulo (renomearDocumento) |
| Linha: disciplina | R | simulado_pastas (pasta com disciplina_id, herdada) |
| Linha: páginas | R | simulado_conteudo_versoes.paginas da versão atual |
| Linha: tempo no ritmo padrão (PDFull) | C | páginas ÷ velPadrao do tenant, blocos de 30 min |
| Linha: ordem | C | posição na lista ordenada |
| Linha: nº de questões (aba Questões) | R | simulado_conteudo_quiz_questoes |
| Linha: atualizada em (JurisClub) | R | documentos.atualizado_em |
| Switch visível ao aluno | R | documentos.oculto (definirVisibilidadeConteudo, com auditoria) |
| Botão Editar PDF/Gerenciar | link | /admin/biblioteca/conteudo/[id]/gerenciar |
| Janela Trocar arquivo | R | SubstituirModal existente, publicarNovaVersao (mantém grifos) |
| Histórico de versões (v{n}) | R | simulado_conteudo_versoes (numero, origem, criada_em, paginas) + versao_atual_id |
| Excluir | R | removerDocumento (soft-delete, Lixeira 30 dias), com confirmação |
| Aba Flashcards: nome, cards, status, alcance | R | simulado_flashcard_baralhos + cartões |
| Aba Simulados: título, modo, questões, duração, início, status | R | simulado_simulados, simulado_prova_questoes |
| Filtros Todos/Só escondidos, ordenar nome/recentes, busca, paginação | R | servidor; ordenação global por SQL |
| Adicionar linha / Importar em lote / Incluir material | link | levam à Biblioteca (Drive): upload em massa e planilha |
| Estados vazios | F | textos |

### Videoteca (`/admin/revisao/videoteca`)
| Elemento | Origem | Fonte |
|---|---|---|
| KPI videoaulas | C | docs com vídeo por link + docs-vídeo + video_aulas |
| KPI de vídeo no total | C | video_aulas.duracao_s (prontas) + metadados.duracao_min dos documentos |
| KPI escondidas | C | documentos tipo vídeo com oculto = true |
| KPI processando e faixa com títulos | R | video_aulas.status in (enviando, processando) |
| Linha: aula (PDFull) | R | documento com metadados.video (link) ou que referencia o doc-vídeo (metadados.video.doc_id) |
| Linha: título, link | R | metadados.video.titulo/url; documentos.titulo; video_aulas.titulo |
| Linha: duração | R | video_aulas.duracao_s; metadados.duracao_min (campo novo, editável na linha) |
| Linha: origem/status | R | derivado da fonte; video_aulas.status |
| Switch visível | R | documentos.oculto (só doc-vídeo); link = "segue a aula"; vídeo próprio = "sem controle" |
| Botões Abrir / Trocar vídeo / Gerenciar | link | gerenciar do documento ou /admin/conteudos/videos |

### Central de Atualizações (`/admin/revisao/atualizacoes`)
| Elemento | Origem | Fonte |
|---|---|---|
| KPI materiais para atualizar | R | reportes 'desatualizado' abertos + simulado_conteudo_atualizacao_pedidos pendentes |
| KPI atualizações no mês (mês BRT) | C | simulado_conteudo_atualizacoes.criado_em |
| KPI avisadas aos alunos | R | simulado_conteudo_atualizacoes.avisar_alunos |
| Fila: material, texto, origem, quando | R | reportes (+ nome do aluno) e pedidos; rótulo "tipo · título" pela subpasta |
| Janela Trocar arquivo | R | SubstituirModal |
| Formulário Registrar: material | R | busca por título em simulado_conteudo_documentos (até 30) |
| Tipos (4) e switches | F | constantes do protótipo |
| Publicar | R | grava simulado_conteudo_atualizacoes; reporte vira resolvido; pedido vira atendido; auditoria |
| Aviso aos alunos | R | simulado_notificacoes (sino do aluno) |
| Novidades do Início | R | simulado_novidades (categoria Materiais) |
| Histórico | R | simulado_conteudo_atualizacoes; filtro por tipo, busca, paginação |
| Pedir atualização / descartar (extra) | R | simulado_conteudo_atualizacao_pedidos |

### Leitor do aluno (edição pequena)
`apps/web/app/aluno/(portal)/nova/painel/leitor/[materialId]/page.tsx`: o selo fixo "Atualizado em 10/10/2026", a linha fixa de disciplina/curso e o bloco "Novidades da versão" (texto fixo) foram trocados por `novidadesDoDocumento()`. Sem registro, selo e bloco não aparecem. A linha fixa de disciplina/curso foi removida (era fictícia). O ícone "spark" do bloco virou "info".

## b) O que foi trocado nesta rodada
- Leitor do aluno ligado ao selo e às novidades.
- Aviso aos alunos: notificação in-app em massa e novidade no Início.
- Duração de vídeo: campo metadados.duracao_min (preservado por normalizarMetadados), editável na Videoteca e somado no KPI.
- Ordenação global e paginação por uma consulta SQL (count OVER), com fallback PostgREST.
- LegProc inclui documentos com leitura_legproc (mesma regra do leitor); PDFull os exclui.
- Título editável na tabela; "Adicionar linha" e "Importar em lote" conforme os prints.

## c) Lacunas restantes
- E-mail do aviso: não há disparo de e-mail por atualização (só sino e novidade).
- Destinatários do aviso: acesso direto, grupos (do documento e de pastas ancestrais), leitores e anotadores. Acesso via produto/regra de liberação não é resolvido. Limite de 20.000 alunos.
- Colunas "Link do material" e edição manual de Ordem/Páginas (protótipo): não existem no modelo real (arquivo = material; páginas contadas automaticamente; ordem vem do catálogo do Cronograma).
- CSV do protótipo: substituído por link para o upload em massa e a planilha de metadados da Biblioteca.
- Vídeo próprio (video_aulas) sem ligação com aula do PDFull e sem controle de visível ao aluno.
- "Trocar arquivo" de vídeo leva ao gerenciar do documento (o modal envia base64; evitado para vídeos grandes).
- Classificação PDFull/PDFlash/PDFight: não há campo por documento; vale a regra do sistema (subpasta). Só LegProc tem flag por documento.
- Sem SQL direto (DATABASE_URL), o fallback ordena por grupo de pastas, não globalmente.
- Não testado em navegador nem com dados reais; colunas/tabelas (oculto, video_aulas, simulado_notificacoes, simulado_novidades, simulado_pasta_grupos/estudantes) foram usadas conforme o código existente, sem conferência no banco.

## d) Divergências vs prints (04, 05, 06) corrigidas
- 04: faltavam "Adicionar linha" e "Importar … em lote"; título era só leitura (agora editável).
- 05: faltavam "Adicionar linha", "Importar Videoaulas em lote" e duração editável.
- 06: estrutura conferida (KPIs, abas, itens da fila com os dois botões, formulário, histórico); o aviso passou de flag para envio in-app.
- Ações do app.js: libnew, vidnew, goreps, libhist, libtroca, crdel, crrowbool, updtipo, updnova, updpub, tab, sw implementadas; craddrow/cradd/crcsv como link; edição inline de ordem/páginas/link = lacuna.

## e) Dependências do banco verificadas
Script Node somente SELECT (`select(coluna).limit(1)` por tabela/coluna, service role, apps/web/.env.local). 21 tabelas, todas as colunas usadas pelos meus arquivos (biblioteca, videoteca, atualizações, leitor do aluno, notificações, novidades, metadados, pasta_grupos/estudantes, versões, cronograma_tipo_material, leitura_legproc, atualizações/pedidos).

| Item | Resultado | Tratamento |
|---|---|---|
| simulado_conteudo_documentos.oculto | NÃO existe (migration 20261026000000_biblioteca_acesso_v2.sql pendente) | Sondagem com cache de 60s (`temColunaOculto`). Sem a coluna: consultas refeitas sem `oculto`, tudo tratado como visível, filtro "Só escondidos" e interruptores desligados, KPI de escondidos = 0 e aviso "Aplique a migration 20261026000000 para controlar a visibilidade". Biblioteca e Videoteca |
| video_aulas | TABELA AUSENTE (removida de propósito pela migration 20261110040000_video_remove_espelho: o vídeo próprio vive só no serviço de vídeo) | Fonte removida da Videoteca; KPI "processando" mostra "—" (consultar no gerenciador de vídeo); o total de horas soma só metadados.duracao_min. Vídeos do gerenciador próprio não aparecem na lista (lacuna) |
| Demais 19 tabelas e todas as demais colunas | ok | nenhuma ação |

Observação: o relatório de inventário (seção a) cita video_aulas e oculto como fonte; vale o que está nesta seção.
