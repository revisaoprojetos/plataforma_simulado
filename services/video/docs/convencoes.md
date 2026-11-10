# Convenções de código e testes

## Código
- TypeScript estrito; sem `any` sem justificativa.
- Um módulo Nest por domínio (`auth`, `courses`, `lessons`, `videos`, `uploads`, `playback`, `progress`, `notes`, `analytics`, `storage`, `health`, `mcp`).
- Camadas: controller (HTTP/validação) → service (regra de negócio, reutilizado por REST e MCP) → repositório/Prisma.
- DTOs validados (zod ou class-validator); respostas tipadas e documentadas no Swagger.
- Tempos de vídeo em **segundos**; IDs UUID; datas UTC (ISO-8601).
- Configuração só via `ConfigService` validado (zod) — nada de `process.env` espalhado.
- Erros de domínio viram exceções HTTP padronizadas; nunca vazar stack/segredos.
- Logs estruturados (pino) com correlation-id; sem dados sensíveis.
- Comentários explicam o *porquê*, não o *quê*.
- Migrations Prisma nunca editadas depois de mergeadas.
- Ferramentas: `npm run lint` (ESLint), `npm run typecheck` (tsc), `npm run format` (Prettier). Hooks do husky rodam lint-staged e commitlint; pre-push roda typecheck.
- Idioma: identificadores em inglês; docs e mensagens ao usuário em pt-BR.

## Testes
| Tipo | Ferramenta | Foco |
|---|---|---|
| Unit | Jest | regras puras: merge de ranges, conclusão, `canAccessLesson` |
| E2E API | Jest + Supertest (`npm run test:e2e`; banco `video_test` criado e migrado automaticamente) | permissões (aluno × professor × admin), upload, playback, heartbeat |
| MCP | cliente MCP do SDK | escopos, isolamento de dados, ausência de URLs/segredos |
| Player | Playwright (`npm run test:browser -w apps/player`, Edge real, stack local no ar) | reprodução com frames, controles, legendas, transcrição, capítulos, anotações, progresso e retomada |
| Carga | k6 (`sh load/run.sh 1000 60s 25`, Docker) | heartbeat ≥1.000/s, p95 < 100 ms; compare servidor (histograma) e cliente; rode após mexer no caminho do heartbeat |
| S3 | `npm run smoke:s3` | put/get, presigned, multipart, CORS |

Cobertura mais rigorosa em: permissões, progresso/ranges, MCP. Todo bug corrigido ganha teste de regressão.

## Definition of Done
Código + testes verdes · lint/typecheck · Swagger e `docs/` atualizados (ver tabela no [CLAUDE.md](../CLAUDE.md)) · sem segredos · commit Conventional · PR revisado.
