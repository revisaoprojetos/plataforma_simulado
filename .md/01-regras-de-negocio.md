# MAC — Plataforma de Lei Seca

## Especificação de Regras de Negócio

**Versão:** 1.0  
**Status:** Base para validação  
**Escopo:** MVP seguro e preparado para expansão do acervo

---

## 1. Objetivo do produto

A Plataforma de Lei Seca é um ambiente privado de estudo de legislação destinado aos alunos da MAC. O sistema deve reunir leis organizadas e atualizadas, recursos editoriais da equipe e ferramentas pessoais de estudo.

O produto deve permitir:

- administrar um acervo inicial de até 200 leis, sem estabelecer esse número como limite técnico;
- publicar novas versões das leis sem eliminar versões anteriores;
- controlar individualmente o período de acesso de cada aluno;
- preservar anotações e progresso mesmo após expiração temporária do acesso;
- impedir que um aluno acesse dados de outro aluno ou funções administrativas;
- oferecer leitura confortável em computador, tablet e celular;
- manter histórico e autoria das ações administrativas relevantes.

---

## 2. Escopo por fase

### 2.1 MVP — primeira versão utilizável

O MVP deve conter:

1. autenticação e recuperação de acesso;
2. perfis de Administrador, Editor e Aluno;
3. validade, ativação e desativação de alunos;
4. catálogo de leis por matéria;
5. leitor de leis com índice interno;
6. importação, revisão, rascunho e publicação;
7. versionamento e relatório de atualização;
8. grifos editoriais e modo sem grifos;
9. anotações pessoais e favoritas;
10. busca no acervo;
11. histórico de leitura e retomada do último ponto;
12. painel de auditoria administrativa;
13. arquivamento e restauração de leis.

### 2.2 Fase posterior

Podem ser acrescentados depois da validação do MVP:

- flashcards com revisão espaçada;
- banco de questões e caderno de erros;
- simulados;
- metas e estatísticas de estudo;
- trilhas por concurso ou carreira;
- publicação agendada;
- aprovação editorial por duas pessoas;
- aplicativo móvel dedicado;
- planos, pagamentos e renovação automática.

---

## 3. Perfis e permissões

### 3.1 Administrador

O Administrador pode:

- criar, editar, renovar, desativar e reativar usuários;
- atribuir e remover o perfil de Editor;
- cadastrar, editar, publicar, arquivar e restaurar leis;
- visualizar todas as versões e rascunhos;
- administrar matérias, tags e ordem do catálogo;
- criar conteúdo editorial institucional;
- consultar registros de auditoria;
- revogar sessões de usuários;
- iniciar redefinição de senha, sem visualizar a senha atual.

O sistema deve impedir que o último Administrador ativo remova de si mesmo o perfil de Administrador ou desative a própria conta.

### 3.2 Editor

O Editor pode:

- cadastrar e editar leis;
- importar documentos;
- criar rascunhos e relatórios de atualização;
- adicionar conteúdo editorial;
- enviar uma versão para publicação.

Por padrão, o Editor não pode:

- administrar usuários;
- alterar papéis e permissões;
- consultar anotações pessoais dos alunos;
- excluir definitivamente dados;
- acessar configurações de segurança.

No MVP, a permissão de publicar pode ser concedida ao Editor por configuração. Se não for concedida, somente o Administrador publica.

### 3.3 Aluno

O Aluno pode:

- acessar somente conteúdo publicado e disponível para seu perfil;
- pesquisar e navegar no acervo;
- criar, editar e excluir suas próprias anotações;
- criar favoritos e registrar progresso;
- consultar relatórios públicos de atualização;
- alterar a própria senha;
- encerrar suas próprias sessões.

O Aluno nunca pode:

- visualizar rascunhos;
- acessar a área administrativa;
- consultar dados ou anotações de outro aluno;
- modificar o conteúdo institucional;
- alterar a própria validade, situação ou papel.

### 3.4 Regra geral de autorização

Ocultar botões ou páginas não constitui segurança. Toda permissão deve ser validada novamente no servidor e no banco de dados. Uma operação não autorizada deve ser recusada mesmo quando solicitada fora da interface oficial.

---

## 4. Cadastro, autenticação e acesso

### 4.1 Dados do usuário

Cada usuário possui:

