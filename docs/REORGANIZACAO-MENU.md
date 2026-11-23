# Reorganização do menu lateral do Admin (setores › clusters na sidebar + abas internas)

Fonte única: `apps/web/lib/admin/setores.ts` (SETORES › ABAS = **clusters** › itens). Consumidores:
`components/admin/sidebar.tsx` (acordeão: setor abre/recolhe e lista **1 linha por aba/cluster**),
`components/admin/barra-setor.tsx` (abas internas: **só os itens do cluster ativo**; posicionada pelo `<BarraSetorSlot />`
de `barra-setor-slot.tsx` ABAIXO do título/descrição de cada página — ver "Posição da barra"), editor de rótulos (`configuracoes/menu-lateral-form.tsx`, catálogo derivado).
Teste: `lib/admin/setores.test.ts`. **Nenhum href mudou.**

## Princípio

Na sidebar só entram entradas MUITO diferentes entre si. Páginas relacionadas viram UMA entrada (o cluster); as páginas
irmãs ficam DENTRO da área, como abas internas. A sidebar mostra clusters; a barra mostra irmãos (nunca duplica).

- Clique no cluster → `hrefInicialAba` (1º item visível). Item ativo = href mais longo (`?query` só com pathname exato).
- Setor com 1 cluster só (Início, Engajamento) = link direto (sem acordeão/flyout).
- Sidebar recolhida: flyout lista os clusters do setor (contadores `counts` somados por cluster).
- A barra some quando: rota sem setor; cluster com < 2 itens visíveis (permissão/flag/manutenção/super-only); ou o cluster
  tem `abasProprias: true` (a tela já exibe as abas dos mesmos irmãos). Helper: `itensDaBarra`.

## Tabela setor › entrada da sidebar › abas internas › abas próprias? › permissão › super

"Abas próprias?" = a tela JÁ mostra abas dos mesmos irmãos (então a barra central NÃO aparece). Onde "não", a barra
central é usada. Abas próprias de OUTRO tipo (ex.: CronogramaTabs, AdaptativoTabs, ConteudosTabs) ficam abaixo da barra,
pois listam outras páginas (não os irmãos do cluster).

