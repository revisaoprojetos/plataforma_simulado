# DOCUMENTO DEFINITIVO DO SISTEMA EDUCACIONAL
## Plataforma Multi-Tenant — Revisão PGE / MEQ
### Versão Final Consolidada · 23/06/2026

---

# PARTE 1 — VISÃO DO PROJETO

## 1.1 · O Que É

Sistema educacional online de preparação para concursos públicos com foco em advocacia (AGU, PGE, Procuradorias). Permite que professores e administradores criem questões, montem simulados, corrijam provas discursivas e conduzam programas de mentoria; e que alunos resolvam provas, acompanhem seu desempenho e recebam feedback individualizado.

Suporta **múltiplas plataformas** no mesmo banco de dados e backend, cada uma com identidade visual e domínio próprios.

## 1.2 · Objetivo

| Objetivo | Detalhe |
|---|---|
| Centralizar preparação | Questões, simulados, discursivas e mentoria em um único sistema |
| Multi-tenant | Mesmo backend suportando Revisão PGE, MEQ e futuras plataformas |
| Escalar com segurança | Modelagem relacional correta, LGPD, auditoria completa |
| Base para mobile | App Expo para alunos com notificações em tempo real |

## 1.3 · Por Que Recomeçar do Zero

| Problema | Impacto |
|---|---|
| Credenciais do Supabase atual expostas no git | Segurança comprometida — novo projeto obrigatório |
| Modelagem com JSONB em vez de tabelas relacionais | Consultas lentas, impossível fazer joins, sem integridade referencial |
| Arquitetura monoplataforma | Não suporta MEQ nem futuras plataformas |
| Dívida técnica acumulada | Escopo expandiu além do que a base suporta |
| Links de simulado sem autenticação | Alunos acessam provas sem login |

## 1.4 · Decisões Estratégicas Tomadas

| # | Questão | Decisão |
|---|---|---|
| 1 | Storage | Provider ainda indefinido; sistema com camada de abstração pronta para S3/GCS desde o início |
| 2 | Bot WhatsApp | N8N já automatizado — apenas linking ao sistema |
| 3 | Novo projeto | Supabase novo do zero; backup com padrão `tabela_bk_23062026` |
| 4 | Domínio | `revisaopge.centeroffice.com.br` (exemplo) |
| 5 | Cadastro de alunos | Somente admins cadastram — sem auto-registro |
| 6 | Links públicos | Todos os links de simulado exigem login |
| 7 | Push mobile | Expo Push para notificar alunos (gabaritos, notas, diagnósticos) |
| 8 | Time | Mesma equipe web + mobile |
| 9 | LGPD | Sistema de proteção de dados obrigatório desde o início |
| 10 | Ordem de dev | Modelagem DB → backend → frontend → mobile |
| 11 | Plano Supabase | Pro |
| 12 | Correção discursiva | Admin vê todas as redações; atribui notas; status: pendente / em análise / corrigida / liberada |

---

# PARTE 2 — ARQUITETURA

## 2.1 · Multi-Tenancy

Todas as tabelas de negócio carregam `plataforma_id`. A resolução é feita por subdomínio no servidor:

```
Requisição HTTP
      │
      ▼
hostname → SELECT id FROM plataformas WHERE dominio = hostname
      │
      ▼
plataforma_id injetado em TODAS as queries via JWT claim
      │
      ▼ (RLS garante isolamento automático)
Dados retornados apenas da plataforma correta
```

| Plataforma | Subdomínio | Status |
|---|---|---|
| Revisão PGE | `revisaopge.centeroffice.com.br` | Migrar do atual |
| MEQ | `meq.centeroffice.com.br` | Futuro |
| Super Admin | `admin.centeroffice.com.br` | Único painel global |

## 2.2 · Modelo de Autenticação

```
Supabase Auth — 1 conta por e-mail (global, cross-plataforma)
        │
        ▼
plataforma_acessos — define ONDE e COM QUE PAPEL o usuário entra
   ├── plataforma_id  → qual plataforma
   ├── role           → admin_geral | admin_conteudo | admin_correcao |
   │                    admin_relatorio | admin_comercial | estudante
   └── ativo          → acesso habilitado/suspenso
        │
        ├──▶ estudantes        (dados do aluno por plataforma)
        └──▶ plataforma_admins (dados do admin por plataforma)
```

**Regras:**
- Mesmo e-mail pode ser estudante na Revisão e professor no MEQ
- Seletor de plataforma aparece pós-login quando há múltiplos acessos
- Somente admins cadastram estudantes — sem auto-registro
- Todos os links de simulado exigem autenticação

## 2.3 · RBAC — Hierarquia de Acesso

```
super_admin (global — painel admin.centeroffice.com.br)
└── plataforma_admin
    ├── admin_geral       → acesso completo à plataforma
    ├── admin_conteudo    → questões, simulados, pastas, etiquetas, cadernos
    ├── admin_correcao    → visualiza e corrige discursivas
    ├── admin_relatorio   → relatórios e diagnósticos
    └── admin_comercial   → matrículas, contratos, pagamentos
         └── estudante   → seus próprios dados e provas
```

---

# PARTE 3 — BANCO DE DADOS

## 3.1 · Tabelas Estruturais

```sql
-- Raiz multi-tenant
plataformas (
  id            uuid PK,
  nome          text,
  dominio       text UNIQUE,
  logo_url      text,
  ativo         boolean DEFAULT true,
  criado_em     timestamptz DEFAULT now()
)

-- Controle de acesso central
plataforma_acessos (
  id            uuid PK,
  user_id       uuid FK → auth.users,
  plataforma_id uuid FK → plataformas,
  role          text CHECK (role IN ('admin_geral','admin_conteudo','admin_correcao',
                                     'admin_relatorio','admin_comercial','estudante')),
  ativo         boolean DEFAULT true,
  criado_em     timestamptz DEFAULT now(),
  UNIQUE(user_id, plataforma_id)
)

-- Perfis por plataforma
estudantes (
  id            uuid PK,
  plataforma_id uuid FK → plataformas,
  user_id       uuid FK → auth.users,
  nome          text,
  cpf           text,
  telefone      text,
  criado_em     timestamptz DEFAULT now()
)

plataforma_admins (
  id            uuid PK,
  plataforma_id uuid FK → plataformas,
  user_id       uuid FK → auth.users,
  nome          text,
  criado_em     timestamptz DEFAULT now()
)

-- Matrículas
matriculas (
  id            uuid PK,
  plataforma_id uuid FK → plataformas,
  estudante_id  uuid FK → estudantes,
  plano         text,
  status        text CHECK (status IN ('ativa','expirada','cancelada')),
  validade      timestamptz,
  criado_em     timestamptz DEFAULT now()
)
```

