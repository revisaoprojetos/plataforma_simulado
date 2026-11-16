# Auditoria de Problemas da Plataforma

Registro simples de tudo que deu errado, o que causou e como foi resolvido.
**Regra:** todo problema novo entra aqui na hora, com **data** e **assunto**. Entradas mais novas ficam no topo de cada seção.

**Versão da plataforma no momento desta auditoria:** v4.22.0 (último commit em 16/11/2026).
Em cada problema novo, anote também a **versão em que foi encontrado** e a **versão em que foi corrigido** (veja a seção "Versões" no fim).

**Legenda de status**
- ✅ Resolvido e no ar
- 🛠️ Corrigido no código, falta publicar (deploy) ou rodar o SQL
- ⏳ Em aberto

> Datas antigas ainda não estavam anotadas. Ficam como "a confirmar" e serão preenchidas conforme formos revisando.

---

## 1. Problemas relatados por alunos

| Data | Assunto | O que acontecia | Status | Como foi resolvido |
|---|---|---|---|---|
| 16/11/2026 | Cronograma adaptativo | O aluno já tinha cronograma criado e fixado, mas via a tela de "criar novo cronograma" ao clicar em continuar. | 🛠️ | A tela fica em "carregando" até o plano chegar, em vez de mostrar a tela de primeiro acesso. |
| 16/11/2026 | Cronograma: materiais não abriam | Ao iniciar a meta ou abrir o material, nada abria (principalmente LegProc). O documento aparecia com "NaN" e o carregamento era muito longo. | 🛠️ | A lista de documentos bloqueados passou a carregar em paralelo, com limite de 2 segundos e cache maior. A tela espera os dados completos antes de mostrar. |
| 16/11/2026 | Botão "Voltar" do leitor | Ao voltar do leitor, o aluno caía no início do painel de estudo, e não no cronograma que estava estudando. | 🛠️ | O "Voltar" agora retorna ao cronograma aberto. |
| 16/11/2026 | Atualizações do material | A aba mostrava "Invalid Date" no lugar da data. | 🛠️ | O leitor foi ajustado para o novo formato de dados do servidor, com o rótulo e a data já montados. |
| a confirmar | Login travado | O aluno não conseguia entrar por causa de um cookie duplicado. | 🛠️ | Correção em 3 camadas. Ainda não publicada. |
| a confirmar | Aluno na Curseduca sem acesso | O aluno aparecia como "sem acesso" mesmo com acesso liberado. | ✅ | Corrigida a regra que sincroniza o grupo. |
| a confirmar | Liberação de materiais por regra (Agosto/Setembro) | Regras não chegavam ao aluno porque a busca cortava em 1000 registros. | 🛠️ | A busca passou a paginar e a ordenar corretamente. |
| a confirmar | Missão "1 simulado" | A missão ficava em 0/1 mesmo depois de o aluno fazer o simulado. | 🛠️ | Corrigida a reconciliação da missão. |
| a confirmar | Sequência (streak) de leitura | A sequência perdia dias: contava errado depois da meia-noite e deixava buracos. | ✅ / 🛠️ | Recálculo na hora e ajuste dos dias já registrados. Uma parte ainda aguarda publicação. |
| a confirmar | Desafio Jurisprudência (jogo) | O progresso do aluno zerava. | ✅ | Adicionadas proteções e guarda local do progresso. |
| a confirmar | Pasta com subpastas | A pasta aparecia com 0 itens para o aluno. | ✅ | Corrigida a contagem de pastas aninhadas. |
| a confirmar | Aula agendada | Ao agendar uma aula, ela caía em "Rascunho". | 🛠️ | Faltava um campo na consulta. Corrigido. |
| a confirmar | E-mail duplicado | Era possível ter dois alunos com o mesmo e-mail. | ⏳ | Existe bloqueio no sistema, mas falta a trava no banco de dados. |

## 2. Problemas durante o desenvolvimento (nossos erros)

