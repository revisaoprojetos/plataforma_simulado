# Auditoria de Integrações — Curseduca & Guru (v2, reescrita)

**Tenant:** Revisão / Ensino Jurídico · **Data:** 21/09/2026
**O que é:** laudo consolidado dos problemas de sincronização de alunos, com uma leitura **honesta de responsabilidade** (o que foi bug/desenho **nosso** × o que é do **provedor**), o que já foi corrigido e o que ainda depende de decisão ou do fornecedor.

> **Estado do código:** tudo commitado e **pushado** na branch `feat/discursivas-correcao-ocr` (`c8d80bdc`, `1517ea5e`, `e7a2372b`). **Deploy à produção (Swarm `estudando-junto_app`) é MANUAL e está pendente** — nada disto vale no ar até o deploy.
> **Migrações aplicadas no twdr:** `20260923000000`, `20260924000000`, `20260925000000`, `20260926000000`.

---

## 1. Descoberta central (o ponto que muda a conversa com os fornecedores)

A leitura inicial foi *"a Curseduca está instável (502) e por isso a sincronização quebra"*. A reverificação contra a **API real** (OpenAPI oficial + sondas ao vivo, 38/38 campos conferidos) revelou um fator técnico que **amplificava muito** esses erros:

- O código chamava o detalhe `/members/{id}` **para cada membro** — um **fan-out de ~18 mil chamadas** — na suposição de que a lista `/members?groupId=` não trazia CPF/telefone/grupos.
- A API **sempre trouxe** esses dados na própria lista. No canal "Desafio de Lei Seca" (1.065 membros): **~1.065 → 26 chamadas (~40× menos)**.
- Esse volume de chamadas era **o que disparava os 502 / rate-limit / os ~6 min** — não apenas o gateway deles.

**Conclusão que reposiciona o contato:** reduzimos o uso da API em **~40×**. Agora dá para exigir estabilidade **em cima de um uso leve e correto** da API `/members` — uma cobrança mais forte e embasada do que apenas apontar o 502.

---

## 2. Panorama: o que já foi resolvido × o que depende do fornecedor

| Ponto | Situação | Detalhe |
|---|---|---|
| 502 / rate-limit / sync de ~6 min | ✅ Resolvido | Fan-out `/members/{id}` **eliminado** (−40×); some o principal gatilho do 502. |
| Retry não cobria 502/504 | ✅ Resolvido | 5xx transitório abortava tudo → agora tolera. |
| 1 canal ruim derrubava a sync inteira | ✅ Resolvido | Tolerância por-grupo (`gruposFalhos`). |
| Aluno reconhecido mas fora do grupo | ✅ Resolvido | Agrupamento automático por nome + id (Igor + 63 no Lei Seca). |
| Aluno "com acesso" que na verdade expirou | ✅ Resolvido | Passa a usar `hasAccess` da API (F3). |
| Job de import preso "processando" | ✅ Resolvido | Stale-lock (`locked_at`). |
| Config Curseduca duplicada | ✅ Resolvido | Unificada na canônica. |
| Reembolso mantinha acesso | ✅ Resolvido | Reconcile por PULL da API do Guru (B1). |
| Revogação removia acesso manual | ✅ Resolvido | Coluna `origem` (B3). |
| Estabilidade do gateway `/members` | 📞 Fornecedor | 502 sob paginação pesada — cobrar SLA (agora com uso leve). |
| `?search=` ignorado / sem webhook de entrada | 📞 Fornecedor | Limitações da API — perguntar (ver §7). |
| Doc da API de assinaturas / HMAC no webhook (Guru) | 📞 Fornecedor | Confirmar contrato e segurança. |

**Resumo:** a grande maioria dos pontos **já está resolvida na plataforma**. Restam **3 itens que dependem dos fornecedores** — e são pedidos/confirmações, não falhas ativas.

---

## 3. Curseduca

### 3.1. Estado
✅ Ativa · agrupamento automático **ligado** · 35 canais · **0 falhas** no último ciclo.

### 3.2. O que corrigimos (por eixo, não por ordem cronológica)