## 3.2 · Tabelas de Conteúdo

```sql
-- Organização hierárquica
pastas (
  id            uuid PK,
  plataforma_id uuid FK → plataformas,
  nome          text,
  pai_id        uuid FK → pastas,
  criado_em     timestamptz DEFAULT now()
)

-- Etiquetas: mapeamento e identificação de pastas e questões
etiquetas (
  id            uuid PK,
  plataforma_id uuid FK → plataformas,
  nome          text,
  cor           text DEFAULT '#6366f1',
  criado_em     timestamptz DEFAULT now()
)

-- Questões
questoes (
  id               uuid PK,
  plataforma_id    uuid FK → plataformas,
  pasta_id         uuid FK → pastas,
  enunciado        text,
  tipo             text CHECK (tipo IN ('objetiva','discursiva')),
  nivel_dificuldade text CHECK (nivel_dificuldade IN ('facil','medio','dificil')),
  status           text CHECK (status IN ('rascunho','publicada','arquivada')) DEFAULT 'rascunho',
  criado_por       uuid FK → plataforma_admins,
  criado_em        timestamptz DEFAULT now()
)

questao_etiquetas (
  questao_id  uuid FK → questoes ON DELETE CASCADE,
  etiqueta_id uuid FK → etiquetas ON DELETE CASCADE,
  PRIMARY KEY (questao_id, etiqueta_id)
)

questao_pasta (
  questao_id uuid FK → questoes ON DELETE CASCADE,
  pasta_id   uuid FK → pastas ON DELETE CASCADE,
  PRIMARY KEY (questao_id, pasta_id)
)

alternativas (
  id         uuid PK,
  questao_id uuid FK → questoes ON DELETE CASCADE,
  texto      text,
  correta    boolean DEFAULT false,
  ordem      int
)

competencias (
  id         uuid PK,
  questao_id uuid FK → questoes ON DELETE CASCADE,
  nome       text,
  peso       numeric(4,2) DEFAULT 1.0
)

feedbacks_questao (
  id           uuid PK,
  questao_id   uuid FK → questoes,
  estudante_id uuid FK → estudantes,
  tipo         text CHECK (tipo IN ('erro_gabarito','erro_enunciado','desatualizada','outro')),
  descricao    text,
  status       text CHECK (status IN ('pendente','analisado','resolvido')) DEFAULT 'pendente',
  criado_em    timestamptz DEFAULT now()
)
```

## 3.3 · Tabelas de Simulados

```sql
simulados (
  id              uuid PK,
  plataforma_id   uuid FK → plataformas,
  titulo          text,
  descricao       text,
  tipo            text CHECK (tipo IN ('fechado','aberto')),
  status          text CHECK (status IN ('rascunho','publicado','encerrado')) DEFAULT 'rascunho',
  data_inicio     timestamptz,
  data_fim        timestamptz,
  tempo_limite_min int,
  criado_por      uuid FK → plataforma_admins,
  criado_em       timestamptz DEFAULT now()
)

simulado_questoes (
  id          uuid PK,
  simulado_id uuid FK → simulados ON DELETE CASCADE,
  questao_id  uuid FK → questoes,
  ordem       int,
  peso        numeric(4,2) DEFAULT 1.0,
  UNIQUE(simulado_id, questao_id)
)

grupos (
  id            uuid PK,
  plataforma_id uuid FK → plataformas,
  nome          text,
  criado_em     timestamptz DEFAULT now()
)

grupo_membros (
  grupo_id     uuid FK → grupos ON DELETE CASCADE,
  estudante_id uuid FK → estudantes ON DELETE CASCADE,
  PRIMARY KEY (grupo_id, estudante_id)
)

grupo_simulados (
  grupo_id    uuid FK → grupos ON DELETE CASCADE,
  simulado_id uuid FK → simulados ON DELETE CASCADE,
  PRIMARY KEY (grupo_id, simulado_id)
)
```

## 3.4 · Tabelas de Sessão e Resposta

```sql
sessoes_prova (
  id           uuid PK,
  simulado_id  uuid FK → simulados,
  estudante_id uuid FK → estudantes,
  status       text CHECK (status IN ('aguardando','em_andamento','finalizada')) DEFAULT 'aguardando',
  iniciado_em  timestamptz,
  finalizado_em timestamptz
)

-- Embaralhamento determinístico por sessão
sessao_questao_ordem (
  sessao_id     uuid FK → sessoes_prova ON DELETE CASCADE,
  questao_id    uuid FK → questoes,
  ordem_exibida int,
  PRIMARY KEY (sessao_id, questao_id)
)

respostas_objetivas (
  id               uuid PK,
  sessao_id        uuid FK → sessoes_prova ON DELETE CASCADE,
  questao_id       uuid FK → questoes,
  alternativa_id   uuid FK → alternativas,
  correta          boolean,
  tempo_resposta_seg int,
  respondido_em    timestamptz DEFAULT now()
)

respostas_discursivas (
  id            uuid PK,
  plataforma_id uuid FK → plataformas,
  simulado_id   uuid FK → simulados,
  estudante_id  uuid FK → estudantes,
  status        text CHECK (status IN ('pendente','em_analise','corrigida','liberada')) DEFAULT 'pendente',
  enviado_em    timestamptz DEFAULT now()
)

arquivos_discursivos (
  id          uuid PK,
  resposta_id uuid FK → respostas_discursivas ON DELETE CASCADE,
  arquivo_id  uuid FK → arquivos,
  ordem       int,
  criado_em   timestamptz DEFAULT now()
)

correcoes_discursivas (
  id                uuid PK,
  resposta_id       uuid FK → respostas_discursivas ON DELETE CASCADE,
  professor_id      uuid FK → plataforma_admins,
  nota_final        numeric(5,2),
  nivel_desempenho  text CHECK (nivel_desempenho IN ('insuficiente','basico','adequado','avancado')),
  comentario_geral  text,
  status            text CHECK (status IN ('em_correcao','finalizada')) DEFAULT 'em_correcao',
  -- Lock de edição simultânea
  em_correcao_por   uuid FK → plataforma_admins,
  em_correcao_desde timestamptz,
  lock_expira_em    timestamptz,
  iniciado_em       timestamptz DEFAULT now(),
  finalizado_em     timestamptz
)

-- Coordenadas em proporção (0.0–1.0) — independente de resolução
anotacoes_discursivas (
  id          uuid PK,
  correcao_id uuid FK → correcoes_discursivas ON DELETE CASCADE,
  arquivo_id  uuid FK → arquivos,
  tipo        text CHECK (tipo IN ('retangulo','destaque','seta')),
  x           numeric(5,4),
  y           numeric(5,4),
  largura     numeric(5,4),
  altura      numeric(5,4),
  cor         text DEFAULT '#ef4444',
  comentario  text,
  criado_em   timestamptz DEFAULT now()
)

correcao_competencias (
  id             uuid PK,
  correcao_id    uuid FK → correcoes_discursivas ON DELETE CASCADE,
  competencia_id uuid FK → competencias,
  nota           numeric(5,2),
  comentario     text
)
```