| Data | Assunto | O que aconteceu | Status | Como foi resolvido |
|---|---|---|---|---|
| 16/11/2026 | Salvar em cadernos | A tela mostrava "Salvar em cadernos indisponível". A tabela no banco estava no formato antigo. | 🛠️ | Migração `20261119060000_caderno_itens_alinhar_colunas.sql`. **Confirmar se já foi aplicada.** |
| 16/11/2026 | Visual do pop-up de caderno | O desenho saiu fraco, com azul no lugar do roxo da marca. | 🛠️ | Refeito em pop-up com a cor da marca. Faltam testes em celular e modo escuro. |
| 16/11/2026 | Barra de ferramentas do leitor | Textos e ícones sobrepostos. | 🛠️ | Corrigido no CSS. |
| 16/11/2026 | Versão na barra superior | Aparecia uma versão automática ("v3") que não deveria aparecer. | 🛠️ | Só aparece o rótulo criado pelo professor ou admin. |
| 16/11/2026 | Tipo "Sem atualizações" | Faltava essa opção para avisar que a versão não teve acréscimos. | ✅ | Tipo criado e migração `20261121000000` aplicada. |
| 16/11/2026 | Arquivos temporários no commit | Arquivos de teste `fix-c2*.mjs` de outra sessão foram commitados junto. | ⏳ | Avisado. Falta remover do repositório. |
| 16/11/2026 | Migrações com o mesmo número | Dois arquivos com o prefixo `20261119060000` (outra sessão). | ⏳ | Falta renomear um deles. |
| 16/11/2026 | Teste automático do aluno | O login de teste parou de funcionar e não deu para conferir a tela real. | ⏳ | Usado teste de código no lugar. A conferência no navegador continua pendente. |
| a confirmar | Server actions em domínio próprio | Eram rejeitadas nos domínios personalizados. | ✅ | Trocadas por rotas de API. |
| a confirmar | Busca com muitos itens | Consulta com lista grande travava. | ✅ | A busca passou a dividir a lista em blocos de 80. |
| a confirmar | Consumo de dados (egress) do Supabase | O consumo estourava com a configuração vazia. | ✅ | Conferir a configuração no Portainer e otimizar as consultas. |
| a confirmar | Build quebrando em produção | `'use server'` com `export type` passava nos testes e quebrava o build. | ✅ | Rodar o build local antes de publicar. |
| a confirmar | Servidor de desenvolvimento lento ou sem memória | O Turbopack consumia memória demais. | ✅ | Usar `pnpm iniciar`. |

---

## Versões (encontrado → corrigido)

| Assunto | Encontrado na | Corrigido na |
|---|---|---|
| Atualizações do material: "Invalid Date" e tipo "Sem atualizações" | v4.18.x (antes da 4.19.0) | Código pronto, **ainda sem versão** (falta "cpi") |
| Cronograma: tela de primeiro acesso, materiais não abrem, "NaN" | v4.19.0 | Código pronto, **ainda sem versão** (falta "cpi") |
| Botão "Voltar" do leitor | v4.18.x | v4.19.0 (parte do cronograma); ajuste final sem versão |
| Salvar em cadernos, pop-up e barra de ferramentas do leitor | v4.18.x | Código pronto, **ainda sem versão** (falta "cpi" e aplicar a migração) |
| Versão na barra superior | v4.18.x | v4.19.0 |
| Liberação por regra (corte de 1000 regras) | antes da v4.20.1 | v4.20.1 |
| PDFs do bucket privado | antes da v4.19.1 | v4.19.1 |
| Demais itens "a confirmar" | versão não registrada | versão não registrada |

> A versão de cada correção só fica definida quando o "cpi" for feito. Os itens "a confirmar" serão preenchidos ao revisar o histórico de versões (`CHANGELOG.md`).

---

## Como manter esta auditoria

Para cada problema novo, adicione uma linha no topo da tabela certa com:
**Data** (dd/mm/aaaa) · **Assunto** · **O que acontecia** · **Status** · **Como foi resolvido**.
Quando um item pendente for resolvido, mude o status e anote a data da correção.