- identificador interno imutável;
- nome completo;
- nome de usuário único;
- e-mail de recuperação, quando adotado;
- papel;
- situação;
- data inicial de acesso;
- data e hora de expiração;
- data de criação e última alteração;
- autor administrativo da criação ou última alteração.

O nome de usuário deve:

- ser único sem diferenciar letras maiúsculas e minúsculas;
- conter somente letras sem acento, números, ponto, hífen ou sublinhado;
- ter entre 3 e 40 caracteres;
- não poder reutilizar nomes reservados, como `admin`, `suporte` e `sistema`.

### 4.2 Situações possíveis

Um usuário pode estar:

- **Pendente:** criado, mas ainda sem primeiro acesso concluído;
- **Ativo:** autorizado e dentro da validade;
- **Expirado:** validade encerrada;
- **Desativado:** bloqueado manualmente;
- **Bloqueado:** temporariamente impedido por segurança;
- **Arquivado:** preservado apenas para histórico.

O acesso somente é permitido quando o usuário está Ativo, dentro da validade e sem bloqueio de segurança.

### 4.3 Senhas

- Senhas nunca podem ser armazenadas ou exibidas em texto simples.
- Administradores não podem conhecer ou recuperar a senha atual do usuário.
- O cadastro deve gerar convite ou senha temporária forte.
- A troca da senha temporária deve ser exigida no primeiro acesso.
- A senha deve ter no mínimo 10 caracteres.
- O sistema deve permitir recuperação por fluxo seguro.
- Após redefinição administrativa, as sessões anteriores devem poder ser revogadas.
- Mensagens de login não devem revelar se determinado usuário existe.

### 4.4 Tentativas e sessões

- Tentativas excessivas de login devem produzir limitação temporária.
- Sessões devem expirar e ser renovadas de maneira controlada.
- Desativação, arquivamento ou incidente de segurança deve permitir revogar todas as sessões.
- O sistema deve manter registro de login bem-sucedido, falhas relevantes e encerramento administrativo de sessões.
- Autenticação em dois fatores deve ser obrigatória para Administradores e recomendada para Editores.

### 4.5 Validade

- A validade deve considerar a data, a hora e o fuso oficial `America/Fortaleza`.
- Por padrão, o acesso termina às 23h59min59s da data informada.
- A validade deve ser conferida em operações protegidas, não apenas na tela de login.
- Ao expirar, o usuário perde acesso ao conteúdo, mas seus dados permanecem preservados.
- A renovação reativa o acesso sem remover anotações, favoritos, progresso ou histórico.
- Renovar por um ano significa acrescentar um ano à data de expiração vigente quando ela ainda estiver no futuro; se estiver vencida, acrescentar um ano à data da renovação.
- O Administrador pode definir outra data manualmente.

---

## 5. Catálogo de leis

### 5.1 Dados de uma lei

Cada lei deve possuir:

- identificador interno imutável;
- tipo da norma;
- número;
- ano;
- título curto;
- título oficial;
- ementa;
- slug único;
- matéria principal;
- matérias e tags adicionais;
- esfera ou origem;
- situação editorial;
- ordem de exibição;
- fonte oficial;
- data da última verificação;
- versão publicada vigente;
- datas e autores de criação e alteração.

O slug é único, mas não deve ser usado como identidade interna da lei. Alterá-lo não pode quebrar anotações, favoritos ou links antigos; slugs anteriores devem redirecionar para o atual.

### 5.2 Situações editoriais

Uma lei pode estar:

- **Em preparação:** cadastrada, ainda sem conteúdo utilizável;
- **Rascunho:** possui alterações não publicadas;
- **Em revisão:** pronta para conferência;
- **Publicada:** possui versão vigente visível aos alunos;
- **Arquivada:** removida do catálogo comum, mas preservada;
- **Revogada:** identificada como revogada, com tratamento editorial definido.

Uma lei pode ter simultaneamente uma versão publicada e um novo rascunho. O aluno continua vendo a versão publicada até a publicação do novo rascunho.

### 5.3 Organização

- Toda lei deve possuir uma matéria principal.
- Uma lei pode receber matérias secundárias e tags.
- A ordem deve ser configurável dentro de cada matéria.
- O aluno pode filtrar por matéria, tipo, ano, situação e atualização recente.
- O catálogo deve funcionar com mais de 200 leis sem carregar o texto completo de todas elas.

### 5.4 Duplicidade

