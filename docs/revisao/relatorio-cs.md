# Relatório CS — Membros · Grupos · Calendário · Campanhas · Avisos

Legenda de origem: R = lido do banco (tabela.coluna) · C = calculado no servidor com dados reais · F = constante de produto/texto fixo legítimo · X = fictício/exemplo.
Migration do bloco: `supabase/migrations/20261112040000_cs_membros_grupos_calendario_campanhas_avisos.sql` (aplicada). Nenhuma migration nova nesta rodada.
Verificação feita: `npx tsc --noEmit` (limpo nos meus arquivos) e script Node SELECT-only contra o banco real. NÃO verifiquei em navegador, nem claro/escuro/responsivo, nem `next build`.

## Dependências do banco verificadas (SELECT real, service role)
| Tabela | Colunas usadas | Resultado | Migration que resolve se faltar |
|---|---|---|---|
| simulado_estudantes | id, nome, email, cpf, telefone, deletado, tenant_id, created_at, emails_secundarios, acesso_bloqueado, bloqueado_em, ultimo_acesso_em | existe | 20261112040000 (3 últimas) |
| simulado_grupos | id, nome, pai_id, is_mestre, codigo_externo, deletado, validade_tipo, validade_meses, validade_ate | existe | 20261112040000 (validade_*), 20260718000001/2 |
| simulado_grupo_membros | id, estudante_id, grupo_id, tenant_id, expira_em | existe | 20261031040000 (expira_em) |
| simulado_integracao_mapeamentos | id, grupo_id, provider, fonte_ref, fonte_nome, ativo, atualizado_em | existe | 20260715000001 |
| simulado_produto_itens / simulado_produtos | id, produto_id, item_id, tipo_item, ativo, tenant_id / id, nome, ativo, ordem | existe | 20261030000000/2 |
| simulado_eventos_calendario | id, titulo, tipo, data, hora, grupo_id, link, lembrete_1h, lembrete_enviado_em | existe | 20261112040000 |
| simulado_campanhas, simulado_campanha_api_config | todas as colunas usadas | existe | 20261112040000 |
| simulado_banners | id, tipo, titulo, mensagem, imagem_url, link, cor, ativo, ordem, local, grupo_id, ate | existe | 20261112040000 (local/grupo_id/ate) |
| simulado_tenants, simulado_home_snapshot, simulado_notificacoes, simulado_audit_logs | colunas usadas | existe | — |
| simulado_cronograma_adaptativo_plano / _plano_meta / _meta | id, estudante_id, fixado, arquivada, criado_em, plano_id, meta_id, estado, estrelas, atualizado_em | existe | 20261105050000 |

Tudo existe hoje. Mesmo assim, tudo que depende de migration é tolerante: `/api/aluno/login` (consulta de bloqueio e carimbo de último acesso são queries à parte cujo erro é ignorado; nunca lança), `lib/home/snapshot.ts` (eventos em try/catch; banners relêem sem `grupo_id/ate` se der erro; pop-ups idem), Início antiga (relê no formato antigo), `getSessaoAluno` (`alunoBloqueado` devolve false em erro), listas de Membros/Avisos (refazem sem as colunas novas e mostram aviso com o nome da migration), Calendário/Campanhas (estado vazio com aviso).

## a) Inventário (origem antes → depois)

### Membros (`/admin/revisao/membros`)
| Elemento | Antes | Depois | Fonte |
|---|---|---|---|
| KPI membros com acesso | C | C | count `simulado_estudantes` (não deletado, `acesso_bloqueado=false`) |
| KPI entraram nesta semana | C | C | count `ultimo_acesso_em >= now-7d` |
| KPI sem acesso há 7 dias | C | C | count `ultimo_acesso_em < now-7d`, não bloqueado |
| KPI bloqueados | C | C | count `acesso_bloqueado=true` |
| Abas Todos/Ativos/Sem acesso/Bloqueados + contagens | C | C | mesmas contagens (cache 120 s) |
| Busca (nome/e-mail/CPF/telefone/e-mail secundário) | R | R | `simulado_estudantes` (movida para ACIMA das abas, como o print) |
| Lista: nome, e-mail, nº de grupos, situação, último acesso | R/C | R/C | `simulado_estudantes`, `simulado_grupo_membros` (count dos alunos da página); texto relativo calculado no servidor |
| Ordenação / paginação | R | R | `?sort/?dir/?page/?pp` → `.order().range()` + count |
| Painel: nome, e-mail, último acesso, situação | R | R | `simulado_estudantes` |
| Painel: grupos (nome, validade, origem) | R | R | `simulado_grupo_membros.expira_em`, `simulado_grupos.validade_*`, `simulado_integracao_mapeamentos` |
| Painel: 3 métricas | R | R | `simulado_cronograma_adaptativo_*`; "—" se sem plano. "do Extensivo lido" virou "do plano de estudos concluído" (fonte real) |
| Select Liberar outro curso / Grupo de acesso | R | R | `simulado_grupos` (sem pastas, sem pasta "Encerrados", sem os que o aluno já tem) |
| Rótulos dos botões, avisos | F | F | — |

