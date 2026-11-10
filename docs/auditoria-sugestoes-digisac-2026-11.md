# Auditoria — "Sugestões da nova plataforma" (Digisac, 27/10 a 08/11/2026)

57 itens de 30 chamados: 19 problemas, 34 sugestões/pedidos, 4 dúvidas. Cada item foi conferido contra o código.
Legenda: **CORRIGIDO** (alterado nesta rodada) · **JÁ EXISTIA** · **PARCIAL** · **PENDENTE** (porte P/M/G) · **DADO** (depende de configuração/conteúdo, não de código) · **RESPOSTA** (dúvida, texto pronto abaixo) · **SEM CAUSA** (falta informação do aluno).

> Nada foi testado em navegador. Nenhum commit, push ou migração foi feito.

## Resumo
| Situação | Qtde | Itens |
|---|---|---|
| Corrigido agora | 15 | 1, 5, 51, 14, 20, 52, 38*, 43, 16, 44, 50*, 26*, 28, 54, 55* (*parcial / causa provável) |
| Já existia | 4 | 13, 22, 36, 18 (grifos persistem) |
| Parcial | 9 | 3, 10, 12, 25, 31, 32, 35, 40, 19 |
| Pendente grande / produto | 11 | 2, 17, 23, 24, 29, 30, 33, 34, 39, 48, 6/37/57 (escrita livre) |
| Conteúdo editorial (sem código) | 6 | 8, 9, 11, 15, 41, 42 |
| Dado/configuração | 2 | 47, 49 |
| Sem causa (precisa de relato) | 6 | 4, 7, 46, 53, 56, + 55 (demais falhas) |
| Resposta ao aluno | 4 | 18, 21, 27, 45 |

## Cronograma (23 itens)
| Nº | Situação | Detalhe |
|---|---|---|
| 43, 16 | CORRIGIDO | Matérias desbalanceadas: o catálogo vinha em "ondas" (4 matérias ocupavam 100+ aulas antes das outras). Nova `ordemParalela` no motor: com mais de 4 matérias todas avançam juntas, equilibradas por fração consumida. Simulação 12 matérias/45h: todas começam na semana 1. |
| 44 | CORRIGIDO | Novo seletor "Quantas matérias estudar em paralelo?" (0 = automático) na configuração. |
| 50, 26 | CORRIGIDO (causa provável) | (A) o "último tema estudado" marcava o prefixo na ordem alfabética de `AS`, não na ordem de estudo → marcava aulas erradas; (B) aulas da Biblioteca sem match na planilha iam para o fim e a Parte 3 podia vir antes das Partes 1 e 2. Corrigido com `indicesAnteriores` na ordem do curso e `encaixarSemPlanilha`. Se persistir, preciso do cronograma de um aluno afetado. |
| 28 | CORRIGIDO | "Baixar DOCX" do iframe pulava as semanas de revisão; agora entram, com metas de revisão e questões por tema. |
| 22 | JÁ EXISTIA | Dá para marcar uma só disciplina; o painel multi-plano permite vários cronogramas. |
| 12, 31 | PARCIAL | Existe "Já estuda pelo Revisão?" com último tema por matéria (prefixo contínuo). Falta marcar aulas avulsas fora de ordem (M). |
| 10, 40 | PARCIAL | Revisão por meta (PDFlash, Flashcards, Meus grifos) existe. Falta escolher PDFight e trocar PDFull por PDFlash como meta principal (M). |
| 3 | PARCIAL | Durações são parâmetro por tenant; falta edição por aluno/meta (M). |
| 25, 32 | PARCIAL | Limites de lei seca/questões são parâmetros do tenant. Falta opção do aluno "X questões e LegProc todo dia" (M, decisão de produto). |
| 49 | DADO | A matéria só aparece nas essenciais se tiver PDFull publicado na Biblioteca, pasta ligada à disciplina e aula ativa no Catálogo de metas. Conferir esses 3 pontos no tenant. |
| 47 | DADO | Meus Extensivos lista só o que foi liberado (grupo/regra); o aluno não "adiciona". |
| 4, 46 | SEM CAUSA | Pedir id da meta (`pf:<n>`), plano do aluno e print. Hipótese p/ 4: aula sem documento. |
| 2 | PENDENTE P | Liberar para pós-extensivo = regra de liberação no admin + decisão. |
| 17, 23, 30 | PENDENTE G | Unir cursos; integrar Sprint/retas finais; cronograma de discursivas. |
| 48 | PENDENTE M | Pedido vago ("gestão do cronograma"); definir o que se espera. |
| 45 | RESPOSTA | Ver respostas. |

