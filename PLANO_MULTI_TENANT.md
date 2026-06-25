# Plano de Multi-Tenancy — Revisão + MEQ

## Visão Geral

Transformar o sistema em multi-tenant isolando os dados por instituição via
`instituicao_id` em todas as tabelas principais, com RLS automático no Supabase
garantindo que admins só enxergam e operam dados da própria instituição.

---

## PARTE 1 — MIGRAÇÕES DE BANCO

### Migration 001 — Criar tabela de instituições

```sql
-- ============================================================
-- 001_criar_instituicoes.sql
-- ============================================================
CREATE TABLE public.instituicoes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          text UNIQUE NOT NULL,        -- 'revisao' | 'meq'
  nome          text NOT NULL,
  nome_curto    text NOT NULL,               -- exibido na UI
  cor_primaria  text NOT NULL DEFAULT '#4F4A6E',
  cor_acento    text NOT NULL DEFAULT '#E5B230',
  logo_url      text,
  ativo         boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Inserir as duas instituições reais
INSERT INTO public.instituicoes (slug, nome, nome_curto, cor_primaria, cor_acento) VALUES
  ('revisao', 'Revisão Ensino Jurídico', 'Revisão', '#4F4A6E', '#E5B230'),
  ('meq',     'MEQ',                    'MEQ',     '#1a3a5c', '#f0a500');
```

---

### Migration 002 — Adicionar instituicao_id nas tabelas principais

```sql
-- ============================================================
-- 002_add_instituicao_id.sql
-- ============================================================

-- 1. administradores
ALTER TABLE public.administradores
  ADD COLUMN instituicao_id uuid REFERENCES public.instituicoes(id),
  ADD COLUMN tipo text NOT NULL DEFAULT 'admin' CHECK (tipo IN ('admin', 'super_admin'));
-- tipo='super_admin' + instituicao_id=NULL = Admin Plus (acesso total)

-- 2. simulados
ALTER TABLE public.simulados
  ADD COLUMN instituicao_id uuid NOT NULL DEFAULT (
    SELECT id FROM public.instituicoes WHERE slug = 'revisao'
  ) REFERENCES public.instituicoes(id);

-- 3. estudantes
ALTER TABLE public.estudantes
  ADD COLUMN instituicao_id uuid NOT NULL DEFAULT (
    SELECT id FROM public.instituicoes WHERE slug = 'revisao'
  ) REFERENCES public.instituicoes(id);

-- 4. grupos
ALTER TABLE public.grupos
  ADD COLUMN instituicao_id uuid NOT NULL DEFAULT (
    SELECT id FROM public.instituicoes WHERE slug = 'revisao'
  ) REFERENCES public.instituicoes(id);

-- 5. pastas
ALTER TABLE public.pastas
  ADD COLUMN instituicao_id uuid NOT NULL DEFAULT (
    SELECT id FROM public.instituicoes WHERE slug = 'revisao'
  ) REFERENCES public.instituicoes(id);

-- 6. questoes
ALTER TABLE public.questoes
  ADD COLUMN instituicao_id uuid NOT NULL DEFAULT (
    SELECT id FROM public.instituicoes WHERE slug = 'revisao'
  ) REFERENCES public.instituicoes(id);

-- 7. import_jobs
ALTER TABLE public.import_jobs
  ADD COLUMN instituicao_id uuid NOT NULL DEFAULT (
    SELECT id FROM public.instituicoes WHERE slug = 'revisao'
  ) REFERENCES public.instituicoes(id);

-- Remover os DEFAULT temporários após a migration de dados
-- (feito na migration 003)
```

---

### Migration 003 — Migrar dados existentes + remover DEFAULT

