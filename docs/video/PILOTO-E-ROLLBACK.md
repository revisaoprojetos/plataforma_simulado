# Piloto e rollback — Gerenciador de Vídeo (5.4)

Princípio: **o vídeo próprio entra como um provedor a mais** ("Vídeo próprio") ao lado de YouTube/Vimeo/Panda. Voltar atrás = trocar o provedor da aula; nenhum conteúdo antigo é apagado. Tudo que muda produção é passo manual do operador (regra do projeto: sem commit/push/imagem/deploy automáticos).

## 1. Escopo do piloto

| Item | Definição |
|---|---|
| Tenant | **1** (escolher o de menor risco/maior abertura a testes). Os demais seguem 100% no provedor atual |
| Conteúdo | 3 a 5 vídeos curtos/médios (inclua 1 aula longa, 60–90 min, e 1 vídeo com legenda/capítulos), todos com cópia no provedor antigo (YouTube/Vimeo/Panda) |
| Público | Grupo de **testadores globais** (acesso total, fora de ranking) + 10–30 alunos voluntários liberados por regra; nada de turma inteira |
| Duração | 2 semanas mínimas, incluindo 1 fim de semana e 1 pico (ex.: aula marcada) |
| Estado inicial | Empresa do serviço criada para o tenant (D6); `accessEndpointEnabled` ligado **só** nessa empresa; chave de integração no servidor Next; CORS/`allowedDomains` do tenant; iframe Curseduca testado (`allow="fullscreen"`) |

Pré-requisitos (todos marcados): `SEGURANCA-CHECKLIST.md` completo; carga de staging aprovada; backup + restore testados; `RUNBOOK.md` revisado; plano de comunicação com suporte (como o aluno reporta problema e como o suporte volta a aula para o provedor antigo).

## 2. Roteiro

1. **Dia 0 (testadores)**: sobe os vídeos, confere processamento (status `ready`, renditions esperadas), reproduz em desktop, Android, iOS/Safari, dentro do iframe Curseduca. Valida: retomar de onde parou, velocidade, qualidade, legenda, fullscreen, marca d'água, expiração/renovação do token (deixe uma aula aberta > 10 min), revogação (remover matrícula e ver o acesso cair).
2. **Dias 1–3**: libera 10 voluntários (regra de liberação do piloto). Acompanha painéis duas vezes ao dia.
3. **Dias 4–14**: amplia para até 30. Roda `egress-estimate.ts --days 7` ao fim da semana 1 e da 2 e registra GB por aluno-hora real.
4. **Fim**: reunião de decisão com o quadro de métricas abaixo -> **go** (expandir por tenant/curso), **ajustar** (corrigir e repetir 1 semana) ou **abortar** (rollback total).

## 3. Métricas de sucesso (preencher a meta real após a carga de staging)

| Métrica | Meta | Fonte |
|---|---|---|
| Início de reprodução (clique -> 1º frame) p95 | <= 3 s | telemetria do player / medição manual |
| Taxa de erro de playback (start/manifest/chave) | < 0,5% | `/metrics` da API (5xx/4xx por rota) |
| Rebuffering (tempo travado / tempo assistido) | < 2% | telemetria do player |
| Heartbeat p95 (servidor) | < 100 ms | `load/percentiles.cjs` |
| Fila de progresso | volta a ~0 em 15 s; nunca >= 80% do teto | `progress_events_queue_length` |
| Vídeos processados com sucesso | 100% `ready` em <= 2x a duração do vídeo | `videos.status`, logs do worker |
| Chamados/reclamações do piloto | 0 críticos; < 5% dos voluntários com problema repetido | suporte |
| Progresso consistente | % exibido no app = % do serviço (amostra de 20 alunos) | comparação manual |
| Egress medido | dentro de +/- 30% do modelo (`CARGA-E-EGRESS.md` §5) | `egress-estimate.ts` x console do provedor |
| Segurança | 0 achados críticos/altos novos; `s3:audit` limpo | `npm run s3:audit -w apps/api` |

## 4. Critérios de abort (qualquer um = parar e fazer rollback do passo)

- Qualquer **vazamento entre empresas/alunos** (playback ou progresso de outro aluno/empresa), mesmo único.
- Segmento ou chave obtidos sem sessão/token válido; bucket com ACL pública; segredo exposto em log/repo.
- Taxa de erro de playback >= 2% por 30 min, ou serviço indisponível > 15 min no horário de uso.
- Perda/corrupção de progresso do aluno (retrocesso, zerar) confirmada em mais de 1 aluno.
- Worker/consolidador travado e fila de heartbeat >= teto sem recuperação em 30 min.
- Egress real > 2x o modelo sem explicação (risco de custo), ou disco/volume do Postgres/Redis acima de 85%.
- Aluno do piloto impedido de assistir aula obrigatória sem alternativa (o rollback para o provedor antigo deve ser imediato).