| Setor | Entrada da sidebar (aba) | Abas internas (itens) | Abas próprias? | Permissões | Super |
|---|---|---|---|---|---|
| Início | Dashboard (link direto) | Dashboard `/admin` · Visão Revisão `/admin/revisao/inicio` | não → barra | — / relatorios:view | |
| Pedagógico | Biblioteca | Conteúdos `/admin/biblioteca` · Biblioteca Revisão · Biblioteca Lei Seca (flag) · JurisClub | não → barra (a página tem tabs Conteúdos/JurisClub da coleção, outra coisa) | configuracoes:view / leitura:view | |
| Pedagógico | Videoteca | (1 item) | — | configuracoes:view | |
| Pedagógico | Lei Seca e Jurisprudência | Lei Seca · Análise · Jurisprudência (todos flag) | não → barra (ModuloTabsBar/JurisprudenciaTabs são internas por pasta/desafio) | leitura:view / relatorios:view | |
| Pedagógico | Cursos e Produtos | Produtos Estúdio · Produtos / Extensivos · Cursos Revisão | não → barra (ConteudosTabs cobre só `/admin/conteudos/*`) | produtos:view | |
| Pedagógico | Gerador de cronograma | (1 item) `/admin/revisao/cronograma?aba=gerador` | — (a tela tem abas próprias: Catálogo · Metas · Conteúdos · Acessos · Importação · Relatórios · Liberação · Liberação de aulas) | cronogramas:view (gate real da página) | |
| Pedagógico | Cronograma adaptativo | (1 item) `/admin/revisao/cronograma?aba=adaptativo` | — (a tela tem abas próprias: Cobertura · Disciplinas · Regras · Sprints · Versões · Faixas · Semana especial · Liberação e configurações · Lei seca) | cronogramas:view | |
| Pedagógico | Questões | Questões · Modelos de Caderno (flag) | não → barra | questoes:view | |
| Pedagógico | Simulados | Aplicação de Simulado · Simulados Revisão · Correção (discursivas) | não → barra | simulados:view / questoes:view | |
| Pedagógico | Atualizações | (1 item) Central de Atualizações | — | configuracoes:view | |
| Pedagógico | Dúvidas | (1 item) Central de Dúvidas | — | estudantes:view | |
| Alunos | Estudantes | Estudantes · Membros · Visualizações de aluno | não → barra (EstudantePerfilTabs é do perfil) | estudantes:view | |
| Alunos | Grupos | Grupos · Grupos de acesso | não → barra | grupos:view | |
| Alunos | Comunicação | Calendário · Campanhas · Avisos e pop-ups | não → barra (RevisaoAbas de calendário/campanhas são vista/canal) | estudantes:view / configuracoes:view | |
| Engajamento | Gamificação (link direto) | (1 item) | — | gamificacao:view | |
| Atendimento | Atendimento | Dúvidas · Requerimentos (`?tab=`) | **SIM** (`abasProprias`: Dúvidas / Requerimentos / Demandas) → sem barra | estudantes:view | |
| Atendimento | Feedback | Comentários · Reports | não → barra | questoes:view | |
| Análise | Relatórios | Central · Gráfico · Simulado · Disciplina · Relatórios Revisão | não → barra | relatorios:view | |
| Análise | Alunos e engajamento | Estudantes · Grupos por aluno · Ranking · Assinaturas & Engajamento · NPS | não → barra | relatorios:view | |
| Admin | Equipe e permissões | Administradores · Permissões da equipe (Revisão) | não → barra (AdministradoresTabs cobre só Administradores/Permissões de `/administradores/*`) | rbac:view | |
| Admin | Configuração | Mensagens · Ajuda/FAQ · Banners & Pop-ups · Novidades · Aparência (Revisão) · Ajuda | não → barra | configuracoes:view | |
| Admin | Integrações | (1 item) | — | integracoes:view | |
| Admin | Auditoria | Acessos · Modificações · Automações · Visualizações (`?tipo=`) · Acessos de alunos | não → barra (a página não tem abas de tipo; só sub-filtros) | auditoria:view / acessos:view | |
| Admin | LGPD e lixeira | LGPD · Lixeira | não → barra | estudantes:view / questoes:view | |
| Super Admin | Sistema | (1 item) | — | configuracoes:view | SIM |
| Super Admin | Chaves e integrações técnicas | Chaves de API · API Keys · Webhooks & n8n · Regras de liberação (flag) | não → barra (ConexoesTabs é interna ao webhooks) | vários | SIM |
| Super Admin | Segurança e auditoria técnica | Segurança · Problemas · Equipe online | não → barra | seguranca:view / problemas:view / acessos:view | SIM |
| Super Admin | Teste e editores Office | Editores Office · Modelos de Caderno (OnlyOffice) | não → barra | configuracoes:view | SIM |
| Super Admin | Console global | (1 item) `/super` | — | — | SIM |

(flag) = escondido por flag de ambiente (LEITURA_ATIVA, JURISPRUDENCIA_ATIVA, MODELOS_CADERNO_ATIVO, LIBERACAO_REGRAS_ATIVO,
OCULTAR_CRONOGRAMA). Com a flag ligada, o cluster pode ficar com 1 item visível e a barra some sozinha.

Hrefs completos de cada item: ver `lib/admin/setores.ts` (inalterados em relação ao menu antigo; `/admin/relatorios` e `/super` são novos).

## Ajustes em relação à proposta

- Ranking foi para "Alunos e engajamento" (Análise), conforme a proposta; "Relatórios" ficou com Central/Gráfico/Simulado/Disciplina/Revisão.
- "Atendimento › Atendimento" mantém `abasProprias` porque a tela já tem as abas Dúvidas/Requerimentos/Demandas.
- "Central de Dúvidas" (Pedagógico) e "Atendimento › Dúvidas" coexistem: telas diferentes.
- "Auditoria" (Admin) não contém Problemas/Equipe online (vão para Super Admin); mantém Acessos de alunos.
- Console global (`/super`) é um cluster do Super Admin (atalho; não participa do "item ativo").
- Teste (`/admin/teste`) é super-only (as duas travas valem).
- Rótulos dos itens ficaram curtos na barra (ex.: "Biblioteca Revisão" em vez de "Biblioteca (Revisão)").

## Duplicados (menu antigo x bloco "Plataforma Revisão") — NÃO removidos, para consolidar depois