```sql
-- ============================================================
-- 003_migrar_dados_existentes.sql
-- ============================================================
DO $$
DECLARE
  revisao_id uuid := (SELECT id FROM public.instituicoes WHERE slug = 'revisao');
BEGIN
  -- Atualiza todos os registros existentes para o Revisão
  UPDATE public.simulados   SET instituicao_id = revisao_id;
  UPDATE public.estudantes  SET instituicao_id = revisao_id;
  UPDATE public.grupos      SET instituicao_id = revisao_id;
  UPDATE public.pastas      SET instituicao_id = revisao_id;
  UPDATE public.questoes    SET instituicao_id = revisao_id;
  UPDATE public.import_jobs SET instituicao_id = revisao_id;

  -- Todos os admins existentes pertencem ao Revisão
  UPDATE public.administradores
    SET instituicao_id = revisao_id, tipo = 'admin';
END $$;

-- Remover DEFAULT temporários e tornar colunas NOT NULL definitivas
ALTER TABLE public.simulados   ALTER COLUMN instituicao_id DROP DEFAULT, ALTER COLUMN instituicao_id SET NOT NULL;
ALTER TABLE public.estudantes  ALTER COLUMN instituicao_id DROP DEFAULT, ALTER COLUMN instituicao_id SET NOT NULL;
ALTER TABLE public.grupos      ALTER COLUMN instituicao_id DROP DEFAULT, ALTER COLUMN instituicao_id SET NOT NULL;
ALTER TABLE public.pastas      ALTER COLUMN instituicao_id DROP DEFAULT, ALTER COLUMN instituicao_id SET NOT NULL;
ALTER TABLE public.questoes    ALTER COLUMN instituicao_id DROP DEFAULT, ALTER COLUMN instituicao_id SET NOT NULL;
ALTER TABLE public.import_jobs ALTER COLUMN instituicao_id DROP DEFAULT, ALTER COLUMN instituicao_id SET NOT NULL;

-- Índices de performance
CREATE INDEX idx_simulados_inst   ON public.simulados(instituicao_id);
CREATE INDEX idx_estudantes_inst  ON public.estudantes(instituicao_id);
CREATE INDEX idx_grupos_inst      ON public.grupos(instituicao_id);
CREATE INDEX idx_pastas_inst      ON public.pastas(instituicao_id);
CREATE INDEX idx_questoes_inst    ON public.questoes(instituicao_id);
```

---

### Migration 004 — Enum e app_role atualizado

```sql
-- ============================================================
-- 004_atualizar_enum_roles.sql
-- ============================================================

-- Adicionar role de super_admin ao enum existente
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'super_admin';

-- Tabela de sessões admin (troca de contexto para super_admin)
CREATE TABLE public.admin_sessao_contexto (
  user_id       uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  instituicao_id uuid NOT NULL REFERENCES public.instituicoes(id),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
-- super_admin pode trocar de instituição via essa tabela sem fazer logout
```

---

## PARTE 2 — FUNÇÕES AUXILIARES (RLS HELPERS)

```sql
-- ============================================================
-- 005_rls_helpers.sql
-- ============================================================

-- Retorna instituicao_id do admin logado (NULL se super_admin)
CREATE OR REPLACE FUNCTION auth.minha_instituicao()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT instituicao_id
  FROM public.administradores
  WHERE user_id = auth.uid() AND ativo = true
  LIMIT 1;
$$;

-- Retorna a instituição ativa no contexto do super_admin
-- (a que ele selecionou no seletor)
CREATE OR REPLACE FUNCTION auth.contexto_instituicao()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT COALESCE(
    -- super_admin usa o contexto escolhido
    (SELECT asc2.instituicao_id FROM public.admin_sessao_contexto asc2
     WHERE asc2.user_id = auth.uid()),
    -- admin normal usa a própria
    auth.minha_instituicao()
  );
$$;

-- Verifica se o usuário logado é super_admin
CREATE OR REPLACE FUNCTION auth.is_super_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.administradores
    WHERE user_id = auth.uid()
      AND tipo = 'super_admin'
      AND ativo = true
  );
$$;

-- Verifica se o usuário é admin (qualquer tipo) de uma instituição
CREATE OR REPLACE FUNCTION auth.is_admin_de(inst_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT auth.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.administradores
      WHERE user_id = auth.uid()
        AND instituicao_id = inst_id
        AND ativo = true
    );
$$;
```

---

## PARTE 3 — POLÍTICAS RLS POR TABELA

### Habilitar RLS em todas as tabelas

```sql
ALTER TABLE public.instituicoes   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.simulados      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estudantes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grupos         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pastas         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questoes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_jobs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.administradores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alternativas   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessoes_prova  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matriculas     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.respostas      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedbacks_questao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grupo_membros  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grupo_simulado ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questao_pasta  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questao_simulado ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs     ENABLE ROW LEVEL SECURITY;
```

---

### instituicoes

