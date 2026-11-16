# Rastreio de atividade do aluno

**O que e coletado:** sessoes de acesso (IP, navegador, SO, aparelho, metodo de login) e atividades: paginas vistas (rota normalizada, sem query e com ids como `:id`), tempo de permanencia por pagina, leitura/materiais abertos e baixados, video iniciado, metas do cronograma concluidas, grifos/notas (so contagem/ids), quizzes, simulados e jogos. Nunca se registra texto digitado, querystring ou tokens.

**Finalidade:** seguranca da conta (uso indevido/compartilhamento), suporte e melhoria do produto (metricas agregadas de uso).

**Retencao:** registros detalhados por 180 dias (`ACESSOS_RETENCAO_DIAS`, minimo 30). Antes do purge, o sistema consolida agregados diarios por aluno (`simulado_aluno_metricas_dia`: acessos, atividades, tempo, contagem por tipo), sem IP/UA.

**Acesso:** somente admins com `acessos:view` (CSV: `acessos:export`, auditado). IP/UA nunca sao devolvidos ao aluno.

**Transparencia (LGPD):** nao ha componente de politica/consentimento no portal do aluno que comporte o aviso; incluir este texto na politica de privacidade vigente. Migration: `20261120010000_rastreio_aluno_total.sql` (pendente de aplicacao).
