import 'server-only'
import { remember } from '@/lib/cache/relatorio-cache'
import { sqlQuery } from '@/lib/data/sql'

/**
 * A coluna `documentos.classificacao_id` já existe no banco (migration 16 aplicada)? Cache 5 min. Os SQL de resumo/uso só se
 * estendem com a classificação do doc quando true; false (ou SQL indisponível) = SQL antigo, sem erro nem log.
 */
export async function colunaClassificacaoIdExiste(): Promise<boolean> {
  return remember<boolean>('conteudo-class:col-doc', 300, async () => {
    const r = await sqlQuery<{ ok: number }>(
      `SELECT 1 AS ok FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'simulado_conteudo_documentos' AND column_name = 'classificacao_id' LIMIT 1`)
    return !!r && r.length > 0
  })
}
