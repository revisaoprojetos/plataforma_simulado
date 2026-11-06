# Cronograma Adaptativo — Fase 0 (diagnóstico, somente leitura) — 2026-11-06

Base: produção (tenant Revisão). Backup do progresso: `C:\Users\joooa\Downloads\backup-cronograma-adaptativo-2026-11-06\adaptativo_meta_progresso.json` (1.530 linhas).

| Item | Valor |
|---|---|
| Planos | 706 (114 exemplo, 187 arquivados), 499 alunos |
| Progresso (`_meta`) | ~1.530 linhas em 314 planos, 1.001 concluídas |
| Grade espelhada (`plano_meta`) | 434.279 linhas em 469 planos; sem duplicadas |
| Planos sem espelho | 237 (de 706) |
| Progresso em plano sem espelho | 137 linhas |
| **Progresso órfão** (plano espelhado, meta fora da grade) | 74 linhas em 42 planos (5 concluídas, 52 com tempo/nota) |
| Progresso sem plano | 0 |
| Catálogo | 593 planos em `planilhas-e935254383d8`, 113 sem carimbo (`null`) |
| **Direitos Humanos selecionado** | **0 planos** (nenhum aluno é afetado pela retirada) |

## Achados
1. **Os índices dos planos NÃO são os do catálogo 2.18.** Nos planos, `115/119` = Direito Civil, `123/124` = Processo Civil e `270/271/272` = Legislação Penal Especial (aulas da Biblioteca). O mesmo número aponta para aulas diferentes conforme a origem → confirma o risco do id posicional (Fase 1). A importação da 2.18 deve casar por (disciplina, nº da aula), nunca por posição.
2. `documento_id` de `plano_meta` só existe para ~30% das metas de aula (as que vêm de documento da Biblioteca); as demais não têm chave estável.
3. 74 progressos órfãos e 237 planos sem espelho são os dois furos de integridade já mensuráveis.
