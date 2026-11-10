# Integração Vídeo próprio x Regras de liberação — ganchos e patches PROPOSTOS

Nada abaixo foi aplicado: os arquivos-alvo já estão modificados no working tree (ou fora do escopo desta fase). Aplicar manualmente.

## Como funciona
- Fonte da verdade: `simulado_access_grants` (regras Guru/Curseduca) por **produto**. Cada produto pode ter 1+ **cursos de vídeo**
  (`video_cursos.produto_id`); o curso `produto_id IS NULL` é o "Acervo" do tenant (onde o Estúdio cria as aulas; **não** é sincronizado por
  regra — vincule a aula/curso a um produto para liberar por regra).
- `video_matriculas_sync` = fila + estado, uma linha por `(tenant, regra, aluno, curso)` (UPSERT => idempotente). `externalRef = regra_id:aluno_id`
  (sem regra no grant usa-se `produto_id`). O aluno é identificado no serviço por `externalId = estudante_id`.
- 1ª matrícula usa `externalRef`; **renovação/alteração de prazo omite o `externalRef`** (com ele o serviço devolve `replayed` e não renova).
- Revogação: só chama o serviço se **nenhuma outra regra** ainda concede o mesmo curso (`outraRegraAindaConcede`); 404 do serviço = já revogado.
- Backoff: 30 s · 2^(n-1) com teto de 6 h e jitter ±20%; 8 tentativas; 4xx (exceto 408/429) = falha definitiva (`falhou`, visível em `GET /api/admin/video/sync`).
- Reconciliação (autocura): `POST /api/admin/video/sync?reconciliar=1[&aplicar=1]` compara grants ativos x fila (dry-run por padrão).
- Gate do aluno: `POST /api/aluno/video/playback` exige matrícula `sincronizado` + vigente (ou testador global); o serviço ainda reconfere.

## Patch 1 — gancho na liberação (`apps/web/lib/integracoes/liberacao/engine.ts`, arquivo modificado no working tree)
Uma linha no fim de `reconciliarEstudanteProduto` (cobre concessão, revogação, expiração por cron, reprocessar/pausar/cancelar regra, pois todos passam por ela):

```diff
+import { sincronizarAlunoProduto } from '@/lib/video/sync'
 ...
 async function reconciliarEstudanteProduto(svc: any, tenantId: string, estId: string, produtoId: string, agora: Date): Promise<void> {
   const tem = await temAcessoProduto(svc, tenantId, estId, produtoId, agora)
   ...
   } else {
     ...
   }
+  // Vídeo próprio: enfileira enroll/revoke dos cursos de vídeo do produto (idempotente; nunca lança; no-op sem video_empresas ativa).
+  await sincronizarAlunoProduto(tenantId, estId, produtoId, agora)
 }
```
Concessão manual de produto (`lib/produtos/conceder.ts`/assinaturas) que NÃO passa por grants: chamar `sincronizarAlunoProduto` depois de `concederItem`/`revogarItem`
quando o produto tiver cursos de vídeo; enquanto não, a reconciliação diária não cobre isso (só enxerga grants) — risco anotado.

## Patch 2 — permissões RBAC (`apps/web/lib/rbac-catalogo.ts`)
```diff
   { resource: 'liberacao', action: 'view' }, { resource: 'liberacao', action: 'manage' },
+  { resource: 'video', action: 'view' }, { resource: 'video', action: 'manage' },
```
e o rótulo no mapa de recursos (junto de `liberacao: 'Regras de liberação'`): `video: 'Vídeos (próprio)'`. Sem isso só admin/super-admin acessam (`accessCan`), o que é seguro.
Sugestão: `video:view` ao papel `professor`; `video:manage` aos admins de conteúdo.

## Patch 3 — agendamento (worker, mesmo padrão dos crons)
```
*/1 * * * *  curl -fsS -X POST -H "x-cron-secret: $CRON_SECRET" "$APP/api/admin/video/sync?limite=100"
17 3 * * *  curl -fsS -X POST -H "x-cron-secret: $CRON_SECRET" "$APP/api/admin/video/sync?reconciliar=1&aplicar=1"
```
Começar com a reconciliação **sem** `aplicar=1` (dry-run) e conferir os números.

## Patch 4 — CSP/`proxy.ts` (front, fase 4.3; arquivo modificado)
Liberar a origem pública da video-api em `connect-src`, `media-src` e `img-src` (e `blob:` em `media-src` para hls.js), e `https://<s3 Hetzner>` em `media-src`/`img-src` (segmentos e poster assinados). Manter `frame-ancestors` do Curseduca; `allow="fullscreen"` no iframe.

## Passos manuais para ligar um tenant (piloto)
1. Aplicar `supabase/migrations/20261110010000_video_proprio.sql` (SQL Editor).
2. No serviço: criar a empresa (slug = slug do tenant), `allowedDomains` com TODOS os domínios do tenant, `accessEndpointEnabled=true`, admin da empresa e chave de integração (`access:manage`).
3. Env no web: `VIDEO_API_URL`, `VIDEO_PUBLIC_API_URL`, `VIDEO_INTEGRATION_KEY` (ou `__<SLUG>`), `VIDEO_ADMIN_EMAIL`/`VIDEO_ADMIN_PASSWORD`.
4. `insert into video_empresas (tenant_id, slug, ativo, acesso_habilitado) values ('<tenant>', '<slug>', true, true);`
5. Vincular um curso a um produto: `insert into video_cursos (tenant_id, course_id, module_id, produto_id, titulo) values (...)` (curso/módulo criados no serviço) — UI de vínculo é fase 4.5.
6. Agendar o job (Patch 3) e aplicar o Patch 1.
