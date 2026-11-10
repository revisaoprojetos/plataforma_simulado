# Segurança

## Segredos
- `.env` nunca vai ao git (`.gitignore`); só `.env.example` com nomes. gitleaks no pre-commit e no CI.
- Credenciais S3 com permissão mínima (somente o bucket do projeto). Rotacionar se vazarem.
- Segredos em produção via variáveis do orquestrador/secret manager, não em imagens.

## Autenticação
- Senhas com argon2id. Access JWT curto (15 min), refresh rotativo com detecção de reuso (invalida a família).
- Refresh token opaco (32 bytes aleatórios), guardado como HMAC-SHA256 (chave `JWT_REFRESH_SECRET`); rotação atômica (só uma requisição concorrente consome o token); reuso revoga a família.
- Login não distingue "empresa inexistente", "e-mail inexistente" e "senha errada" (mesma resposta; sempre verifica um hash argon2 para igualar o tempo).
- Access JWT leva `sub`, `tid`, `role`, `email`; empresa suspensa é barrada no login/refresh (o access já emitido expira em até 15 min).
- Tokens pessoais MCP (`gvmcp_…`): exibidos uma vez, guardados como HMAC-SHA256, com escopos, expiração (90 dias por padrão) e revogação imediata (conferidos no banco a cada chamada).

## Isolamento entre empresas
- `tenantId` vem **sempre** do JWT/contexto autenticado; nunca de body, query ou header do cliente.
- Toda query de negócio filtra por `tenant_id`; criar registro grava o `tenant_id` do contexto. Referências entre entidades (curso, módulo, aula, vídeo) são validadas dentro do mesmo tenant.
- Acesso a recurso de outra empresa responde **404** (não revela existência).
- Empresa `suspended`: login, refresh e playback negados.
- S3 sob `tenants/{tenantId}/`; URLs assinadas só para chaves do tenant do token.
- Testes e2e de vazamento entre empresas em cada módulo; o MCP herda o tenant do token.
- Avaliar RLS do Postgres como defesa em profundidade (Marco 7).

## Autorização
- RBAC `admin` / `professor` / `aluno` + política central `canAccessLesson(user, lesson)` (matrícula + publicação).
- Professor só vê/edita os seus cursos. Aluno só os próprios dados de progresso/notas.
- REST e MCP usam os mesmos services; sem caminhos paralelos de dados.

## Proteção do conteúdo
Camadas (nenhuma sozinha é DRM comercial):
1. Bucket privado; nada é público. Segmentos e poster só por **URL assinada** (1 h); manifests, chave e VTT passam pela API.
2. **Token de playback** (5 min) amarrado a usuário + vídeo + aula + sessão + site. Segredo derivado do de acesso (não se confundem). Renovação reavalia matrícula, publicação e status da empresa.
3. HLS AES-128; chave e IV aleatórios por vídeo (o IV é o mesmo em todos os segmentos do vídeo — limitação aceita, pois não é DRM); chave só em `/hls/key/:videoId` com token válido e sessão ativa, `no-store`. Os arquivos no S3 guardam o marcador `__KEY_URI__`, nunca uma URL real.
4. **Domínios permitidos** por empresa (Origin no playback; token só funciona no site que o pediu).
5. **Limite de telas** por aluno (Redis, atômico via Lua); encerrar a sessão corta o acesso na hora.
6. **Marca d'água** por aluno em overlay (versão queimada no vídeo fica para a Fase 2).