### Grupos (`/admin/revisao/grupos`)
| Elemento | Antes | Depois | Fonte |
|---|---|---|---|
| KPIs grupos / vínculos / vencendo 30 d / sem curso | C | C | SQL em `simulado_grupo_membros` + `simulado_produto_itens` (cache 60 s) |
| Pastas laterais e contagens | R/C | R/C | `simulado_grupos.is_mestre/pai_id` |
| Tabela: nome, pasta, vencendo, origem, alunos, acesso vale, cursos | R/C | R/C | `simulado_grupos`, agregado SQL, `simulado_integracao_mapeamentos`, `simulado_produto_itens`+`simulado_produtos` |
| Busca / ordenação (nome) / paginação | R | R | server-side |
| Form criar / editar / turma | R | R | `simulado_grupos`, `simulado_produtos` ativos |
| Opções de validade | F | F | modelo de dados |

### Calendário (`/admin/revisao/calendario`)
| Elemento | Antes | Depois | Fonte |
|---|---|---|---|
| Grade mês/semana, eventos, cor por tipo | R | R | `simulado_eventos_calendario` |
| Neste dia + grupo | R | R | idem + `simulado_grupos.nome` |
| Select Para quem | R | R | `simulado_grupos` |
| Tipos | F | F | CHECK da tabela |
| Lembrete 1 h antes | só flag | cron real (in-app) | `/api/cron/eventos-lembrete` |
| Início do aluno | ok | ok | `lib/home/snapshot.ts` |
| Dashboard admin | — | confirmado | `lib/admin/revisao/dashboard.ts` seleciona `id,data,hora,titulo,tipo,grupo_id` — bate com o esquema |

### Campanhas — E-mail
| Elemento | Antes | Depois | Fonte |
|---|---|---|---|
| Chips de público | R | R | `simulado_grupos`, `simulado_estudantes` |
| N alunos vão receber | C com dupla contagem | C distinto | SQL único com EXISTS: só com e-mail, sem bloqueados, vínculo não vencido |
| Modelos de e-mail | F | F | constantes de produto (`cs-tipos.ts`); não existe tabela de modelos de campanha (`tenant_mensagens` é de bloqueio/liberação de simulado) |
| Prévia: plataforma | R | R | `simulado_tenants.nome` |
| Prévia: nome "Camila" | X | R | 1º nome do admin logado |
| Prévia: "{curso}" fixo | X | R | 1º produto ativo ou "seu curso" |
| Últimos envios | R | R | `simulado_campanhas`; "—" quando não enviada |
| Aviso de envio ligado/desligado | F | C | `CAMPANHA_WEBHOOK_URL` |
| Enviar teste | bloqueado | real se ligado | só para o e-mail do admin |
| Enviar agora / Agendar | registra | registra + envio por cron | status na_fila/agendada → enviando → enviada/erro |

### Campanhas — Mensagem por API
| Elemento | Antes | Depois | Fonte |
|---|---|---|---|
| Conexão | R | R | `simulado_campanha_api_config` |
| Serviços / modelos | F | F | constantes |
| Estimativa | C dupla | C distinto | só com celular; removido "aceitou receber" (não há consentimento) |
| Prévia: nome | X | R | admin logado |
| Prévia: hora 18:00 | X | R | hora do campo "Enviar em" |
| Últimos disparos | R | R | `simulado_campanhas` |

### Avisos (`/admin/revisao/avisos`)
| Elemento | Antes | Depois | Fonte |
|---|---|---|---|
| Linhas | R | R | `simulado_banners` (+local/grupo_id/ate; legado deduz de `tipo`; ate cai p/ `tema.banner_destaques[id].agendaFim`) |
| Filtro/busca/ordem/paginação | R | R | server-side |
| Início NOVA | parcial | ok | filtra data/grupo; pop-ups agora exibidos |
| Início ANTIGA + pop-up | não filtrava | filtra data e grupo | `app/aluno/(portal)/page.tsx` |