Antes de criar uma lei, o sistema deve verificar combinação de tipo, número, ano e esfera. Havendo possível duplicidade, deve impedir a criação automática e solicitar decisão administrativa.

---

## 6. Estrutura do conteúdo jurídico

### 6.1 Estrutura mínima

O conteúdo deve reconhecer, sempre que possível:

- partes, livros, títulos, capítulos e seções;
- artigos;
- parágrafos;
- incisos;
- alíneas;
- itens;
- anexos;
- blocos editoriais;
- tabelas.

Cada dispositivo deve receber um identificador interno estável. Esse identificador não pode depender exclusivamente da posição do dispositivo no documento.

### 6.2 Conteúdo oficial e editorial

O sistema deve distinguir visual e tecnicamente:

- texto oficial da norma;
- grifos editoriais;
- comentários da equipe MAC;
- jurisprudência;
- alertas;
- esquemas e tabelas;
- indicações de cobrança em prova.

O texto oficial não deve ser confundido com comentários da equipe. A exportação e o modo de leitura devem permitir identificar claramente a origem de cada bloco.

### 6.3 Formatação editorial

O padrão inicial será:

- amarelo: núcleo do dispositivo;
- verde: complemento;
- roxo: prazos;
- vermelho em negrito: exceções;
- cinza: comentário da equipe;
- azul: STF;
- salmão: STJ;
- ouro: TST;
- cor de alerta: atenção.

Nenhuma informação pode depender somente da cor. Os blocos devem ter rótulo, ícone ou texto equivalente para acessibilidade.

---

## 7. Importação de documentos

### 7.1 Formatos e fidelidade esperada

O MVP deve aceitar `.docx` como formato principal de importação. HTML controlado pode ser aceito como formato auxiliar. Outros formatos somente serão incorporados após validação específica.

A importação de `.docx` deve preservar, dentro do conjunto de recursos oficialmente suportados:

- estrutura de títulos e parágrafos;
- negrito, itálico, sublinhado, tachado, sobrescrito e subscrito;
- cores de fonte e de realce;
- listas, recuos, alinhamento e espaçamento;
- tabelas, células mescladas, bordas e cores;
- caixas e blocos editoriais reconhecidos;
- hyperlinks e notas de rodapé;
- imagens incorporadas, dentro dos limites definidos;
- quebras de página relevantes;
- comentários editoriais convertidos para o modelo da plataforma quando houver correspondência segura.

“Sem perder nada” significa que nenhum elemento incompatível pode ser descartado silenciosamente. Quando um recurso do Word não puder ser representado fielmente, a importação deve preservar o original, apontar o elemento afetado, informar a divergência e exigir revisão. Divergência crítica impede a publicação.

### 7.2 Fluxo obrigatório

1. O usuário autorizado envia o arquivo.
2. O sistema valida formato e tamanho.
3. O arquivo original é preservado de forma privada.
4. A conversão ocorre em ambiente controlado.
5. O conteúdo é sanitizado.
6. A estrutura jurídica é identificada.
7. O sistema apresenta alertas e pré-visualização.
8. O Editor revisa o resultado.
9. O conteúdo é salvo como rascunho.
10. A publicação exige ação separada e explícita.

A pré-visualização deve permitir comparar o documento original renderizado e a versão convertida. A importação somente será considerada concluída após o Editor aceitar o resultado.

### 7.3 Segurança da importação

- Scripts, formulários, iframes, eventos executáveis e URLs perigosas devem ser removidos.
- Somente elementos, atributos e estilos previamente permitidos podem permanecer.
- A validação deve ocorrer no servidor mesmo que também exista no navegador.
- Um arquivo importado nunca pode publicar conteúdo automaticamente.
- Erros de conversão devem ser registrados e apresentados ao Editor.
- O tamanho máximo será configurável.

### 7.4 Nova lei e atualização

No início da importação, o usuário deve escolher entre:

- criar nova lei;
- importar nova versão para lei existente.

O sistema não deve criar uma nova lei automaticamente quando a intenção for atualizar uma lei existente.

### 7.5 Arquivo original e rastreabilidade

- Cada importação deve preservar o `.docx` original em armazenamento privado.
- O registro deve relacionar arquivo, lei, rascunho, usuário, data, ferramenta e versão do conversor.
- Uma nova conversão não pode sobrescrever o arquivo original nem o resultado anterior.
- Imagens extraídas devem manter vínculo com a importação de origem.
- O Administrador deve conseguir baixar o arquivo original.
- Arquivos devem passar por validação de extensão, tipo real, tamanho e conteúdo malicioso.