**Eixo "usar a API certo" (Fases 1–5 da reverificação, `e7a2372b`)**
- **F1 — fim do fan-out:** CPF/telefone/grupos/classificação saem da própria lista; `/members/{id}` vira só **fallback** (grupo vazio ou sem CPF). ~40× menos chamadas.
- **F3 — acesso real por `hasAccess`:** `expiresAt=null` **não** garante acesso (29 casos de nulo sem acesso); a lista **não** filtra por acesso vigente (ex.: "Amostra Passaporte" tinha 2.259 na lista, só 4 com acesso). Política do tenant: **não conceder a novos expirados, nunca remover quem já está** (contador `semAcesso`).
- **F2/F4 — higiene:** busca por membro paginando (o `?search=` deles é ignorado) e body do `/login` enxuto (sondado: segue 201).
- **F5 — `origem` também na sync legada:** `executarImport` grava `origem='integracao'` e só remove o que é da integração (protege acesso manual até de aluno Curseduca).

**Eixo "resiliência" (rodada A/C, `c8d80bdc`)**
- Retry cobre **502/504**; **tolerância por-grupo** (canal ruim não derruba os demais); **stale-lock** (`locked_at`); **guarda anti-sobreposição** de ticks; **alerta na tela** dos canais sem grupo correspondente.

**Eixo "vínculo confiável" (A1–A4)**
- **A1:** casa canal→grupo por **`codigo_externo` (id estável)**, nome só como fallback + **auto-cura** (grava o id no grupo). Renomear canal/grupo não quebra mais.
- **A2:** **descoberta automática** de canais atrás da flag `descobrir_canais` (default **off**) — canal novo entra sozinho.
- **A3:** import pesado **sai do request HTTP** → enfileira em `simulado_curseduca_jobs` (fila/cron com stale-lock).
- **A4:** painel legado passa a **ler/gravar na config canônica** (`simulado_integracao_config`), preservando `webhook_token`. Fim do "editei e não teve efeito".

### 3.3. Risco residual (deles)
- Se a API deles der **502 em todas as tentativas** de um canal, o canal é **pulado** naquele ciclo (`gruposFalhos`) e os alunos entram só no próximo. Mitigado do nosso lado; a estabilidade é responsabilidade deles.

---

## 4. Guru

### 4.1. Estado
✅ Ativa · **0 erros** · inbox de webhooks **100% HTTP 200**. **Nenhuma falha ativa.**

> Mito desfeito: o aluno `igorduartemaia328@gmail.com` aparecia como `origem=guru` mas tinha **0 eventos Guru** — cadastro antigo; ele entrou pela **Curseduca** (canal "Desafio de Lei Seca"). Não foi problema do Guru.
>
> Diagnóstico corrigido: uma versão anterior dizia "só concede, nunca revoga". **Errado** — o **webhook já revoga** (`cancelado/reembolsado/expirado` → `revogar()` com proteção `outraAtivaConcede`). Os gaps eram mais estreitos (abaixo) e eram **nossos**.

### 4.2. Correções latentes de segurança/robustez (`c8d80bdc`)
`tenant_id` no UPDATE do evento · comparação de segredo **constant-time** · status desconhecido **não** concede mais · erro de insert de estudante deixou de ser engolido · sanitização de injeção no `.or()` · recuperação de lock na fila + reprocesso com o mapa do tenant · redação de `api_token`/headers no inbox.

### 4.3. O achado que importava: reconcile por PULL (B1)
Rodado `guru-reconcile?pull=1` — **varredura completa de 6042 assinaturas** (depois de corrigir um bug de paginação que truncava em 2500):

- **`revogaria = 0`** sobre as 6042 → **nenhum acesso preso por reembolso/cancelamento perdido.** O webhook de revogação está saudável.
- **`concederia = 1618`, mas só 104 GANHARIAM de fato** — os outros **1514 já têm** (reaplicar é no-op). Dos 104: 95 alunos existentes sem o acesso, 3 cadastros novos, 6 sem mapeamento. Concentrados em **Extensivo Black Março 2026 (37)** e **Passaporte Vitalício 2026 (33)**.
- **Aplicação (`?aplicar=1`) autorizada, mas NÃO concluída:** a tentativa de 21/09 **falhou por starvation do rate limit** — o pull compartilha a cota de 60/min do Guru com o tráfego real de produção e, rodando pelo dev, não conseguiu vaga suficiente em 40 min (curl encerrou sem resposta). **0 concessões aplicadas** (verificado no banco: nenhuma assinatura tocada além do tráfego normal). **A reexecutar** em janela de menor concorrência, ou **direto no servidor após o deploy** (sem o teto de tempo do request externo). Como `revogaria=0`, não há urgência nem risco de perda.

