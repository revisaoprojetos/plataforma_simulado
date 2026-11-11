# Controle de migrações

As migrações ficam em `supabase/migrations/*.sql` e são aplicadas **à mão** no banco. O registro nativo do Supabase (`supabase_migrations.schema_migrations`) só tem as 33 primeiras (até 15/06/2026), então o controle é nosso: tabela `public.migracoes_aplicadas` (versão, checksum, quando, origem).

## Comandos (rodar em `apps/web`)

| Comando | O que faz |
|---|---|
| `pnpm migracoes status` | Lista **aplicadas × PENDENTES**, arquivo editado após aplicar e nomes fora do padrão. Só leitura. |
| `pnpm migracoes aplicar --dry` | Mostra o que seria executado. |
| `pnpm migracoes aplicar` | Executa as pendentes **em ordem**, 1 transação por arquivo; para no primeiro erro. |
| `pnpm migracoes aplicar <versao>` | Executa só a(s) indicada(s) (aceita prefixo, ex.: `20261112010000`). |
| `pnpm migracoes marcar <versao>` | Marca como aplicada sem executar (quando foi aplicada na mão). |
| `pnpm migracoes baseline <versao>` | Marca como aplicadas todas com versão ≤ a informada (uso único, para iniciar o controle). |

Usa `DATABASE_URL` de `apps/web/.env.local` (confira que aponta para o banco desejado antes de `aplicar`).

## Regras

1. Nome sempre `AAAAMMDDHHMMSS_descricao.sql`; nunca reutilizar timestamp.
2. **Nunca editar** migração já aplicada — criar uma nova. O `status` acusa checksum diferente.
3. Idempotente quando possível (`if not exists`, `create or replace`).
4. Todo push/deploy com migração nova: rodar `pnpm migracoes status` antes e `aplicar` depois; só ligar a feature após aplicada.
5. Fora do padrão histórico (não renomear, já aplicadas): `20260620_discursivo`, `20260621_add_formato_questoes`, `20260621_revisoes_discursivas`.
