# Auditoria de Problemas da Plataforma

Registro simples de tudo que deu errado (histórico de **02/11/2026 em diante**): o que acontecia, por quê e como foi resolvido.
**Regra fixa:** todo problema novo entra aqui na hora, com **data**, **assunto**, **versão** e **status**. Os mais novos ficam no topo de cada tabela.

- **Versão da plataforma (último commit):** v4.22.1, em 16/11/2026.
- **Última conferência desta auditoria:** 17/11/2026.

## Legenda

| Marca | Significa |
|---|---|
| ✅ | Resolvido. Saiu em uma versão lançada (conforme o CHANGELOG) ou foi conferido no banco. |
| ⏳ | **Em aberto.** Precisa de uma ação. |

> **Atenção:** "✅" significa lançado em versão. Eu não consigo ver qual versão está rodando em produção. Confira o SHA no Portainer antes de afirmar que algo está no ar.
> **Prazos:** os prazos dos itens ⏳ são propostos em 17/11/2026 e podem ser ajustados por você. Nos itens ✅ a coluna mostra quando foi concluído.
> Itens marcados "a confirmar" ainda não têm data ou versão registrada.

---

## 1. O que ainda está em aberto (prioridade)

| # | Assunto | Razão do problema | Ação para correção | Prazo de correção | Quem resolve |
|---|---|---|---|---|---|
| 4 | Duas migrações com o mesmo número `20261119060000` e duas com `20261120010000` | Arquivos criados com o mesmo timestamp em sessões diferentes. | Renomear um arquivo de cada par (só os ainda não registrados) e atualizar o registro. | 19/11/2026 | Renomear |
| 6 | E-mail duplicado de aluno | O bloqueio existe só no sistema (duplo clique ainda pode passar). Falta o índice único no banco. | Limpar os 2 casos duplicados e criar o índice único em migração nova. | 25/11/2026 | Migração nova |
| 7 | Gabarito da questão `af828df6` (AGU) | A alternativa certa foi trocada sem querer em 06/08. A nota está correta. **Não rodar re-correção.** | Reverter a alternativa quando você decidir. | Sem prazo, aguarda sua decisão | Decisão sua |
| 8 | Chave de criptografia (`APP_ENCRYPTION_KEY`) | Se a chave mudar, as integrações da Curseduca "somem". | Fixar a chave no ambiente do stack e nunca trocar. | 20/11/2026 | Infra |
| 9 | Storage S3 (Hetzner) | Flip feito (27/11/2026, v4.32.0); falta desvincular de vez do Supabase: bucket `imagens` do Hetzner ainda privado, URLs antigas no banco e fallback ligado. | Ver 3.6 "Storage: desvínculo do Supabase" (policy pública das imagens, SQLs 18 e 20, "cpi", depois desligar o fallback). | A definir (Infra) | Infra |
| 11 | Arquivos `fix-c2*.mjs` | Foram commitados por engano junto da v4.19.0. | Remover do repositório no próximo "cpi". | Próximo "cpi" | Limpeza |
| 12 | Teste automático do aluno | O login de teste parou de funcionar. Sem isso não dá para conferir telas reais. | Investigar o fluxo e as credenciais de teste. | 24/11/2026 | Investigar |
| 13 | Não testados ainda | Entregues sem teste manual: aviso ao sair do leitor, salvamento automático da folha, visual em celular e modo escuro. | Testar cada item e registrar o resultado. | 20/11/2026 | Testar |
| 14 | `.limit(2000)` suspeitos | Em `banco-estudantes.tsx` e `adicionar-estudantes/page.tsx`. O PostgREST corta em 1.000 linhas. | Trocar por `fetchAll` com ordenação por `id`. | 24/11/2026 | Revisar |
| 15 | 10 aulas da planilha de julho sem vínculo | Aulas de Direito Empresarial (9) e Processo Civil – Execução I não existem no Extensivo da Advocacia Pública, então ficam sem data na matriz. | Criar as aulas no produto e reimportar a planilha. | 20/11/2026 | Conteúdo |
| 16 | Importar cronogramas: erro "reading 'sheets'" | O leitor de .xlsx quebrava com arquivo de outro programa. O novo leitor (`ler-xlsx.ts`) existe, mas falta testar com o arquivo real "PE 2027". | Testar com o arquivo real e fazer o "cpi". | 18/11/2026 | Testar e subir |
| 17 | Aviso "cronogramas liberados que ninguém recebe" | O aviso ignorava o acesso geral do grupo. A correção ("Liberar para todos") está feita e a migração foi aplicada, mas ainda não subiu. | Fazer o "cpi". | 18/11/2026 | Subir versão |

