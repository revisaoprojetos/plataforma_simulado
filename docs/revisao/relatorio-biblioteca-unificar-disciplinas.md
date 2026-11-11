# Biblioteca › Unificar disciplinas (conteúdos)

Ferramenta equivalente ao Unificar › Termos da aba Questões, para a **Biblioteca de conteúdos** (PDFull, PDFlash, PDFight, LegProc, JurisClub).
Entrada: botão **Unificar disciplinas** no cabeçalho do painel de pastas (só para quem tem `configuracoes:update`; não aparece na aba Questões).
Visão em largura cheia dentro da Biblioteca (`?modo=unificar-disciplinas`, com "Voltar aos materiais").

## 1. Mapa: o que é "disciplina" nos conteúdos

| Camada | Onde | Observação |
|---|---|---|
| Pasta-disciplina | `simulado_pastas` (`folder_area` `conteudo` ou `conteudo_jurisclub`), raiz da árvore, em geral com `disciplina_id` | Cronograma (`conteudo-banco.ts`) resolve a disciplina de um documento subindo a árvore até a pasta com `disciplina_id` |
| Subpasta de tipo | filhas com `cronograma_tipo_material` (pdfull/pdflash/pdfight/legproc) | os documentos ficam nelas |
| Documento | `simulado_conteudo_documentos.pasta_id` (+ texto livre `metadados.disciplina`) | |
| Taxonomia | `simulado_disciplinas` (compartilhada com questões, assuntos, cronograma metas/links/conjuntos, dúvidas, respostas avulsas) | pasta aponta via `disciplina_id` |
| Acesso | `modo_acesso`/`acesso_geral`/`oculto` na pasta + `simulado_pasta_grupos` + `simulado_pasta_estudantes`; documentos herdam pelo `pai_id` | |
| Produtos / vendas | `simulado_produto_itens` (`tipo_item='biblioteca_pasta'`, `item_id`), `simulado_integracao_mapeamentos.pasta_id` | |
| Capa / página inicial | `capa_url`, `capa_card_url`, `capa_modo`, `capa_meta`, `pagina_inicial*` na pasta (herdados pelos documentos) | |

## 2. Números reais (tenant Revisão, banco consultado em 11/11/2026)

- 26 pastas-disciplina em `conteudo` (881 documentos de conteúdo) e 7 em `conteudo_jurisclub` (120).
- **Pastas duplicadas/variantes (detecção de `questoes-termos-deteccao.ts`, limiares 62% a 98%): 0 grupos** nas duas áreas. Nenhuma pasta compartilha `disciplina_id`; os nomes das pastas não têm variantes. "Direito Previdenciário" × "Direito Previdenciário Público" parecem irmãs mas os títulos dos documentos não coincidem (RGPS × RPPS): são disciplinas diferentes, e a detecção corretamente não as junta.
- `metadados.disciplina` quase não é usado (16 documentos JurisClub, todos "Direito Administrativo"): não há sujeira de texto livre.
- **O que existe de real é duplicidade na taxonomia ligada às pastas** (6 grupos, mesma detecção do Unificar › Termos): Internacional Privado × Direito Internacional Privado, Internacional Público × Direito Internacional Público e Previdenciário Público × Direito Previdenciário Público envolvem disciplinas que **as pastas usam** (pasta "Direito Internacional Privado" aponta para a disciplina "Internacional Privado", que tem 0 questões, enquanto as 4 questões usam "Direito Internacional Privado"). Processo Civil, Processo Penal e Eleitoral duplicam disciplinas sem pasta. A prévia mostra "Pastas da Biblioteca ligadas à disciplina: 1" nesses casos.
- Pastas com regras de acesso próprias: "Direito Empresarial" e "Direito Agrário" (1 grupo + 16 alunos); as demais abertas. Subpastas de Direito Civil têm 1 aluno liberado (PDFight/PDFlash/LegProc). Isso gera conflito de acesso real em várias combinações (testado na prévia).
- Subpasta-tipo `PDFull` de Direito Administrativo existe duplicada, mas uma já está na Lixeira (ignorada).