## b) O que foi trocado nesta rodada
1. Estimativa de público distinta (sem dupla contagem), por canal.
2. Prévias sem dados fictícios.
3. Cron `app/api/cron/eventos-lembrete/route.ts` (CRON_SECRET, dry-run padrão, `?aplicar=1`): notificação in-app 1 h antes, idempotente. Não envia e-mail/WhatsApp.
4. Bloqueio derruba sessão aberta (`lib/aluno-bloqueio.ts`, cache 60 s, em `getSessaoAluno`); no login a checagem ocorre depois de validar CPF/telefone.
5. Envio de campanha: `lib/admin-revisao/campanha-envio.ts` + `app/api/cron/campanhas-enviar/route.ts`. POST HMAC-SHA256 (`x-signature`) para `CAMPANHA_WEBHOOK_URL` (fluxo n8n), lotes de 200. DESLIGADO até configurar (`CAMPANHA_WEBHOOK_URL`; segredo opcional `CAMPANHA_WEBHOOK_SECRET`). Nada foi enviado em nenhum teste.
6. Pop-up na Início nova (`carregarPopupsHome` + `BannersPortal`).
7. Busca de Membros acima das abas.

Investigação de provedor: nenhum Resend/SMTP/Nodemailer/SendGrid/Mailgun/Z-API/Twilio/Meta em `apps/web`. Existem webhooks de saída/automações (HTTP, n8n) e notificações in-app; por isso o envio é via fluxo HTTP configurável.

## c) Lacunas restantes
- Envio real depende de criar o fluxo n8n, setar as envs e agendar o cron. Não testado ponta a ponta. Métricas de abertura/clique/entrega/leitura ficam "—" (sem callback do provedor).
- Teste por celular (API) indisponível: admin não tem celular no cadastro.
- Os dois crons novos não estão no agendador.
- Último acesso só é gravado em `/api/aluno/login` (única porta que cria `aluno_session`; embed/identify e handoff não criam sessão de portal). Quem usa o cookie de 7 dias mantém a data do último login.
- Faixa de avisos e Destaques da semana entram no carrossel do Início; não há faixa/bloco próprio no portal.
- "Reenviar senha" não existe (aluno sem senha); substituído por "Copiar link de acesso" (`/aluno`). Sem e-mail de boas-vindas.
- Modelos de mensagem são constantes (sem tabela por tenant).
- Importação de lista: máx. 200 por vez.
- Gravar cursos do grupo mexe em `simulado_produto_itens` (catálogo usado pela liberação por regra de venda) — validar com o fluxo Guru.

## d) Divergências vs print (09, 10, 12, 13, 14, 15 reconferidos)
- 09: busca movida acima das abas; abas em sublinhado (regra do projeto) e não pílula; e-mail sem máscara; Reenviar senha → Copiar link; métrica 1 renomeada.
- 10: igual; acrescentei busca/ordenar/paginar.
- 12: acrescentei abas Mês/Semana e "Hoje" (pedido do coordenador).
- 13/14: abas sem ícones (RevisaoAbas não aceita ícone; ui.tsx proibido); aviso de provedor acrescentado; hora e nomes da prévia agora reais.
- 15: acrescentei coluna de excluir, busca e filtro; nota extra com link do editor completo.

Ações de docs/ACOES.md: memnew/memimp/memcancel/memsave/memimpgo/membloq/memdel/memrmg/libera/selal/tab, newgrp/dupgrp/grpsave/grpcancel, calm/day/evk/evadd/evdel/sw, para/modelo/mailsend/mailagenda/ask/unconfirm, apicon/wapara/wamod/wasend, ban/bansave/bancancel implementadas (envio só quando ligado); mailteste só quando ligado; "Reenviar senha" é lacuna.