```sql
-- Todos os admins autenticados enxergam a própria instituição
CREATE POLICY "inst_select" ON public.instituicoes
  FOR SELECT USING (
    auth.is_super_admin()
    OR id = auth.minha_instituicao()
  );

-- Só super_admin cria/edita instituições
CREATE POLICY "inst_insert" ON public.instituicoes
  FOR INSERT WITH CHECK (auth.is_super_admin());

CREATE POLICY "inst_update" ON public.instituicoes
  FOR UPDATE USING (auth.is_super_admin());
```

---

### simulados

```sql
CREATE POLICY "sim_select" ON public.simulados
  FOR SELECT USING (auth.is_admin_de(instituicao_id));

CREATE POLICY "sim_insert" ON public.simulados
  FOR INSERT WITH CHECK (
    auth.is_super_admin()
    OR instituicao_id = auth.minha_instituicao()
  );

CREATE POLICY "sim_update" ON public.simulados
  FOR UPDATE USING (auth.is_admin_de(instituicao_id));

CREATE POLICY "sim_delete" ON public.simulados
  FOR DELETE USING (auth.is_admin_de(instituicao_id));

-- Estudantes acessam simulados via token (função SECURITY DEFINER — sem RLS)
-- A função getProvaPorSessao já valida por token_acesso
```

---

### estudantes

```sql
CREATE POLICY "est_select" ON public.estudantes
  FOR SELECT USING (auth.is_admin_de(instituicao_id));

CREATE POLICY "est_insert" ON public.estudantes
  FOR INSERT WITH CHECK (
    auth.is_super_admin()
    OR instituicao_id = auth.minha_instituicao()
  );

CREATE POLICY "est_update" ON public.estudantes
  FOR UPDATE USING (auth.is_admin_de(instituicao_id));
```

---

### grupos

```sql
CREATE POLICY "grp_select" ON public.grupos
  FOR SELECT USING (auth.is_admin_de(instituicao_id));

CREATE POLICY "grp_insert" ON public.grupos
  FOR INSERT WITH CHECK (
    auth.is_super_admin()
    OR instituicao_id = auth.minha_instituicao()
  );

CREATE POLICY "grp_update" ON public.grupos
  FOR UPDATE USING (auth.is_admin_de(instituicao_id));

CREATE POLICY "grp_delete" ON public.grupos
  FOR DELETE USING (auth.is_admin_de(instituicao_id));
```

---

### pastas

```sql
CREATE POLICY "pasta_select" ON public.pastas
  FOR SELECT USING (auth.is_admin_de(instituicao_id));

CREATE POLICY "pasta_insert" ON public.pastas
  FOR INSERT WITH CHECK (
    auth.is_super_admin()
    OR instituicao_id = auth.minha_instituicao()
  );

CREATE POLICY "pasta_update" ON public.pastas
  FOR UPDATE USING (auth.is_admin_de(instituicao_id));

CREATE POLICY "pasta_delete" ON public.pastas
  FOR DELETE USING (auth.is_admin_de(instituicao_id));
```

---

### questoes + alternativas

```sql
CREATE POLICY "q_select" ON public.questoes
  FOR SELECT USING (auth.is_admin_de(instituicao_id));

CREATE POLICY "q_insert" ON public.questoes
  FOR INSERT WITH CHECK (
    auth.is_super_admin()
    OR instituicao_id = auth.minha_instituicao()
  );

CREATE POLICY "q_update" ON public.questoes
  FOR UPDATE USING (auth.is_admin_de(instituicao_id));

CREATE POLICY "q_delete" ON public.questoes
  FOR DELETE USING (auth.is_admin_de(instituicao_id));

-- Alternativas herdam pelo JOIN com questoes (sem instituicao_id própria)
CREATE POLICY "alt_select" ON public.alternativas
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.questoes q
      WHERE q.id = questao_id
        AND auth.is_admin_de(q.instituicao_id)
    )
  );

CREATE POLICY "alt_insert" ON public.alternativas
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.questoes q
      WHERE q.id = questao_id
        AND auth.is_admin_de(q.instituicao_id)
    )
  );

CREATE POLICY "alt_update" ON public.alternativas
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.questoes q
      WHERE q.id = questao_id
        AND auth.is_admin_de(q.instituicao_id)
    )
  );

CREATE POLICY "alt_delete" ON public.alternativas
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.questoes q
      WHERE q.id = questao_id
        AND auth.is_admin_de(q.instituicao_id)
    )
  );
```

---

### sessoes_prova