## 3. Como funciona

Abas de sublinhado: **Pastas repetidas** · **Disciplinas da taxonomia** · **Escolher manualmente** · **Histórico**.

- **Pastas repetidas**: lista de grupos à esquerda (confiança, similaridade, nº de documentos; busca, ordenação, limiar, ver ignorados, paginação), revisão à direita (variantes lado a lado com documentos, subpastas, tipos de material, taxonomia, restrição), escolha da pasta mantida, nome final, "não é igual", **São disciplinas diferentes** (grava em `simulado_termos_ignorados` com `tipo='pasta_disciplina'`, fallback localStorage `bib-pastas-ignoradas:v1`). Extra além da detecção de nomes: pastas que apontam para a **mesma** `disciplina_id` entram no mesmo grupo.
- **Disciplinas da taxonomia**: reuso EXATO do componente `Candidatos` do Unificar › Termos (tipo disciplina, rota `questoes-termos`, mesma prévia/confirmação/desfazer). Só aparece para quem tem `questoes:view`. A prévia lista as pastas da Biblioteca repontadas.
- **Escolher manualmente**: todas as pastas-disciplina (busca + página), marque 2+ e revise; usa a mesma prévia/mescla. Necessário porque a detecção por nome hoje devolve 0 grupos.
- **Histórico**: unificações de pastas com **Desfazer**.

### Mesclar (rota `POST /api/admin/revisao/biblioteca/pastas-unificar`, transação SQL)
Ações: `previa` (`configuracoes:view`, não grava) · `mesclar` · `ignorar` · `desfazer` (`configuracoes:update`). GET: `s=grupos|pastas|historico`. Unificar a taxonomia junto exige também `questoes:update`.

Regras de conflito (decididas e documentadas):
1. **Subpastas**: casam por **tipo de material** (iguais e não nulos) ou, se um dos lados não tem tipo, por **nome normalizado**; tipos diferentes nunca se fundem. Fundir = documentos e subpastas da origem vão para a destino (recursivo); sem par → a subpasta muda de pai (sem renomear, sem colisão de nome).
2. **A pasta mantida vence**: ordem, cor, ícone, capa, acesso, `oculto`, tipo. Só **preenche o que está vazio** (cor, ícone, tipo de material e a capa **em bloco**: capa_url + card + modo + `capa_meta`). A mantida sem `disciplina_id` herda a da variante.
3. **Acesso**: comparação por assinatura efetiva (modo, acesso geral, oculta, grupos, alunos). Se diferente, a prévia lista os pares e a confirmação **exige o aceite explícito** (o servidor também recusa sem `aceitarAcesso`). Os vínculos de acesso das pastas arquivadas ficam intocados para o desfazer.
4. **Taxonomia**: `mesma` (nada), `herda` (a mantida assume), `diferentes` → checkbox "Unificar também a disciplina nas questões e no cronograma" (padrão marcado; chama `unificarDisciplinas` existente, com log/desfazer próprios). Se desmarcado, a prévia avisa quantas metas/links/conjuntos ficam sem material (os documentos passam à disciplina da pasta mantida).
5. **Variantes** são arquivadas (soft-delete, `deletado_em`, 30 dias) **só depois** de ficarem sem documentos e subpastas ativos (conferência final dentro da transação; senão aborta e nada muda). Documentos da Lixeira também acompanham.
6. Também acompanha: `metadados.disciplina` igual ao nome da variante → nome final; `simulado_produto_itens` (biblioteca_pasta) e `simulado_integracao_mapeamentos` repontados (duplicata na mantida é removida e guardada).
7. Trava de pastas (`FOR UPDATE`), pastas da mesma área, sem ancestral/descendente, máx. 30 variantes. Auditoria `registrarAudit` com o estado anterior (ids por pasta); invalida a árvore (`limparCacheGestao`) e o cache próprio. Cache de leitura 2 min + "Recalcular".
8. **Desfazer** (log em `simulado_termos_mesclagens`, `tipo='pasta_disciplina'`): restaura pastas, pais, documentos (só os que ainda estão no destino), campos herdados/nome/disciplina (só se não mudaram), metadados, produtos/integrações e, se houve, a unificação da taxonomia.