## Leitor de PDF, Grifos, Interface e Mobile (16 itens)
| Nº | Situação | Detalhe |
|---|---|---|
| 1 | CORRIGIDO | Botão de Suporte vira só ícone (translúcido) abaixo de 1023px de largura ou 480px de altura; respeita safe-area. Já some nos leitores. Se ainda cobrir algum botão, informar a tela. |
| 5, 51 | CORRIGIDO | Switch "Tela cheia" no leitor (Fullscreen API + prefixo webkit para iPad + fallback de modo foco); `allowFullScreen` nos iframes. |
| 14 | CORRIGIDO | Verde mais amarelado e azul mais saturado, nos 4 temas; grifos antigos mudam de tom sozinhos. |
| 20 | CORRIGIDO | Cor rosa de grifo (botão, atalho 6, filtro em "Meus grifos"). |
| 52 | CORRIGIDO | Switch "Escurecer página do PDF" (inverte o canvas; grifos continuam visíveis); salvo por aluno. |
| 38 | CORRIGIDO (parcial) | Âncora falhava quando o texto mudava só em espaços (nbsp, duplo, zero-width). Busca tolerante + aviso "N anotações não puderam ser localizadas". Se o texto mudou de verdade, a anotação fica órfã (mas não é apagada). |
| 13 | JÁ EXISTIA | Marca-texto, sublinhado, ondulado, tachado, negrito, cor do texto e contorno. |
| 35 | PARCIAL | Leitor refaz o layout ao girar o aparelho. Não gira a página do PDF em si. |
| 6, 37, 57 | PENDENTE G | Escrita livre sobre o PDF (tinta por página, persistência, reancoragem). Hoje: caneta que grifa e desenho livre só no painel de anotações. |
| 56, 7, 53 | SEM CAUSA | Pedir aparelho, navegador, rota/material afetado. Só ajustei `100vh`→`100dvh` no menu do leitor (iOS). |
| 18 | RESPOSTA | Ver respostas. |

## Banco de questões, Conteúdo, Ferramentas, Simulados e Acesso (18 itens)
| Nº | Situação | Detalhe |
|---|---|---|
| 54 | CORRIGIDO | O Recomendado só lia respostas de simulado; o que o aluno resolve no banco vai para `simulado_respostas_avulsas` e nunca entrava. Novo `lib/aluno/historico-respostas.ts` (paginado, em chunk), usado nas duas páginas. Também removido o `.limit(50)` sem ordem e truncamento em 1000 linhas. |
| 55 | CORRIGIDO (parcial) | Leitura do ledger de XP tinha `.limit(500)`: quem tinha muito histórico perdia dias e sequência. Agora paginado. Outras falhas não reproduzidas: pedir módulo e aluno. |
| 19 | PARCIAL | Tela nova do banco mostra "Simulado X — questão N" além de banca/ano. Órgão e cargo não existem no schema de `simulado_questoes`. |
| 36 | JÁ EXISTIA | Biblioteca, Cursos e Meus Extensivos. |
| 34 | PENDENTE M | Pomodoro só existe dentro do leitor; no menu lateral exige estado global persistente e compatibilidade com iframe. |
| 24 | PENDENTE G | Resposta-padrão + espelho de correção interativo (LegProc/aprofundamento, abas laterais). |
| 29, 39 | PENDENTE M/G | Provas/simulados de cursos anteriores e provas reais com diagnóstico: conteúdo + importação (CSV já existe). |
| 33 | PENDENTE G | Questões criadas pelo aluno (tabela própria, RLS, editor, aba, integração com cadernos). |
| 8, 9, 11, 15, 41, 42 | EDITORIAL | Atualizar Empresarial/Previdenciário, ampliar Sociedades, vídeos ELS, PDFlash, mais teses nos LegProcs, cards V/F a partir dos PDFs. |

## Respostas prontas ao suporte
- **18 (grifos na versão beta):** "Seus grifos ficam salvos no servidor, ligados à sua conta, não ao aparelho. Continuam ao migrar da beta para a versão final e abrem em qualquer dispositivo."
- **21 (QConcursos/TEC):** "Sim, o banco já tem funcionalidades parecidas: filtros por disciplina, assunto, banca, ano, tipo e dificuldade; status por questão (nova, acertou, errou); caderno automático de erros, cadernos próprios, favoritos, comentário do professor, estatísticas por matéria, reporte de erro e tesoura nas alternativas. Estamos evoluindo o banco com o feedback de vocês."
- **27 (Black vitalício):** "A nova plataforma está disponível a todos os alunos, hoje em fase de testes. Quem já tinha o Black vitalício pode acessá-la sem custo adicional ou continuar na plataforma antiga, sem prazo para migrar."
- **45 (liberada hoje?):** "A plataforma está liberada para todos os alunos em fase de testes. Quem preferir pode continuar na antiga."
- **47:** "Os produtos aparecem em Meus Extensivos conforme a liberação (grupo ou regra). Se estiver vazio, conferimos a liberação no admin — nos informe o e-mail da conta."
- **6/37/57:** "Você já pode grifar com a caneta, e o desenho livre fica no painel de anotações. Escrita direta sobre o PDF está no roadmap."

## Arquivos alterados
Cronograma: `lib/cronograma/adaptativo/motor28.ts`, `conteudo-banco.ts`, `public/cronograma/adaptativo/index.html`, `motor28.js` (gerado).
Leitor/Grifos: `public/leitura/leitor-jus.html`, `components/aluno/suporte-whatsapp.tsx`, `leitor-biblioteca.tsx`, `leitor-jus/leitor-jus.tsx`, `app/aluno/(portal)/nova/painel/grifos/page.tsx`.
Banco/Desafios: `lib/aluno/historico-respostas.ts` (novo), `nova/cursos/central/questoes/recomendado/page.tsx`, `(portal)/recomendado/page.tsx`, `nova/cursos/central/questoes/banco/page.tsx`, `lib/leitura/aluno-desafio-detalhe.ts`.

## Atenção antes do deploy
- Com mais de 4 matérias, o modo automático muda a ordem das metas futuras de quem regenerar o plano; metas já feitas ou fixas não mudam.
- Testar em tablet/iPad: tela cheia, modo escuro do PDF, cor rosa e o botão de Suporte.
- `LEITOR_REV` foi subido (lp11→lp12) para atualizar o cache do leitor.