## 3.5 · Tabelas de Cadernos (Designer)

```sql
caderno_templates (
  id            uuid PK,
  plataforma_id uuid FK → plataformas,
  nome          text,
  config_visual jsonb,
  global        boolean DEFAULT false,
  criado_em     timestamptz DEFAULT now()
)

cadernos (
  id            uuid PK,
  plataforma_id uuid FK → plataformas,
  titulo        text,
  descricao     text,
  tipo          text CHECK (tipo IN ('simulado','mentoria','material_livre')),
  simulado_id   uuid FK → simulados,
  mentoria_id   uuid FK → mentorias,
  template_id   uuid FK → caderno_templates,
  publicado     boolean DEFAULT false,
  criado_por    uuid FK → plataforma_admins,
  criado_em     timestamptz DEFAULT now()
)

caderno_versoes (
  id         uuid PK,
  caderno_id uuid FK → cadernos ON DELETE CASCADE,
  snapshot   jsonb,
  criado_por uuid FK → plataforma_admins,
  criado_em  timestamptz DEFAULT now()
)

caderno_paginas (
  id         uuid PK,
  caderno_id uuid FK → cadernos ON DELETE CASCADE,
  titulo     text,
  ordem      int,
  criado_em  timestamptz DEFAULT now()
)

caderno_blocos (
  id        uuid PK,
  pagina_id uuid FK → caderno_paginas ON DELETE CASCADE,
  tipo      text CHECK (tipo IN (
              'texto','imagem','questao','gabarito',
              'tabela','cabecalho','pdf','divisor','legislacao'
            )),
  ordem     int,
  config    jsonb,
  criado_em timestamptz DEFAULT now()
)

-- FK auxiliar com RESTRICT para detectar questões arquivadas/deletadas
caderno_bloco_questoes (
  bloco_id   uuid FK → caderno_blocos ON DELETE CASCADE,
  questao_id uuid FK → questoes ON DELETE RESTRICT,
  PRIMARY KEY (bloco_id, questao_id)
)
```

## 3.6 · Tabelas de Mentoria

```sql
mentorias (
  id               uuid PK,
  plataforma_id    uuid FK → plataformas,
  titulo           text,
  descricao        text,
  tipo_concurso    text,
  banca            text,
  data_inicio      date,
  data_fim         date,
  capacidade_xforce int DEFAULT 15,
  status           text CHECK (status IN ('rascunho','ativa','encerrada')) DEFAULT 'rascunho',
  criado_por       uuid FK → plataforma_admins,
  criado_em        timestamptz DEFAULT now()
)

mentoria_inscricoes (
  id           uuid PK,
  mentoria_id  uuid FK → mentorias ON DELETE CASCADE,
  estudante_id uuid FK → estudantes,
  plano        text,
  status       text CHECK (status IN ('ativa','cancelada','concluida')) DEFAULT 'ativa',
  inscrito_em  timestamptz DEFAULT now(),
  UNIQUE(mentoria_id, estudante_id)
)

mentoria_ciclos (
  id              uuid PK,
  mentoria_id     uuid FK → mentorias ON DELETE CASCADE,
  mes_referencia  date,
  titulo          text,
  descricao       text,
  ordem           int
)

mentoria_encontros (
  id                    uuid PK,
  ciclo_id              uuid FK → mentoria_ciclos ON DELETE CASCADE,
  tipo                  text CHECK (tipo IN ('coordenador','xforce','gravacao_livre')),
  titulo                text,
  data_hora             timestamptz,
  link_videoconferencia text,
  gravacao_url          text,
  capacidade_max        int,
  realizado             boolean DEFAULT false,
  criado_em             timestamptz DEFAULT now()
)

mentoria_encontro_inscritos (
  encontro_id  uuid FK → mentoria_encontros ON DELETE CASCADE,
  estudante_id uuid FK → estudantes ON DELETE CASCADE,
  confirmado   boolean DEFAULT true,
  compareceu   boolean,
  PRIMARY KEY (encontro_id, estudante_id)
)

mentoria_lista_espera (
  id           uuid PK,
  encontro_id  uuid FK → mentoria_encontros ON DELETE CASCADE,
  estudante_id uuid FK → estudantes,
  posicao      int,
  criado_em    timestamptz DEFAULT now()
)

mentoria_materiais (
  id         uuid PK,
  ciclo_id   uuid FK → mentoria_ciclos ON DELETE CASCADE,
  tipo       text CHECK (tipo IN (
               'pdffull','pdffight','pdflash',
               'prova_comentada','jurisprudencia','legislacao','outro'
             )),
  titulo     text,
  arquivo_id uuid FK → arquivos,
  ordem      int,
  publicado  boolean DEFAULT false,
  criado_em  timestamptz DEFAULT now()
)

mentoria_simulados (
  mentoria_id uuid FK → mentorias,
  ciclo_id    uuid FK → mentoria_ciclos,
  simulado_id uuid FK → simulados,
  PRIMARY KEY (ciclo_id, simulado_id)
)

mentoria_progresso (
  id                   uuid PK,
  mentoria_id          uuid FK → mentorias,
  estudante_id         uuid FK → estudantes,
  ciclo_id             uuid FK → mentoria_ciclos,
  simulado_concluido   boolean DEFAULT false,
  xforce_participou    boolean DEFAULT false,
  encontro_participou  boolean DEFAULT false,
  materiais_acessados  jsonb DEFAULT '[]',
  nota_simulado        numeric(5,2),
  atualizado_em        timestamptz DEFAULT now(),
  UNIQUE(estudante_id, ciclo_id)
)

mentoria_perguntas (
  id             uuid PK,
  ciclo_id       uuid FK → mentoria_ciclos,
  estudante_id   uuid FK → estudantes,
  pergunta       text,
  resposta       text,
  respondido_por uuid FK → plataforma_admins,
  respondido_em  timestamptz,
  criado_em      timestamptz DEFAULT now()
)
```

