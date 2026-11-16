# Rastreio de acessos da equipe (admins)

**Finalidade:** segurança e investigação (quem acessou o painel, de onde, o que fez). Não é usado para avaliação de desempenho.

**Dados coletados (somente EQUIPE; aluno nunca):** sessão (IP, navegador/SO/dispositivo, início, último sinal, encerramento), páginas vistas (rota normalizada, sem query nem ids), tempo na página, ações de mutação (rota da API, ID da requisição) e login/logout. Também grava contexto (página, rota da API, ID da requisição, sessão) nos eventos de auditoria.

**Base legal / LGPD:** legítimo interesse (segurança da informação). IP e user-agent são dados pessoais.

**Acesso:** somente via service role no servidor, pelas telas `/admin/acessos-equipe` e `/admin/auditoria`, com permissão `acessos:view` (CSV: `acessos:export`; encerrar sessão: `acessos:manage`). Tabelas sem grants para `anon`/`authenticated`. Exportação e encerramento de sessão ficam na auditoria.

**Retenção sugerida:** 180 dias. Função `simulado_admin_rastreio_purgar(dias)` (mínimo 30), a ser chamada por cron (como a do rastreio de alunos).

**Tabelas:** `simulado_admin_sessoes`, `simulado_admin_atividades`; colunas `rota`, `rota_api`, `request_id`, `sessao_id`, `status` em `simulado_audit_logs`. Migration: `20261121100000_admin_rastreio.sql`.

**Limites:** o IP vem de `x-forwarded-for` (não confiável para decisão de acesso); alertas (IP novo, muitos IPs, madrugada) são indícios, não prova.