```sql
-- Admin vê sessões do próprio simulado
CREATE POLICY "sess_select" ON public.sessoes_prova
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.simulados s
      WHERE s.id = simulado_id
        AND auth.is_admin_de(s.instituicao_id)
    )
  );

-- Estudantes criam/atualizam via funções SECURITY DEFINER (sem RLS)
-- As server functions (createServerFn) usam service_role key — bypass RLS
```

---

### matriculas

```sql
CREATE POLICY "mat_select" ON public.matriculas
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.simulados s
      WHERE s.id = simulado_id
        AND auth.is_admin_de(s.instituicao_id)
    )
  );

CREATE POLICY "mat_insert" ON public.matriculas
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.simulados s
      WHERE s.id = simulado_id
        AND auth.is_admin_de(s.instituicao_id)
    )
  );
```

---

### respostas

```sql
CREATE POLICY "resp_select" ON public.respostas
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.sessoes_prova sp
      JOIN public.simulados s ON s.id = sp.simulado_id
      WHERE sp.id = sessao_id
        AND auth.is_admin_de(s.instituicao_id)
    )
  );
```

---

### grupo_membros

```sql
CREATE POLICY "gm_select" ON public.grupo_membros
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.grupos g
      WHERE g.id = grupo_id
        AND auth.is_admin_de(g.instituicao_id)
    )
  );

CREATE POLICY "gm_insert" ON public.grupo_membros
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.grupos g
      WHERE g.id = grupo_id
        AND auth.is_admin_de(g.instituicao_id)
    )
  );

CREATE POLICY "gm_delete" ON public.grupo_membros
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.grupos g
      WHERE g.id = grupo_id
        AND auth.is_admin_de(g.instituicao_id)
    )
  );
```

---

### grupo_simulado

```sql
CREATE POLICY "gs_select" ON public.grupo_simulado
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.simulados s
      WHERE s.id = simulado_id
        AND auth.is_admin_de(s.instituicao_id)
    )
  );

CREATE POLICY "gs_insert" ON public.grupo_simulado
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.simulados s
      WHERE s.id = simulado_id
        AND auth.is_admin_de(s.instituicao_id)
    )
    AND EXISTS (
      SELECT 1 FROM public.grupos g
      WHERE g.id = grupo_id
        AND auth.is_admin_de(g.instituicao_id)
    )
  );
-- Impede admin do Revisão de vincular grupos do MEQ ao seu simulado

CREATE POLICY "gs_delete" ON public.grupo_simulado
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.simulados s
      WHERE s.id = simulado_id
        AND auth.is_admin_de(s.instituicao_id)
    )
  );
```

---

### questao_pasta + questao_simulado

```sql
-- questao_pasta: herda pela pasta
CREATE POLICY "qp_select" ON public.questao_pasta
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.pastas p
      WHERE p.id = pasta_id AND auth.is_admin_de(p.instituicao_id)
    )
  );

-- questao_simulado: herda pelo simulado
CREATE POLICY "qs_select" ON public.questao_simulado
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.simulados s
      WHERE s.id = simulado_id AND auth.is_admin_de(s.instituicao_id)
    )
  );

CREATE POLICY "qs_insert" ON public.questao_simulado
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.simulados s
      WHERE s.id = simulado_id AND auth.is_admin_de(s.instituicao_id)
    )
  );
```

---

### administradores

```sql
-- Admin vê apenas colegas da mesma instituição + super_admins veem todos
CREATE POLICY "adm_select" ON public.administradores
  FOR SELECT USING (
    auth.is_super_admin()
    OR instituicao_id = auth.minha_instituicao()
  );

-- Só super_admin cria novos admins
CREATE POLICY "adm_insert" ON public.administradores
  FOR INSERT WITH CHECK (auth.is_super_admin());

CREATE POLICY "adm_update" ON public.administradores
  FOR UPDATE USING (
    auth.is_super_admin()
    OR (user_id = auth.uid() AND instituicao_id = auth.minha_instituicao())
  );
-- Admin pode editar próprio perfil; super_admin edita qualquer um
```

---

### audit_logs

```sql
-- Admin vê apenas logs da própria instituição
CREATE POLICY "audit_select" ON public.audit_logs
  FOR SELECT USING (
    auth.is_super_admin()
    OR (
      ator_tipo = 'admin' AND ator_id::uuid IN (
        SELECT user_id FROM public.administradores
        WHERE instituicao_id = auth.minha_instituicao()
      )
    )
  );
```

