/**
 * INTERRUPTOR CENTRAL DE DOWNLOADS DO ALUNO — decisão PURA (sem banco/servidor; testável e usável no admin).
 *
 * Chave por tenant: `simulado_tenants.tema.downloads_aluno` = 'permitido' | 'bloqueado'.
 *  · AUSENTE = BLOQUEADO (padrão seguro: downloads desativados "por enquanto"). Só 'permitido' EXPLÍCITO libera.
 *  · Compatibilidade: a chave antiga `tema.biblioteca_politica.aluno_pode_baixar === true` (explícita) também libera,
 *    mas `downloads_aluno` (quando presente) sempre vence. Ausente nos dois = bloqueado.
 *
 * ESCOPO (decisão do usuário): SOMENTE downloads de MATERIAIS DE CONTEÚDO (documentos da Biblioteca, materiais de aula/produto/cronograma
 * — rotas aluno/biblioteca/baixar, conteudo/baixar e arquivo/pdf ?download= de caminhos 'materiais/').
 * NÃO governa: diagnóstico, cadernos de teste/questões, gabaritos, resultados/relatórios de simulados, PDF/DOCX do próprio cronograma,
 * exportação do Caderno beta, ler no leitor, nem downloads do ADMIN.
 */
export type ModoDownloads = 'bloqueado' | 'permitido'
export type PapelDownload = 'aluno' | 'testador' | 'admin'

export const MOTIVO_DOWNLOADS_DESATIVADOS = 'downloads_desativados'
export const MENSAGEM_DOWNLOAD_INDISPONIVEL = 'Download indisponível no momento'
/** @deprecated O PDF/DOCX do próprio cronograma NÃO está mais sob o interruptor (só materiais de conteúdo). Mantido por compatibilidade; sem uso nas rotas. */
export const BLOQUEIA_PDF_DO_CRONOGRAMA = false

export function modoDownloadsDoTema(tema: unknown): ModoDownloads {
  const t = (tema && typeof tema === 'object' ? tema : {}) as Record<string, unknown>
  if (t.downloads_aluno === 'permitido') return 'permitido'
  if (t.downloads_aluno === 'bloqueado') return 'bloqueado'
  const leg = (t.biblioteca_politica && typeof t.biblioteca_politica === 'object' ? t.biblioteca_politica : {}) as Record<string, unknown>
  return leg.aluno_pode_baixar === true ? 'permitido' : 'bloqueado'
}

export interface DecisaoDownloadAluno { permitido: boolean; motivo: typeof MOTIVO_DOWNLOADS_DESATIVADOS | null }

/** Decisão central. Admin e testador global sempre podem; aluno só com o tenant em 'permitido'. */
export function decidirDownloadAluno(modo: ModoDownloads | null | undefined, papel: PapelDownload = 'aluno'): DecisaoDownloadAluno {
  if (papel === 'admin' || papel === 'testador') return { permitido: true, motivo: null }
  if (modo === 'permitido') return { permitido: true, motivo: null }
  return { permitido: false, motivo: MOTIVO_DOWNLOADS_DESATIVADOS }
}

/** Texto do tema para gravar o interruptor (mantém a chave antiga em sincronia para quem ainda a lê). */
export function patchTemaDownloads(permitido: boolean): { downloads_aluno: ModoDownloads } {
  return { downloads_aluno: permitido ? 'permitido' : 'bloqueado' }
}
