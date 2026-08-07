// Material para download do aluno: escolher entre o caderno GERADO pelo sistema
// ("Enunciados") ou um PDF pronto IMPORTADO (ex.: "caderno completo" da empresa EBT).
// Guardado em `simulado_cadernos_designer.config.material` (sem migração).

export type FonteMaterial = 'sistema' | 'pdf'

export interface MaterialCaderno {
  fonte: FonteMaterial
  pdfUrl: string
  pdfNome: string
}

export const MATERIAL_PADRAO: MaterialCaderno = { fonte: 'sistema', pdfUrl: '', pdfNome: '' }

/**
 * Extrai o caminho do objeto DENTRO do bucket `pdfs` a partir da URL pública — para remover o
 * arquivo do storage (evitar órfãos) ao trocar/remover o material. Tolera o `?download=` (que é
 * acrescentado só na LEITURA por `enunciadoPdf`/`enunciadoQuestoesPdf`, não no valor gravado).
 * Retorna null quando a URL não é do bucket `pdfs` (ex.: link externo antigo).
 */
export function pdfStoragePath(pdfUrl: string | undefined | null): string | null {
  if (!pdfUrl) return null
  const m = /\/storage\/v1\/object\/public\/pdfs\/(.+?)(?:\?|$)/.exec(pdfUrl)
  return m ? decodeURIComponent(m[1]) : null
}

/** Lê `config.material` de forma tolerante (default = sistema). */
export function materialDoConfig(config: unknown): MaterialCaderno {
  const m = (config as any)?.material
  if (!m || typeof m !== 'object') return { ...MATERIAL_PADRAO }
  return {
    fonte: m.fonte === 'pdf' ? 'pdf' : 'sistema',
    pdfUrl: typeof m.pdfUrl === 'string' ? m.pdfUrl : '',
    pdfNome: typeof m.pdfNome === 'string' ? m.pdfNome : '',
  }
}

/**
 * O "Gabarito Comentado" do aluno = o PDF importado (empresa/EBT). É um caderno A MAIS
 * (não substitui os do sistema); aparece só quando há PDF de fato. O nome exibido
 * ao aluno é sempre "Gabarito Comentado" (o `pdfNome` fica para telas de admin).
 *
 * O `url` já vem com `?download=<nome>.pdf`: assim o arquivo BAIXA com o nome ORIGINAL da
 * importação (`pdfNome`) e não com o id/hash do path no storage. O Supabase Storage respeita
 * esse parâmetro via `Content-Disposition`, o que funciona cross-origin e tanto por
 * `window.open` quanto por `<a download>` (mesmo padrão do pdf-downloads-provider). O card de
 * preview do admin usa `material.pdfUrl` cru (outro caminho), então a pré-visualização inline
 * do PDF continua intacta.
 */
export function enunciadoPdf(config: unknown): { url: string; nome: string } | null {
  const m = materialDoConfig(config)
  if (!m.pdfUrl) return null
  const arq = (m.pdfNome || 'Gabarito Comentado').replace(/\.pdf$/i, '').trim() || 'Gabarito Comentado'
  const sep = m.pdfUrl.includes('?') ? '&' : '?'
  return { url: `${m.pdfUrl}${sep}download=${encodeURIComponent(arq)}.pdf`, nome: 'Gabarito Comentado' }
}

/** Lê `config.material_enunciado` — 2º PDF importado = "Enunciado de Questões" (só as questões). */
export function materialEnunciadoDoConfig(config: unknown): MaterialCaderno {
  const m = (config as any)?.material_enunciado
  if (!m || typeof m !== 'object') return { ...MATERIAL_PADRAO }
  return {
    fonte: m.fonte === 'pdf' ? 'pdf' : 'sistema',
    pdfUrl: typeof m.pdfUrl === 'string' ? m.pdfUrl : '',
    pdfNome: typeof m.pdfNome === 'string' ? m.pdfNome : '',
  }
}

/**
 * "Enunciado de Questões" do aluno = 2º PDF importado (só as questões, SEM gabarito). Diferente do
 * Gabarito Comentado, fica disponível ANTES de iniciar (download no card do simulado). O `url` já
 * vem com `?download=<nome>.pdf` (mesmo padrão do Gabarito Comentado). Some quando não há PDF.
 */
export function enunciadoQuestoesPdf(config: unknown): { url: string; nome: string } | null {
  const m = materialEnunciadoDoConfig(config)
  if (!m.pdfUrl) return null
  const arq = (m.pdfNome || 'Enunciado de Questões').replace(/\.pdf$/i, '').trim() || 'Enunciado de Questões'
  const sep = m.pdfUrl.includes('?') ? '&' : '?'
  return { url: `${m.pdfUrl}${sep}download=${encodeURIComponent(arq)}.pdf`, nome: 'Enunciado de Questões' }
}
