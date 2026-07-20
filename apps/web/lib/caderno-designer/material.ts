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
 * Quando o aluno deve receber o PDF importado no lugar do caderno do sistema.
 * Retorna `{ url, nome }` só se a fonte for 'pdf' E houver PDF de fato.
 */
export function usaPdfImportado(config: unknown): { url: string; nome: string } | null {
  const m = materialDoConfig(config)
  return m.fonte === 'pdf' && m.pdfUrl ? { url: m.pdfUrl, nome: m.pdfNome || 'Material completo (PDF)' } : null
}