---

## 8. Edição, revisão e publicação

### 8.1 Rascunhos

- Alterações devem ser salvas automaticamente como rascunho, com indicação de estado.
- O histórico de rascunhos deve permitir recuperar versões recentes.
- Dois usuários editando o mesmo rascunho devem receber aviso de conflito.
- A interface deve informar quem editou por último e quando.

### 8.2 Publicação

- A publicação sempre cria uma versão imutável.
- Uma versão publicada não é alterada diretamente; correções geram outra versão.
- Somente uma versão pode ser a vigente para os alunos.
- A troca da versão vigente deve ocorrer em uma única operação transacional.
- Se a publicação falhar, a versão anterior deve continuar vigente.
- Cada versão registra número, data, autor, origem e resumo de alterações.
- O Administrador pode restaurar uma versão anterior, gerando uma nova publicação baseada nela.

### 8.3 Relatório de atualização

O relatório público deve possuir:

- data de referência;
- resumo em linguagem clara;
- tipo: inclusão, alteração, revogação, correção editorial ou outro;
- dispositivos afetados, quando identificáveis;
- autor e data de criação internos;
- versão relacionada.

Registros técnicos automáticos permanecem na auditoria e não aparecem no relatório público.

### 8.4 Comparação

O Administrador e o Editor devem conseguir comparar rascunho e versão vigente. Em fase posterior, o aluno poderá visualizar as diferenças relevantes entre versões publicadas.

### 8.5 Exportação para DOCX e PDF

O sistema deve exportar uma lei para `.docx`, PDF ou ambos. A exportação deve ser gerada a partir da versão selecionada e não do HTML visível no navegador.

Conforme sua permissão, o usuário deve poder escolher:

- versão vigente ou histórica;
- documento com ou sem grifos;
- inclusão de comentários institucionais e relatório de atualizações;
- modelo previamente definido de página, margens e identidade institucional;
- inclusão das próprias anotações, quando essa opção estiver habilitada.

A exportação deve preservar hierarquia e numeração, formatação tipográfica, realces, cores, caixas editoriais, tabelas, células mescladas, imagens, hyperlinks, cabeçalhos, rodapés, paginação e quebras de página controladas. O arquivo deve identificar a lei, a versão e a data de geração.

Regras adicionais:

- O `.docx` deve ser um DOCX válido e editável, não HTML renomeado.
- O PDF deve manter o mesmo conteúdo e identidade visual do DOCX, ressalvadas diferenças inerentes ao formato.
- A geração deve ocorrer no servidor para ser consistente entre navegadores e dispositivos.
- O sistema deve renderizar e validar o arquivo antes de disponibilizá-lo.
- Uma falha não pode produzir arquivo parcial apresentado como concluído.
- A exportação deve registrar usuário, lei, versão, formato, opções e data.
- Anotações de outro aluno nunca podem ser incluídas.
- A permissão de exportação para alunos pode ser controlada por plano, turma ou configuração.
- O padrão visual de exportação deve ser versionado; mudanças futuras não alteram arquivos já gerados.

---

## 9. Arquivamento e exclusão

- A operação comum para retirar uma lei do catálogo é **Arquivar**, não Excluir.
- Leis arquivadas preservam versões, relatórios, anotações, favoritos e auditoria.
- Uma lei arquivada pode ser restaurada.
- A exclusão definitiva exige permissão especial, confirmação reforçada e registro de auditoria.
- A exclusão definitiva deve ser bloqueada enquanto existirem dados dependentes, salvo processo explícito de retenção e anonimização.
- Usuários também devem ser desativados ou arquivados, não apagados rotineiramente.

---

## 10. Leitura pelo aluno

### 10.1 Navegação

O leitor deve oferecer:

- catálogo por matéria;
- índice interno da lei;
- busca dentro da lei;
- link direto para dispositivo;
- avanço para dispositivo anterior e seguinte;
- retorno ao último ponto lido;
- indicação da versão e da última atualização;
- layout responsivo.

### 10.2 Preferências

O aluno pode configurar:

