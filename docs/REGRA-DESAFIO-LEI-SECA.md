# Regra oficial — Desafio de Lei Seca (liberação diária e sequência)

> Texto pronto para **colar na aba Regulamento do módulo** (Admin → Leitura → módulo → Regulamento)
> e **enviar aos alunos**. Reflete exatamente o comportamento do sistema (horário de Brasília).

## Versão para o Regulamento (completa)

**Como funciona o Desafio**

- Todo dia é liberada uma aula nova às **00:01 (horário de Brasília)**.
- A aula do dia **conta para a sua sequência (ofensiva) se for concluída até as 23:59 do mesmo dia** (horário de Brasília).
- **Concluir a aula** = ler o conteúdo **e** responder o quiz da aula.
- Você pode fazer aulas de dias anteriores quando quiser — elas continuam abertas —, mas **para manter a sequência é preciso concluir a aula do dia dentro do próprio dia**.
- Se passar **um dia inteiro sem concluir nenhuma aula**, a sequência **zera** e recomeça do 1.
- Fazer várias aulas no mesmo dia conta como **1 dia** de sequência (não adianta acumular no mesmo dia).

## Versão curta (para mandar no grupo/WhatsApp)

> 📌 **Regra do Desafio:** cada dia libera uma aula às **00:01 (Brasília)** e ela vale para a sua **sequência** até as **23:59 do mesmo dia**. Concluir = **ler + fazer o quiz**. Ficou 1 dia sem fazer? A sequência **zera**. As aulas antigas continuam abertas para você recuperar o conteúdo, mas só a do dia mantém a ofensiva. 🔥

---

### Notas de implementação (por que não precisou de código)
- A liberação usa **America/São_Paulo (UTC-3)** — corrigido no agendamento por aula (fuso do navegador → BRT).
- A **sequência** já é calculada por dias consecutivos em BRT: a aula-completa conta no dia do `quizUlt`;
  pular um dia zera (`sequenciaDeDias` em `lib/gamificacao/engajamento-leitura.ts`). Ou seja, "vale até 23:59
  do mesmo dia" já está refletido na ofensiva — sem esconder conteúdo (catch-up permitido).
- Se um dia quiser **fechar a aula de verdade** às 23:59 (trava técnica), é a opção B/C do plano — não implementada
  de propósito (esconderia dias passados de todos os alunos).