Correções que tornaram o pull confiável: teto de paginação 50→1000 páginas + guarda anti-loop; e **espera paciente** por vaga no rate limit (60/min compartilhado via Redis com o tráfego real).

### 4.4. Riscos residuais
- **[Nosso, desligado] Expiração por data (B2):** existe (`assinaturas-expirar`), mas roda só em **dry-run** e **não está agendada** — assinatura vencida sem evento continua com acesso até ligarmos.
- **[Deles] Paginação da API:** os nomes de campo do cursor (`next_cursor`/`has_more`) ainda não foram confirmados na doc — por isso o PULL nasce conservador (só revoga status explícito; ausência na página não revoga).

---

## 5. Números que importam

| Métrica | Valor |
|---|---|
| Fan-out eliminado (Lei Seca) | ~1.065 → **26 chamadas** (~40×) |
| Campos da API Curseduca reconferidos ao vivo | **38/38** consistentes |
| Assinaturas Guru varridas (pull completo) | **6.042** |
| Revogações "presas" encontradas | **0** |
| "Concederia" bruto × ganho real | 1.618 → **104** |
| Alunos re-vinculados no Lei Seca (manual) | **+63** (inclui Igor) |
| Migrações aplicadas nesta frente | **4** |

---

## 6. Decisões pendentes (de negócio, não técnicas)

1. **Deploy à produção** (Swarm manual) — sem ele, nada acima vale no ar. *Ação técnica, mas depende de janela.*
2. **Ligar a expiração por data (B2)?** Passa a **retirar** acesso de assinaturas vencidas. Rodar dry-run → revisar → `?aplicar=1` → agendar.
3. **Ligar a descoberta de canais (A2)?** Flag `descobrir_canais` — canal novo entra sem editar a lista. Hoje **off**.
4. **Desativar a config Curseduca legada (C8)?** `simulado_curseduca_config` segue `ativo=true` (nunca lida). Desligar = fonte única.
5. **Conceder os 104 do reconcile** — autorizado, mas a 1ª execução falhou por rate limit (ver §4.3). **Reexecutar** numa janela de baixa concorrência ou após o deploy (no próprio servidor). Baixo risco (idempotente, `revogaria=0`).

---

## 7. O que pedir a cada fornecedor

**Curseduca**
1. Estabilidade/SLA da API `/members` (picos de 502) — agora que **não** a martelamos mais.
2. Existe **busca server-side**? (`?search=` hoje é ignorado.)
3. Existe **webhook de entrada** ("membro entrou/saiu do canal")? Eliminaria o polling.
4. Limites oficiais de **rate/paginação**.

**Guru**
1. **Documentação da API de assinaturas** (endpoints + modelo de paginação: cursor vs página).
2. **Assinatura HMAC no header** do webhook (hoje validamos token na URL + Account Token no corpo).

---

## 8. Rastreabilidade

- **Commits (branch `feat/discursivas-correcao-ocr`, pushados):** `c8d80bdc` (A1–A4 + B1–B3 + fix paginação), `1517ea5e` (análise de ganho por produto + pull paciente), `e7a2372b` (Fases 1–5 API real). Contexto: `127dc281` (guarda anti-sobreposição).
- **Migrações (todas aplicadas no twdr):** `20260923000000` (job lock), `20260924000000` (agrupar), `20260925000000` (descobrir_canais), `20260926000000` (origem).
- **Arquivos-chave:** `lib/curseduca/{client,import-core,agrupar,cfg}.ts`, `app/api/cron/{curseduca-sync,curseduca-jobs,guru-reconcile,assinaturas-expirar}/route.ts`, `app/admin/curseduca/actions.ts`, `components/admin/curseduca-sync-card.tsx`, `lib/integracoes/{engine,orquestrador,config}.ts`, `lib/integracoes/providers/{curseduca,guru}.ts`, `lib/simulado/propagar-grupo.ts`.