## 3.7 · Tabelas de Suporte

```sql
-- Storage centralizado com abstração de provider
arquivos (
  id            uuid PK,
  plataforma_id uuid FK → plataformas,
  nome          text,
  tipo_mime     text,
  tamanho_bytes bigint,
  provider      text CHECK (provider IN ('supabase','s3','gcs')) DEFAULT 'supabase',
  bucket        text,
  path          text,
  path_display  text,
  path_thumb    text,
  processado    boolean DEFAULT false,
  publico       boolean DEFAULT false,
  criado_por    uuid,
  criado_em     timestamptz DEFAULT now()
)

jobs (
  id            uuid PK,
  tipo          text,
  payload       jsonb,
  status        text CHECK (status IN ('pendente','em_processamento','concluido','erro')),
  resultado     jsonb,
  tentativas    int DEFAULT 0,
  criado_por    uuid,
  criado_em     timestamptz DEFAULT now(),
  processado_em timestamptz
)

relatorio_cache (
  id            uuid PK,
  plataforma_id uuid FK → plataformas,
  tipo          text,
  chave         text UNIQUE,
  dados         jsonb,
  calculado_em  timestamptz DEFAULT now(),
  valido_ate    timestamptz
)

notificacoes (
  id            uuid PK,
  plataforma_id uuid FK → plataformas,
  estudante_id  uuid FK → estudantes,
  tipo          text,
  titulo        text,
  mensagem      text,
  lida          boolean DEFAULT false,
  criado_em     timestamptz DEFAULT now()
)

expo_push_tokens (
  id           uuid PK,
  estudante_id uuid FK → estudantes ON DELETE CASCADE,
  token        text UNIQUE,
  plataforma   text,
  criado_em    timestamptz DEFAULT now()
)

audit_logs (
  id               uuid PK,
  plataforma_id    uuid,
  user_id          uuid,
  tabela           text,
  operacao         text CHECK (operacao IN ('INSERT','UPDATE','DELETE','LIBERAR','BLOQUEAR')),
  dados_anteriores jsonb,
  dados_novos      jsonb,
  criado_em        timestamptz DEFAULT now()
)

lgpd_consentimentos (
  id               uuid PK,
  user_id          uuid FK → auth.users,
  versao_politica  text,
  ip_address       inet,
  user_agent       text,
  aceito_em        timestamptz DEFAULT now(),
  UNIQUE(user_id, versao_politica)
)

lgpd_solicitacoes (
  id            uuid PK,
  user_id       uuid FK → auth.users,
  tipo          text CHECK (tipo IN ('acesso','exclusao','portabilidade')),
  status        text CHECK (status IN ('pendente','em_analise','concluida')) DEFAULT 'pendente',
  criado_em     timestamptz DEFAULT now(),
  processado_em timestamptz
)
```

## 3.8 · Índices de Performance

```sql
CREATE INDEX idx_respostas_disc_lista     ON respostas_discursivas(plataforma_id, status, enviado_em DESC);
CREATE INDEX idx_respostas_disc_simulado  ON respostas_discursivas(simulado_id, status);
CREATE INDEX idx_respostas_disc_estudante ON respostas_discursivas(estudante_id, simulado_id);
CREATE INDEX idx_questoes_plataforma      ON questoes(plataforma_id, status);
CREATE INDEX idx_questoes_pasta           ON questoes(pasta_id);
CREATE INDEX idx_questao_etiquetas        ON questao_etiquetas(etiqueta_id, questao_id);
CREATE INDEX idx_perguntas_ciclo          ON mentoria_perguntas(ciclo_id, respondido_em NULLS FIRST);
CREATE INDEX idx_progresso_estudante      ON mentoria_progresso(estudante_id, mentoria_id);
CREATE INDEX idx_jobs_pendentes           ON jobs(tipo, status) WHERE status = 'pendente';
CREATE INDEX idx_audit_tabela             ON audit_logs(tabela, criado_em DESC);
CREATE INDEX idx_audit_user               ON audit_logs(user_id, criado_em DESC);
```

## 3.9 · Script de Backup da Migração

```sql
CREATE OR REPLACE FUNCTION criar_backup_tabela(
  p_tabela text,
  p_data   text DEFAULT to_char(now(), 'DDMMYYYY')
)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_nome text := p_tabela || '_bk_' || p_data;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = v_nome)
  THEN RAISE EXCEPTION 'Backup "%" já existe.', v_nome; END IF;
  EXECUTE format('CREATE TABLE %I AS SELECT * FROM %I', v_nome, p_tabela);
  RETURN v_nome;
END; $$;

-- Executar para cada tabela antes da migração
-- Resultado: questao_bk_23062026, simulado_bk_23062026, etc.
```

---

# PARTE 4 — MÓDULOS DO SISTEMA

## 4.1 · Banco de Questões