| 18 | Edição do documento não aparece / histórico só diz "atualizado" (25/11/2026) | O salvamento do OnlyOffice sobrescreve a mesma versão e não guarda o que mudou; saves de 19/11 não têm evento no log. O texto guardado (`html_rico`) e o cache do leitor não eram refeitos. | Corrigido o callback (v4.30.3). Falta registrar um diff por salvamento ("Art. 7º, XIII alterado") e mostrar no histórico. | A definir | Implementar |
| 19 | Lentidão e Bad Gateway (auditoria 25/11/2026) | Web com 1 réplica sem limites; banco em us-east-1 e app na Alemanha (~90–100 ms por consulta); `proxy.ts` chama `getUser()` em toda página; sem CDN (~0,9 s por arquivo estático); Redis de fila e cache juntos em LRU. | Réplicas, limites e Redis de filas no compose (v4.30.3, falta deploy). Pendentes: aproximar app e banco, CDN (Cloudflare), trocar `getUser()` por validação local depois de atualizar `@supabase/ssr`. | A definir | Infra |
| 20 | Outbox de conteúdo parado | 11.515 eventos `documento.atualizado` sem processar desde 19/10; nenhum cron chama `/api/conteudo/outbox/processar`. | Agendar o processamento no worker e só então limpar. | A definir | Implementar |
| 21 | Tabelas sem retenção | `audit_logs` 1,28 GB (+24 mil linhas/dia), `webhook_inbox` 223 MB, `conteudo_versoes` 3,3 GB de TOAST. | Funções de purga criadas na migração 20261204000100 (não agendadas). Decidir prazo e agendar. | A definir | Decisão sua |
| 23 | Migrações não aplicadas no banco que o app usa (25/11/2026) | A conferência feita com o `DATABASE_URL` do app (projeto `twdrtlxkjvunkdobudev`, pooler us-east-1) mostrou TODAS as migrações recentes ausentes, mesmo com "sql ok". O print do Supabase mostra um banco em São Paulo; pode haver dois projetos. | Confirmar o código do projeto onde os SQLs são rodados; a seção Banco do admin mostra o projeto conectado e OK/FALTA por migração. | 26/11/2026 | Você |
| 24 | Bloat de 3,2 GB em `simulado_conteudo_versoes` | TOAST com 3,3 GB para ~50 MB de dado vivo; nunca teve autovacuum. | `VACUUM (FULL, ANALYZE) simulado_conteudo_versoes;` via psql, fora do pico. | 26/11/2026 | Você (psql) |
| 25 | Pendências de CPU | `rebuildCacheTenant` pagina todo o ledger de XP; `matricularEmSimuladosDoBanco` reconcilia todos os membros a cada vínculo; `leitura-publicar` lê todas as aulas com `publicacao`; `curseduca-jobs/sync` e `integracoes-eventos` sem lock Redis. | RPC com DISTINCT; reconciliar só o delta; filtro por data; usar `comLockCron`. | A definir | Implementar |
| 22 | Badge "N resposta(s)" em questões | A checagem de uso passou a devolver 0 ou 1. | Trocar por RPC de contagem se quiser o número exato. | A definir | Opcional |
| 26 | Consultas mais pesadas do banco (26/11/2026) | `simulado_pasta_estudantes` (~824 chamadas/min) e `simulado_respostas_objetivas` por questão somavam ~74% do tempo de execução. | v4.30.5: leitura só do próprio aluno + RPC cacheada; relatórios com RPC agregada. Aplicar `20261206000000` no projeto `twdrtlxkjvunkdobudev`. | 26/11/2026 | Você (migração) |

---

## 2. Migrações que ainda faltam

Só aparece aqui o que **não foi feito**. Quando uma migração for aplicada e conferida no banco, ela sai desta lista.
Última conferência no banco real: 17/11/2026.

| Status | Migração | Razão do problema | Ação para correção | Prazo de correção |
|---|---|---|---|---|
| ⏳ | Numeração duplicada | Dois pares de arquivos com o mesmo número (`20261119060000` e `20261120010000`). | Renomear um de cada par. | 19/11/2026 |
| ⏳ | Pendentes confirmadas no banco (25/11/2026) | Objetos ausentes: `20261105020000` (disciplina_aliases), `20261110010000` (video_*), `20261112010000` (download_log), `20261120010000` (aluno_metricas), `20261124000000` (índices audit_logs, só via psql por ser CONCURRENTLY), `20261125020000` (doc_* em plano_meta), `20261203000000` (contagens). Novas: `20261204000000_contagem_grupos`, `20261204000100_manutencao_retencao_indices` e `20261205000000_reducao_cpu_indices`. | Aplicar na ordem, fora do pico. | 26/11/2026 |
| ⏳ | Não conferidas | Migrações antigas marcadas na memória com "⚠️" que não foram verificadas no banco: `20261029010000`, `20261029020000`, `20261028040000`, `20261008*`, `20261021000000`, `20261022100000`, `20261031120000`, `20261104140000`, `20261105010000`, `20261106020000`, `20261030000000`, `20260922*`, `20261031*` (Estúdio) e `050000/060000/061000` do adaptativo. | Conferir cada uma no banco, aplicar o que faltar e apagar da lista o que já estiver feito. | 24/11/2026 |

