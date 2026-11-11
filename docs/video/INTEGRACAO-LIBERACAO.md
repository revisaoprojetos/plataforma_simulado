# Integração Vídeo próprio x acesso do aluno (desenho atual)

> Substitui o desenho antigo (espelho `video_empresas/video_cursos/video_aulas`, fila `video_matriculas_sync`, cron de sync e gancho em
> `liberacao/engine.ts`). Tudo isso foi removido (migration `20261110040000_video_remove_espelho.sql`). Princípio: **o gerenciador de vídeo
> manda; a plataforma se adapta**.

## Como funciona
- **Cursos, módulos e aulas vivem só no serviço de vídeo.** A plataforma não guarda cópia. Uma aula entra num produto/currículo (ou
  documento) por **referência**: `video-proprio:<courseId>:<lessonId>` (`parseReferenciaVideoProprio` / `referenciaVideoProprio` em
  `lib/biblioteca/video-provedor.ts`). O aluno abre `/aluno/video/<courseId>/<lessonId>`.
- **Configuração:** tabela global `video_config` (tela `/super/video`): URL interna, prefixo público, chave de integração e conta admin.
  Fallback às env `VIDEO_*` se a linha não estiver ativa. Slug da empresa no serviço = **slug do tenant** (`simulado_tenants.slug`).
- **Acesso decidido pela plataforma (gate nosso)** em `POST /api/aluno/video/playback` e `/api/aluno/video/anotacoes`:
  testador global **ou** a aula é item ativo e já liberado do currículo de um produto ao qual o aluno tem acesso
  (`videoLiberadoPorProduto` em `lib/produtos/curriculo-aluno.ts`, mesmo núcleo do leitor: assinatura/grupo/segmento + disponibilidade do
  módulo/aula). Uma consulta por `ref_url`, limite 50. Cache positivo de 60 s por (aluno, aula).
- **Matrícula sob demanda (just-in-time):** passado o gate, a plataforma chama `POST /access/enrollments` com
  `{ email, name, externalId: estudanteId, courseId, accessDays: 1, reactivate: true }` (sem `externalRef`, para renovar a janela a cada
  acesso). Cache em memória ~10 min por (aluno, curso). Depois: `/access/sessions` (JWT do aluno) e `/lessons/:id/playback`. O serviço
  reconfere a matrícula; os dois gates precisam passar.
- **Revogação:** o gate nosso deixa de passar (assinatura expirou, grupo removido, segmento bloqueou) e a janela de 1 dia no serviço
  expira sozinha. Acesso residual máximo: ~60 s (cache do gate) para novas sessões, até 1 dia para uma matrícula já aberta usada
  por fora da plataforma (o aluno só chega ao serviço pelo nosso backend).

## Limitações conhecidas
- O gate só reconhece aulas colocadas no **currículo de produtos** (`simulado_produto_modulo_itens.ref_url`). Vídeo próprio embutido
  em documento da Biblioteca ou em meta de cronograma ainda não é coberto (nega acesso, exceto testador global).
- "Próxima aula": exige listagem das aulas do módulo em `lib/video/client.ts`; enquanto não existir, a resposta traz `nextAulaId: null`.
- `EnrollReq` em `client.ts` ainda não declara `accessDays`/`reactivate` (o serviço aceita); a rota usa cast.