- Criação de questões objetivas e discursivas com editor rich text
- Definição de competências por questão (correção criteriada)
- Organização em pastas hierárquicas
- **Etiquetas livres** para mapeamento: `CESPE`, `AGU`, `Alta Recorrência`, `Jurisprudência`...
- Busca por etiqueta, pasta, tipo, dificuldade, status
- Importação em lote via job assíncrono
- Ciclo de vida: `rascunho → publicada → arquivada`
- Feedbacks de alunos sobre questões (contestações)
- Estatísticas de acerto por questão (comparativo individual vs. turma)

## 4.2 · Simulados

**Tipos:**
- **Fechado** — período definido, aluno responde uma vez dentro do prazo
- **Aberto** — sempre disponível para prática

**Funcionalidades:**
- Questões com ordem e peso configuráveis
- Atribuição a grupos de alunos
- Tempo limite com auto-finalização server-side
- Embaralhamento determinístico por `sessao_id`
- Correção automática das objetivas ao finalizar
- Gabarito liberável pelo admin → notificação push
- Histórico de tentativas com nota e ranking

## 4.3 · Correção Discursiva

**Fluxo:**

```
Aluno envia imagens     → status: pendente
Admin abre para corrigir → status: em_analise  (lock adquirido)
Admin salva parcialmente → status: em_analise  (auto-save 30s)
Admin finaliza          → status: corrigida
Admin libera ao aluno   → status: liberada     (push + e-mail ao aluno)
```

**Ferramentas do corretor:**
- Visualizador fullscreen (zoom 50–300%, prev/next, thumbnails)
- Canvas de anotações: retângulos, destaques, setas — com **comentário textual por anotação**
- Painel direito: nota por competência + nível de desempenho + comentário geral
- Auto-save 30s + salvar parcial + finalizar (lock permanente)
- Lock exclusivo: dois corretores nunca editam a mesma redação ao mesmo tempo

**Tabela (admin):**
- Filtros: status, simulado, grupo, estudante
- Mini-thumbnails das páginas enviadas
- Ações: Visualizar | Corrigir | Editar | Liberar

## 4.4 · Caderno de Designer

Editor visual estilo WordPress Blocks — caderno → páginas → blocos arrastáveis.

**Tipos de blocos:**

| Bloco | Descrição |
|---|---|
| Texto | Rich text (negrito, itálico, listas, links) |
| Imagem | Upload com legenda |
| Questão | Vincula questão do banco (exibe enunciado + alternativas) |
| Gabarito | Revela a resposta da questão vinculada |
| Tabela | Editável em grade |
| Cabeçalho | Logo, título do simulado/mentoria, data |
| PDF | Embeda PDF de material |
| Divisor | Separador visual / espaçamento |
| Legislação | Artigos comentados (uso em mentoria) |

**Vínculo com projeto:**
- `tipo: simulado` → puxa título, data, questões (gera blocos automáticos)
- `tipo: mentoria` → puxa ciclo e materiais do ciclo
- `template_id` → template visual **exclusivo da plataforma** (nunca compartilhado entre Revisão e MEQ)

**Templates por plataforma:** Revisão PGE e MEQ têm templates independentes. `super_admin` cria templates globais como base.

**Exportação:** PDF gerado server-side via Puppeteer (job assíncrono — retorna link quando pronto).

**Histórico:** máx. 5 versões por caderno (limpeza automática via trigger).

## 4.5 · Mentoria

Programa de acompanhamento mensal especializado para concursos de advocacia.

**Estrutura de um ciclo mensal:**

```
Ciclo (ex.: Junho 2026)
├── Encontro com Coordenador (ao vivo)
│   ├── Análise do edital
│   ├── Predileção da banca
│   └── Estratégia de estudo
├── X-Force Mensal (grupos ≤ 15 alunos)
│   └── Orientação personalizada
├── Simulado Mensal
├── Mini Simulados (jurisprudência + legislação)
├── Materiais do ciclo
│   ├── PDFull       (material completo)
│   ├── PDFight      (versão compacta)
│   ├── PDFlash      (flashcards / resumo)
│   ├── Provas Comentadas (últimas 3 da banca)
│   ├── Jurisprudência (atualizada mensalmente)
│   └── Legislação Específica (grifada e comentada)
└── Q&A Assíncrono (aluno pergunta, professor responde no ciclo)
```

**Painel Admin:**
- Criação e gestão de mentorias e ciclos
- Publicação de materiais por ciclo
- Controle de capacidade X-Force (máx. 15) com lista de espera automática
- Agendamento de encontros com link de videoconferência
- Upload de gravações pós-encontro
- Visão de progresso individual por aluno por ciclo
- Alertas: encontros sem gravação, encontros próximos sem link, alunos sem acesso

**Painel Aluno:**
- Timeline dos ciclos com checklist de progresso
- Acesso a materiais (a partir da data de inscrição)
- Inscrição no X-Force com vagas em tempo real
- Calendário de encontros
- Push 24h e 1h antes de encontro ao vivo
- Canal de perguntas assíncronas por ciclo

## 4.6 · Relatórios e Diagnóstico

**Para o aluno:**
- Taxa de acerto por matéria/tema/etiqueta
- Evolução temporal (linha do tempo)
- Pontos fortes e fracos
- Tempo médio por questão
- Comparativo com média da turma
- Histórico de simulados com nota e ranking

**Para o admin:**
- Visão consolidada de todos os alunos
- Ranking por simulado
- Taxa de conclusão
- Alertas de baixo desempenho
- Questões com maior taxa de erro
- Exportação PDF/CSV

**Liberação controlada:** admin decide quando liberar gabarito, relatório e diagnóstico — cada ação gera notificação push.

## 4.7 · Módulo Comercial

Perfil `admin_comercial` visualiza:
- Matrículas com status, plano e vencimento
- Alertas de matrículas próximas do vencimento
- Histórico de acesso por aluno
- Exportação de relatório de matrículas

---

# PARTE 5 — INFRAESTRUTURA

## 5.1 · Storage — Camada de Abstração

```typescript
interface StorageProvider {
  upload(file: Buffer, path: string): Promise<string>
  getUrl(path: string): Promise<string>
  getSignedUrl(path: string, expiresIn: number): Promise<string>
  delete(path: string): Promise<void>
}

// Provider atual: Supabase Storage (novo projeto)
// Futuro: AWS S3 ou GCS — troca via variável de ambiente, sem mudança de código
const storage: StorageProvider = createProvider(process.env.STORAGE_PROVIDER);
```