## Diff exato das edições em arquivos existentes
### apps/web/app/api/aluno/login/route.ts
```diff
--- a/apps/web/app/api/aluno/login/route.ts
+++ b/apps/web/app/api/aluno/login/route.ts
@@ -85,2 +85,11 @@ export async function POST(request: NextRequest) {
 
+  // CS › Membros: acesso bloqueado pelo admin (migração 20261112040000). Só depois de validar CPF/telefone (não revela o bloqueio a quem não prova a identidade). Consulta À PARTE e tolerante:
+  // sem a coluna (migração pendente) o erro é ignorado e o login segue como sempre.
+  try {
+    const { data: bl, error: blErr } = await supabase.from('simulado_estudantes').select('acesso_bloqueado').eq('id', estudante.id).maybeSingle()
+    if (!blErr && (bl as { acesso_bloqueado?: boolean } | null)?.acesso_bloqueado === true) {
+      return NextResponse.json({ message: 'Seu acesso está bloqueado. Fale com o suporte.' }, { status: 403 })
+    }
+  } catch { /* coluna ausente → não bloqueia */ }
+
   // Exibe o e-mail que a pessoa REALMENTE usou para entrar (pode ser um secundário) — o acesso
@@ -89,2 +98,4 @@ export async function POST(request: NextRequest) {
   await criarSessaoAluno({ estudanteId: estudante.id, tenantId, nome: estudante.nome ?? 'Aluno', email: emailLogin })
+  // CS › Membros: carimba o último acesso (alimenta "Sem acesso há dias"). Best-effort; sem a coluna é no-op.
+  try { await supabase.from('simulado_estudantes').update({ ultimo_acesso_em: new Date().toISOString() }).eq('id', estudante.id) } catch { /* coluna ausente */ }
   // Auditoria: acesso do aluno à plataforma (portal). ator_id fica no entidade_id p/ evitar FK.
```
### apps/web/lib/home/snapshot.ts
```diff
--- a/apps/web/lib/home/snapshot.ts
+++ b/apps/web/lib/home/snapshot.ts
@@ -102,2 +102,23 @@ export async function computarHome(svc: SupabaseClient, tenantId: string, estId:
   } catch { /* sem plano adaptativo → calendário em branco */ }
+
+  // CS › Calendário de eventos (migração 20261112040000): eventos da SEMANA para "Todos" ou para os grupos do aluno.
+  try {
+    const { data: evs } = await svc.from('simulado_eventos_calendario').select('titulo, tipo, data, hora, grupo_id, link')
+      .eq('tenant_id', tenantId).gte('data', inicioIso).lte('data', fimIso).order('data', { ascending: true }).order('hora', { ascending: true }).limit(200)
+    const lista = (evs ?? []) as { titulo: string; tipo: string; data: string; hora: string; grupo_id: string | null; link: string | null }[]
+    if (lista.length) {
+      let meus = new Set<string>()
+      if (lista.some((e) => e.grupo_id)) {
+        const { data: gm } = await svc.from('simulado_grupo_membros').select('grupo_id').eq('tenant_id', tenantId).eq('estudante_id', estId).limit(500)
+        meus = new Set(((gm ?? []) as { grupo_id: string }[]).map((g) => g.grupo_id))
+      }
+      const TAG: Record<string, [string, HomeTagKind]> = { live: ['Live', 'pink'], aula: ['Aula ao vivo', 'blue'], sim: ['Simulado', 'gold'], mentoria: ['Mentoria', 'green'], prazo: ['Prazo', 'red'] }
+      for (const e of lista) {
+        if (e.grupo_id && !meus.has(e.grupo_id)) continue
+        const [tag, kind] = TAG[e.tipo] ?? ['Evento', 'brand']
+        ;(agendaCal[String(e.data).slice(0, 10)] ??= []).push({ hora: String(e.hora).slice(0, 5), tag, kind, titulo: e.titulo, contexto: null, acao: e.link ? 'Abrir' : undefined, href: e.link ?? undefined })
+      }
+      for (const k of Object.keys(agendaCal)) agendaCal[k].sort((a, b) => (a.hora ?? '99').localeCompare(b.hora ?? '99'))
+    }
+  } catch { /* sem a tabela de eventos → só as metas do cronograma */ }
   const diasCal: HomeDiaCal[] = semanaDias.map((d) => { const iso = isoDe(d); return { iso, wd: WD[d.getUTCDay()], dia: d.getUTCDate(), hoje: iso === hojeIsoCal, dots: (agendaCal[iso] ?? []).map((it) => it.kind) } })
@@ -145,18 +166,54 @@ export async function marcarHomeDesatualizado(svc: SupabaseClient, tenantId: str
 /** BANNERS da Início (dado de TENANT, igual p/ todos) — cacheados por tenant (remember), não vão ao snapshot. */
-export async function carregarBannersHome(svc: SupabaseClient, tenantId: string): Promise<HomeDestaque[]> {
-  if (!tenantId) return []
-  return remember(`home-banners:${tenantId}`, 120, async () => {
+// CS › Avisos e pop-ups (migração 20261112040000): respeita "sai do ar em" (`ate`) e "para quem" (`grupo_id`,
+// filtrado por aluno no READ quando `estId` é informado). Sem a migração, lê as colunas antigas e segue igual.
+type BannerRaw = { id?: string; tipo: string | null; titulo: string | null; mensagem: string | null; imagem_url: string | null; link: string | null; cor: string | null; grupo_id?: string | null; ate?: string | null }
+
+/** Banners/pop-ups ativos do tenant (cache 120 s) já filtrados por "sai do ar" e por grupo (quando `estId`). */
+async function carregarBannersVisiveis(svc: SupabaseClient, tenantId: string, estId?: string): Promise<BannerRaw[]> {
+  const todos = await remember<BannerRaw[]>(`home-banners:${tenantId}`, 120, async () => {
     try {
-      const { data: banRows } = await svc.from('simulado_banners')
-        .select('tipo, titulo, mensagem, imagem_url, link, cor')
+      const ler = (cols: string) => svc.from('simulado_banners').select(cols)
         .eq('tenant_id', tenantId).eq('ativo', true)
         .order('ordem', { ascending: true }).order('criado_em', { ascending: false })
-      return ((banRows ?? []) as any[])
-        .filter((b) => b.tipo !== 'popup')
-        .map((b): HomeDestaque => ({
-          eyebrow: '', titulo: b.titulo ?? '', subtitulo: b.mensagem ?? '', chips: [],
-          cta: { rotulo: 'Abrir', url: b.link ?? '#' }, imagem: b.imagem_url ?? null, cores: b.cor ?? undefined,
-        }))
-    } catch { return [] as HomeDestaque[] }
+      let r: any = await ler('id, tipo, titulo, mensagem, imagem_url, link, cor, grupo_id, ate')
+      if (r.error) r = await ler('id, tipo, titulo, mensagem, imagem_url, link, cor')
+      return ((r.data ?? []) as BannerRaw[])
+    } catch { return [] as BannerRaw[] }
+  })
+  const agora = Date.now()
+  let meusGrupos: Set<string> | null = null
+  if (estId && todos.some((b) => b.grupo_id)) {
+    try {
+      const { data } = await svc.from('simulado_grupo_membros').select('grupo_id').eq('tenant_id', tenantId).eq('estudante_id', estId).limit(500)
+      meusGrupos = new Set(((data ?? []) as { grupo_id: string }[]).map((g) => g.grupo_id))
+    } catch { meusGrupos = new Set() }
+  }
+  return todos
+    .filter((b) => !b.ate || new Date(b.ate).getTime() >= agora)
+    .filter((b) => !b.grupo_id || (meusGrupos?.has(b.grupo_id) ?? false))
+}
+
+export async function carregarBannersHome(svc: SupabaseClient, tenantId: string, estId?: string): Promise<HomeDestaque[]> {
+  if (!tenantId) return []
+  return (await carregarBannersVisiveis(svc, tenantId, estId))
+    .filter((b) => b.tipo !== 'popup')
+    .map((b): HomeDestaque => ({
+      eyebrow: '', titulo: b.titulo ?? '', subtitulo: b.mensagem ?? '', chips: [],
+      cta: { rotulo: 'Abrir', url: b.link ?? '#' }, imagem: b.imagem_url ?? null, cores: b.cor ?? undefined,
+    }))
+}
+
+/** POP-UPS ao entrar (tipo 'popup') para a Início nova — mesmos filtros de data/grupo; estilo/frequência vêm de
+ *  tema.banner_destaques (editor completo de banners). Renderizados por <BannersPortal> só com os pop-ups. */
+export async function carregarPopupsHome(svc: SupabaseClient, tenantId: string, estId: string): Promise<import('@/components/aluno/banners-portal').BannerPortal[]> {
+  if (!tenantId) return []
+  const pops = (await carregarBannersVisiveis(svc, tenantId, estId)).filter((b) => b.tipo === 'popup' && b.id)
+  if (!pops.length) return []
+  const tema = await remember<Record<string, any>>(`home-popups-tema:${tenantId}`, 120, async () => {
+    try { const { data } = await svc.from('simulado_tenants').select('tema').eq('id', tenantId).maybeSingle(); return ((data?.tema as any)?.banner_destaques ?? {}) as Record<string, any> } catch { return {} }
   })
+  return pops.map((b) => ({
+    id: b.id as string, tipo: 'popup' as const, titulo: b.titulo, mensagem: b.mensagem, imagem_url: b.imagem_url, link: b.link, cor: b.cor,
+    estilo: tema[b.id as string]?.popupEstilo ?? null, pontas: tema[b.id as string]?.popupPontas ?? null, freq: tema[b.id as string]?.freq ?? null,
+  }))
 }
```
### apps/web/app/aluno/(portal)/nova/inicio/page.tsx
```diff
--- a/apps/web/app/aluno/(portal)/nova/inicio/page.tsx
+++ b/apps/web/app/aluno/(portal)/nova/inicio/page.tsx
@@ -9,3 +9,4 @@ import { createAdminClient } from '@/lib/supabase/server'
 import type { HomeDestaque } from '@/components/brand/interna/home/types'
-import { carregarHome, carregarBannersHome, type HomeDados } from '@/lib/home/snapshot'
+import { carregarHome, carregarBannersHome, carregarPopupsHome, type HomeDados } from '@/lib/home/snapshot'
+import { BannersPortal } from '@/components/aluno/banners-portal'
 import { BannerInicio } from './_banner-inicio'
@@ -42,3 +43,5 @@ export default async function InicioPage() {
   }
-  const realBanners = sessao ? await carregarBannersHome(svc, sessao.tenantId) : []
+  const realBanners = sessao ? await carregarBannersHome(svc, sessao.tenantId, sessao.estudanteId) : []
+  // Pop-ups ao entrar (CS › Avisos e pop-ups): a Início nova não os exibia.
+  const popups = sessao ? await carregarPopupsHome(svc, sessao.tenantId, sessao.estudanteId) : []
   const destaques: HomeDestaque[] = [bomEstudo, ...realBanners]
@@ -70,2 +73,3 @@ export default async function InicioPage() {
       {/* Banner = MESMO carrossel da Início padrão; "Bom estudo" entra como um slide */}
+      {popups.length > 0 && <BannersPortal banners={popups} />}
       <BannerInicio destaques={destaques} />
```
### apps/web/app/aluno/(portal)/page.tsx
```diff
--- a/apps/web/app/aluno/(portal)/page.tsx
+++ b/apps/web/app/aluno/(portal)/page.tsx
@@ -56,7 +56,10 @@ export default async function AlunoHome({ searchParams }: { searchParams: Promis
     remember(`aluno-home-tenant:${sessao!.tenantId}`, 120, async () => {
-      const [{ data: banRows }, { data: tenantRow }] = await Promise.all([
+      const [banRes, { data: tenantRow }] = await Promise.all([
         // Mesma ordenação do console (ordem asc, empate por criado_em DESC) para o carrossel bater com a lista de Avisos.
-        svc.from('simulado_banners').select('id, tipo, titulo, mensagem, imagem_url, link, cor').eq('tenant_id', sessao!.tenantId).eq('ativo', true).order('ordem', { ascending: true }).order('criado_em', { ascending: false }),
+        svc.from('simulado_banners').select('id, tipo, titulo, mensagem, imagem_url, link, cor, grupo_id, ate').eq('tenant_id', sessao!.tenantId).eq('ativo', true).order('ordem', { ascending: true }).order('criado_em', { ascending: false }),
         svc.from('simulado_tenants').select('tema').eq('id', sessao!.tenantId).maybeSingle(),
       ])
+      // CS › Avisos (grupo_id/ate, migração 20261112040000): se a coluna não existir, relê no formato antigo.
+      let banRows: any[] | null = banRes.data as any[] | null
+      if (banRes.error) banRows = (await svc.from('simulado_banners').select('id, tipo, titulo, mensagem, imagem_url, link, cor').eq('tenant_id', sessao!.tenantId).eq('ativo', true).order('ordem', { ascending: true }).order('criado_em', { ascending: false })).data as any[] | null
       return { banRows: banRows ?? [], tema: (tenantRow?.tema ?? null) as any }
@@ -65,3 +68,13 @@ export default async function AlunoHome({ searchParams }: { searchParams: Promis
   const { acs, sessAll, sims, visual, grupoPorSimAll } = base
-  const banRows = tenantBundle.banRows
+  // Avisos: "sai do ar" (ate) e "para quem" (grupo_id). Vale também para o pop-up (BannersPortal recebe estes mesmos itens).
+  let banRows = tenantBundle.banRows as any[]
+  {
+    const agoraMs = Date.now()
+    banRows = banRows.filter((b) => !b.ate || new Date(b.ate).getTime() >= agoraMs)
+    if (banRows.some((b) => b.grupo_id)) {
+      const { data: gm } = await svc.from('simulado_grupo_membros').select('grupo_id').eq('tenant_id', sessao!.tenantId).eq('estudante_id', estId).limit(500)
+      const meus = new Set(((gm ?? []) as { grupo_id: string }[]).map((x) => x.grupo_id))
+      banRows = banRows.filter((b) => !b.grupo_id || meus.has(b.grupo_id))
+    }
+  }
   const tenantRow = { tema: tenantBundle.tema } as { tema: any }
```
### apps/web/lib/aluno-session.ts
```diff
--- a/apps/web/lib/aluno-session.ts
+++ b/apps/web/lib/aluno-session.ts
@@ -3,2 +3,3 @@ import { cookies } from 'next/headers'
 import { lerSessaoImpersonation } from '@/lib/impersonation/session'
+import { alunoBloqueado } from '@/lib/aluno-bloqueio'
 
@@ -78,2 +79,4 @@ export async function getSessaoAluno(): Promise<AlunoSession | null> {
       if (payload.estudanteId && payload.tenantId) {
+        // CS › Membros: aluno bloqueado perde a sessão já aberta (o cookie dura 7 dias).
+        if (await alunoBloqueado(String(payload.estudanteId))) return null
         return {
```