## 5. Rollback por fase

Cada linha é independente e **reversível**; execute do nível mais barato para o mais profundo. Comandos entre `<>` são do operador; nada foi executado por quem gerou este documento.

| Fase | Sintoma | Rollback | Comando / ação | Efeito |
|---|---|---|---|---|
| **5/piloto (conteúdo)** | Problema em uma aula | **Voltar o provedor da aula** para YouTube/Vimeo/Panda | No Estúdio, editar a aula e trocar "Vídeo próprio" pelo provedor/URL antigo; em lote: `UPDATE` na tabela do currículo (backup antes; filtrar por tenant e `video_aulas.id`) — **TODO(operador): conferir nome da tabela/coluna na migration `simulado_video_*` e testar em staging** | O aluno volta a ver o vídeo antigo na próxima abertura; progresso do serviço fica guardado |
| **4 (front)** | Player com bug | Reverter a imagem do `web` ao SHA anterior (serviço `plataforma_simulado_web`, regra do projeto: SHA; `:latest` = rollback) ou desligar o provedor "Vídeo próprio" no seletor | `docker service update --image <imagem>:<sha-anterior> plataforma_simulado_web` | Remove o player novo; conteúdo antigo intacto |
| **3 (integração)** | Sync de acesso errado (libera/revoga indevido) | Pausar o job de sincronização (flag/env do job; se não houver, desabilitar o cron) e **desabilitar `accessEndpointEnabled`** da empresa | no `platform admin` do serviço: empresa -> `accessEndpointEnabled=false`; ou `ACCESS_ENDPOINT_ENABLED=false` no stack para **todas** | `/access/*` responde 404; ninguém novo recebe sessão; playback de quem já tem JWT continua até expirar (<= 15 min) |
| **3 (acesso, emergência)** | Vazamento de acesso | Revogar a chave de integração e matrículas do piloto | `POST /v1/access/enrollments/revoke` por aluno/curso, ou desativar a empresa | Playback e renew passam a 403 em <= 30 s |
| **2 (infra: worker)** | Worker consumindo CPU/derrubando nó, jobs em loop | **Parar o worker** | `docker service scale <stack>_video-worker=0` (jobs voltam à fila com o SIGTERM gracioso; `stop_grace_period` 10 min); reativar com `=1` | Novos uploads ficam em `queued`; vídeos prontos continuam sendo servidos |
| **2 (infra: api/consolidador)** | Release ruim | Voltar imagem da api/consolidador/worker ao SHA anterior | `docker service update --image ghcr.io/<repo>/video-api:<sha-anterior> <stack>_video-api` (idem consolidator; worker usa `video-worker`) | Volta ao código anterior; migration é aditiva (sem down) |
| **2 (infra: parar tudo)** | Incidente grave | Escalar `video-api`, `video-consolidator` e `video-worker` a 0 | `docker service scale <stack>_video-api=0 <stack>_video-consolidator=0 <stack>_video-worker=0` | Só afeta quem usa o provedor "Vídeo próprio" (pós-rollback de conteúdo, ninguém) |
| **1 (serviço: dados)** | Corrupção de dados do serviço | Restaurar `pg_dump` mais recente em instância descartável, validar, e só então trocar | ver `RUNBOOK.md` (restore testado) | Perde até o RPO acordado |
| **0 (decisões)** | Cobrança/custo inesperado | Encerrar a chave S3 do piloto e conferir fatura; manter bucket sem objetos novos | console do provedor (operador) | Para o custo; vídeos já publicados deixam de tocar |

Ordem sugerida em incidente de playback: (1) voltar a aula para o provedor antigo, (2) `accessEndpointEnabled=false` na empresa, (3) parar worker se for carga de CPU, (4) voltar imagem, (5) desligar serviços.

Regras do rollback: não apagar vídeos, empresas nem o bucket durante o incidente (preserva evidência e permite retorno); registrar horário, causa e decisão em `docs/video/` (post-mortem curto).

## 6. Critério de saída do piloto (go)

- Todas as métricas da §3 atendidas por 7 dias seguidos e nenhum critério de abort disparado.
- Rollback **ensaiado** no staging e no piloto (trocar 1 aula de volta ao provedor antigo e confirmar).
- Aprovação escrita do responsável de negócio e do operador técnico; próximos tenants entram um por vez, repetindo a §1 reduzida.
