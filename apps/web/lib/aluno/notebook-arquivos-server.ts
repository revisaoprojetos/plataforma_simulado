// Caderno (beta) — storage dos arquivos do aluno (imagens coladas e anexos). Caminho SEMPRE por tenant+estudante da SESSÃO:
//   caderno-arquivos/<tenantId>/<estudanteId>/<uuid>.<ext>   (bucket PRIVADO; nunca URL pública)
// O dono é implícito no caminho, então outro aluno/tenant nunca alcança o objeto. A tabela OPCIONAL simulado_aluno_notebook_arquivos
// (migração 20261129020000) só serve à COTA por aluno e à limpeza na exclusão definitiva; sem ela tudo segue funcionando (sem cota).
import 'server-only'
import { decidirBucketCaderno } from '@/lib/aluno/notebook-texto'

/** Lançado quando o bucket PRIVADO do caderno não está configurado em produção (rotas respondem 503 `storage_indisponivel`). */
export class BucketCadernoAusente extends Error {
  constructor() { super('STORAGE_CADERNO_BUCKET não configurado: defina um bucket PRIVADO para os arquivos do caderno.') }
}

/** Bucket: STORAGE_CADERNO_BUCKET (obrigatório em produção); fora dela cai no bucket dos originais de conteúdo (resolverBucketConteudo). */
export async function bucketArquivosNotebook(): Promise<string> {
  const d = decidirBucketCaderno(process.env.STORAGE_CADERNO_BUCKET, process.env.NODE_ENV)
  if ('bucket' in d) return d.bucket
  if ('erro' in d) throw new BucketCadernoAusente()
  const { resolverBucketConteudo } = await import('@/lib/conteudo/ingestao')
  return resolverBucketConteudo()
}

export const caminhoArquivoNotebook = (tenantId: string, estudanteId: string, nomeArquivo: string) => `caderno-arquivos/${tenantId}/${estudanteId}/${nomeArquivo}`


/**
 * Exclusão DEFINITIVA de página: remove do storage os arquivos que NENHUMA outra página do aluno referencia (best-effort, nunca lança).
 * Depende da RPC `notebook_arquivos_orfaos` (migração 20261129020000): sem ela NADA é apagado (conservador — uma cópia da página pode
 * referenciar o mesmo arquivo). Chamar DEPOIS de apagar a linha da página.
 */
export async function removerArquivosOrfaos(svc: any, ctx: { tenantId: string; estudanteId: string }, arquivos: string[], paginaId: string): Promise<number> {
  try {
    if (!arquivos.length) return 0
    const r = await svc.rpc('notebook_arquivos_orfaos', { p_tenant: ctx.tenantId, p_estudante: ctx.estudanteId, p_arquivos: arquivos, p_excluir: paginaId })
    if (r.error) return 0
    const orfaos: string[] = ((r.data ?? []) as string[]).filter((x) => arquivos.includes(x))
    if (!orfaos.length) return 0
    const { getStorage } = await import('@/lib/storage')
    const bucket = await bucketArquivosNotebook()
    let n = 0
    for (const nome of orfaos) {
      try { await getStorage().remove(bucket, caminhoArquivoNotebook(ctx.tenantId, ctx.estudanteId, nome)); n++ } catch { /* best-effort */ }
      try { await svc.from('simulado_aluno_notebook_arquivos').delete().eq('tenant_id', ctx.tenantId).eq('estudante_id', ctx.estudanteId).eq('arquivo', nome) } catch { /* tabela opcional */ }
    }
    return n
  } catch (e) {
    console.error('[notebook] limpar arquivos:', (e as Error)?.message)
    return 0
  }
}
