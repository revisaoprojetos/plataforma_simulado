# Documentação — Gerenciador de Vídeo-Aulas

Plataforma de vídeo-aulas com API, worker de transcodificação HLS e player de referência. Armazenamento em S3 (Hetzner Object Storage), execução em Docker, acessível também por **MCP** (agentes de IA).

| Documento | Conteúdo |
|---|---|
| [produto.md](produto.md) | Visão, personas, jornadas, escopo, métricas |
| [requisitos.md](requisitos.md) | Requisitos funcionais e não funcionais, fora de escopo |
| [convencoes.md](convencoes.md) | Estilo de código, testes, Definition of Done |
| [arquitetura.md](arquitetura.md) | Componentes, fluxos (upload, playback, tracking), riscos |
| [modelo-de-dados.md](modelo-de-dados.md) | Tabelas, relações, índices, regras de progresso |
| [api.md](api.md) | Endpoints REST `/v1` |
| [mcp.md](mcp.md) | Servidor MCP: tools, resources, auth, segurança |
| [seguranca.md](seguranca.md) | Proteção de conteúdo, auth, LGPD, segredos |
| [git-workflow.md](git-workflow.md) | Branches, commits, hooks, CI, releases |
| [roadmap.md](roadmap.md) | Marcos 0–8, critérios de aceite, Fase 2 |
| [benchmark.md](benchmark.md) | YouTube × Netflix × Panda Video e impacto no produto |
| [operacao.md](operacao.md) | Desenvolvimento, produção (deploy, backup, escala), monitoramento, teste de carga, LGPD, runbook |
| [adr/](adr/) | Decisões de arquitetura |

Decisões fechadas: NestJS + TypeScript, FFmpeg em worker Docker (HLS), S3 Hetzner (`hel1`), Postgres + Redis/BullMQ, Prisma, JWT próprio com roles, Fase 1 = API + progresso + player de referência, MCP embutido na API.