---

## 3. Problemas relatados por alunos e pela equipe

### 3.1 Cronograma e área do aluno

| Status | Data / Versão | Assunto | Razão do problema | Ação para correção | Prazo de correção | Quem relatou |
|---|---|---|---|---|---|---|
| ⏳ | 27/11/2026 · não lançado | Matriz de aulas do Gerador | O conjunto de conteúdos (ex.: Direito Administrativo) era uma lista de campos de texto, sem vínculo com a Biblioteca, e mostrava as abas do Cronograma (a ideia era uma área interna só com "Voltar"). | Tela interna com tabela (1 linha por aula; colunas = seções/classificações; célula = documento + parte + rótulo + visível + tempo), seletor da Biblioteca, links de questões na própria tabela, ações em lote e "Disciplinas e filtros". Seleção gravada em `simulado_conteudo_selecao_meta` (area `gerador`, chave `cj:<conjunto>\|<aula>\|<seção>`); o aluno só muda quando há seleção. Campos antigos ficam em "Avançado / legado". Decisões: chave por conjunto+aula+seção (consumo casa por disciplina+aula+tipo, conjunto de menor ordem vence); seleção oculta esconde o material da meta; seleção com documento despublicado cai no automático; coluna Questões = links (sem seletor); o seletor lista só documentos de pastas de disciplina (mesmo universo do resolvedor). Sem SQL novo (usa a tabela da migration 16). | Aguardando teste e commit (cpi) | Dono |
| ✅ | 16/11/2026 · 4.21.0 | Cronograma: tela de primeiro acesso | Com cronograma criado e fixado, "Continuar" mostrava a tela de criar novo. A tela aparecia antes do plano carregar. | A tela fica em "carregando" até o plano chegar. | Concluído (16/11/2026) | Dono |
| ✅ | 16/11/2026 · 4.21.0 | Cronograma: material não abria, "NaN" | LegProc não abria e a tela mostrava dados incompletos. A checagem de documentos bloqueados era lenta e em série. | Carga em paralelo, limite de 2 s, cache maior e a tela espera os dados completos. | Concluído (16/11/2026) | Dono |
| ✅ | 13/11/2026 · 4.21.0 | Botão "Voltar" | Caía no início do painel e não no cronograma em estudo. A rota de retorno era fixa. | Volta ao cronograma que está sendo estudado. | Concluído (13/11/2026) | Dono |
| ✅ | 06/11/2026 · 4.9.2 | Meta de Questões abria o PDFull | A meta de Questões apontava para o PDFull da matéria. | Abre a tela de questões ou só inicia o cronômetro. O cronômetro flutuante também foi corrigido. | Concluído (06/11/2026) | Aluno |
| ✅ | 06/11/2026 · 4.9.1 | "PR.regras218 is undefined" | Arquivo novo com o motor antigo em cache. | A versão agora vem do conteúdo do arquivo. | Concluído (06/11/2026) | Equipe |
| ✅ | 06/11/2026 · 4.5.0 | Painel da meta | O botão "Parcial" não abria e a tela piscava. | Botão corrigido. | Concluído (06/11/2026) | Equipe |
| ✅ | 04/11/2026 · 4.3.1 | Cronograma em branco | Colisão de nome de variável no iframe. | Variável renomeada. | Concluído (04/11/2026) | Equipe |
| ✅ | 03/11/2026 · 4.2.3 e 4.2.5 | Menu do celular com itens faltando | A barra inferior usava lista fixa. | Passou a ler o menu configurado. | Concluído (03/11/2026) | Equipe |
| ✅ | 03/11/2026 · 4.2.4 e 4.2.5 | Telas de protótipo | Cadernos de exemplo iguais para todos. A contagem de "Salvos" falhava por filtro em coluna inexistente. | Corrigido. | Concluído (03/11/2026) | Equipe |
| ✅ | 03/11/2026 · 4.2.0 | Agendar aula caía em "Rascunho" | Faltava a coluna `publicacao` na consulta. | Coluna incluída. Afetava todos os tenants. | Concluído (03/11/2026) | Equipe |

