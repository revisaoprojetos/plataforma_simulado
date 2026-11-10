# ADR 0005 — API de integração com o sistema de origem

**Status:** aceito · 2026-11-01

## Contexto
O aluno não usa esta plataforma diretamente: ele está logado em **outro sistema** (área de membros, checkout), que tem a senha e a identidade dele. Esse sistema precisa liberar e cortar acesso a cursos e abrir as aulas para o aluno. A proposta inicial era receber webhooks de plataformas de venda (Hotmart, Guru, Kiwify, Hubla), normalizar pedidos e avaliar um motor de regras. Isso foi **descartado**: os formatos dos webhooks mudam por plataforma, e quem sabe a regra de negócio é o sistema de origem.

## Decisões
**Um endpoint genérico de matrícula, chamado pelo sistema de origem.** `POST /access/enrollments` recebe e-mail, curso e prazo opcional. Sem webhooks, adapters, status de pedido ou motor de regras. Cenários atuais (aluno só no sistema de origem) e futuros (login direto aqui) usam o mesmo endpoint.

**Identidade = e-mail normalizado**, com `externalId` opcional (id do aluno no sistema de origem). A senha do aluno nunca chega aqui: aluno criado pela integração tem um hash inutilizável (`!…`). Quem já existe não é alterado.

**Sessão em nome do aluno** (`POST /access/sessions`): JWT de aluno, de curta duração e sem refresh, para o sistema de origem consumir a API por ele. O primeiro acesso por token (`POST /auth/first-access`) existe para o cenário futuro de login direto e só é emitido quando pedido.

**Chave de integração = token pessoal de admin com o escopo `access:manage`**, reaproveitando o mecanismo dos tokens do MCP (hash, expiração, revogação a cada chamada, auditoria). JWT de login não vale nestas rotas.

**Prazo na matrícula** (`startsAt`, `endsAt`, `revokedAt`), aplicado por um único filtro (`activeEnrollment`) em toda checagem de acesso, mantendo a regra de autorização única (REST, playback e MCP). Revogar mantém o registro e derruba as telas abertas. `externalRef` (id do pedido) dá idempotência: repetir a chamada não renova o prazo.

**Recurso opcional com dupla trava:** `ACCESS_ENDPOINT_ENABLED` (ambiente, padrão falso) e `tenants.access_endpoint_enabled` (operador, padrão falso). Desligado em qualquer nível, responde 404 como se a rota não existisse e nada é gravado; as suítes anteriores provam que o comportamento antigo não muda.

## Consequências
- **Risco concentrado na chave:** quem a tem abre sessão como qualquer aluno da empresa. Mitigações: só admin cria, uma por sistema, segredo de servidor, revogação imediata, auditoria com ids (sem e-mail), sessão só para papel `aluno`.
- Sem motor de regras, o sistema de origem é a fonte da verdade sobre quem pode o quê; se um dia a plataforma precisar decidir sozinha (receber vendas direto), isso volta como um novo ADR em cima deste endpoint.
- Sem e-mail transacional na API: o token de primeiro acesso é devolvido ao chamador, que monta e envia o link.
- Analytics de "matriculados" passa a contar só matrículas vigentes; o resumo de um aluno continua mostrando o histórico.
