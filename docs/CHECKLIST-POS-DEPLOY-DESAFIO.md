# Checklist pós-deploy — Desafio de Lei Seca

> **Regra (ask #3 / Hugo):** nenhuma atualização vai ao ar sem este checklist preenchido e enviado no grupo.
> Preencha a coluna **OK?** (✅/❌) + **evidência** (print/vídeo com data-hora, ou link do log). Rode com uma
> **conta de aluno REAL** (não admin) e, sempre que possível, **dentro do iframe da Curseduca**
> (`membros.revisaoensinojuridico.com.br`) — é o ambiente real de acesso.

**Deploy:** SHA `__________`  ·  **Data/hora (BRT):** `__________`  ·  **Responsável:** `__________`

---

## 1. Smoke test do fluxo do aluno (obrigatório todo deploy)

| # | Teste | OK? | Evidência |
|---|-------|-----|-----------|
| 1.1 | **Login do aluno** pelo domínio de produção (não IP) entra sem erro (sem "Plataforma não encontrada"). | | |
| 1.2 | **Abre a trilha** do Desafio (módulo publicado aparece; dia liberado acessível). | | |
| 1.3 | **Conclui uma aula** (leitura → marca concluída) e o progresso persiste ao recarregar. | | |
| 1.4 | **Faz o quiz** da aula (responde tudo → conclui) e a resposta persiste. | | |
| 1.5 | **Ranking** do módulo abre e mostra o aluno na posição esperada. | | |
| 1.6 | **Sequência/ofensiva** reflete o esperado (fez hoje → conta; refez aula antiga → NÃO quebra). | | |

## 2. Iframe na Curseduca (P0.2) — multi-navegador

> Abrir o Desafio **embutido na Curseduca** e logar com e-mail. Repetir em cada ambiente.

| # | Ambiente | OK? | Evidência (vídeo) |
|---|----------|-----|-------------------|
| 2.1 | Chrome (desktop) | | |
| 2.2 | Edge (desktop) | | |
| 2.3 | Firefox (desktop) | | |
| 2.4 | **Chrome + bloqueador de anúncio** (uBlock/AdGuard ligado) | | |
| 2.5 | Safari (macOS/iOS) | | |
| 2.6 | **Android WebView** (celular real) | | |
| 2.7 | Cookie no iframe: DevTools → Application → Cookies → `aluno_session` com **SameSite=None, Secure, Partitioned** | | |

## 3. Resolução de tenant / login (P0.3)

| # | Teste | OK? | Evidência |
|---|-------|-----|-----------|
| 3.1 | Logar como aluno **com um admin já logado no mesmo navegador** → sem 404, sem vazar dados. | | |
| 3.2 | Nos logs do `web`, **não** aparece `⚠️ [tenant] nenhum tenant para o host "..."` (se aparecer host `0.0.0.0`/interno, o `x-forwarded-host` não está chegando). | | |
| 3.3 | `NODE_ENV=production` confirmado no container `plataforma_simulado_web` (Portainer) — senão o cookie do iframe quebra. | | |

## 4. Liberação diária (P0.4)

| # | Teste | OK? | Evidência |
|---|-------|-----|-----------|
| 4.1 | Admin → Leitura → módulo → **Aulas**: agendamento de **todos os dias restantes** (até o 30) com data/hora BRT corretas. | | |
| 4.2 | Query de conferência: `select titulo, publicacao->>'publicarEm' from simulado_documentos where pasta_id='<mod>' order by ordem;` → cada `publicarEm` = `03:0xZ` (= 00:0x BRT) do dia certo. | | |
| 4.3 | Às **00:05 BRT**, conta de teste vê o dia liberado (ou `POST /api/cron/leitura-publicar` retorna `publicadas>=1`). | | |
| 4.4 | Worker `plataforma_simulado_worker` **de pé** e com `CRON_SECRET` setado. | | |

## 5. Sincronização Curseduca (P0.1)

| # | Teste | OK? | Evidência |
|---|-------|-----|-----------|
| 5.1 | **Reconciliação:** `GET /api/cron/curseduca-reconciliar?tenant=02195fa6-...` (header `x-cron-secret`) → `faltantes: []` (diferença = 0). | | |
| 5.2 | **Ponta-a-ponta (<15 min):** incluir um e-mail de teste num grupo da Curseduca → aparece na plataforma e vê o Desafio. | | |
| 5.3 | Log de sync (`simulado_curseduca_sync_log`) das últimas 48h **sem `ok=false`**. | | |

## 6. Mensagens automáticas (P0.6)

| # | Teste | OK? | Evidência |
|---|-------|-----|-----------|
| 6.1 | **Prévia de inatividade** (Conexões → Webhooks → Logs de saída → "Prévia de inatividade"): conferir ~10 nomes contra o cadastro **antes** de qualquer disparo. | | |
| 6.2 | "Testar webhook" NÃO gera mensagem real (n8n barra `teste:true`/header `X-Webhook-Teste`). | | |
| 6.3 | Após um disparo real, **Logs de saída** mostram destinatário + mensagem corretos (nome real, não "João"). | | |

---

### Se qualquer item falhar → **não publica** (ou faz rollback pelo SHA anterior). Ver `docs/FLUXO-GIT-BRANCHES.md` e a memória de deploy.
