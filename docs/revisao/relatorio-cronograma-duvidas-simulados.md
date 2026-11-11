# Auditoria de dados reais: Cronograma Adaptativo, Central de Dúvidas e Simulados

Telas: `apps/web/app/admin/revisao/{cronograma,duvidas,simulados}`. Libs: `apps/web/lib/revisao/{cronograma,cronograma-schema,duvidas}.ts`.
Legenda de origem: R = lido do banco; C = calculado no servidor com dados reais; F = constante do produto (copiada do protótipo); X = fictício.
Não abri as telas no navegador nem consultei o banco: a auditoria foi feita lendo o código. Só rodei `tsc --noEmit`.

## a) Inventário

### Cronograma Adaptativo (cabeçalho, comum às 5 abas)
| Elemento | Antes | Depois | Fonte |
|---|---|---|---|
| Textos do cabeçalho, rótulos, "Abrir a Biblioteca" | F | F | texto do protótipo; link `/admin/biblioteca` |
| KPI Aulas no cronograma | C | C | definições do conteúdo efetivo (`simulado_pastas`, `simulado_conteudo_documentos`, overlay do Catálogo de metas), só aulas ativas e com a disciplina ligada |
| KPI Páginas de PDFull | C | C | soma de `simulado_conteudo_versoes.paginas` (versão atual) ou do catálogo |
| KPI Materiais pendentes | C (só links e override) | C | falta de PDFull, PDFlash, PDFight ou Questões, calculada pelas fontes reais da seção "O que foi trocado" |
| KPI Regras diferentes do 2.0 | C (valores de exemplo) | C | regras salvas + valor vigente no motor, comparados ao padrão 2.0 |
| Contagens das abas | C | C | pendentes; nº de disciplinas; regras alteradas; `simulado_revisao_cron_versoes` (count) |
| Aviso de migração pendente | n/a | novo | exibido quando `simulado_revisao_cron_regras` não existe |
| Falha ao ler o catálogo | quebraria a página | aviso | try/catch na página |

### Aba Cobertura das aulas
| Elemento | Antes | Depois | Fonte |
|---|---|---|---|
| Notas (info e pendências) e ritmo "17 páginas por hora" | C | C | `ritmoPadrao` é valor vigente do motor (`velPadrao`) |
| Busca, filtro de disciplina, filtro de situação, ordenação, paginação de 25 | C | C | no servidor, sobre as linhas calculadas |
| Ordem | C | C | ordem de distribuição do catálogo |
| Aula e disciplina | R | R | `meta_def`/catálogo: disciplina, número, título |
| PDFull (páginas) | R | R | `simulado_conteudo_versoes.paginas` ou catálogo |
| PDFlash e PDFight | parcial: só override do catálogo | R | override do catálogo OU documento publicado na pasta tipada `simulado_pastas.cronograma_tipo_material = 'pdflash'/'pdfight'`, casado por disciplina + nº da aula, com `versoes.paginas`; se não houver páginas medidas, mostra "na Biblioteca" |
| Questões | só link | R | contagem real via filtro da aula (`simulado_cronograma_adaptativo_qf` + `contarQuestoesFiltro`, "N q."), senão link QC/TEC, senão documento de Questões na Biblioteca, senão "falta" |
| Link PDFull | R | R | `documento_id`, abre `/admin/biblioteca/conteudo/{id}` |
| Tempo total | C | C | páginas ÷ ritmo, arredondado ao bloco + tempos das regras |
| Estado vazio | F | F | |

### Aba Disciplinas
| Elemento | Antes | Depois | Fonte |
|---|---|---|---|
| Lista de disciplinas | R | R | disciplinas das aulas ativas + `simulado_revisao_cron_disciplinas` |
| "Tem PDFlash" (padrão) | R | R | `semFlash` real do motor (`lerCfgMetas`); override por linha salva |
| "Tem PDFight" e "No cronograma" | R | R | `simulado_revisao_cron_disciplinas`; padrão ligado |
| Nº de aulas | C | C | contagem do catálogo |
| Adicionar, remover, busca, filtro, ordenação | R | R | |
| Texto de apoio | F | F | |

