# Dashboard, Relatórios, Aparência e Permissões da equipe — auditoria de dados reais

Legenda de origem: R = lido do banco; C = calculado no servidor a partir de dados reais; F = fixo/constante do protótipo; X = fictício; E = editável (grava no banco).
Validação feita contra o banco real (tenant Revisão / Ensino Jurídico) com script Node SOMENTE LEITURA, rodando as próprias funções de `lib/admin/revisao/*` (bundle esbuild) e SQLs avulsos.

## a) Inventário

### Dashboard (`/admin/revisao/inicio`)
| Bloco / janela | Elemento | Antes → Depois | Origem (tabela.coluna) |
|---|---|---|---|
| Cabeçalho | Título, subtítulo, botões Novo evento / Incluir material | F → F (rótulos de UI; destinos reais em `RR`) | — |
| KPI Cursos em aberto | número | R | `simulado_produtos` (ativo, validade_tipo, validade_data). Medido: 4 |
| KPI Alunos ativos | número | R/C | `simulado_assinaturas` (status='ativo', expira_em) com `simulado_estudantes` (deletado). Medido: 11.787 |
| KPI estudaram hoje | número | C | `simulado_tempo_estudo` (dia BRT, segundos>0). Medido: 123 |
| KPI Questões no banco | número | R | `simulado_questoes` (deletado=false). 5.689 |
| KPI PDFs na biblioteca | número | R (corrigido) | `simulado_conteudo_documentos` categoria='conteudo', status='publicado', tipo_origem<>'video' (antes contava rascunho e vídeo: 881 → 875) |
| Calendário semana/mês | grade, eventos, legenda | R/C | `simulado_eventos_calendario` (data, hora time → "HH:MM", titulo, tipo, grupo_id). Hoje: 0 eventos cadastrados (estado vazio real) |
| Próximos eventos | 4 itens + total | R | idem; grupo por `simulado_grupos.nome` (NULL = "Todos") |
| Dúvidas: sem resposta / mais antiga / respondidas 7d | números | R/C | `simulado_duvidas` (status, criado_em, atualizado_em). Hoje 0 |
| Problemas em materiais | número | R | `simulado_material_reportes` (status aberto/em_analise). 3 |
| Média das avaliações / notas 1–2 | número | C | `simulado_material_avaliacoes.nota`. 5,0 / 0 |
| Dúvidas por disciplina / últimas 3 | barras e lista | R | `simulado_duvidas` + `simulado_disciplinas.nome`, `simulado_estudantes.nome` (nome + inicial do sobrenome) |
| Última atualização em massa + tabela | data, texto, tipo, materiais, alunos avisados | X/F → R/C | ANTES: tabela `simulado_atualizacoes_massa` (ninguém grava) / lei_atualizacoes. DEPOIS: `simulado_conteudo_atualizacoes` (Central de Atualizações), agrupando o mesmo texto no mesmo dia (BRT) em 2+ documentos; alunos avisados = alunos distintos em `simulado_notificacoes` (tipo='material_atualizado', link do material, mesmo dia). Hoje: 0 registros |