| Função | Rota antiga | Rota Revisão |
|---|---|---|
| Biblioteca | `/admin/biblioteca`, `/admin/leitura/biblioteca` (+ Estúdio `/admin/conteudos/materiais/biblioteca`) | `/admin/revisao/biblioteca` |
| Grupos | `/admin/grupos` | `/admin/revisao/grupos` |
| Estudantes/Membros | `/admin/estudantes` | `/admin/revisao/membros` |
| Dúvidas | `/admin/atendimento?tab=duvidas` | `/admin/revisao/duvidas` |
| Simulados | `/admin/simulados` | `/admin/revisao/simulados` |
| Cursos/Produtos | `/admin/conteudos/produtos`, `/admin/produtos` | `/admin/revisao/cursos` |
| Cronograma | `/admin/cronogramas*` | `/admin/revisao/cronograma` |
| Relatórios | `/admin/relatorios*` | `/admin/revisao/relatorios` |
| Dashboard | `/admin` | `/admin/revisao/inicio` |
| Equipe/Permissões | `/admin/administradores` | `/admin/revisao/equipe` |
| Avisos | `/admin/configuracoes/banners` | `/admin/revisao/avisos` |
| Aparência | (migrada ao Console /super) | `/admin/revisao/aparencia` |

Rótulos distinguem os dois (sufixo "(Revisão)").

## Rótulos/ícones por tenant (`tenants.tema.sidebar_rotulos`)

- Entrada da sidebar (cluster) de 1 item: chave = href do item (overrides antigos continuam valendo). Cluster com vários itens: chave `aba:<id>` (novo; antes só se renomeava o item). Overrides antigos de itens que agora são irmãos na barra continuam valendo na BARRA (rótulo do item), não na sidebar.
- SETORES (chave = label do setor, tolerante): aproveitam overrides antigos de GRUPO chamados "Alunos", "Análise", "Engajamento", "Atendimento", "Pedagógico"; o setor "Início" aproveita o override do item Dashboard (`/admin`).
- FICAM SEM EFEITO (sem erro): grupos antigos "Simulado", "Cronograma", "Desafios", "Jurisprudência", "Conexões", "Auditoria" (grupo), "Feedback", "Configuração", "Conteúdo", "Biblioteca", "Dashboard (Revisão)", "CS", "Montagem de curso", "Análise (Revisão)", "Configurar", "Teste". O override do item `/admin/gamificacao` (Engajamento virou link direto) deixa de valer: use o do setor.
- O editor (catálogo derivado de SETORES, sem Super Admin e sem o setor Início, que é a linha "Dashboard") lista, por setor, 1 linha por cluster.

## Super admin — rotas e 3 camadas

Prefixos (`SUPER_ONLY_PREFIXOS`): `/admin/sistema`, `/admin/transcricao`, `/admin/api-keys`, `/admin/conexoes/webhooks` (+ `/n8n`, só actions), `/admin/liberacao`, `/admin/seguranca`, `/admin/auditoria/problemas`, `/admin/acessos-equipe`, `/admin/teste`; mais `/admin/biblioteca?tab=modelos` (por query).

1. Exibição: setor/aba/item `superOnly` filtrados em `setoresVisiveis` (sidebar + barra) quando `!isSuperAdmin`.
2. Rota: (a) `app/admin/layout.tsx` → `rotaSuperOnly(pathname) && !superAdmin` → "Sem acesso a esta área", ANTES dos demais gates e valendo para `access.isAdmin`; (b) `layout.tsx` em cada pasta da área usando `components/admin/gate-super-only.tsx` (cobre navegação suave, em que o layout raiz não re-executa); (c) `/admin/biblioteca/page.tsx` recusa `?tab=modelos` para não-super.
3. Servidor:
   - Server actions trocadas para `getCurrentAccessSuper`/`checkPermissionSuper` (novos, em `lib/auth/permissions.ts`; não-super recebe Access vazio): `sistema/actions.ts` (TODAS: manutenção, workspace, buscas), `transcricao/actions.ts`, `api-keys/actions.ts`, `liberacao/actions.ts`, `conexoes/webhooks/actions.ts`, `conexoes/n8n/actions.ts`.
   - `teste/agentes/actions.ts` e `teste/onlyoffice/[id]/previa-actions.ts` NÃO tinham checagem alguma → agora `isSuperAdmin`.
   - `biblioteca/actions.ts`: `guard(acao, categoria)` recusa `modelo_caderno` a não-super em listarArvore, criarPasta, listarPastasConteudo, carregarArvoreAcesso, montarArvoreAcessoDrive e ingestões que recebem `input.categoria`.
   - Rotas de API: `api/admin/acessos-equipe/*` (3) e `api/admin/auditoria-problemas/*` (4 handlers + exportar) ganharam `isSuperAdmin`. `api/teste/*` já usam `guardaTeste` (super + env em produção) ou `exigirAcessoOO` (token HMAC ou sessão). `api/seguranca/ingest` = CRON_SECRET. `api/sistema/manutencao` é GET público (só status).
   - Já checavam permissão mas só do tenant (agora também super): todas as acima. Páginas `seguranca`, `problemas`, `acessos-equipe`, `api-keys`, `transcricao` mantêm a checagem de permissão própria além do gate.