- tamanho da fonte;
- espaçamento;
- largura de leitura;
- tema claro, escuro ou sépia;
- exibição com ou sem grifos editoriais;
- posição do painel de anotações.

As preferências devem acompanhar o usuário entre sessões e dispositivos.

### 10.3 Modo sem grifos

O modo sem grifos é apenas uma preferência visual. Ele não altera o conteúdo publicado.

Devem ser ocultados:

- fundos coloridos de destaque;
- negritos usados exclusivamente como marcação editorial;
- vermelho editorial de exceção.

Devem permanecer:

- estrutura da norma;
- negrito estrutural;
- comentários e jurisprudência, identificados por seus rótulos;
- tabelas;
- indicações de cobrança em prova.

---

## 11. Busca

- A busca global deve pesquisar título, número, ementa, texto dos dispositivos, matéria e tags.
- Resultados devem indicar lei, dispositivo e trecho encontrado.
- O aluno deve poder filtrar resultados.
- A busca deve considerar variações simples de acentuação e caixa.
- Conteúdo não publicado nunca pode aparecer para alunos.
- Anotações pessoais podem ter busca própria e nunca entram em resultados de outro usuário.

---

## 12. Anotações pessoais

### 12.1 Tipos

No MVP, a anotação pessoal pode ser:

- nota livre;
- destaque pessoal;
- favorito com comentário.

Questão, flashcard e jurisprudência pessoal podem ser ativados no MVP se não comprometerem o prazo; caso contrário, ficam para a segunda fase.

### 12.2 Propriedade e isolamento

- Cada anotação pertence a um único usuário.
- Somente seu proprietário pode ler, editar ou excluir a anotação.
- Administradores não visualizam o conteúdo pessoal do aluno pela interface comum.
- Exceções legais ou de suporte devem possuir procedimento específico, autorização e auditoria.

### 12.3 Âncora

Cada anotação deve registrar:

- lei;
- dispositivo interno;
- versão em que foi criada;
- texto selecionado;
- contexto anterior e posterior;
- posição aproximada;
- datas de criação e alteração.

Após nova publicação, o sistema deve tentar localizar novamente a seleção. Se não houver correspondência segura, a anotação permanece preservada e recebe o estado **Revisão necessária**, sem ser ligada silenciosamente ao trecho errado.

### 12.4 Conteúdo institucional

Anotações da equipe não são anotações pessoais. Elas constituem blocos editoriais versionados junto à lei e são visíveis conforme a versão publicada.

---

## 13. Favoritos, progresso e histórico

- O aluno pode favoritar uma lei ou dispositivo.
- O sistema registra o último dispositivo visualizado por lei.
- O progresso é pessoal e não pode ser consultado por outros alunos.
- Métricas agregadas para administração devem ser anônimas ou claramente previstas na política de privacidade.
- O aluno pode remover seu histórico de leitura sem apagar anotações e favoritos.

---

## 14. Auditoria

Devem gerar registro de auditoria:

- criação, alteração, desativação e renovação de usuário;
- mudança de papel;
- revogação de sessões;
- criação, importação, publicação, arquivamento e restauração de lei;
- alteração de metadados;
- tentativa de operação administrativa recusada;
- exclusão definitiva;
- alterações nas configurações de segurança.

Cada registro deve informar:

- autor;
- ação;
- tipo e identificador do objeto;
- data e hora;
- resultado;
- informações anteriores e posteriores relevantes, sem registrar senhas ou segredos.

Registros de auditoria não podem ser alterados pela interface comum.

---

## 15. Segurança e privacidade

### 15.1 Princípios obrigatórios

- acesso mínimo necessário;
- negação por padrão;
- validação no servidor e no banco;
- isolamento de dados por usuário;
- proteção contra conteúdo importado malicioso;
- segredos fora do frontend;
- comunicação criptografada;
- backups periódicos;
- registro e monitoramento de falhas;
- atualização regular de dependências.

### 15.2 Banco de dados

- Todas as tabelas expostas à aplicação devem possuir políticas de acesso.
- Alunos somente consultam versões publicadas e permitidas.
- Rascunhos são restritos a Administradores e Editores autorizados.
- Anotações, favoritos, progresso e preferências devem ser isolados pelo identificador autenticado.
- Operações administrativas sensíveis devem ocorrer por funções controladas no servidor.
- A chave administrativa do banco nunca pode ser enviada ao navegador.

### 15.3 Privacidade

