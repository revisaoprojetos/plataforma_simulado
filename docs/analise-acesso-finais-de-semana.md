# Análise de acesso — Finais de semana

**Plataforma:** Revisão / Ensino Jurídico (tenant `simulado`)
**Gerado em:** 2026-10-09
**Período dos dados:** até 2026-10-09 (BRT · America/São_Paulo)

> **Metodologia.** "Acesso" = **alunos únicos ativos no dia** — qualquer atividade real
> (Desafio de Lei Seca, questões avulsas, simulados e eventos de XP), unificada a partir de
> `simulado_xp_eventos`, `simulado_leitura_respostas`, `simulado_respostas_avulsas` e
> `simulado_sessoes_prova`. Todos os horários em **BRT**. Analisado só o tenant **Revisão** —
> é o único com tráfego real (MEQ e VND ainda sem alunos). Não há log de login dedicado, então
> **atividade = acesso**.
>
> ✅ **Nota de interpretação (corrigida).** Os finais de semana antigos **NÃO estão subcontados**:
> simulados rodaram todo FDS e sempre foram registrados (tabela de sessões existe desde jun/2026).
> O salto para ~500–600 alunos nos 2 últimos FDS é **crescimento real**, causado pelo **lançamento
> do Desafio de Lei Seca (~20/set/2026)** — uma camada de engajamento DIÁRIO que antes não existia
> (coluna "Lei Seca" = 0 em todo FDS anterior). Ou seja: a diferença é **feature nova**, não erro de
> medição. Ver §5 (quebra por tipo de atividade).

---

## 1) Finais de semana — alunos únicos que acessaram

| Fim de semana | Sáb | Dom | Únicos (Sáb∪Dom) | Média/dia | Confiança |
|---|---:|---:|---:|---:|---|
| 26–27/set | **603** | **577** | **721** | **590** | com Lei Seca |
| 03–04/out | **530** | **466** | **627** | **498** | com Lei Seca |
| 19–20/set | 45 | 57 | 97 | 51 | só simulado/questões (sem Lei Seca) |
| 12–13/set | 68 | 92 | 153 | 80 | ⚠️ parcial |
| 05–06/set | 94 | 127 | 208 | 111 | ⚠️ parcial |
| 29–30/ago | 19 | 25 | 42 | 22 | ⚠️ parcial |
| 22–23/ago | 16 | 66 | 80 | 41 | ⚠️ parcial |
| 15–16/ago | 25 | 15 | 40 | 20 | ⚠️ parcial |
| 08–09/ago | 27 | 15 | 38 | 21 | ⚠️ parcial |

---

## 2) Médias (sobre os 2 FDS com dados completos)

| Métrica | Valor |
|---|---:|
| **Média de acesso por dia de FDS** | **~544 alunos** |
| Média Sábado | ~567 alunos |
| Média Domingo | ~522 alunos |
| **Alunos únicos por fim de semana** (≥1 dos 2 dias) | **~674 alunos** |

---

## 3) Fim de semana × dia de semana (21/set → hoje)

| Recorte | Média alunos/dia |
|---|---:|
| Dia de semana (Seg–Sex) | **602** |
| Fim de semana (Sáb–Dom) | **544** |

- Pico diário do período: **805 alunos**
- Mínimo diário do período: **143 alunos**

---

## 4) Horários de pico no fim de semana

| Faixa | Alunos ativos (na hora) |
|---|---:|
| 19h | 180 |
| 11h | 180 |
| 22h | 178 |
| 21h | 165 |
| 18h | 155 |

---

## 5) Acesso por tipo de atividade — 3 tabelas (alunos únicos por FDS)

### 5.1 📝 Simulado

| Fim de semana | Sáb | Dom | Únicos/FDS |
|---|---:|---:|---:|
| 18–19/jul | 2 | 158 | 159 |
| 25–26/jul | 55 | 108 | 149 |
| 01–02/ago | 35 | 37 | 66 |
| 08–09/ago | 24 | 12 | 33 |
| 15–16/ago | 23 | 10 | 33 |
| 22–23/ago | 14 | 65 | 77 |
| 29–30/ago | 16 | 24 | 38 |
| 05–06/set | 94 | 125 | 207 |
| 12–13/set | 66 | 88 | 149 |
| 19–20/set | 41 | 55 | 92 |
| 26–27/set | 84 | 101 | 165 |
| 03–04/out | 119 | 96 | 199 |

### 5.2 🟦 Lei Seca

| Fim de semana | Sáb | Dom | Únicos/FDS |
|---|---:|---:|---:|
| até 19–20/set | 0 | 0 | 0 (feature não existia) |
| 26–27/set | 559 | 526 | 640 |
| 03–04/out | 459 | 398 | 509 |

### 5.3 🔗 Unificada (distinct — sem contar o mesmo aluno 2×)