**Processamento de imagens (discursivas):**
- `original` → preservado para download e PDF
- `_display` → máx. 1920px, JPEG 85%, progressivo (exibição no canvas)
- `_thumb` → 300px, JPEG 70% (preview na tabela de listagem)

## 5.2 · Notificações — Roteamento por Canal

```typescript
async function enviarNotificacao(estudanteId: string, evento: EventoNotificacao) {
  const [tokens, email, telefone] = await Promise.all([
    getExpoPushTokens(estudanteId),
    getEmailEstudante(estudanteId),
    getTelefoneEstudante(estudanteId),
  ]);

  const promessas: Promise<void>[] = [];
  if (tokens.length > 0) promessas.push(enviarPush(tokens, evento));

  const comEmail = ['gabarito_liberado','nota_discursiva_liberada',
                    'novo_ciclo_mentoria','encontro_24h','matricula_expirando'];
  if (comEmail.includes(evento.tipo)) promessas.push(enviarEmail(email, evento));

  const comWhatsApp = ['encontro_24h','encontro_1h','matricula_expirando'];
  if (comWhatsApp.includes(evento.tipo) && telefone)
    promessas.push(dispararN8N(telefone, evento));

  await Promise.allSettled(promessas); // nunca lança — loga e continua
}
```

| Evento | Push | E-mail | WhatsApp |
|---|---|---|---|
| Gabarito liberado | ✓ | ✓ | - |
| Nota discursiva liberada | ✓ | ✓ | - |
| Relatório disponível | ✓ | ✓ | - |
| Novo ciclo de mentoria | ✓ | ✓ | ✓ |
| Novo material no ciclo | ✓ | ✓ | - |
| Encontro ao vivo em 24h | ✓ | ✓ | ✓ |
| Encontro ao vivo em 1h | ✓ | - | ✓ |
| Gravação disponível | ✓ | ✓ | - |
| Matrícula expirando | - | ✓ | ✓ |

## 5.3 · Mobile — React Native + Expo

- Resolução de simulados
- Visualização de resultados e correções discursivas
- Acesso aos materiais de mentoria
- Expo Push Notifications em tempo real
- Mesma equipe web + mobile

## 5.4 · Integrações Externas

| Sistema | Função | Estado |
|---|---|---|
| Supabase (novo projeto) | BD + Auth + Storage | Criar |
| Resend | E-mail transacional | Integrar |
| N8N | WhatsApp (bot já automatizado) | Só linking |
| Expo Push | Notificações mobile | Integrar |
| Puppeteer | Geração de PDF (cadernos) | Integrar no worker |
| sharp | Resize de imagens server-side | Integrar no worker |
| AWS S3 / GCS | Storage escalável | Futuro — abstração pronta |

## 5.5 · Segurança

```sql
-- Função lida do JWT claim (injetado pelo servidor via header)
CREATE OR REPLACE FUNCTION get_plataforma_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT (current_setting('request.jwt.claims', true)::jsonb ->> 'plataforma_id')::uuid;
$$;

-- Template RLS aplicado em 100% das tabelas de negócio
CREATE POLICY "isolamento_plataforma" ON nome_tabela
  USING (plataforma_id = get_plataforma_id());
```

**Regras permanentes:**
- `.env` no `.gitignore` desde o commit zero — nunca commitar credenciais
- ESLint impede importação de `supabaseAdmin` em arquivos cliente
- Secret scanning no CI (TruffleHog) em todo push
- `supabaseAdmin` (service role) exclusivamente dentro de `createServerFn`
- Rate limiting em todos os endpoints de autenticação

## 5.6 · LGPD

```
Primeiro acesso → tela de consentimento obrigatória (não bypassável via middleware)
        │
        ▼
lgpd_consentimentos: user_id + versao_politica + ip + aceito_em
        │
Ao atualizar a política → incrementar versão → todos re-consentem automaticamente
        │
Direitos do titular:
  ├── Acesso      → exportação JSON dos dados do usuário
  ├── Esquecimento → anonimização/exclusão controlada
  └── Portabilidade → export estruturado
```

## 5.7 · Auditoria

Toda operação de escrita nas tabelas críticas registrada em `audit_logs`:

```
Tabelas: questoes, simulados, correcoes_discursivas,
         matriculas, plataforma_acessos, estudantes, mentorias
Campos:  user_id, tabela, operacao, dados_anteriores, dados_novos, criado_em
```

---

# PARTE 6 — TODOS OS PONTOS CRÍTICOS COM LÓGICA DE CORREÇÃO

## S1 · Credenciais expostas no git ★ CRÍTICO

```bash
# .gitignore desde o commit zero
.env / .env.* / *.pem / *.key

# CI: TruffleHog em todo push — bloqueia merge se detectar segredo
# Credenciais SOMENTE no painel do provedor de deploy (Vercel/Railway)
```

## S2 · Vazamento entre plataformas sem RLS

```sql
-- RLS em 100% das tabelas de negócio com get_plataforma_id()
-- Matriz de teste obrigatória antes do go-live:
-- Cada tabela × cada role → SELECT/INSERT/UPDATE/DELETE
-- verificando que retorna/aceita apenas dados da própria plataforma
```

## S3 · Upload sem validação server-side

```typescript
// Validação obrigatória no servidor antes de aceitar qualquer upload:
// 1. MIME type contra lista de permitidos por tipo de upload
// 2. Tamanho máximo (10MB imagens / 50MB PDFs)
// 3. Magic bytes dos primeiros 8 bytes do arquivo (evita extensão falsa)
```

## S4 · Links de simulado sem autenticação

```typescript
// Middleware global em toda rota não-pública:
// → verifica sessão Supabase
// → redireciona para /login?returnUrl=... se não autenticado
// createServerFn de dados de simulado: verificação adicional de sessão + acesso
```

## S5 · Service role exposto ao cliente

```typescript
// ESLint: no-restricted-imports bloqueia supabaseAdmin fora de .server.ts
// CI: grep por supabaseAdmin em /src/routes e /src/components deve retornar vazio
// Todo acesso privilegiado exclusivamente via createServerFn (server-side)
```

## S6 · LGPD sem consentimento registrado

