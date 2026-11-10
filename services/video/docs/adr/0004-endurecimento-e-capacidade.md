# ADR 0004 — Endurecimento, limites e capacidade

**Status:** aceito · 2026-10-26

## Contexto
O Marco 7 prepara a plataforma para produção: proteção contra abuso, observabilidade, LGPD e uma meta de capacidade (RNF10: ≥ 1.000 heartbeats/s com p95 < 100 ms numa instância). O primeiro teste de carga **falhou** (p95 de 559 ms e consolidação 4× mais lenta que a chegada), o que orientou as decisões abaixo.

## Decisões

**Limite de requisições (Redis, janela fixa, fail-open).** Contagem atômica por Lua (`INCR` + `PEXPIRE`) com políticas por tipo de rota. Chaves: IP (rotas anônimas), usuário (autenticadas), conta-alvo `tenant|e-mail` (força bruta) e sessão de reprodução (entrega de vídeo). Rotas de entrega usam o limite por sessão, não por IP, para não punir uma escola inteira atrás de um NAT. Se o Redis cair, o limite libera (disponibilidade acima de proteção), com erro no log. Janela fixa permite rajada de até 2× no limite da janela; aceitável aqui.

**Consolidação de progresso em SQL por conjuntos, em processo próprio.**
- O planejamento é uma função pura (`consolidation.ts`); a gravação usa `unnest` e `ON CONFLICT`, ~12 consultas por lote, qualquer que seja o tamanho. Se um lote falha, reprocessa grupo a grupo para isolar eventos de aula/aluno removido (descartados) dos demais (voltam à fila).
- Em produção roda em um serviço `consolidator` (mesma imagem, outro ponto de entrada), com `PROGRESS_FLUSH_INTERVAL_MS=0` nas instâncias da API, para que a escrita pesada não dispute CPU com quem atende os jogadores. As leituras de progresso/analytics ainda esvaziam a fila antes de ler.

**Caminho quente do heartbeat enxuto.** Scripts por `EVALSHA`; duração do vídeo em cache de memória; verificação do token em cache até expirar (a assinatura de um token imutável não muda); limite por sessão e "sessão ativa?" em paralelo; sem logger de requisição para o heartbeat (falhas aparecem nas métricas).

**Configuração insegura recusada em produção.** Segredos curtos/de exemplo, segredos iguais, limite desligado e CORS em localhost impedem o boot.

**RLS do Postgres: não adotado agora.** O isolamento por empresa é aplicado em toda consulta e coberto por testes e2e de vazamento. RLS exigiria `SET LOCAL app.tenant_id` por transação em todas as requisições (custo no caminho quente e complexidade com Prisma) para proteger contra um erro que os testes já cobrem. Reavaliar se o número de empresas crescer ou se houver acesso direto ao banco por terceiros.

**LGPD.** Exportação em JSON sem segredos; remoção em dois modos — `anonymize` (padrão: remove identidade, anotações e logins; mantém o histórico sem identificação para preservar estatísticas) e `erase` (apaga tudo, cascata). Travas: não remove dono de curso nem o último administrador.

## Resultado da medição (1.000 sessões, 1 heartbeat/s cada, 60 s, uma instância da API)
Servidor: p50 3,6 ms · p90 20 ms · **p95 36 ms** · p99 99 ms · 99% < 100 ms · 0 erros; fila de progresso drena em segundos. Cliente (k6): p95 67 ms. API a ~75% de um núcleo. Detalhes e como reproduzir em [operacao.md](../operacao.md#teste-de-carga).

## Consequências
+ Meta de capacidade atingida e reproduzível (`load/`), com observabilidade para acompanhar em produção.
+ Escala horizontal simples: a API é sem estado; o consolidador pode ter réplicas (travas por aluno/aula).
− Mais um serviço a operar (consolidador). − Um erro de escopo por `tenant_id` continua dependendo de testes (sem RLS).