### Relatórios (`/admin/revisao/relatorios`)
| Aba / elemento | Origem | Medido (30 dias, todos os grupos) |
|---|---|---|
| Filtro grupo | R `simulado_grupos` (nome) | — |
| Filtro período 7/30/tudo, abas | F de UI | — |
| Leitura: % leram o PDF da semana | C `..._plano_meta` (tipo pf/pp, semana atual seg–dom) com `..._meta.estado='done'` | 0,7% |
| Leitura: % leram o LegProc da semana | idem tipo lp | 0,6% |
| Leitura: % abriram o JurisClub do mês | C `simulado_conteudo_leitura_progresso` com documentos categoria='jurisclub' (ultima_leitura_em no mês BRT) ÷ alunos ativos | 0,5% |
| Leitura: páginas por hora | C `simulado_tempo_estudo` (soma paginas / soma segundos, paginas>0) | 12,2 |
| PDFs lidos por disciplina | C metas pf/pp por disciplina; aluno concluiu todas as do período (mín. 5 alunos) | Ambiental 29% … |
| LegProc por lei | C metas lp por título (mín. 20 metas) | CF 26% … |
| Desempenho: nota média, simulados feitos | C `simulado_sessoes_prova` (finalizada, não teste, finalizado_em no período) | 62,0 / 2.618 |
| Desempenho: disciplina de menor acerto e % | C `simulado_respostas_objetivas.correta` + sessões + `simulado_questoes.disciplina_id` + `simulado_disciplinas` (mín. 20 respostas) | Direito Digital 33% |
| Desempenho: barras | as 15 disciplinas de menor acerto | — |
| Cronograma: montados | C `..._plano` (arquivada=false, exemplo=false) | 696 |
| Cronograma: % metas cumpridas | C metas com data_prevista no período até hoje | 18% |
| Cronograma: 5+ metas atrasadas | C metas vencidas e não 'done' por aluno | 242 |
| Cronograma: sessões fora do cronograma | C `..._plano.extras[]` (elemento `data` dentro do período) | 43 |
| Cronograma: linha das 8 semanas | C % done por semana (date_trunc week) | S6 33%, S7 19%, S8 17% (S1–S5 0%: a marcação de "feita" é recente) |
| Feedbacks: média, reportados, corrigidos | C `simulado_material_avaliacoes`, `simulado_material_reportes` (status='resolvido') | 5,0 / 3 / 0 |
| Feedbacks: NPS | C `simulado_avaliacoes.nps` (%9–10 menos %0–6) | 89 |
| Feedbacks: piores materiais / por tipo | C avaliações por documento (mín. 3) / reportes por tipo | vazio / Problema técnico 3 |
| Copiar tabela | formata o que está na tela | — |

### Aparência (`/admin/revisao/aparencia`)
| Elemento | Origem |
|---|---|
| Logo, ícone, imagem de login | R/E `simulado_tenants.tema`: logo_url, favicon, login.fundoImagem (upload via `/api/admin/imagem`) |
| Cores | R/E tema.cor_primaria, tema.cor_accent |
| Texto da fonte | R tema.fonte (antes F fixo "Plus Jakarta Sans"; agora mostra a real, padrão se vazio) |
| Menu do aluno (13 itens) | lista = itens REAIS que o layout do aluno mostra na Revisão (verificado item a item contra `app/aluno/(portal)/layout.tsx`: 13/13 batem; o layout não exporta a lista, então o catálogo fica em `aparencia-tipos.ts`); estado R/E tema.menu_aluno.ocultos; o layout do aluno agora aplica o filtro |
| Prévia do menu | C no cliente a partir do estado (cor, logo, itens riscados) |
| Ordem dos blocos do Início | R/E tema.home_blocos; a Início do aluno (`nova/inicio/page.tsx`) agora lê e reordena (avisos, calendário, novidades, vitrine). "Destaques" e "Próximo simulado" não existem como bloco na Início: ordem salva, sem efeito visual |
| Salvar | action com checkPermission configuracoes:manage + auditoria + limpa o cache do tema do portal |

### Permissões da equipe (`/admin/revisao/equipe`)
| Elemento | Origem |
|---|---|
| Papéis e contagem de pessoas | R `simulado_roles`, `simulado_tenant_acessos` |
| Matriz 15 áreas x papéis (Vê/Edita) | C `simulado_role_permissions` x `simulado_permissions` (área → recurso em `equipe-tipos.ts`) |
| Clique na célula | E grava em `simulado_role_permissions` (rbac:manage + auditoria) |
| Pessoas: nome, e-mail mascarado, papel, ativo | R `simulado_users`, `simulado_tenant_acessos` |
| Último acesso | R `simulado_users.ultimo_login` (vazio em produção) com fallback `auth.users.last_sign_in_at` (cache 5 min). Antes: busca em auditoria, 8 s |
| Histórico (8 itens) | R `simulado_audit_logs`, consulta por entidade (usa o índice); texto por `resumoRegistro` |
| Criar papel / convidar / trocar papel / tirar acesso | reuso exato das actions de `rbac` e `administradores` |

