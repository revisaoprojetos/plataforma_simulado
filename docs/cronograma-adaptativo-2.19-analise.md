# Cronograma Adaptativo 2.19 — análise e plano de adoção

Fonte: `C:\Users\joooa\Downloads\Cronograma 2.19` (HTML 2.19, histórico 2.9→2.19, funcionamento completo). Comparado com a 2.18 e com a plataforma (motor28.ts v2.8.1 + flags 2.18).

## 1. O que mudou da 2.18 para a 2.19
Uma única novidade funcional: **meta geral de Jurisprudência, 60 min, 1× por semana de atividade** (tipo `jp`, id `jp:<semana>`).

| Item | 2.19 |
|---|---|
| Catálogo | **Idêntico à 2.18** (blocos CATALOGO_PLANILHAS / CATALOGO_BASE218 / DADOS com o mesmo hash). 24 disc., 268 aulas, 622 LP, 81 PDFights. Nada a reimportar. |
| Escolha do dia | Sexta ou sábado que comporte 1h; entre eles o de maior tempo livre (empate = data anterior). Sem sexta/sábado elegível → outro dia da semana com mais folga. |
| Capacidade | Não fabrica horas: considera rotina, recesso, exceção pontual e ocupação já concluída. Semana sem estudo não recebe a reserva; semana ativa sem dia que caiba 1h → erro explícito ("precisa de um dia com 1h disponível"). |
| Motor | Reserva ANTES de alocar o conteúdo da semana; no dominó a meta é separada, reservada 1×/semana e **descontada da capacidade** entregue ao motor-base (`horasPontuais` reduzidas); reservas reunidas ao plano no fim. Loop de até 200 tentativas para o plano não ficar aberto só para criar `jp`. |
| Prioridades | Continuação de PDFull continua 1ª do dia; `jp` não a substitui. |
| Remanejo | Mover `jp` ocupa a vaga da semana de destino (sem duplicar); semana com `jp` já concluída/iniciada bloqueia a chegada de outra. `origemSaiu` evita recriar a meta da semana de origem. |
| Dados/UI | `TIPOS.jp` (roxo #6751b9), `ORDEM.jp=4`, `DUR.jp=60`; descritor próprio (não consulta `catalogo.aulas`); "Parou em" aceita julgado/informativo; aparece em Semana, próximos dias, foco, notas, conclusão, indicadores e DOCX (agrupada com `fl`: "Jurisprudência — 1h"). Fora das metas configuráveis (não tem checkbox: é obrigatória). |
| Persistência | chave local `rej-cronograma-v2-19`, nuvem `v219`, marcador `regraJuris219=1` (regenera plano na migração). |
| Não faz | Sem biblioteca/integração de conteúdo de jurisprudência; `jp` é só um bloco de tempo. |
| Entrega | Só 3 arquivos (HTML + 2 .md). **Não vieram** Catalogo/Definicoes JSON, Manifesto, Verificações (existiam na 2.18). A verificação de migração usa registros sintéticos. |

## 2. Estado da plataforma frente ao `jp`
Hoje **não existe `jp`** em nenhuma camada. Só há o card "Jurisprudência (em breve)" nas Metas (v4.4.1) e `juris` no docx-adapter (`conta_atividade:false`, usado para outro fim).

Pontos que **quebram** se um plano passar a ter `jp:N` sem preparação (confirmados no código):
1. `gradeValida` em [dados.ts](apps/web/lib/cronograma/adaptativo/dados.ts) (`ID_META = pf|pp|fl|qu|lp|rf|rq`) — **rejeita o plano inteiro** com `plano_invalido` (validação que eu mesmo introduzi na Fase 3).
2. CHECK `chk_cron_adapt_pm_tipo` na migração `20261106040000` (ainda NÃO aplicada por você? se não foi, corrijo o arquivo; se foi, nova migração) — o espelho relacional falharia para linhas `jp`.
3. `descrever` em [engine.ts](apps/web/lib/cronograma/adaptativo/engine.ts) e [plano-metas.ts](apps/web/lib/cronograma/adaptativo/plano-metas.ts): id desconhecido; `snapshot.ts` (título); `liberacao.ts` (`jp` cairia no ramo "aula": precisa ser sempre liberado — não tem documento).
4. [motor28.ts](apps/web/lib/cronograma/adaptativo/motor28.ts) e o iframe [index.html](apps/web/public/cronograma/adaptativo/index.html) (helpers duplicados: `TIPOS/ORDEM/DUR`, `descrever`, `linhaDisc`, `perguntaParada`, `textoParou`, foco, DOCX).
5. Saneamentos que tratam id sem aula como "inexistente" (retiradas/remanejadas) precisam pular `jp`.
6. Progresso do aluno (`..._meta`) é por `meta_id` texto: aceita `jp:N` sem mudança; `aula_key` fica nulo (correto).

## 3. Diferenças de base que pesam na adoção
- A 2.19 foi escrita sobre o motor 2.16+ (dominó, `feito`, `S.prog`). O motor da plataforma é puro (2.8.1) e **não recebe o estado de "feito"**: a regra "semana já tem `jp` concluída" exige passar o conjunto de metas concluídas ao motor (hoje ele recebe `fixos`). Provável uso de `fixos` + um parâmetro `concluidas`.
- A 2.19 não tem parâmetros: 60 min e sexta/sábado são fixos. Na plataforma convém ser **por tenant** (padrão desligado, como as flags 2.18): `jurisprudenciaSemanal219` (bool), `jurisprudenciaMin` (padrão 60), dias preferidos.
- Efeito colateral esperado: cada semana perde 1h de capacidade → planos ficam ligeiramente mais longos; semanas curtas (<1h útil em um dia) passam a dar erro explícito em vez de plano silencioso.

## 4. Plano de implementação (fases)
- **F0 — Preparação segura (sem mudar plano algum):** aceitar `jp` nas camadas passivas: `gradeValida`, CHECK/migração, `descrever`, snapshot, liberação (sempre liberado), saneamentos, docx-adapter (agrupar com `fl` como na 2.19). Testes de que planos atuais não mudam.
- **F1 — Motor:** portar `reservarJuris219` + dominó com reserva para `motor28.ts` (puro), com `concluidas`; flag/param por tenant; erro explícito de semana sem dia de 1h.
- **F2 — Iframe:** TIPOS/ORDEM/DUR, descritor, linha, pergunta/texto de parada ("Até qual julgado/informativo…"), foco, notas, Semana/próximos dias; `motor28.js` recompilado; sem checkbox em metas (obrigatória quando a flag liga).
- **F3 — Admin:** ativar o card "Jurisprudência" em Metas & inteligência (toggle + minutos + dias preferidos) e texto do impacto na duração.
- **F4 — Testes:** suíte nova no `cronograma:testar` replicando os 6 cenários do histórico (sexta, sábado, outro dia, recesso integral, 191 PDFulls essenciais, remanejo entre semanas, ajuste diário) + invariante "flag desligada = plano idêntico".
- **F5 — Rollout:** só para planos novos/regenerados; nunca regenerar os 706 planos automaticamente (a 2.19 regenera na migração; aqui NÃO, para não mover datas de alunos).

## 5. Decisões que dependem de você
1. Ligar `jp` por tenant (padrão desligado) ou obrigatório para todos? (recomendo por tenant, desligado)
2. Aplicar a regra só em planos novos (recomendado) ou oferecer botão "recalcular com Jurisprudência" ao aluno?
3. Pendente da rodada anterior: as regras da 2.18 que exigem novos tipos de meta continuam adiadas; a 2.19 depende só do tipo `jp`.

## 6. Execução (F0–F5) — status
Implementado e testado; **não commitado, não versionado, migração não aplicada**.
- F0 camadas passivas: `jp` aceito em `gradeValida`, `descrever` (engine/plano-metas/iframe), ORDEM, TIPOS, liberação (nunca vira meta de aula), DOCX (tipo `juris`), migração `20261106050000` (CHECK com `jp`).
- F1 motor: `gerarPlano` (wrapper) + `reservarJuris219` em motor28.ts; núcleo intacto (`gerarPlanoNucleo`); flag desligada = plano idêntico.
- F2 iframe: tipos, descritor, título, linha, foco, pergunta/texto de parada, DOCX; tokens `--jp`/`--jp-soft` (claro/escuro); `motor28.js` recompilado.
- F3 admin: bloco "Jurisprudência semanal (versão 2.19)" em Metas & inteligência (chave + minutos 15–180).
- F4 testes: `scripts/_juris219.mjs` (22) encadeado em `pnpm cronograma:testar` (14 + 25 + 15 + 22 aprovados).
- F5 rollout: padrão desligado por tenant; nenhum plano existente é regenerado.
Fora do escopo desta entrega: "iniciada" (progresso parcial) bloqueando troca de semana no remanejo; card informativo no assistente do aluno.