```typescript
// Middleware pós-auth: verifica lgpd_consentimentos para versão atual
// Se não há registro → redirect obrigatório para /lgpd/consentimento
// Incrementar VERSAO_POLITICA_ATUAL ao atualizar política → todos re-consentem
```

## M1 · Dois admins corrigindo a mesma discursiva ★ CRÍTICO

```sql
-- adquirir_lock_correcao(resposta_id, admin_id):
--   SELECT FOR UPDATE na linha
--   Valida se lock está livre ou expirado (30 min)
--   Atualiza em_correcao_por + lock_expira_em

-- renovar_lock_correcao(): heartbeat a cada 5 min (hook no cliente)
-- navigator.sendBeacon('/api/liberar-lock'): libera ao fechar aba
-- Segundo admin recebe: "Em correção por [nome] desde [hora]"
```

## M2 · Backup sem nomenclatura padronizada

```sql
-- criar_backup_tabela('questoes') → questoes_bk_23062026
-- Script automático para todas as tabelas antes da migração
-- Valida que nome de backup não existe antes de criar
```

## M3 · Perda de dados no editor de blocos

```typescript
// 1. Draft local IMEDIATO no localStorage (sem latência de rede)
// 2. Persistência no servidor com debounce de 2s
// 3. beforeunload: aviso do browser se há mudanças não salvas
// 4. Recuperação de draft ao reabrir caderno (descarta se > 24h)
```

## M4 · Ciclos de mentoria sem controle por data de inscrição

```typescript
// Server fn filtra: mes_referencia >= startOfMonth(inscricao.inscrito_em)
// Aluno inscrito em junho vê ciclos de junho em diante — não os anteriores
```

## M5 · Questões duplicadas entre plataformas

```sql
-- Trigger check_questao_mesma_plataforma:
--   simulados.plataforma_id deve === questoes.plataforma_id
--   ao inserir em simulado_questoes
-- RLS garante que SELECT não vaza dados entre plataformas
```

## M6 · Coordenadas de anotação perdidas se URL da imagem mudar

```typescript
// Anotações referenciam arquivos.id — NUNCA path/URL direta
// Coordenadas em proporção 0.0–1.0 (independente de resolução e zoom)
// URL gerada sob demanda pelo servidor a partir do ID
// Ao renderizar: converte proporção de volta para pixels do elemento atual
```

## P1 · Upload lento de múltiplas páginas

```typescript
// pLimit(3): máx 3 uploads simultâneos (não satura conexão)
// Compressão client-side antes do upload (imagens > 2MB → máx 2048px, quality 85%)
// Retry com backoff exponencial: tentativa 1 (0s), 2 (1s), 3 (2s)
// Progress bar individual por página
```

## P2 · Canvas lento em imagens grandes

```typescript
// Processamento server-side com sharp após upload:
//   _display: máx 1920px, JPEG 85%, progressivo → carregado no canvas
//   _thumb:   300px, JPEG 70% → carregado na tabela de listagem
// Original preservado para download e geração de PDF
```

## P3 · Geração de PDF com timeout

```typescript
// Job assíncrono: admin solicita → job criado → retorno imediato ao cliente
// Worker processa Puppeteer em background com mesmo CSS do editor
// Cliente: useQuery(refetchInterval: 3000) para status do job
// Ao concluir: notificação push/e-mail com link do PDF
```

## P4 · Tabela de discursivas lenta

```sql
-- Índice composto: (plataforma_id, status, enviado_em DESC)
-- Paginação server-side obrigatória: máx 20 por página
-- Nunca retornar todos os registros sem LIMIT
```

## P5 · Embaralhamento sem seed fixo (resposta muda no reload)

```typescript
// seededRandom(sessao_id): hash do UUID → LCG determinístico
// Fisher-Yates seeded = mesma ordem em qualquer reload da mesma sessão
// Ordem salva em sessao_questao_ordem (não recalculada na correção)
```

## P6 · Relatórios pesados bloqueando a UI

```typescript
// relatorio_cache com TTL de 1h por chave
// Se expirado: cria job → retorna { calculando: true }
// Worker calcula e salva no cache
// Cliente: polling com useQuery até calculando = false
```

## U1 · Aluno acessa simulado já finalizado

```typescript
// createServerFn de toda questão verifica (tripla):
//   1. sessao.estudante_id === user.estudanteId
//   2. sessao.status !== 'finalizada'
//   3. tempo decorrido <= tempo_limite_min (auto-finaliza se excedido)
```

## U2 · Caderno com template de outra plataforma

```sql
-- Trigger check_template_plataforma:
--   template.plataforma_id === caderno.plataforma_id OU template.global = true
-- UI: exibe apenas templates da plataforma atual no seletor
-- Server: valida mesmo que UI seja burlada
```

## U3 · X-Force lotado sem aviso claro

```sql
-- inscrever_xforce(): SELECT FOR UPDATE + contador atômico
-- Trigger check_capacidade_xforce: constraint de segurança adicional
-- UI: vagas restantes em tempo real (poll 10s)
-- Se lotado: insere em mentoria_lista_espera com posição numerada
```

## U4 · Gravação não publicada após encontro

```sql
-- View alertas_gravacao_pendente:
--   encontros com realizado=true, gravacao_url=null, data_hora < now()-2h
-- Badge de alerta no dashboard admin com botão "Publicar gravação"
```

## U5 · Push notification sem token Expo cadastrado

```typescript
// enviarNotificacao(): tenta push → se sem token, fallback para e-mail (Resend)
// Eventos urgentes: fallback adicional para WhatsApp via N8N
// Promise.allSettled: nunca lança erro — loga falhas individualmente
```

## U6 · Admin liberando nota para estudante errado

```typescript
// createServerFn: validação cruzada obrigatória
//   correcao.resposta.estudante_id === estudanteId enviado no payload
// Modal de confirmação com nome do aluno visível antes de confirmar
// Audit log completo: quem liberou, para quem, quando
```

## Men2 · Race condition na inscrição do X-Force

```sql
-- Função com SELECT FOR UPDATE na linha do encontro
-- Trigger check_capacidade_xforce: constraint de segurança adicional
-- Lista de espera com posição numerada e notificação quando vaga abre
```