### 3.2 Liberação de materiais (regras por produto e segmento)

| Status | Data / Versão | Assunto | Razão do problema | Ação para correção | Prazo de correção | Quem relatou |
|---|---|---|---|---|---|---|
| ✅ | 16/11/2026 · 4.20.1 | **Bug crítico:** regras de Agosto/Setembro | Turmas de Setembro (5 turmas, 1.295 regras) ficavam sem restrição. O limite de 5.000 era cortado em 1.000 pelo PostgREST. | Paginação com ordenação por `id`. | Concluído (16/11/2026) | Achado na auditoria |
| ✅ | 16/11/2026 · 4.20.1 | Bloqueio de Agosto até 14/11 | A data-base do item prevalecia sobre a regra do módulo. | Regra de segmento passou a valer. | Concluído (16/11/2026) | Equipe |
| ✅ | 16/11/2026 · 4.20.1 | 79 documentos LegProc/PDFull não abriam | Abriam só pela regra de pasta; quem tinha só o produto ficava de fora. | Acesso pelo produto. | Concluído (16/11/2026) | Equipe |
| ✅ | 16/11/2026 · 4.20.1 | Mensagem errada | Material com data futura mostrava "Você não tem acesso". | Mostra "Ainda não liberado, será liberado em dd/mm". | Concluído (16/11/2026) | Equipe |
| ✅ | 16/11/2026 · 4.20.1 | `concluir_meta` trancava a aula | A regra travava a liberação. | Libera na data da regra. | Concluído (16/11/2026) | Equipe |
| ✅ | 13/11/2026 · 4.19.1 | PDFs: "Bucket not found" | O bucket virou privado. | Proxy autenticado e links assinados. Banco conferido: bucket privado. | Concluído (13/11/2026) | Equipe |
| ✅ | 12/11/2026 · 4.18.0 | 404 mudo ao abrir documento | Sem explicação para o aluno. | Tela com o motivo e "Em preparação". | Concluído (12/11/2026) | Equipe |

### 3.3 Biblioteca e leitor

| Status | Data / Versão | Assunto | Razão do problema | Ação para correção | Prazo de correção | Quem relatou |
|---|---|---|---|---|---|---|
| ✅ | 16/11/2026 · 4.21.0 | Atualizações: "Invalid Date" | O leitor esperava o formato antigo. | O servidor monta rótulo e data. Data validada por teste; **conferir no leitor real após o deploy**. | Concluído (16/11/2026) | Professor |
| ✅ | 16/11/2026 | Tipo "Sem atualizações" | Faltava a opção. | Tipo criado. Migração conferida no banco. | Concluído (16/11/2026) | Professor |
| ✅ | 16/11/2026 · 4.21.0 | Salvar em cadernos | A tela dizia "indisponível". A tabela estava no formato antigo. | Migração `20261119060000_caderno_itens_alinhar_colunas`. **Conferida no banco.** | Concluído (16/11/2026) | Dono |
| ✅ | 16/11/2026 · 4.21.0 | Design do pop-up de cadernos | Visual fraco, azul no lugar do roxo, lista gigante. | Refeito em pop-up com a cor da marca. Faltam testes em celular e modo escuro. | Concluído (16/11/2026) | Dono |
| ✅ | 16/11/2026 · 4.19.0 | Barra de ferramentas do leitor bagunçada | A barra colorida cortava os ícones. | Corrigido no CSS. | Concluído (16/11/2026) | Dono |
| ✅ | 13/11/2026 · 4.19.0 | Versão automática "v3" no topo | Aparecia mesmo sem o professor criar. | Só aparece o rótulo criado pelo admin. | Concluído (13/11/2026) | Dono |
| ✅ | 06/11/2026 · 4.9.0 a 4.10.0 | Modelos JurisClub | Tipo não era salvo, folha em branco no PDF e tabelas pretas no modo escuro. | Abre sempre no leitor em texto. | Concluído (06/11/2026) | Equipe |
| ✅ | 03/11/2026 · 4.1.3 | Conversão docx para PDF falhava no S3 | O OnlyOffice recebia uma URL não pública. | Corrigido. | Concluído (03/11/2026) | Equipe |

### 3.4 Simulados, desafios e sequência (streak)

| Status | Data / Versão | Assunto | Razão do problema | Ação para correção | Prazo de correção | Quem relatou |
|---|---|---|---|---|---|---|

### 3.5 Curseduca, acesso e login

| Status | Data / Versão | Assunto | Razão do problema | Ação para correção | Prazo de correção | Quem relatou |
|---|---|---|---|---|---|---|

