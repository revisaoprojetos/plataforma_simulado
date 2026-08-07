/**
 * Bucket onde as IMAGENS de UI/conteúdo são hospedadas (imagens de questão, capas de
 * caderno/banco, logo/favicon/fundo do tenant, fundos de página do designer).
 *
 * Historicamente as imagens moravam no bucket `pdfs` (junto dos PDFs), o que misturava
 * assets de UI com arquivos de PDF. Este ponto único permite migrar para um bucket
 * dedicado (`imagens`) sem caçar `from('pdfs')` espalhado pelo código.
 *
 * Default = 'imagens' (bucket dedicado). A migração já foi executada: todas as imagens
 * existentes vivem em `imagens/{cadernos,logos,questoes,banners,bancos,fundos}/` e as URLs
 * no banco já apontam para lá. Para reverter ao comportamento antigo, defina
 * `STORAGE_IMAGE_BUCKET=pdfs` no ambiente. As URLs antigas em `pdfs/assets` foram removidas
 * (backup local em scripts/_backup-pdfs-assets/).
 */
export const BUCKET_IMAGENS = (process.env.STORAGE_IMAGE_BUCKET?.trim() || 'imagens')