## 4. Verificado no navegador real × só por código

Navegador (Playwright, dev em localhost:3000, usuário de teste, **nenhuma gravação**: POSTs feitos = só `previa`; contagens do banco idênticas antes/depois: 243 pastas ativas, 9 na Lixeira, 1003 documentos, 0 logs, 0 ignorados, 48 disciplinas):
- botão no painel de pastas das abas de conteúdo (ausente na aba Questões), abertura em ~190 ms, URL `?modo=`, deep link, "Voltar aos materiais", abas PDFlash/JurisClub preservadas (14 linhas, 28 pastas);
- estado vazio de Pastas repetidas; aba Taxonomia com os 6 grupos reais e prévia (1 pasta ligada); aba manual (1,4 s) com prévia de 2,9 s; prévia com conflito de acesso real: botão Confirmar **desabilitado** até o aceite, habilitado depois; sem scroll horizontal a 420 px; sem erros de página;
- Unificar › Termos das Questões continua funcionando.
API (leitura/prévia real): 0 grupos, 26+7 pastas, prévias de 2 e 3 variantes (29 e 119 documentos, 4 e 8 fusões), `mesclar` sem aceite de acesso recusada (400) sem gravar, ids inválidos/mesma pasta/área errada/ação inválida.
SQL: todas as instruções da mesclagem e do desfazer foram executadas numa transação com **ROLLBACK** contra o banco real (achou e corrigiu a restrição NOT NULL de `capa_modo`).

**Só por código (não executado de verdade):** `mesclar` com sucesso, `ignorar`, `desfazer`, a chamada a `unificarDisciplinas` a partir da mescla de pastas, o fallback localStorage e o repontamento de produto/integração (0 linhas reais).

## 5. Migrations pendentes

**Nenhuma nova.** Reusa `simulado_termos_mesclagens` e `simulado_termos_ignorados` (migration 20261113060000, já presente neste banco). Sem elas a mescla funciona (auditada), sem Desfazer, e "São diferentes" cai no localStorage. Observação: `simulado_disciplina_aliases` não existe neste banco (20261105020000/30000 parcialmente aplicadas); isso é anterior a esta entrega.

## 6. Arquivos

Novos: `lib/admin-revisao/biblioteca-pastas-unificar-tipos.ts`, `lib/admin-revisao/biblioteca-pastas-unificar.ts`, `app/api/admin/revisao/biblioteca/pastas-unificar/route.ts`, `app/admin/revisao/biblioteca/unificar-disciplinas.tsx`.
Alterados: `app/admin/revisao/biblioteca/biblioteca-app.tsx` (estado, botão no `cabecalho` do `PastasPainel`, modo), `.../page.tsx` (`?modo=unificar-disciplinas`), `app/admin/revisao/biblioteca/unificar-termos.tsx` (só `export` em `Candidatos`, `Num`, `COR_CONF`), `lib/admin-revisao/questoes-termos.ts` (`export` em `emTransacao`/`ErroNegocio`/`falha`; o histórico de termos agora ignora `tipo='pasta_disciplina'`). O Unificar de Questões segue funcionando (verificado).

## 7. Lacunas honestas

- Hoje não há pastas duplicadas reais: a utilidade imediata está na aba Taxonomia e na escolha manual.
- A detecção por nome não sugere "X" × "X Público" (palavra extra de um lado) por desenho; só manual.
- O cronograma (`conteudo-banco.ts`) não filtra pastas na Lixeira: as variantes arquivadas ficam sem documentos, então não afetam, mas o comportamento é anterior.
- Cache de acesso por documento (60 s) e leitura podem mostrar o acesso antigo por até 1 min após a mescla.
- Após 30 dias a pasta arquivada pode ser purgada pela Lixeira; o Desfazer depende de a pasta ainda existir.
- Contagem de documentos na lista usa a árvore em cache (30 s) e exclui vídeo/áudio; a prévia conta todos os documentos vivos.
- `metadados.disciplina` só é ajustado quando igual ao nome da variante.
