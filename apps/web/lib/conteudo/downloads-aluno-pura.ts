/**
 * INTERRUPTOR CENTRAL DE DOWNLOADS DO ALUNO — decisão PURA (sem banco/servidor; testável e usável no admin).
 *
 * Chave por tenant: `simulado_tenants.tema.downloads_aluno` = 'permitido' | 'bloqueado'.
 *  · AUSENTE = BLOQUEADO (padrão seguro: downloads desativados "por enquanto"). Só 'permitido' EXPLÍCITO libera.
 *  · Compatibilidade: a chave antiga `tema.biblioteca_politica.aluno_pode_baixar === true` (explícita) também libera,
 *    mas `downloads_aluno` (quando presente) sempre vence. Ausente nos dois = bloqueado.
 *
 * O que a chave governa (no SERVIDOR): documentos da Biblioteca/cronogramas/aulas do produto (rotas de baixar), mídia,
 * cadernos do simulado (caderno de questões / gabarito comentado do card) e o PDF do cronograma.
 * O que NÃO governa: ler no leitor (inclui o proxy /api/arquivo/pdf SEM ?download=), PDF de resultado/relatório do próprio
 * aluno (não é material de estudo), downloads do ADMIN.
 */
export type ModoDownloads = 'bloqueado' | 'permitido'
export type PapelDownload = 'aluno' | 'testador' | 'admin'

export const MOTIVO_DOWNLOADS_DESATIVADOS = 'downloads_desativados'
export const MENSAGEM_DOWNLOAD_INDISPONIVEL = 'Download indisponível no momento'
/** O PDF do próprio cronograma (Revisão/Gerador) também fica sob o interruptor. Mude para false para liberá-lo sempre. */
export const BLOQUEIA_PDF_DO_CRONOGRAMA = true

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
