# MAC — Plataforma de Lei Seca

## Parte 4 — Fundação da aplicação

**Status:** concluída para desenvolvimento local  
**Data:** 12/08/2026

## Entregas

- aplicação responsiva com leitor de leis;
- biblioteca organizada por matéria;
- busca local do catálogo;
- seleção de lei e indicador de progresso;
- modo com e sem grifos;
- controles iniciais de anotação e favorito;
- tela de login preparada para Supabase Auth;
- configuração por variáveis de ambiente, sem segredos no código;
- migração inicial do PostgreSQL;
- perfis Administrador, Editor e Aluno;
- catálogo, versões, dispositivos, anotações, favoritos, progresso e auditoria;
- políticas Row Level Security;
- verificação de validade no banco;
- publicação transacional;
- testes de aceitação de segurança em pgTAP.

## Decisões de segurança implementadas

1. O aluno só pode acessar seus próprios dados de estudo.
2. A validade é verificada em função do banco, não apenas na tela de login.
3. O aluno só pode ler a versão publicada e vigente.
4. Editor não recebe permissão de administração de usuários.
5. Publicação ocorre por função transacional reservada ao Administrador.
6. Auditoria não aceita escrita direta pela API autenticada.
7. A chave secreta do Supabase é declarada somente para uso no servidor.
8. Nenhuma credencial real foi incluída.

## Validação

- build de produção concluído;
- verificação TypeScript concluída sem erros;
- rotas `/` e `/login` geradas;
- o servidor local iniciou em `http://localhost:3000`, mas o ambiente isolado bloqueou uma conexão interna do runtime Cloudflare; isso não afetou o build.

## Limites desta etapa

- o projeto ainda não está conectado a um Supabase real;
- a migração ainda deve ser aplicada e testada em um projeto de desenvolvimento;
- os dados apresentados na interface são demonstrativos;
- a proteção efetiva das rotas será ativada junto com a conexão do ambiente;
- nenhuma implantação pública foi realizada.

## Próxima etapa recomendada

Criar o projeto Supabase de desenvolvimento, aplicar a migração, executar os testes RLS com usuários fictícios e conectar autenticação, catálogo e leitor aos dados reais.
