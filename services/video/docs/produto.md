# Produto

## Visão
Plataforma de vídeo-aulas com a entrega de Panda Video/YouTube e acompanhamento pedagógico mais profundo: saber **quem assistiu, quando, o quê e até onde**, com player rico e dados acessíveis também por agentes de IA (MCP).

## Personas
| Persona | Quer | Principais recursos |
|---|---|---|
| **Aluno** | Assistir, retomar, estudar | Player (velocidade, legenda, transcrição, notas, capítulos), continuar assistindo, progresso do curso |
| **Professor** | Publicar e entender o engajamento | Upload, legendas/capítulos, analytics por aula/curso, alunos em risco |
| **Operador (`platform_admin`)** | Gerenciar as 4 empresas, ver uso e saúde | Cadastro/suspensão de empresas, métricas por empresa |
| **Admin da empresa** | Operar a própria empresa | Usuários, matrículas, reprocessar vídeos, métricas |
| **Agente de IA (MCP)** | Responder perguntas sobre conteúdo e engajamento | Tools de leitura/analytics, transcrições, relatórios |

## Jornadas
1. **Publicar:** professor cria curso → módulo → aula → envia vídeo → acompanha status → publica.
2. **Assistir:** aluno abre aula → player pede playback → assiste (heartbeats) → fecha → retoma depois no mesmo ponto.
3. **Estudar:** aluno busca na transcrição, salta ao trecho, anota no tempo.
4. **Acompanhar:** professor vê retenção, abandono e alunos inativos; exporta CSV.
5. **Perguntar à IA:** via MCP, "quem não terminou a aula 3?" ou "resuma a aula 5".

## Escopo
- **Fase 1:** catálogo, upload + HLS, playback protegido, progresso/histórico, player de referência, analytics, MCP. Detalhes em [requisitos.md](requisitos.md) e [roadmap.md](roadmap.md).
- **Fase 2:** transcrição/legenda automática (Whisper), busca full-text, ladder por título, áudio múltiplo, quizzes, comentários, CTAs, certificados, CDN, DRM comercial.
- **Fora de escopo:** pagamentos, live, app nativo, recomendação, download offline.

## Diferenciais
Progresso por trechos realmente assistidos · anotações com timestamp · alunos em risco · MCP embutido. Comparativo em [benchmark.md](benchmark.md).

## Métricas de sucesso
- Taxa de conclusão de aulas e de cursos; retenção média por aula.
- % de vídeos processados com sucesso e tempo médio de transcode.
- Precisão do progresso (testes com dataset conhecido = 100%).
- Capacidade: ≥1.000 heartbeats/s, p95 < 100 ms.
- Custo de egress por aluno-hora.