| Fim de semana | Simulado | Lei Seca | Soma crua | **Unificada** | Fazem os 2 |
|---|---:|---:|---:|---:|---:|
| 01–02/ago | 66 | 0 | 66 | 70 | 0 |
| 08–09/ago | 33 | 0 | 33 | 38 | 0 |
| 15–16/ago | 33 | 0 | 33 | 40 | 0 |
| 22–23/ago | 77 | 0 | 77 | 80 | 0 |
| 29–30/ago | 38 | 0 | 38 | 42 | 0 |
| 05–06/set | 207 | 0 | 207 | 208 | 0 |
| 12–13/set | 149 | 0 | 149 | 153 | 0 |
| 19–20/set | 92 | 0 | 92 | 97 | 0 |
| 26–27/set | 165 | 640 | 805 | **721** | **84** |
| 03–04/out | 199 | 509 | 708 | **627** | **81** |

**Leitura:**

- A **Unificada deduplica**: no FDS 26–27/set, Simulado (165) + Lei Seca (640) = 805 na soma crua,
  mas a Unificada é **721**, porque **84 alunos fizeram os dois** (contam 1×). A Unificada também
  inclui quem fez **só questões**, por isso fica 1–5 acima da soma quando Lei Seca = 0.
- **Simulado rodou todo FDS e sempre foi contado** (33–207 alunos/FDS). Os FDS antigos **não** estão
  subcontados — são o acesso real de quem fazia simulado.
- O salto do total para 500–600 veio do **lançamento do Desafio de Lei Seca (~20/set)** — camada de
  engajamento **diário** que antes era **0** em todo FDS. Sozinho, o Lei Seca traz ~3× mais gente
  que o simulado do dia.
- O acesso de simulado **oscila com o simulado lançado**: fortes (05–06/set = 207, 03–04/out = 199,
  18–19/jul = 159) vs fracos (08–09 e 15–16/ago = 33). O tamanho do FDS depende de **qual** simulado
  saiu, não da ausência de simulado.

### Médias (FDS com Lei Seca ativa: 26–27/set e 03–04/out)

| Métrica | Únicos/FDS |
|---|---:|
| 📝 Simulado | 182 |
| 🟦 Lei Seca | 575 |
| 🔗 **Unificada (acesso total, sem repetir)** | **674** |
| Fazem simulado **e** lei seca | ~83 |

---

## Análise

- **Resposta direta:** a **média de acesso dos últimos finais de semana é ~544 alunos ativos
  por dia** (Sáb ~567, Dom ~522), ou **~674 alunos únicos por fim de semana** contando quem
  entrou em pelo menos um dos dois dias.
- **Sábado > Domingo** de forma consistente (567 vs 522, ~−8% no domingo). O domingo esfria um
  pouco, mas segue forte.
- **Tendência de queda entre os 2 FDS:** 26–27/set (590/dia · 721 únicos) → 03–04/out
  (498/dia · 627 únicos) = **−15%**. Dois pontos não fazem tendência, mas vale **monitorar o
  próximo FDS (10–11/out)** para saber se é sazonalidade (feriado/virada de mês) ou arrefecimento
  real.
- **Fim de semana rende ~10% menos que dia útil** (544 vs 602/dia). O **Desafio de Lei Seca
  diário** é o que sustenta o acesso alto mesmo no FDS — sem rotina diária, a queda de fim de
  semana costuma ser bem maior.
- **Quando o aluno acessa no FDS:** dois blocos claros — **fim de manhã (11h)** e **noite
  (18h–22h, pico 19h e 21–22h)**. Boas janelas para **disparar o conteúdo do dia, push/e-mail e
  abrir simulados** (ex.: liberar a aula/quiz do dia cedo + lembrete ~18h).

### Ressalvas

- A **média de ~544/dia** vale para o **patamar atual (pós-Lei Seca)**. Só há **2 FDS nesse novo
  patamar** (26–27/set e 03–04/out); em ~3–4 semanas haverá 5–6 para uma média mais robusta.
- Os FDS antigos **não estão subcontados** — são o acesso real **antes** do Lei Seca existir (só
  simulado + questões). Não devem ser comparados "de igual para igual" com os pós-Lei Seca, porque
  medem um produto diferente (sem a camada de engajamento diário). Ver §5.

---

## Fonte / reprodução

- Tabelas: `simulado_xp_eventos`, `simulado_leitura_respostas`, `simulado_respostas_avulsas`,
  `simulado_sessoes_prova` (todas filtradas por `tenant_id` = Revisão).
- "Dia de acesso" = data BRT de qualquer evento do aluno (`DISTINCT estudante_id` por dia).
- Fim de semana = Sábado (isodow 6) + Domingo (isodow 7) consecutivos.
