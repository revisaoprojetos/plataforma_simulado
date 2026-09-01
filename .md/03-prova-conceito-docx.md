# MAC — Plataforma de Lei Seca

## Parte 3 — Prova de conceito com DOCX reais

**Versão:** 1.0  
**Data da análise:** 22/07/2026  
**Status:** prova de conceito concluída; caminho simplificado reprovado; arquitetura híbrida aprovada

---

## 1. Objetivo

Validar, com documentos reais da MAC, os requisitos de:

- importar leis comentadas e grifadas em DOCX;
- disponibilizar o conteúdo de forma segura na plataforma;
- preservar texto, grifos, comentários editoriais, tabelas, imagens e identidade visual;
- exportar novamente para DOCX e PDF;
- impedir perda silenciosa de conteúdo ou formatação.

---

## 2. Documentos usados

Foram analisados os três arquivos fornecidos na pasta oficial do projeto:

1. `Decreto-Lei 3.365_1941 - Desapropriações (10.07.26).docx`;
2. `Decreto-Lei 4.657_1942 - LINDB (10.07.26).docx`;
3. `Lei 9.868_1999 - ADI e ADC (10.07.26).docx`.

Os arquivos originais não foram alterados.

---

## 3. Método

A prova de conceito teve quatro etapas:

1. leitura estrutural do pacote OOXML de cada DOCX;
2. renderização dos originais pelo Microsoft Word para inspeção visual;
3. importação experimental para JSON usando uma biblioteca DOCX de alto nível;
4. reconstrução experimental da LINDB para DOCX e nova renderização pelo Word.

Foram comparados:

- número de páginas;
- cobertura textual;
- parágrafos;
- tabelas e mesclagens;
- imagens e desenhos;
- caixas de texto;
- hyperlinks;
- cabeçalhos e rodapés;
- grifos e cores;
- preservação da capa e do projeto visual.

---

## 4. Perfil real dos documentos

| Documento | Páginas | Parágrafos | Tabelas | Mídias | Desenhos | VML | Caixas de texto | Links | Mesclagens |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Desapropriações | 28 | 563 | 23 | 9 | 1 | 1 | 5 | 0 | 65 |
| LINDB | 18 | 371 | 24 | 9 | 13 | 8 | 12 | 2 | 0 |
| ADI e ADC | 23 | 499 | 21 | 8 | 1 | 1 | 5 | 0 | 75 |

Todos possuem cabeçalhos e rodapés próprios. Os números acima mostram que os arquivos não são apenas texto com realces: são documentos editoriais completos.

### 4.1 Elementos visuais confirmados

- capa institucional com imagem, marca e elementos posicionados;
- página de novidades da versão;
- legenda editorial;
- cabeçalho e rodapé em todas as páginas de conteúdo;
- numeração de página;
- grifos amarelos, verdes e roxos;
- exceções e palavras críticas em vermelho;
- caixas cinza, azul e salmão;
- tabelas de comparação e síntese;
- bordas, células mescladas e larguras específicas;
- ícones de conteúdo cobrado em prova;
- comentários jurisprudenciais extensos;
- hyperlink em pelo menos um dos documentos;
- imagens e objetos flutuantes.

---

## 5. Resultado do importador simplificado

O primeiro importador experimental usou uma biblioteca DOCX de alto nível e converteu parágrafos, runs, grifos básicos, cores e texto de tabelas para JSON.

### 5.1 Cobertura textual

| Documento | Palavras/tokens no OOXML | Recuperados | Cobertura |
|---|---:|---:|---:|
| Desapropriações | 8.007 | 7.324 | 91,47% |
| LINDB | 4.489 | 4.254 | 94,76% |
| ADI e ADC | 5.593 | 5.030 | 89,93% |

O método perdeu entre aproximadamente 5% e 10% do conteúdo textual. A principal causa foi conteúdo dentro de caixas de texto, VML e objetos gráficos que não aparece na API simples de parágrafos.

### 5.2 Reconstrução da LINDB

O original da LINDB possui 18 páginas. O DOCX reconstruído pelo caminho simplificado gerou 13 páginas.

A comparação visual mostrou perda ou alteração de:

