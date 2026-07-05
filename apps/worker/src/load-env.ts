// Carrega variáveis de ambiente ANTES de qualquer outro import.
// O worker roda a partir de apps/worker (sem .env próprio); as vars ficam no .env da raiz
// do monorepo. Precisa ser um módulo separado importado em 1º lugar porque os processors
// criam o cliente Supabase no topo do módulo (import é hoisted e roda antes de statements).
import { config } from 'dotenv'
import { resolve } from 'node:path'

// 1) .env local (apps/worker/.env), se existir — tem precedência.
config()
// 2) .env da raiz do monorepo — preenche o que faltar (dotenv não sobrescreve o que já existe).
config({ path: resolve(__dirname, '../../../.env') })