## Posição da barra (slot) — abaixo do título, acima das abas próprias

O layout do /admin **não** renderiza mais a barra no topo do `<main>`: só monta o `BarraSetorProvider` (isSuperAdmin,
areasBloqueadas, rótulos) em volta do conteúdo — e **não** monta nas telas "Sem acesso" e "Em manutenção" (sem provider, o slot
não renderiza nada). Cada cabeçalho posiciona `<BarraSetorSlot />` entre o título/descrição e as abas/ações seguintes.
Regras: aparece **1x por página** (2 slots → só a 1ª barra do documento fica; a outra se oculta em `useLayoutEffect`, antes do
paint); mesma regra de visibilidade de antes (some com <2 itens, `abasProprias`, rota sem setor, permissão/flag/super-only/manutenção);
só usa pathname/searchParams + props do provider (sem mismatch de hidratação). Teste-guarda: `lib/admin/barra-setor-cobertura.test.ts`.

**Cabeçalhos compartilhados com o slot embutido:** `RevisaoHead` (depois do título), `RevisaoAbas` (acima das abas; só aparece se a página
não tem RevisaoHead — dedup), `EstudioHeader` (entre título e ConteudosTabs/subtabs). `SecaoHeader` NÃO recebeu o slot: é cabeçalho
de **card** (colado no topo de um Card), a barra ali ficaria dentro do cartão; as páginas que o usam recebem o slot após o título manual.

