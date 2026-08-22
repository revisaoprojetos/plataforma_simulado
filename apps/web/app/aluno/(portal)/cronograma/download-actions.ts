'use server'

/**
 * Registro de exportação — uma linha por PDF que o aluno pediu.
 *
 * Fica separado de `simulado_cronograma_emissoes` porque responde outra pergunta. A emissão diz
 * "que cronogramas este aluno tem"; o download diz "o que ele levou embora, quando". É o mesmo
 * corte que o resto do sistema já faz entre `simulado_audit_logs` e `simulado_relatorio_eventos`.
 */

import { createAdminClient } from '@/lib/supabase/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { registrarAudit } from '@/lib/audit'

export type BotaoExportacao = 'pdf' | 'docx' | 'ficha' | 'csv'

/**
 * Best-effort de verdade: um problema aqui NÃO pode impedir o aluno de imprimir o cronograma
 * dele. Mas o erro é LIDO e vai para o log — foi exatamente o `try/catch` que só olhava `data`
 * que deixou a tabela de emissões vazia por dias sem ninguém notar.
 */
export async function registrarDownloadCronograma(
  emissaoId: string,
  botao: BotaoExportacao,
): Promise<void> {
  const sessao = await getSessaoAluno()
  if (!sessao) return

  const svc = createAdminClient()

  // Confere que a emissão é deste aluno antes de gravar — o id vem da URL.
  const { data: emissao } = await svc
    .from('simulado_cronograma_emissoes')
    .select('id, cronograma_nome')
    .eq('id', emissaoId)
    .eq('tenant_id', sessao.tenantId)
    .eq('estudante_id', sessao.estudanteId)
    .maybeSingle()
  if (!emissao) return

  const { error } = await svc.from('simulado_cronograma_downloads').insert({
    tenant_id: sessao.tenantId,
    emissao_id: emissaoId,
    botao,
    ator_tipo: 'estudante',
    ator_id: sessao.estudanteId,
  })
  if (error) {
    console.error('[cronograma] download NÃO registrado:', error.message)
    return
  }

  await registrarAudit({
    operacao: 'INSERT',
    entidade: 'simulado_cronograma_downloads',
    entidadeId: emissaoId,
    depois: { botao, cronograma: (emissao as { cronograma_nome: string }).cronograma_nome },
    atorTipo: 'estudante',
    atorId: sessao.estudanteId,
    tenantId: sessao.tenantId,
  })
}