### Limites do isolamento do bucket (Hetzner)
- **A chave S3 vale para todos os buckets do projeto.** Quem a tem lê os vídeos de todas as empresas **e** a chave AES (`hls/key.bin` fica no mesmo bucket dos segmentos), então o AES-128 não protege contra acesso ao bucket — só contra quem tem a URL de um segmento sem passar pela API. Isolamento real = **projeto Hetzner separado** só para os vídeos (pendência aberta no [roadmap](roadmap.md)).
- Mitigação enquanto o projeto é compartilhado: **uma chave S3 por sistema** (API+worker × outros sistemas), nunca reaproveitar a chave deste projeto em outro, e revogar na hora se vazar.
- Decisão registrada: **não** mover a chave AES para o banco cifrada por chave-mestra (o risco de perder a mestra e inutilizar todos os vídeos pesa mais). Alternativa não adotada: guardar a chave sem cifrar numa coluna do Postgres (o backup do banco passaria a ser sensível).
- **Sem log de acesso nem eventos:** o Hetzner responde `NotImplemented` a `GetBucketLogging` e às notificações, então leituras feitas fora da API não deixam rastro. O que existe é `npm run s3:audit` (somente leitura), que acusa objetos que o banco não conhece, HLS faltando e postura do bucket — detecta escrita externa, não leitura.
7. Rate limit em manifest/chave (Marco 7).
Só são assinados nomes de segmento no padrão `seg_NNNNN.ts` e qualidades que existem em `videos.renditions`; o prefixo vem do tenant do token, nunca da URL.
Limite assumido: quem grava a tela ou copia o stream decifrado consegue o conteúdo. DRM Widevine/FairPlay fica para a Fase 2 se o negócio exigir.

## Progresso à prova de fraude simples
O heartbeat só é aceito com token de playback de sessão **ativa** (quem não tem acesso à aula não consegue gravar progresso). Quem decide se um trecho conta é o servidor, com relógio próprio e teto de velocidade de 4×: mandar posições inventadas, pular para o fim ou repetir heartbeats não gera cobertura nem conclusão.

## Privacidade dos analytics
Relatórios de aula e de curso são agregados (sem dados pessoais), exceto a lista de inativos, que traz nome e e-mail e só vai a quem gerencia o curso. O aluno enxerga apenas os próprios números; professor só os alunos dos seus cursos (sem vínculo, 404). CSVs neutralizam injeção de fórmula em planilhas.

