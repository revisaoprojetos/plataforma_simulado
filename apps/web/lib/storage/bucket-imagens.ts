/**
 * Bucket onde as IMAGENS de UI/conteúdo são hospedadas (imagens de questão, capas de
 * caderno/banco, logo/favicon/fundo do tenant, fundos de página do designer).
 *
 * Historicamente as imagens moravam no bucket `pdfs` (junto dos PDFs), o que misturava
 * assets de UI com arquivos de PDF. Este ponto único permite migrar para um bucket
 * dedicado (`imagens`) sem caçar `from('pdfs')` espalhado pelo código.
 *
 * Default = 'pdfs' (comportamento histórico — merge sem efeito). Defina
 * `STORAGE_IMAGE_BUCKET=imagens` no ambiente para passar a gravar no bucket dedicado.
 * As URLs antigas em `pdfs/assets` continuam válidas (bucket público inalterado); a
 * migração dos objetos + reescrita das URLs é feita à parte, de forma coordenada.
 */
export const BUCKET_IMAGENS = (process.env.STORAGE_IMAGE_BUCKET?.trim() || 'pdfs')
