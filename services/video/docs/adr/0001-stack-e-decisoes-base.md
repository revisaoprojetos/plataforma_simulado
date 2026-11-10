# ADR 0001 — Stack e decisões base

**Status:** aceito · 2026-10-25

## Contexto
Plataforma de vídeo-aulas com rastreio fino de visualização, em Docker, S3 Hetzner, acessível por front, e por agentes de IA via MCP.

## Decisões
- **NestJS + TypeScript** (modularidade, ecossistema S3/BullMQ, mesmo idioma do front).
- **HLS gerado por FFmpeg em worker Docker** (sem custo por minuto; controle do ladder).
- **S3 Hetzner (`hel1`)** com URLs assinadas; CDN plugável depois.
- **Postgres + Prisma** para dados; **Redis + BullMQ** para filas e buffer de heartbeats.
- **JWT próprio** com roles `admin/professor/aluno`.
- **MCP embutido na API** (`POST /mcp`, Streamable HTTP stateless), reutilizando services e RBAC.
- **AES-128 + token curto + marca d'água** em vez de DRM comercial na Fase 1.

## Consequências
+ Stack única, deploy simples, sem custo recorrente de transcode.
+ MCP herda as regras de permissão, sem lógica duplicada.
− Sem DRM real: gravação de tela não é impedida.
− Sem CDN nativo no Hetzner: banda/latência dependem do bucket até haver CDN.