---

# Rodada 2 — Membros reescrito (ficha completa) + verificação no navegador

Testado no dev server (localhost:3000), com a conta de teste do coordenador (sessão reaproveitada do storage state; nenhuma credencial copiada), plataforma Revisão, Playwright headless 1500x950 e 800x900. Screenshots em `C:\Users\joooa\AppData\Local\Temp\claude\c--Users-joooa-Downloads-Plataforma-Simulado\a363c8ff-e76e-4675-9e73-eac17d5ca3df\scratchpad\` (prefixos m-, g-, c-, e-, a-, v-).

## O que mudou em Membros
- Tela client-driven: `membros-app.tsx` (lista, abas, busca com debounce, paginação, ordenação, seleção instantânea, gaveta no estreito, URL via `history.replaceState`). Lista por `GET /api/admin/revisao/membros`; ficha por `GET /api/admin/revisao/membros/[id]?aba=`; ações por `POST` nas mesmas rotas (rota de API em vez de server action por causa do landmine de domínio custom). Cache de 30 s por aba no servidor (`remember`) e cache por aba no cliente; invalidado após qualquer ação.
- Ficha com 8 abas (sublinhado): Resumo, Cadastro, Acessos, Plano de estudos, Desempenho, Leitura, Atendimento, Histórico. Skeleton enquanto carrega, estado de erro com "Tentar de novo", vazio honesto por seção.
- Paginação: Primeira / Anterior / números / Próxima / Última, "Por página" (5/10/25/50), contador "Mostrando a–b de N", spinner e opacidade durante o carregamento.
- Removidos: `membros-tabela.tsx`, `membro-painel.tsx`, `busca-membros.tsx` (substituídos).
- Bug corrigido nesta rodada: `form` do Cadastro agora é `noValidate` (a validação nativa do navegador impedia a nossa mensagem); constantes de cor do calendário movidas para `lib/admin-revisao/cs-estilos.ts` (importar constante de um módulo `'use client'` para um server component devolve referência, não o objeto: as cores dos eventos ficariam vazias); seletor de público das campanhas virou busca (havia 153 chips de grupo).

## Mapa de dados da ficha (origem R = banco, C = calculado no servidor)
| Aba | Campo | Origem | Tabela.coluna |
|---|---|---|---|
| Cabeçalho | nome, e-mail, situação, último acesso | R/C | `simulado_estudantes.nome/email/acesso_bloqueado/ultimo_acesso_em` |
| Resumo | Plano concluído %, metas na semana, média de estrelas | C | `simulado_cronograma_adaptativo_plano`, `_plano_meta`, `_meta.estado/estrelas/atualizado_em` |
| Resumo | Simulados feitos, nota média | C | `simulado_sessoes_prova` (finalizada, não teste, não deletada) |
| Resumo | Tempo de estudo 30 d | C | `simulado_tempo_estudo.segundos` |
| Resumo | Grupos, produtos ativos | C | `simulado_grupo_membros`, `acessoEfetivoDoEstudante` |
| Resumo | Dúvidas aguardando, requerimentos abertos | C | `simulado_duvidas.status`, `simulado_requerimentos.status` |
| Resumo | Gamificação (nível, XP, liga, sequência) | R | `simulado_gamificacao_estudante` |
| Resumo | Conta (cadastro, classificação, origem, bloqueio) | R | `simulado_estudantes.created_at/classificacao/origem_provider/bloqueado_em` |
| Cadastro | nome, e-mail, CPF (mascarado por perfil), telefone, nascimento, classificação, matrícula externa, e-mails secundários, user_id | R | `simulado_estudantes.*`; edição via `editarEstudanteAction` (auditoria, duplicidade de e-mail) |
| Acessos | grupos + validade + origem | R | `simulado_grupo_membros.expira_em`, `simulado_grupos.validade_*`, `simulado_integracao_mapeamentos` |
| Acessos | produtos liberados | R/C | `simulado_access_grants` + `simulado_assinaturas` (via `acesso/aluno-efetivo`) |
| Acessos | assinaturas Guru/Curseduca/manual | R | `simulado_assinaturas.*` + `simulado_produtos.nome` |
| Acessos | matrículas em simulados | R | `simulado_matriculas.*` + `simulado_simulados.titulo` |
| Plano | plano, % , metas por tipo, por semana, atrasadas | C | plano + plano_meta + meta (atrasada = não concluída com `data_prevista` < hoje BRT) |
| Desempenho | feitos, média, melhor, andamento, sessões recentes, posição | R/C | `simulado_sessoes_prova` |
| Desempenho | acerto por disciplina (últimos 60 simulados) | C | `simulado_respostas_objetivas` → `simulado_questoes.disciplina_id` → `simulado_disciplinas.nome` |
| Leitura | documentos, progresso, tempo, concluídos, último ponto | R/C | `simulado_leitura_progresso`, `simulado_leitura_ultimo_ponto`, `simulado_documentos.titulo` |
| Leitura | tempo por frente 30 d | C | `simulado_tempo_estudo` |
| Atendimento | dúvidas / requerimentos / reportes de questão | R | `simulado_duvidas`, `simulado_requerimentos`, `simulado_feedbacks_questao` |
| Histórico | logins no portal, auditoria do aluno, notificações | R | `simulado_audit_logs` (entidade `aluno_portal`/entidade_id), `simulado_notificacoes` |

Observações: simulado_duvidas e a tabela de impersonation não retornaram colunas (primeira vazia; `simulado_impersonation_sessions` não existe no banco -> histórico de "ver como aluno" NÃO incluído). Questões discursivas/correção, anotações e grifos do leitor, cadernos e ranking por simulado não foram incluídos na ficha (existem na ficha antiga, link "Ficha antiga" no painel).

## Matriz: controle → testado no navegador → resultado
| Controle | Testado | Resultado |
|---|---|---|
| Clique em 10 nomes da lista (Membros) | sim | painel trocou nas 10 vezes, 40–330 ms após o 1º carregamento; URL ganhou `?sel=` sem recarregar (1º clique ~15 s = compilação a frio do dev) |
| Abas da lista Todos/Ativos/Sem acesso/Bloqueados | sim | 21.272 / 18.435 / 2.837 / 0 (soma confere); Bloqueados mostra "Nenhum membro encontrado" |
| 8 abas do painel | sim | todas carregam dados reais (~1,1–2 s, depois cache); vazios honestos |
| Paginação: página 2, última, primeira, próxima, anterior | sim | 11–20, 21.271–21.272, 1–10, 11–20, 1–10 |
| Por página 25 | sim | 25 linhas |
| Busca (nome, e-mail, vazio) | sim | "silva" 2.067; e-mail exato 1; "zzzzqqqq" -> estado vazio com o termo |
| Ordenar por nome | sim | muda a 1ª linha |
| Estado de erro da ficha + "Tentar de novo" | sim (rota abortada) | mostra erro e recupera |
| Validação do Cadastro (e-mail inválido) | sim | "Confira o e-mail." sem enviar |
| Gaveta em 800 px | sim | painel oculto, abre ao clicar, fecha no X |
| Formulário Adicionar membro (abrir, validar nome) | sim | toast "Escreva o nome" |
| Formulário Importar lista (abrir, botão desabilitado sem lista/grupo) | sim | ok |
| Aba Cadastro mostra botão Salvar | sim | ok |
| Grupos: KPIs, pastas, busca (55 resultados p/ "passaporte"), pasta lateral (3), ordenar, link Alunos | sim | ok |
| Grupos: Criar grupo (abrir, validar, trocar validade, cancelar), Turma a partir de outra (148 opções, preenche), Editar (abre/cancela) | sim | ok |
| Calendário: mês anterior/próximo, Hoje, clicar dia, chips de tipo, botão Criar desabilitado sem título, switch de lembrete, aba Semana, semana anterior/próxima | sim | ok |
| Campanhas e-mail: estimativa, chip, modelos, prévia, Enviar agora -> confirmação -> Voltar, Agendar desabilitado sem data, teste ("envio desligado") | sim | ok |
| Campanhas API: aba, status "Não conectada", modelo, Disparar desabilitado, troca de aba | sim | ok |
| Avisos: linhas, abrir/cancelar form, Publicar desabilitado vazio, filtro por local (1 pop-up), busca vazia | sim | ok |
| Erros de rede/console em todo o percurso | sim | nenhum PAGEERROR nem HTTP >= 400 |

## NÃO testado no navegador (mutações em dados reais — a política de permissões do ambiente negou criar um aluno de teste, então não tentei contornar)
- Sucesso de: adicionar membro, importar lista, salvar Cadastro, bloquear/desbloquear, remover, tirar do grupo, liberar acesso.
- Sucesso de: criar/editar grupo, criar/apagar evento (por isso as cores dos eventos na grade não foram vistas com evento real), registrar campanha, salvar conexão da API, publicar/ligar/apagar aviso.
- Bloqueio derrubando a sessão do aluno e `/api/aluno/login` com aluno bloqueado; pop-up na Início do aluno; lembrete e envio por cron.
- Claro/escuro e Início do aluno (snapshot) em navegador.
Essas ações foram revisadas só por leitura de código (todas com `checkPermission` e auditoria nas actions existentes) e tsc limpo.

## Lacunas desta rodada
- Histórico de "ver como aluno" (impersonation) fora da ficha: a tabela `simulado_impersonation_sessions` não existe neste banco (PGRST205); o log fica em outra estrutura.
- A ficha não mostra desempenho de discursivas, anotações/grifos, cadernos nem ranking.
- A 1ª abertura de cada aba leva ~1–2 s (consultas reais); depois cache de 30 s.