### 3.6 Infraestrutura, build e desenvolvimento

| Status | Data / Versão | Assunto | Razão do problema | Ação para correção | Prazo de correção |
|---|---|---|---|---|---|
| ⏳ | 27/11/2026 · sem versão | Storage: desvínculo do Supabase | Flip `STORAGE_PROVIDER=s3` feito (v4.32.0, CORS aplicado, 18.619 objetos copiados), mas ainda sobravam: ~370 URLs absolutas do Supabase no banco, `simulado_arquivos.provider='supabase'` (15.736), código de manutenção/cronograma usando `svc.storage` direto e `next/image` sem o host do Hetzner. **Achado:** o bucket `revisaopge-imagens` do Hetzner NÃO é público (403 anônimo; objetos copiados sem ACL). **Feito no código (não commitado):** `cronograma/adaptativo` (lp-catalogo, backup-catalogo/grade/remap) via novo `lib/storage/json.ts`; `organizador`/`backup` via `getStorage()` (novas operações `copy` e `garantirBucket` nos providers s3/supabase/gcs/fallback); `parseStorageUrl`/`pdf-proxy` reconhecem URL Hetzner e Supabase; `next.config` com hosts twdr + Hetzner; fallback Supabase com contador/log amostrado (`[storage] fallback-supabase total=N`). **Já estava ok:** worker, ingestao, listar-buckets, CSP (sem img-src). **Resta:** (1) `node scripts/storage-publicar-imagens.mjs --aplicar` (policy GetObject público só no bucket imagens); (2) SQLs 18 (URLs imagens → Hetzner) e 20 (provider='s3') em `docs/sql-aplicar-twdr/` (reversão: 19 e 21); (3) "cpi"; (4) observar o log do fallback por alguns dias e então `STORAGE_FALLBACK_SUPABASE=off`; (5) URLs do bucket `pdfs` (privado) ficam como localizadores (resolvidas pelo proxy → storage ativo), sem reescrita; 1 PDF de job (`7f88b9a5…`) não existe no Hetzner. Ver seção 1, item 9. | Itens (1) a (4) acima | Sem prazo (depende do usuário) |
| ⏳ | 17/11/2026 · sem versão | Importar cronogramas: "Cannot read properties of undefined (reading 'sheets')" | O leitor de .xlsx quebrava quando o arquivo tinha o `workbook.xml` fora do formato esperado (comum em arquivos exportados de outros programas). | Novo leitor (`ler-xlsx.ts`) confere o arquivo, tenta consertar o formato e mostra mensagem clara. Falta testar com o arquivo real "PE 2027" e fazer o "cpi". | 18/11/2026 |
| ⏳ | 17/11/2026 · sem versão | Aviso "cronogramas liberados que ninguém recebe" | O aviso ignorava o acesso geral do grupo de acesso e não existia como liberar para todos em Grupos de acessos. | Controle "Liberar para todos" nos grupos, acesso direto por cronograma e aviso corrigido. Migração aplicada e conferida no banco. Falta o "cpi". | 18/11/2026 |
| ⏳ | 16/11/2026 | Arquivos de teste commitados | `fix-c2*.mjs` entraram na v4.19.0. | Remover (seção 1, item 11). | Próximo "cpi" |
| ✅ | 11/11/2026 · 4.13.0 | API de vídeo reiniciava em loop | Erro do Swagger no pacote. | Swagger opcional (`API_SWAGGER=false`). | Concluído (11/11/2026) |
| ✅ | 05/11/2026 · 4.5.1 | Build do CI quebrou | `export type` em arquivo `'use server'`. | Regra: rodar `next build` antes de push grande. | Concluído (05/11/2026) |
| ✅ | 02/11/2026 | Desenvolvimento local com falta de memória | Turbopack usava ~20 GB. | Usar `pnpm iniciar`. | Concluído (02/11/2026) |

---

## 4. Como manter esta auditoria

A cada problema novo, adicione uma linha **no topo** da tabela certa (seção 3) com:
**status** · **data e versão** · **assunto** · **razão do problema** · **ação para correção** · **prazo de correção** · **quem relatou**.

- Se ainda não houver correção, use ⏳, defina um **prazo de correção** e registre também na seção 1.
- Corrigido no código e ainda sem versão: marque ⏳ e registre na seção 1. Quando o "cpi" sair, troque por ✅ e anote a versão.
- Migração: só entra na seção 2 se **faltar** aplicar. Depois de aplicar e conferir no banco, **apague a linha** (não deixe item concluído na lista).
- Atualize "Última conferência" e "Versão da plataforma" no topo.
