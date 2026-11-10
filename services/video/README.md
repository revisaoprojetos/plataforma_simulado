# Gerenciador de Vídeo-Aulas

Plataforma de vídeo-aulas multiempresa (estilo Panda Video): upload, transcodificação para HLS com criptografia, entrega protegida, player de referência e acompanhamento fino de **quem assistiu, quando, o quê e até onde** — com analytics e acesso por agentes de IA (MCP).

| | |
|---|---|
| **API** | NestJS + TypeScript · Postgres (Prisma) · Redis/BullMQ · S3 (Hetzner) |
| **Vídeo** | FFmpeg em worker Docker → HLS multi-qualidade com AES-128 |
| **Player** | Vite + hls.js (referência; o front real consome a mesma API) |
| **Multiempresa** | um banco, `tenant_id` em toda tabela, prefixo por empresa no S3 |

## O que já funciona

- **Catálogo** de cursos, módulos e aulas, matrículas, papéis (`platform_admin`, `admin`, `professor`, `aluno`) e login por empresa.
- **Upload** multipart direto ao S3 (retomável), fila e **transcode HLS** (até 1080p, sem upscale), poster e preview na timeline.
- **Playback seguro**: token curto, manifests e segmentos assinados, chave AES só pela API, domínios permitidos, limite de telas e marca d'água.
- **Progresso**: heartbeat com regra anti-trapaça (seek/velocidade/duplicados), trechos assistidos, retomada, "continuar assistindo" e histórico.
- **Conteúdo**: legendas WebVTT, transcrição pesquisável, capítulos e anotações privadas.
- **Analytics**: retenção a cada 5 s, abandono, conclusão, velocidade/qualidade, alunos inativos e CSV.
- **Operação**: limite de requisições, métricas Prometheus, logs estruturados, LGPD (exportar/anonimizar/excluir), compose de produção.
- **Capacidade medida**: 1.000 heartbeats/s com p95 de 36 ms (servidor) numa instância — ver [docs/operacao.md](docs/operacao.md#teste-de-carga).

## Começando (desenvolvimento)

Requisitos: Node 22+, Docker, FFmpeg (opcional, só para gerar vídeos de teste).

```bash
npm install
cp .env.example .env            # preencha S3_ACCESS_KEY / S3_SECRET_KEY (e gere os segredos JWT)
docker compose up -d --build    # postgres, redis, api (:3010) e worker
npm run db:migrate && npm run db:seed
npm run smoke:s3                # confere o bucket (put/get/URL assinada/multipart/CORS)
npm run dev -w apps/player      # player em http://localhost:5173
```

Login de teste: empresa `empresa-a`, `aluno@empresa-a.local`, senha `dev12345` (o seed cria também admin e professor, e a `empresa-b`).
Enviar um vídeo de ponta a ponta: `npm run upload:sample -w apps/api -- video.mp4`.

## Testes

```bash
npm test                         # unitários (API e worker)
npm run test:e2e                 # API contra Postgres/Redis reais (banco video_test, Redis db 15)
npm run test:browser -w apps/player   # player no Edge real (precisa da stack no ar e de um vídeo pronto)
npm run lint && npm run typecheck
```

## Produção

```bash
cp .env.prod.example .env.prod   # preencha segredos; a API recusa subir com configuração insegura
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build
```

TLS, backup, escala, monitoramento e o primeiro operador (`npm run admin:create`) estão em [docs/operacao.md](docs/operacao.md).

## Documentação

Tudo em [`docs/`](docs/README.md): produto, requisitos, arquitetura, modelo de dados, API, MCP, segurança, convenções, fluxo de git, roadmap e decisões (ADRs). Quem usa o Claude Code deve começar pelo [CLAUDE.md](CLAUDE.md).

## Estrutura

```
apps/api       API NestJS (REST /v1 e servidor MCP em /mcp) e o consolidador de progresso
apps/worker    Transcodificação FFmpeg (fila BullMQ)
apps/player    Aplicação web de DESENVOLVIMENTO (Vite + hls.js): player, biblioteca, analytics e tela do aluno; não vai para produção
packages/shared  Tipos compartilhados
prisma/        Schema, migrations, seed e criação do operador
load/          Teste de carga do heartbeat (k6)
docs/          Documentação e ADRs
```

Versionamento por tags (`v0.N.0` a cada marco). Histórico em [CHANGELOG.md](CHANGELOG.md).