## b) O que foi trocado e queries validadas
- Calendário: a troca para `simulado_eventos_calendario` está correta (colunas data, hora time, titulo, tipo, grupo_id existem; a migration 20261112060000 não cria mais a tabela antiga). Hora ajustada de "19:00:00" para HH:MM.
- Atualizações em massa: de fonte inexistente para `simulado_conteudo_atualizacoes` + notificações (SQL executado sem erro; hoje sem dados).
- PDFs: filtro corrigido (publicado, sem vídeo).
- Relatórios: JurisClub deixou de usar `simulado_tempo_estudo.frente='jurisclub'` (não existe nenhuma linha) e passou a usar leitura dos documentos da categoria jurisclub; denominador = alunos ativos; "sessões fora do cronograma" agora respeita o período; amostra mínima nas barras; % abaixo de 10 com 1 casa; nome completo da disciplina.
- Erros antes engolidos em silêncio (consulta com erro virava 0): agora o `seguro` registra `console.warn`, e o resultado vazio é explícito.
- Equipe: 8,9 s → cerca de 3 s (histórico por entidade; último acesso sem varrer a auditoria de ~770 mil linhas).
- Tempos (cache desligado): dashboard 1,3–1,6 s; relatórios 1,2–1,6 s por aba (inclusive com grupo de 1.227 membros e "desde o início"). Todas as abas, os 3 períodos e o filtro de grupo rodaram sem erro.
- Definições de métrica adotadas (confirmar com o usuário): "leram o PDF/LegProc da semana" = alunos que concluíram TODAS as metas pf/pp (ou lp) previstas na semana atual, sobre quem tinha meta; "abriram o JurisClub" = alunos com leitura em documento de categoria jurisclub no mês ÷ alunos ativos; "sessões fora do cronograma" = itens `extras` dos planos com data no período.

## Dependências do banco verificadas (information_schema)
Existem, com todas as colunas usadas: simulado_produtos, simulado_assinaturas, simulado_estudantes, simulado_tempo_estudo, simulado_questoes, simulado_conteudo_documentos, simulado_eventos_calendario, simulado_grupos, simulado_duvidas, simulado_material_reportes, simulado_material_avaliacoes, simulado_disciplinas, simulado_conteudo_atualizacoes, simulado_notificacoes, simulado_cronograma_adaptativo_plano / _plano_meta / _meta, simulado_grupo_membros, simulado_conteudo_leitura_progresso, simulado_sessoes_prova, simulado_respostas_objetivas, simulado_avaliacoes, simulado_tenants (tema), simulado_roles, simulado_permissions, simulado_role_permissions, simulado_tenant_acessos, simulado_users (inclui ultimo_login), simulado_audit_logs, simulado_atualizacoes_massa (existe, sem uso).

FALTA: permissões do recurso `video` (video:view / video:manage) em `simulado_permissions`. A coluna "Videoteca" da matriz fica travada, com aviso, até semear (resolve: migration/seed do RBAC do vídeo próprio). Nada do que uso depende de `simulado_conteudo_documentos.oculto` nem de `biblioteca_acesso_v2`.

Tolerância: dashboard (cada bloco em try/catch → vazio + warn), relatórios (erro → aviso "indisponível", sem inventar número), equipe e aparência (try/catch → aviso/padrões). O layout do portal do aluno só lê `tema.menu_aluno.ocultos` do JSON já carregado (sem consulta nova; tema ausente = nada escondido). A Início do aluno lê `tema.home_blocos` com try/catch (padrão = ordem original).

## c) Lacunas restantes
- "Incluir material" abre a Biblioteca, mas não abre direto o formulário de novo material (`libnew` do protótipo).
- Barra superior mobile (botão de menu + busca, prints 41/42) é do shell do admin, fora desta frente.
- "Destaques da semana" e "Próximo simulado" não existem como bloco na Início do aluno: a ordem fica salva, sem efeito.
- Sem DATABASE_URL os relatórios mostram "indisponível" (dependem de SQL direto).
- Convite da equipe cria a conta com senha provisória exibida uma vez (não envia e-mail).
- Dúvidas, eventos e atualizações em massa estão vazios no banco hoje: os blocos mostram o estado vazio real; não exercitei a renderização com dados nesses três blocos.
- Não testei no navegador (nem claro/escuro nem mobile); a validação foi por tsc e por execução das consultas.
- Server actions podem falhar em domínio custom (landmine conhecida); Aparência e Equipe usam server actions.
- `simulado_atualizacoes_massa` ficou sem uso (a migration já aplicada a criou).

## d) Divergências vs print corrigidas
- Hora dos eventos "19:00:00" → "19:00".
- Link "Últimas dúvidas" abre a dúvida selecionada (`?sel=`); cartão de problemas abre a aba de reportes; avaliações abre a aba de avaliações.
- "% leram…" com 1 casa decimal quando <10% (antes mostrava 0%).
- Acerto por disciplina: lista as 15 piores em ordem decrescente.
- Rótulos dinâmicos ("de novembro", "no período") conforme o filtro.