Antes do lançamento, devem existir:

- política de privacidade;
- termos de uso;
- definição de prazo de retenção;
- canal para solicitação de acesso, correção e exclusão de dados pessoais;
- procedimento de resposta a incidentes;
- relação dos serviços terceiros que processam dados.

---

## 16. Desempenho e escala

- A entrada na plataforma não deve carregar o conteúdo integral de todo o acervo.
- Catálogo, relatórios, versões e anotações devem usar paginação ou carregamento sob demanda.
- Uma lei deve ser carregada somente quando aberta.
- A busca deve usar índices adequados.
- Listagens administrativas devem possuir filtros e paginação.
- O projeto não deve impor limite fixo de 200 leis no código ou no banco.
- O sistema deve ser testado inicialmente com pelo menos 500 leis e volume representativo de anotações.

---

## 17. Backup e continuidade

- Devem existir backups automáticos do banco.
- Arquivos originais importados devem ser preservados em armazenamento privado.
- Arquivos DOCX e PDF gerados podem ser temporários; o prazo de retenção deve ser definido e informado.
- O processo de restauração deve ser testado periodicamente.
- Publicações importantes devem possuir possibilidade de recuperação independente do rascunho atual.
- Falha durante uma publicação não pode retirar do ar a versão vigente.

---

## 18. Requisitos de acessibilidade e dispositivos

- Todas as funções essenciais devem funcionar por teclado.
- Controles devem possuir rótulos compreensíveis.
- O contraste deve atender padrões de acessibilidade.
- Cor não deve ser o único indicador de significado.
- O leitor deve funcionar em computador, tablet e celular.
- Tabelas largas devem possuir tratamento responsivo.
- O tamanho mínimo dos controles deve permitir uso confortável em tela sensível ao toque.

---

## 19. Critérios mínimos para lançamento

O sistema somente poderá receber alunos reais quando:

1. permissões tiverem testes automatizados;
2. um aluno não conseguir acessar dados de outro;
3. aluno expirado não conseguir consultar conteúdo por chamada direta;
4. conteúdo importado estiver sanitizado;
5. publicação possuir transação e recuperação de falha;
6. backups e restauração tiverem sido testados;
7. recuperação de senha estiver operacional;
8. auditoria administrativa estiver funcionando;
9. catálogo e leitor forem testados em celular;
10. houver política de privacidade e termos de uso;
11. não existirem senhas, chaves administrativas ou dados reais embutidos no frontend;
12. houver validação com um grupo piloto antes da abertura geral;
13. documentos de teste de importação tiverem sido comparados visualmente com os originais;
14. DOCX e PDF exportados tiverem sido renderizados e validados por testes e revisão visual.

---

## 20. Decisões pendentes do responsável pelo produto

As seguintes decisões precisam ser confirmadas antes do desenho definitivo do banco e das telas:

1. O Editor poderá publicar diretamente ou dependerá de aprovação?
2. O acesso será vendido por período, turma, plano ou combinação desses critérios?
3. Um aluno poderá pertencer a mais de uma turma?
4. Algumas leis serão exclusivas de determinadas turmas ou todos verão o mesmo acervo?
5. Haverá e-mail real para recuperação ou outro canal de recuperação?
6. Questões e flashcards pessoais entram no MVP ou na segunda fase?
7. A equipe precisa importar muitas leis de uma só vez?
8. A exportação será liberada para todos os alunos ou controlada por plano/turma, e poderá incluir anotações pessoais?
9. Haverá limite de dispositivos ou sessões simultâneas?
10. Leis revogadas continuarão disponíveis para estudo histórico?

---

## 21. Definição recomendada do MVP

Para reduzir risco e acelerar a primeira entrega, recomenda-se que o MVP seja concentrado em quatro jornadas completas:

1. **Administrador gerencia aluno:** cria, convida, renova, desativa e consulta auditoria.
2. **Editor publica lei:** importa, revisa, salva rascunho, compara e publica.
3. **Aluno estuda:** encontra uma lei, navega por dispositivos, alterna grifos e retoma a leitura.
4. **Aluno personaliza:** cria anotação e favorito, mantendo ambos após atualização e renovação do acesso.

Questões, flashcards, simulados e estatísticas devem ser tratados como módulos pedagógicos posteriores, salvo decisão expressa de incluí-los no primeiro lançamento.