### Aba Regras do cronograma
| Elemento | Antes | Depois | Fonte |
|---|---|---|---|
| Rótulos, unidades, limites, dicas, selos Proposta/Confirmar, padrão 2.0 | F legítimo | F legítimo | constantes do produto (`cronograma-schema.ts`) |
| 11 regras com equivalente no motor | F (valor 2.0 exibido como se fosse do tenant) | R | valor real vigente do tenant (`simulado_tenants.tema.cronograma_adaptativo_cfg`): `ritmoPadrao`←`velPadrao`, `tPdflash`←`durFl`, `tQuestoes`←`durQu`, `tLegproc`←`durLp`, `offPdflash`←`offsetRevisao`, `offQuestoes`←`offsetQuestoes`, `tEspPdflash`←`durRf`, `tEspQuestoes`←`durRq`, `limiarAcerto`←`acertoMin`, `limiteSemanas`←`maxSemanas`, `priMinHoras`←`diaCurtoMin` ÷ 60 |
| As outras 40 regras | F | R | valores salvos em `simulado_revisao_cron_regras.valores`, padrão 2.0 quando não salvo |
| Nota de equivalência | n/a | novo | lista as regras ligadas ao motor e conta as que não têm equivalente |
| Simulador rápido | C no cliente | C no cliente | entradas do usuário + `blocoArred`, `tPdflash`, `tQuestoes` reais; é uma calculadora, não é dado da plataforma |
| "O que muda em relação ao 2.0" | C | C | real vs padrão |
| Salvar e restaurar | R | R | só grava regras sem equivalente no motor |

### Aba Sprints
| Elemento | Antes | Depois | Fonte |
|---|---|---|---|
| Lista, busca, filtro, paginação | R | R | `simulado_revisao_cron_sprints` |
| Nome, dias, metas, situação, observação, data | R | R | mesma tabela |
| Modal Criar/Editar/Excluir | R | R | |
| Nº de alunos do sprint | não existe | não existe | sem fonte (ver c) |

### Aba Versões e exportação
| Elemento | Antes | Depois | Fonte |
|---|---|---|---|
| Lista de versões (nº, data BRT, regras alteradas, aulas) | R | R | `simulado_revisao_cron_versoes` |
| Salvar versão | R | R | snapshot de regras e disciplinas |
| Carregar versão | R | R | grava via a mesma regra (sem tocar no motor) |
| Caixa de texto de exportação | C | C | regras, disciplinas e contagem de aulas reais |
| Copiar configuração | C | C | JSON completo (também por download se o clipboard falhar); materiais com páginas, "no ar" e questões reais |
| Carregar configuração colada | R | R | valida e normaliza; só regras e disciplinas |

### Central de Dúvidas (3 abas)
| Elemento | Origem | Fonte |
|---|---|---|
| Contagens das abas | R/C | count em `simulado_duvidas` (aberta; respondida+resolvida), `simulado_material_reportes` (≠ resolvido), `simulado_material_avaliacoes` |
| Toggle Sem resposta/Respondidas, busca, paginação de 12 | R | `simulado_duvidas.status`, `.titulo` |
| Card: disciplina, "há X", título, prévia | R/C | `simulado_disciplinas.nome`; `ultima_msg_em`; `titulo`; 1ª mensagem do aluno em `simulado_duvida_mensagens` |
| Thread: título, disciplina, aluno, quando, "onde" | R | `titulo`, `disciplina_id`, `simulado_estudantes.nome` (abreviado), `origem{label,pagina}` |
| Mensagens | R | `simulado_duvida_mensagens` |
| Responder | R | `responderDuvidaAdmin` + notificação in-app + auditoria |
| Encaminhar para professor: opções | R | `simulado_tenant_acessos` (role ≠ estudante) + `simulado_users` |
| Encaminhar | R | `simulado_revisao_duvida_encaminhamentos` + auditoria; histórico exibido na thread |
| Problemas: material, página, aluno, tipo, texto, quando | R | `simulado_material_reportes` + `simulado_conteudo_documentos.titulo` |
| Problemas: Trocar arquivo | R | link para `/admin/biblioteca/conteudo/{documento_id}` |
| Problemas: Corrigido | R | `resolverReporte` + notificação in-app + auditoria |
| Problemas: filtros e ordenação | R | `status`, `tipo`, `descricao`, `criado_em` |
| Avaliações: KPIs | C | média pela contagem de cada nota de 1 a 5; 1 ou 2 estrelas; com comentário |
| Avaliações: tabela | R | `simulado_material_avaliacoes` + título do documento |
| Avaliações: filtro, busca, ordenação | R | `nota`, `comentario`, `criado_em` |
| Estados vazios e erro | F | |

### Simulados
| Elemento | Antes | Depois | Fonte |
|---|---|---|---|
| KPI Simulados ativos | R | R | `simulado_simulados` (publicado, não deletado, sem dono aluno) |
| KPI Questões no banco | R | R | `simulado_questoes` (não deletado) |
| KPI Estudantes | R | R | `simulado_estudantes` |
| KPI Grupos de alunos | R | R | `simulado_grupos` |
| Atalhos: 9 rotas internas | F | F | rotas reais do sistema |
| Descrição "Banco de questões" | R | R | count real |
| Descrição "Grupos de alunos" | F (dizia "em pastas, com origem Guru ou Curseduca") | R | "N grupos de alunos" |
| Descrição "Desafio de Jurisprudência" | X ("em 15 ciclos") | F neutro | "Teses e súmulas do desafio" |
| Nota final com a contagem de grupos | R | R | |