## Limite de requisições
Contagem atômica no Redis (Lua), janela fixa, por **IP** (rotas anônimas), **usuário** (autenticadas), **conta-alvo** `empresa|e-mail` (força bruta: 8 erros/15 min travam a conta; acertar zera) e **sessão de reprodução** (entrega de vídeo, para não punir uma escola inteira atrás de um NAT). Responde `429` com `Retry-After`. Falha do Redis **libera** (disponibilidade acima do limite) com erro no log. Atrás de proxy, `TRUST_PROXY` (nº de proxies) faz o IP real chegar ao limite; configurado errado, todos parecem o mesmo IP (ou o IP vira falsificável) — confira no primeiro deploy. Tabela de políticas: [api.md](api.md#convenções).

## Cabeçalhos, erros e logs
- helmet: `Content-Security-Policy: default-src 'none'`, `nosniff`, `no-referrer`, HSTS, sem `X-Powered-By`; `/docs` fica de fora (precisa de scripts).
- Todo erro tem o formato `{statusCode, error, message, correlationId}`; 500 nunca vaza a causa (vai só para o log, com o mesmo `correlationId`). `X-Correlation-Id` do cliente só é aceito se for curto e inofensivo.
- Logs JSON (pino): **só** id, método, URL, IP, status e usuário/empresa. Nunca cabeçalhos, cookies, corpo ou `?t=` (o token de playback na URL vira `t=[redacted]`). Heartbeat bem-sucedido não é logado (volume); falhas aparecem em métricas.
- `/metrics` exige Bearer (`METRICS_TOKEN`); rótulos usam o padrão da rota (sem ids) e nunca dados pessoais.

## Configuração segura em produção
Com `NODE_ENV=production` a API **não sobe** se: algum segredo JWT tiver < 32 caracteres ou parecer de exemplo; os dois segredos forem iguais; `RATE_LIMIT_ENABLED=false`; `CORS_ORIGINS` apontar para localhost. Containers rodam sem root, sem capabilities, com sistema de arquivos somente leitura e `no-new-privileges`; Postgres/Redis só na rede interna; Redis com senha, `appendonly` e `noeviction`.

## Upload
Validação de MIME/extensão/tamanho, `ffprobe` antes de aceitar, chaves S3 geradas pelo servidor (nunca pelo cliente), partes assinadas com expiração.

## API
Validação com class-validator/zod, helmet, CORS por env, limites de payload, throttling por IP e por usuário, correlation-id em todos os logs, sem dados sensíveis nos logs.

## API de integração (matrícula e sessão do aluno)
- **Opcional e trancada:** `ACCESS_ENDPOINT_ENABLED=false` por padrão (rotas respondem 404) **e** cada empresa precisa ser habilitada pelo operador. A chave de integração é um token pessoal de **admin** com `access:manage` (aluno e professor não recebem o escopo); JWT de login não vale; é conferida no banco a cada chamada, então revogar corta na hora.
- **Risco assumido: quem tem a chave pode abrir sessão como qualquer aluno da empresa** (`/access/sessions`) e matricular qualquer e-mail. Trate-a como segredo de servidor: nunca no navegador, uma chave por sistema, revogue ao menor sinal de vazamento e acompanhe `audit_log` (`via = access-api`). A sessão só sai para papel `aluno` (nunca admin/professor) e da própria empresa; dura como o login e não tem refresh.
- **Aluno da integração não tem senha:** o `password_hash` começa com `!` e nenhum login o aceita; só entra pela sessão do sistema de origem ou, se pedido, pelo token de primeiro acesso (aleatório de 32 bytes, só o HMAC no banco, uso único, 7 dias, o mais novo invalida o anterior, 20 tentativas/10 min por IP).
- Quem já existe nunca é alterado pela integração (nome, senha e papel ficam como estão); matricular professor/admin é recusado.
- Auditoria de matrícula, revogação, sessão e primeiro acesso com ids e datas, **sem e-mail**; a repetição por `externalRef` não renova o prazo.

## MCP
Sem URLs de vídeo/chaves/segredos nas respostas (barreira de saída que bloqueia a resposta se detectar `X-Amz-Signature`, token ou chave); escopos mínimos; auditoria por chamada em `audit_log` (só o hash dos argumentos); 120 chamadas/min por token; texto de transcrição/nota tratado como dado não confiável. Detalhes em [mcp.md](mcp.md).

## LGPD
- **Minimização:** analytics agregados não trazem dados pessoais; lista de inativos e resumo do aluno só para quem gerencia; logs sem corpo/cabeçalhos; MCP omite e-mail por padrão.
- **Cópia dos dados** (`GET /me/data-export`, ou o admin para o titular): perfil, matrículas, progresso, trechos assistidos, sessões e anotações — nunca senha nem tokens.
- **Eliminação**, em dois modos. *Anonimizar* (padrão): remove nome, e-mail, senha, anotações e logins; **mantém o histórico de visualização sem identificação** para preservar as estatísticas do curso (sem nome/e-mail, o vínculo com a pessoa deixa de existir). *Excluir tudo* (`mode=erase`): apaga também sessões, trechos, progresso e matrículas. O e-mail original fica livre para novo cadastro.
- **Travas:** não remove dono de curso (transfira antes) nem o último administrador da empresa; autoexclusão exige a senha.
- **Efeito imediato:** logins e renovações são revogados e as sessões de reprodução cortadas; um JWT de acesso já emitido ainda vale até 15 min (nenhum dado novo é criado em nome da conta removida além disso).
- **Trilha:** cada remoção gera um log `lgpd.removal` (modo, quem pediu, alvo, empresa — sem dados pessoais) com o `correlationId`.
- **Retenção:** não há expurgo automático do histórico de visualização; defina a política com cada empresa (controladora) e, se necessário, agende `DELETE FROM watch_sessions WHERE started_at < …` (ver [operacao.md](operacao.md#lgpd-atendendo-o-titular)).