---

### import_jobs

```sql
CREATE POLICY "imp_select" ON public.import_jobs
  FOR SELECT USING (auth.is_admin_de(instituicao_id));

CREATE POLICY "imp_insert" ON public.import_jobs
  FOR INSERT WITH CHECK (
    auth.is_super_admin()
    OR instituicao_id = auth.minha_instituicao()
  );
```

---

## PARTE 4 — MUDANÇAS NO FRONTEND

### Impacto por área (o que muda)

| Área | Impacto | Esforço |
|------|---------|---------|
| Login admin | Adicionar campo "Instituição" OR auto-detectar pelo e-mail | Baixo |
| Layout admin | Badge da instituição + seletor para super_admin | Baixo |
| Todas as queries | **Zero alteração** — RLS filtra automaticamente | Nenhum |
| Criar simulado/grupo/pasta | Passar `instituicao_id` no INSERT | Baixo |
| Página de estudantes | Mostrar ícone da instituição na listagem | Baixo |
| Super admin dashboard | Seletor de instituição + visão consolidada | Médio |

### O que NÃO muda

- Toda a lógica de simulado (gabarito, PDF, ranking, timer, etc.)
- Toda a lógica de estudante/sessão
- A experiência do estudante ao fazer prova
- As server functions (já usam service_role — bypass de RLS)

---

## PARTE 5 — FLUXO DO SUPER ADMIN

```
[Login] → deteta tipo='super_admin' → mostra seletor de instituição
         ↓
  [Selecionou Revisão]  →  chama: UPDATE admin_sessao_contexto SET instituicao_id = <revisao>
  [Selecionou MEQ]      →  chama: UPDATE admin_sessao_contexto SET instituicao_id = <meq>
         ↓
  Todas as queries passam por auth.contexto_instituicao() → filtra automaticamente
         ↓
  Badge no topo mostra "Revisão" ou "MEQ" + botão para trocar
```

---

## PARTE 6 — RISCOS E OBSERVAÇÕES

### Riscos

| Risco | Mitigação |
|-------|-----------|
| Server functions bypassam RLS | Já esperado — elas usam `service_role` key. Adicionar `instituicao_id` explícito nos INSERTs das server functions |
| Token de simulado público (estudante) | Não muda — o token é único e já identifica o simulado + instituição implicitamente |
| Questões compartilhadas entre instituições | Não suportado inicialmente. Se necessário, criar tabela `questao_compartilhada` futuramente |
| Performance de policies com JOINs | Mitigado pelos índices criados na migration 003. Monitorar com `EXPLAIN ANALYZE` |

### Decisão importante

**Estudantes são por instituição?** Sim — um aluno do MEQ não deve aparecer em relatórios do Revisão. Se um aluno fizer prova nas duas plataformas, ele terá dois registros de `estudantes` com `instituicao_id` diferentes. O `device_hash` + e-mail não colide entre instituições.

---

## PARTE 7 — SEQUÊNCIA DE EXECUÇÃO

```
1. [Banco]    Executar migration 001 (criar instituicoes)
2. [Banco]    Executar migration 002 (add colunas com DEFAULT temporário)
3. [Banco]    Executar migration 003 (migrar dados + remover DEFAULT)
4. [Banco]    Executar migration 004 (enum + tabela de contexto)
5. [Banco]    Executar migration 005 (funções RLS helpers)
6. [Banco]    Executar todas as políticas RLS (Parte 3)
7. [Frontend] Atualizar _authenticated/route.tsx para detectar super_admin
8. [Frontend] Adicionar badge de instituição + seletor para super_admin
9. [Frontend] Passar instituicao_id nos INSERTs (simulado, grupo, pasta, questão)
10. [Teste]   Criar admin MEQ → verificar isolamento completo
11. [Teste]   Criar super_admin → verificar acesso total + troca de contexto
```

---

## ESTIMATIVA

| Fase | Tempo estimado |
|------|---------------|
| Migrations 001–004 | 2h |
| Funções RLS helpers | 1h |
| Políticas RLS (todas as tabelas) | 3h |
| Frontend — badge + seletor | 2h |
| Frontend — passar instituicao_id nos INSERTs | 2h |
| Testes de isolamento | 2h |
| **Total** | **~12h de trabalho focado** |