- capa e página de novidades;
- cabeçalho e rodapé institucionais;
- imagens e objetos flutuantes;
- geometria e largura de tabelas;
- espaçamento e paginação;
- caixas de texto;
- partes do conteúdo textual;
- consistência da identidade visual.

### 5.3 Veredito

**REPROVADO para produção.**

Não será adotado um fluxo baseado somente em `python-docx`, Mammoth ou conversão direta para HTML. Essas ferramentas podem auxiliar, mas não podem ser a única camada de leitura e preservação.

---

## 6. Decisão arquitetural aprovada

Será utilizada uma arquitetura híbrida com três trilhas simultâneas.

### 6.1 Trilha 1 — original imutável

O DOCX original será sempre armazenado integralmente, com:

- hash SHA-256;
- nome original;
- manifesto dos arquivos internos do pacote;
- data e autor da importação;
- versão do importador;
- vínculo com a lei e com o rascunho produzido.

Essa trilha garante que nenhuma informação original desapareça, mesmo se a plataforma ainda não souber exibi-la.

### 6.2 Trilha 2 — conteúdo estruturado para a plataforma

O importador OOXML converterá os elementos suportados para um formato canônico:

- seções e configuração de página;
- cabeçalhos e rodapés;
- parágrafos e runs;
- artigos, parágrafos, incisos e alíneas;
- grifos, cores e formatação tipográfica;
- tabelas com geometria, bordas, preenchimentos e mesclagens;
- hyperlinks;
- imagens;
- caixas editoriais;
- objetos flutuantes e caixas de texto;
- quebras de página;
- âncoras jurídicas estáveis.

Essa representação será usada pelo leitor e pelo editor da plataforma.

### 6.3 Trilha 3 — preservação OOXML

Elementos ainda não convertidos integralmente serão guardados como fragmentos OOXML referenciados pelo formato canônico.

Cada fragmento terá:

- parte de origem;
- posição no documento;
- tipo do recurso;
- texto alternativo para a web, quando possível;
- severidade;
- estado de revisão.

Um elemento preservado, mas não representável na web, gera aviso. Se afetar conteúdo ou sentido, bloqueia a publicação.

---

## 7. Formato canônico revisado

A primeira versão simples do esquema foi insuficiente. O esquema revisado deve representar:

```text
Documento
├── Origem e integridade
├── Metadados da lei
├── Registro de estilos
├── Recursos e imagens
├── Cabeçalhos
├── Rodapés
├── Seções
│   ├── Configuração de página
│   └── Blocos em ordem
│       ├── Parágrafo
│       ├── Tabela rica
│       ├── Objeto flutuante
│       ├── Quebra
│       └── Bloco OOXML preservado
└── Relatório de conversão
```

O rascunho técnico está em `03-poc-docx/content-schema/canonical-law.v2-draft.schema.json`.

### 7.1 Unidade de texto

Cada trecho deve preservar:

- conteúdo;
- negrito, itálico, sublinhado e tachado;
- sobrescrito e subscrito;
- fonte e tamanho;
- cor da fonte;
- realce e sombreamento;
- hyperlink;
- identificador da origem.

### 7.2 Tabela rica

Cada tabela deve preservar:

- grade e larguras em twips;
- largura total e alinhamento;
- recuo;
- linhas e células;
- mesclagens horizontais e verticais;
- bordas por lado;
- preenchimento;
- margens internas;
- alinhamento vertical;
- parágrafos e outros blocos dentro da célula;
- repetição de cabeçalho;
- proibição de altura fixa que corte conteúdo.

### 7.3 Objeto flutuante

Capas e caixas de texto exigem:

- posição e tamanho em EMU;
- relação com página, parágrafo ou margem;
- quebra de texto;
- ordem de sobreposição;
- imagem ou conteúdo interno;
- fragmento OOXML original para reconstrução.

---

## 8. Importação de produção

O worker de importação deverá:

1. validar o pacote ZIP/OOXML;
2. calcular hash e armazenar o original;
3. inventariar todas as partes e relacionamentos;
4. extrair estilos, temas, fontes e numeração;
5. percorrer o XML mantendo a ordem dos elementos;
6. extrair cabeçalhos, rodapés, imagens e objetos;
7. converter o conteúdo suportado;
8. guardar fragmentos ainda não suportados;
9. calcular cobertura textual e de recursos;
10. gerar uma prévia web;
11. renderizar o original e a conversão;
12. emitir relatório de diferenças;
13. bloquear publicação se houver perda crítica;
14. exigir aceite editorial.