## b) O que foi trocado
1. As 11 regras com equivalente no motor mostram o valor vigente real do tenant e ficam somente leitura. Antes mostravam o padrão 2.0 como se fosse do tenant e deixavam editar sem efeito. Elas não são mais gravadas em `simulado_revisao_cron_regras`.
2. Lista explícita no topo da aba Regras: quais regras têm equivalente no motor e quantas não têm (40, ficam como contrato para a tecnologia).
3. Cobertura de PDFlash e PDFight passou a ler os documentos publicados nas pastas tipadas da Biblioteca, com as páginas da versão atual, além do override do catálogo.
4. Cobertura de Questões passou a usar a contagem real de questões que casam com o filtro de cada aula, além do link e do documento de Questões.
5. O padrão de "Tem PDFlash" lê o `semFlash` real do motor. Já era assim; foi confirmado.
6. Descrições de "Desafio de Jurisprudência" e "Grupos de alunos" em Simulados não têm mais texto inventado.
7. Estado de erro do catálogo na página do cronograma e aviso claro de migração pendente.
8. A migration agora se chama `20261112050000_revisao_cronograma_duvidas.sql`; as mensagens das actions e telas foram atualizadas.

## c) Lacunas restantes
- **Alunos por sprint e trilha por dia:** não há fonte nem tabela; o sprint só registra nome, dias, metas e situação. O protótipo também só simulava isso.
- **40 regras sem equivalente no motor:** ficam salvas como contrato; não alteram os planos. Ligar ao motor exige editar `lib/cronograma/adaptativo/*`, que tem trabalho do usuário não commitado.
- **Atalhos de PDFlash/PDFight:** o casamento de documento com aula depende de "Aula N" no título e da disciplina; documentos fora desse padrão não são reconhecidos (aparece "falta").
- **Contagem "N q." por aula:** é feita só para as linhas da página mostrada (cache de 120 s). Aulas com filtro mas sem questões mostram "0 q.", e o pendente conta o filtro como material.
- **E-mail ao aluno ao responder ou corrigir:** só há notificação in-app. O envio por e-mail não existe no sistema.
- **Encaminhamento:** registra e audita; não notifica o professor.
- **Avaliações:** só documentos da Biblioteca; videoaula e "Revisão" do protótipo não têm tabela.
- **Ações de Biblioteca do protótipo** (`cradd`, `craddrow`, `crdel`, `crrowbool`, `crcsv`, `libhist`): pertencem à tela Biblioteca, não ao Cronograma. Não implementadas aqui.
- **Links `goreps`/`goaval`:** o dashboard e outras telas devem apontar para `/admin/revisao/duvidas?aba=rep` e `?aba=aval`; é responsabilidade de quem constrói essas telas.
- **Nomes de alunos abreviados** ("Rafael T.") como no protótipo; o admin não vê o nome completo nesta tela.
- **Não verificado:** comportamento visual no navegador, quantidade real de aulas ou documentos do tenant, e a Redis em produção (`remember` degrada sem Redis).

## d) Divergências em relação aos prints corrigidas
- **08 Cronograma:** conferidos cabeçalho, 4 KPIs, abas com contagens, as duas notas na ordem (info e depois pendências) e as 8 colunas da tabela. Divergências: células de PDFlash/PDFight/Questões agora refletem o dado real, com "na Biblioteca" quando existe documento sem páginas medidas.
- **11 Dúvidas:** conferidos abas com contagens, toggle "Sem resposta · N / Respondidas · N", lista (pílula de disciplina abreviada, "há X", título, prévia), thread (título, subtítulo "disciplina · aluno · quando", pílula "onde", balão "X perguntou", "Sua resposta", Enviar resposta, select e Encaminhar). Acrescentei busca e paginação (regra do projeto, não estão no print).
- **07 Simulados:** conferidos 4 KPIs, cartão "Atalhos…", 9 atalhos na mesma ordem e a nota. Divergência intencional: atalhos internos em vez do domínio externo; textos de Jurisprudência e Grupos sem dados inventados.
- **Migration pendente:** sem `simulado_revisao_cron_regras` a tela mostra o aviso no topo; leituras de regras, disciplinas, versões e sprints fazem fallback sem quebrar; as actions de gravação retornam a mensagem com o nome da migration. Verificado por leitura de código (as leituras checam `TABELA_AUSENTE`); não testado contra o banco.
