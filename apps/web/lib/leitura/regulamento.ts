/**
 * Regulamento do módulo (LegProc/Leitura): área descritiva que o aluno consulta — texto, vídeo e as
 * metas/ganhos (derivados da pontuação do módulo). Guardado em `simulado_pastas.regulamento` (jsonb),
 * tolerante à migração ausente (mesmo padrão de `intro_config`/`pontuacao`).
 */
export interface RegulamentoConfig {
  ativo: boolean
  titulo: string
  descricao: string
  video_url: string
}

export const REGULAMENTO_PADRAO: RegulamentoConfig = { ativo: false, titulo: '', descricao: '', video_url: '' }

export function normalizarRegulamento(raw: unknown): RegulamentoConfig {
  const r = (raw ?? {}) as Partial<RegulamentoConfig>
  return {
    ativo: r.ativo === true,
    titulo: typeof r.titulo === 'string' ? r.titulo : '',
    descricao: typeof r.descricao === 'string' ? r.descricao : '',
    video_url: typeof r.video_url === 'string' ? r.video_url : '',
  }
}

/** Converte um link de vídeo (YouTube/Vimeo) na URL de EMBED. Retorna null se não for reconhecido. */
export function embedVideoUrl(url: string): string | null {
  const u = (url || '').trim()
  if (!u) return null
  const yt = u.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/)
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`
  const vim = u.match(/vimeo\.com\/(?:video\/)?(\d+)/)
  if (vim) return `https://player.vimeo.com/video/${vim[1]}`
  return null
}