### 8.1 Meta de aceite

Para documentos dentro do perfil MAC:

- cobertura textual: 100%;
- cobertura de imagens: 100%;
- hyperlinks preservados: 100%;
- tabelas e mesclagens reconhecidas: 100%;
- nenhum elemento desconhecido descartado;
- similaridade visual definida por teste de páginas;
- revisão humana obrigatória antes da primeira publicação.

---

## 9. Estratégia de exportação

Haverá dois modos distintos.

### 9.1 Exportar original

Disponibiliza o DOCX exatamente como foi importado. É o modo de fidelidade absoluta quando não há necessidade de incorporar alterações feitas na plataforma.

### 9.2 Exportar versão consolidada

Gera um novo DOCX a partir do conteúdo canônico, aplicando:

- modelo visual MAC versionado;
- estilos e geometria registrados;
- imagens e recursos preservados;
- cabeçalhos, rodapés e paginação;
- conteúdo editorial e opções escolhidas;
- anotações pessoais somente quando autorizadas.

O DOCX consolidado deve ser aberto e renderizado antes de ser liberado.

### 9.3 PDF

O PDF será produzido a partir do DOCX consolidado pelo Microsoft Word em worker Windows ou por LibreOffice homologado, conforme o resultado dos testes de equivalência.

Para estes arquivos de referência, o Microsoft Word será considerado inicialmente o renderizador padrão-ouro.

---

## 10. Impactos no produto

### 10.1 Editor web

O editor não poderá ser um campo de HTML livre. Ele deve editar blocos estruturados e limitar alterações que destruam elementos preservados.

### 10.2 Capas e páginas institucionais

Capas e páginas de novidades podem ser tratadas como:

- páginas fixas derivadas de modelo;
- anexos visuais preservados;
- blocos editoriais especiais.

Não precisam aparecer integralmente no leitor contínuo do aluno, mas devem poder integrar DOCX e PDF exportados.

### 10.3 Cabeçalho e rodapé

Na leitura web, serão substituídos pela identidade da interface. Na exportação, serão restaurados pelo modelo documental.

### 10.4 Tabelas usadas como caixas

O importador deve distinguir:

- tabela de dados;
- quadro editorial;
- tabela usada para diagramação;
- legenda;
- bloco jurisprudencial.

Essa classificação poderá ser automática com confirmação humana.

---

## 11. Riscos restantes

| Risco | Tratamento |
|---|---|
| Objetos Word pouco comuns | Preservar OOXML e bloquear publicação se houver perda semântica |
| Diferença entre Word e LibreOffice | Homologar renderizador com o corpus MAC |
| Fontes ausentes no servidor | Instalar e versionar fontes licenciadas |
| Edição quebrar paginação | Separar leitura web de exportação paginada |
| Tabelas complexas no celular | Visualização responsiva, sem alterar o documento exportado |
| Atualização do conversor mudar resultados | Versionar conversor e manter testes padrão-ouro |
| Crescimento do acervo | Processamento assíncrono, armazenamento por hash e cache de derivados |

---

## 12. Entregáveis desta etapa

- inventário estrutural dos três DOCX;
- relatórios de cobertura textual;
- importador experimental que comprova a limitação da abordagem simples;
- esquema canônico inicial reprovado, mantido para comparação;
- esquema canônico v2 em rascunho;
- decisão de arquitetura híbrida;
- critérios de aceite para o importador de produção;
- estratégia separada de exportação original e consolidada.

---

## 13. Conclusão

É possível construir a plataforma com importação e exportação de alta fidelidade, mas os documentos reais demonstram que isso deve ser tratado como um subsistema próprio do produto.

A promessa correta não será “converter DOCX para HTML”. Será:

> Preservar integralmente o original, converter de forma auditável o perfil documental da MAC, informar toda divergência e somente publicar conteúdos aprovados.

O caminho simplificado foi descartado com evidência mensurável. A próxima implementação deve começar pelo parser OOXML de produção e pelo visualizador web de blocos, usando estes três arquivos como corpus permanente de regressão.

