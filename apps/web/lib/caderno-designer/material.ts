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
