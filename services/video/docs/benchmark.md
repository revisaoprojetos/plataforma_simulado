# Benchmark: YouTube × Netflix × Panda Video

Fontes: pandavideo.com e guias de terceiros (Panda); material secundário sobre arquitetura de Netflix/YouTube. Tratar detalhes de Netflix/YouTube como indicativos. Valores de preço mudam; conferir no site.

| Capacidade | YouTube | Netflix | Panda Video | Nossa decisão |
|---|---|---|---|---|
| HLS/DASH adaptativo | sim | sim (ladder por título) | sim | Fase 1 ladder fixo; por título na Fase 2 |
| Velocidade, qualidade, atalhos | sim | sim | sim | Fase 1 |
| Capítulos + preview de frames | sim | sim | capítulos | Fase 1 (RF26) |
| Legendas com estilo | sim | sim | sim + IA | Estilo RF27; automática Fase 2 |
| Transcrição clicável + busca | sim | não | busca por IA | Fase 1; FTS na Fase 2 |
| Retomar de onde parou | sim | continue assistindo | sim | Fase 1 |
| Próximo vídeo/autoplay | sim | sim (pular intro) | autoplay inteligente | RF28 |
| Múltiplos áudios/dublagem | sim | sim | dublagem IA | Fase 2 |
| Proteção | — | DRM comercial | marca d'água DRM, anti-download, domínios | RF30/RF31 no Marco 3 |
| Analytics de retenção | YouTube Studio | interno | plays, únicos, retenção | Marco 6 |
| CTAs / barra fictícia | cards | — | sim (VSL) | CTA Fase 2; barra fictícia não se aplica |
| Quizzes / material por IA | — | — | quizzes, e-books | Fase 2 |
| Comentários | sim | — | — | Fase 2 |
| Recomendação / perfis / offline | sim | sim | — | Fora de escopo |
| CDN própria | Google | Open Connect | terceiros | Fase 2: CDN na frente do Hetzner |
| Acesso por agentes de IA (MCP) | — | — | — | **Diferencial**: Marco 8 |

## Diferenciais para aulas
Progresso por trechos realmente assistidos, anotações com timestamp, trilha do curso com % de conclusão, alunos em risco e acesso por MCP (perguntar à IA sobre engajamento e conteúdo). Panda/YouTube são fortes em entrega e proteção, fracos em acompanhamento pedagógico.

## Referência de custo
Panda Bronze listado a ≈ US$ 17,90/mês (200 GB armazenamento, 500 GB banda). Medir egress por curso/aluno desde o início.