| Rota | Cabeçalho usado | Slot | Observação |
|---|---|---|---|
| /admin | h1 manual + SecaoHeader (cards) | sim | slot antes dos cards de stats |
| /admin/revisao/inicio | RevisaoHead | sim (compartilhado) | |
| /admin/biblioteca (+?tab=modelos) | biblioteca-client (h1 próprio) | sim | slot antes das abas Conteúdos/JurisClub |
| /admin/revisao/biblioteca | RevisaoHead (biblioteca-app) | sim (compartilhado) | |
| /admin/leitura/biblioteca | h1 manual | sim | |
| /admin/revisao/jurisclub | RevisaoHead | sim (compartilhado) | |
| /admin/leitura | h1 manual / ModuloBanner | sim (só lista de módulos) | **detalhe do módulo (banner+ModuloTabsBar) sem barra** |
| /admin/leitura/analise | h1 manual + abas Documentos/Sequências | sim (lista) | detalhe de documento (?doc) sem barra |
| /admin/jurisprudencia | h1 manual (lista e edição) | sim (os dois modos) | slot antes de JurisTabsBar |
| /admin/conteudos/produtos | EstudioHeader | sim (compartilhado) | demais telas do Estúdio (/admin/conteudos/*) herdam |
| /admin/produtos | h1 manual (produtos-client) | sim | |
| /admin/revisao/cursos | RevisaoHead | sim (compartilhado) | |
| /admin/cronogramas | h1 manual (cronogramas-client) | sim | slot acima de CronogramaTabs |
| /admin/cronogramas/relatorios · /importar | h1 manual | sim | |
| /admin/revisao/cronograma | RevisaoHead + RevisaoAbas | sim (compartilhado) | |
| /admin/cronogramas/adaptativo | h1 manual + AdaptativoTabs | sim | slot acima de AdaptativoTabs |
| /admin/cronogramas/lei-seca | h1 manual | sim | |
| /admin/questoes | h1 manual + abas de tab | sim | slot acima das abas Questões/Unificação/… |
| /admin/modelos-caderno | h1 manual | sim | |
| /admin/simulados | h1 manual + abas Simulados/Desafios | sim | |
| /admin/revisao/simulados | RevisaoHead | sim (compartilhado) | |
| /admin/correcao | h1 manual | sim | |
| /admin/estudantes | h1 manual | sim | |
| /admin/revisao/membros | RevisaoHead (membros-topo) | sim (compartilhado) | |
| /admin/impersonation | h1 manual (impersonation-console) | sim | |
| /admin/grupos | h1 manual (grupos-client) | sim | |
| /admin/revisao/grupos · /calendario · /campanhas · /avisos | RevisaoHead (+RevisaoAbas) | sim (compartilhado) | |
| /admin/comentarios · /feedbacks | h1 manual + SecaoHeader no card | sim | slot antes do Card |
| /admin/relatorios · /graficos · /simulados · /disciplinas · /estudantes · /grupos · /ranking · /nps | h1 manual | sim | com ?id (detalhe) também mostram |
| /admin/relatorios/engajamento | h1 manual (const header) | sim | slot dentro do `header` |
| /admin/revisao/relatorios · /equipe · /aparencia | RevisaoHead | sim (compartilhado) | |
| /admin/administradores (+/permissoes) | h1 manual no layout.tsx + AdministradoresTabs | sim | slot no layout, acima de AdministradoresTabs |
| /admin/configuracoes/mensagens · /ajuda · /banners · /novidades · /admin/ajuda | h1 manual | sim | |
| /admin/auditoria (?tipo=…) | h1 manual (+ SecaoHeader nos cards) | sim (todas as visões) | |
| /admin/acessos | EstudioHeader | sim (compartilhado) | |
| /admin/lgpd · /lixeira | h1 manual | sim | |
| /admin/transcricao · /conexoes/webhooks · /liberacao · /teste | h1 manual (+Tabs próprias) | sim | super-only |
| /admin/api-keys · /seguranca · /auditoria/problemas · /acessos-equipe | EstudioHeader | sim (compartilhado) | super-only |

**Pendente (sem barra por decisão consciente — nunca no topo):** telas de **detalhe/subrota** que casam por prefixo com um item de cluster mas
não usam cabeçalho compartilhado — ex.: `/admin/simulados/[id]/*`, `/admin/estudantes/[id]/*`, `/admin/grupos/[id]`, `/admin/questoes/nova|[id]`,
`/admin/cronogramas/criar|[id]`, `/admin/leitura` com módulo aberto (banner).
Subrotas que usam RevisaoHead/EstudioHeader (ex.: `/admin/revisao/cursos/[id]`, `/admin/conteudos/*`) mostram a barra. Antes (barra no topo) elas exibiam a barra; agora só mostram se montarem um cabeçalho com slot.
Se quiser a barra nelas, basta inserir `<BarraSetorSlot />` após o título de cada uma (o teste-guarda cobre só as rotas-raiz).

## Riscos / pendências conhecidos

- `biblioteca/lote-actions.ts`, `gestao-actions.ts`, `video-actions.ts` etc. operam por id de documento (não por categoria); um não-super com `configuracoes:*` que conheça o id de um modelo ainda poderia agir sobre ele. Fechar exigiria checar `doc.categoria` em cada action.
- `app/admin/seguranca/*` e `seguranca` lib: sem server actions; só páginas (cobertas pelas camadas 2a/2b).
- Efeito de produto: tenants cujos admins usavam Sistema (manutenção/testadores), Chaves de API, Webhooks, API keys e Regras de liberação perdem o acesso (decisão do dono).
- Não testado no navegador (ver relatório da entrega).

## Cronogramas — 1 entrada, 1 destino (aliases)

Decisão do dono: a tela CANÔNICA é `/admin/revisao/cronograma`. A sidebar tem 2 entradas, cada uma com UM item visível (a barra de setor some sozinha).
As rotas antigas são **aliases** (`alias: true` em `lib/admin/setores.ts`): continuam abrindo, resolvem (`resolverRota`) para a entrada correta (destaque/aba ativa), contam
no teste "todo href antigo aparece 1 vez", mas NÃO aparecem na sidebar, na barra nem no editor de rótulos (`setoresVisiveis` os remove).

| Entrada (sidebar) | Destino | Aliases (rotas antigas) |
|---|---|---|
| Gerador de cronograma | `/admin/revisao/cronograma?aba=gerador` | `/admin/cronogramas` (+ todas as subrotas `/admin/cronogramas/**` que não sejam adaptativo/lei-seca), `/relatorios`, `/importar` |
| Cronograma adaptativo | `/admin/revisao/cronograma?aba=adaptativo` | `/admin/revisao/cronograma` (sem query = padrão adaptativo), `/admin/cronogramas/adaptativo` (+ `/adaptativo/**`), `/admin/cronogramas/lei-seca` |

**Permissão:** a página `/admin/revisao/cronograma` exige só `cronogramas:view` (editar é decidido dentro da tela por `cronogramas:update`). Os itens canônicos usam `cronogramas:view`
(antes: Importar/Adaptativo/Lei seca/Revisão exigiam `:update` na sidebar; a ROTA nunca foi fechada por isso). Efeito: quem só tem `:view` passa a VER a entrada "Cronograma adaptativo"
(a tela já era acessível por URL). Nenhuma permissão de servidor foi alterada. `OCULTAR_CRONOGRAMA` só escondia os itens das rotas antigas (agora aliases, sempre fora do menu); o item novo nunca foi ocultado por ela.
Manutenção por área (`areasBloqueadas`) passa a comparar também pelo PATH do href (ex.: bloquear `/admin/revisao/cronograma` esconde as 2 entradas, apesar do `?aba=`).

### Como cada tela antiga continua alcançável (sem a sidebar antiga)

- **Catálogo** (`/admin/cronogramas`) → `?aba=gerador&sub=catalogo`. **Editor de cronograma** (`/admin/cronogramas/[id]`, `/criar`) → links "Editar grade"/nome na tabela do Catálogo, Metas e Relatórios.
- **Relatórios** → sub `relatorios`. **Importar** → sub `importacao` (e botão "Importar modelo" no Catálogo). **Conteúdos** (`/conteudos`, `/conteudos/[id]`) → sub `conteudos` (botão "Abrir").
- **Grupos de acessos** (`/pacotes`, `/pacotes/[id]`) → sub `acessos` ("Abrir editor"). **Auditoria de metas** (`/metas`) e **Tipos de meta** (`/tipos`) → sub `metas` (auditoria + gestão de tipos). **Links de aula** (`/links`) → gestão de plataformas/links dentro da sub `conteudos`.
  As rotas antigas seguem abrindo por URL direta e pelo `CronogramaTabs` das próprias telas.
- **Liberação do adaptativo e as 16 telas** `/admin/cronogramas/adaptativo/*` (Liberação, Metas & inteligência, Catálogo de metas, Definição, Downloads, Análise de uso, Integridade, Personagens, Faixas, Restrições, Versões, Rastro, Fluxo, Simulação, Mapa, Inteligência) →
  aba **"Liberação e configurações"** em `?aba=adaptativo` (link para `/admin/cronogramas/adaptativo`, onde o `AdaptativoTabs` leva às demais). Há também a sub `liberacao` do gerador (painel de liberação novo).
- **Lei seca (adaptativo)** → aba **"Lei seca"** em `?aba=adaptativo` (link para `/admin/cronogramas/lei-seca`) e 17ª aba do `AdaptativoTabs` (a página da Lei seca agora renderiza o `AdaptativoTabs`).
- `/admin/cronogramas/conteudo` (singular, órfã, sem aba que a referenciasse) → `redirect` para `/admin/cronogramas/conteudos`.
- `RevisaoAbas` ganhou `href?` opcional por aba (aba que navega para outra tela).

### Rótulos por tenant (`tema.sidebar_rotulos.admin.itens`) que deixam de aparecer
- Chaves por href que passam a ser alias (sem efeito): `/admin/cronogramas`, `/admin/cronogramas/relatorios`, `/admin/cronogramas/importar`, `/admin/cronogramas/adaptativo`, `/admin/cronogramas/lei-seca`, `/admin/revisao/cronograma`.
- Chaves `aba:gerador-cronograma` e `aba:adaptativo` (aba com vários itens) também deixam de valer: as 2 entradas agora usam a chave do href completo (`/admin/revisao/cronograma?aba=gerador` e `?aba=adaptativo`). Quem renomeou/trocou ícone deve refazer nessas chaves.