## Men3 · Link de videoconferência expirado ou ausente

```sql
-- View alertas_link_pendente: encontros em < 24h sem link_videoconferencia
-- Flag link_urgente na server fn: encontro em < 1h sem link
-- Admin pode atualizar o link a qualquer momento até o início do encontro
```

## Men5 · Sem canal de feedback individual entre encontros

```sql
-- Tabela mentoria_perguntas por ciclo
-- Aluno envia pergunta → admin responde com timestamp
-- Índice por ciclo com respondido_em NULLS FIRST (não respondidas primeiro)
-- Badge de perguntas pendentes no painel do admin
```

## Des1 · Bloco vinculado a questão arquivada ou deletada

```sql
-- caderno_bloco_questoes: FK auxiliar com ON DELETE RESTRICT
--   impede deletar questão que tem blocos vinculados
-- Trigger sync_bloco_questao: mantém tabela auxiliar sincronizada
-- Renderização: isError || status='arquivada' → exibe bloco com aviso visual
--   "⚠ Questão removida ou arquivada — substitua este bloco"
```

## Des3 · Ordem de blocos corrompida com drag-and-drop rápido

```typescript
// reordenarBlocos(): recebe ARRAY COMPLETO da nova ordem (não incremental)
// Promise.all de updates por bloco (atômico)
// Cliente: debounce 300ms — não dispara request a cada pixel arrastado
// Otimista: UI atualiza imediatamente, servidor confirma em background
```

## Des5 · Histórico de versões crescendo indefinidamente

```sql
-- Trigger after_versao_insert → limpar_historico_caderno()
-- Mantém apenas as 5 últimas versões por caderno (DELETE automático)
-- Executado a cada nova versão salva
```

---

# PARTE 7 — STACK TÉCNICA

| Camada | Tecnologia |
|---|---|
| Frontend Web | React + TanStack Router + TanStack Query |
| Estilização | Tailwind CSS + shadcn/ui |
| Backend | TanStack Start (`createServerFn`) |
| Banco | PostgreSQL via Supabase (novo projeto, plano Pro) |
| Auth | Supabase Auth |
| RLS | PostgreSQL Row Level Security |
| Storage | Supabase Storage → abstração pronta para S3/GCS |
| Processamento de imagem | sharp (server-side, worker assíncrono) |
| Geração de PDF | Puppeteer (worker assíncrono) |
| Mobile | React Native + Expo |
| Push | Expo Push Notifications |
| E-mail | Resend |
| WhatsApp | N8N (bot já automatizado — só linking) |
| CI/CD | TruffleHog (secret scan) + ESLint + testes |

---

# PARTE 8 — ORDEM DE DESENVOLVIMENTO

```
FASE 1 — FUNDAÇÃO
├── Criar novo projeto Supabase Pro (novas credenciais — NUNCA commitar)
├── Backup completo: questao_bk_23062026, simulado_bk_23062026, etc.
├── Modelagem completa do banco (todas as tabelas, constraints, índices)
├── RLS em 100% das tabelas
├── Todos os triggers (lock, validações, sync, limpeza)
├── Funções PostgreSQL (get_plataforma_id, adquirir_lock, etc.)
└── Configurar CI com TruffleHog

FASE 2 — BACKEND
├── Camada de storage abstrata (SupabaseStorageProvider)
├── Middleware: auth + LGPD
├── createServerFn: questões, simulados, sessões de prova
├── createServerFn: correção discursiva (lock + canvas + anotações)
├── Módulo de mentoria (ciclos, encontros, materiais, progresso, Q&A)
├── Sistema de jobs assíncronos (PDF, resize de imagem, relatórios)
├── Sistema de notificações (Expo Push + Resend + N8N webhook)
└── Triggers de auditoria automática

FASE 3 — FRONTEND WEB
├── Multi-tenant routing (resolução por subdomínio)
├── Auth com seletor de plataforma pós-login
├── Tela de consentimento LGPD
├── Banco de questões (etiquetas + pastas + competências)
├── Simulados (criação, publicação, grupos)
├── Sessão de prova (aluno) com embaralhamento e tempo
├── Correção discursiva (canvas + anotações + comentários + lock visual)
├── Caderno de Designer (editor de blocos + templates por plataforma)
├── Módulo de mentoria
│   ├── Admin: ciclos / encontros / materiais / progresso / alertas
│   └── Aluno: timeline / X-Force / Q&A / calendário
└── Relatórios e diagnóstico (com cache e liberação controlada)

FASE 4 — MOBILE
└── React Native + Expo
    ├── Resolução de simulados
    ├── Resultados e correções discursivas
    ├── Materiais de mentoria
    └── Expo Push Notifications

FASE 5 — PÓS-LANÇAMENTO
├── Migração de storage para S3/GCS (abstração pronta — sem reescrever código)
├── Gateway de pagamento
└── IA para seleção inteligente de questões (inspiração Mapa da Prova)
```

---

# PARTE 9 — PONTOS AINDA EM ABERTO

| # | Ponto | Situação |
|---|---|---|
| 1 | Provider de storage definitivo | S3 ou GCS — abstração pronta, escolha futura |
| 2 | Gateway de pagamento | Não previsto na fase inicial |
| 3 | Domínio definitivo | Exemplo: `revisaopge.centeroffice.com.br` |
| 4 | Ferramenta de videoconferência | Zoom ou Google Meet — admin insere link manualmente |
| 5 | IA para seleção de questões | Fase futura (inspiração Mapa da Prova) |
| 6 | SLA de suporte e manutenção | A definir com a equipe |

---

# REFERÊNCIAS

- [Mapa da Prova](https://www.mapadaprova.com.br) — referência de UX para banco de questões e mapeamento por concurso/cargo
- [Sprint Final Mentoria AGU 2026 — Revisão Ensino Jurídico](https://lp.revisaoensinojuridico.com.br/sprint-final-mentoria-agu-2026/) — referência de funcionalidades do módulo de mentoria

---

*Documento gerado em 23/06/2026. Cobre: visão do projeto, arquitetura multi-tenant, modelagem de 28 tabelas, 7 módulos funcionais, infraestrutura completa, 28 pontos críticos com lógica de correção, stack técnica e plano de desenvolvimento em 5 fases.*
