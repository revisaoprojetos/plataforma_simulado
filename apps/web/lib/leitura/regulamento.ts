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
  /** PDF do regulamento (visualizado dentro da plataforma, estilo Drive). */
  documento_url: string
  documento_nome: string
  /** Tabela nativa (vista no sistema, sem PDF): linhas × colunas de texto. 1ª linha = cabeçalho. */
  tabela: string[][]
}

export const REGULAMENTO_PADRAO: RegulamentoConfig = { ativo: false, titulo: '', descricao: '', video_url: '', documento_url: '', documento_nome: '', tabela: [] }

/** Higieniza a tabela: máx. 60 linhas × 12 colunas, células string; deixa retangular (linhas do mesmo tamanho). */
export function normalizarTabela(raw: unknown): string[][] {
  if (!Array.isArray(raw)) return []
  const linhas = raw.slice(0, 60).map((row) => (Array.isArray(row) ? row.slice(0, 12).map((c) => (typeof c === 'string' ? c.slice(0, 1000) : '')) : []))
  const cols = linhas.reduce((m, r) => Math.max(m, r.length), 0)
  if (!cols || !linhas.length) return []
  return linhas.map((r) => { const nr = r.slice(); while (nr.length < cols) nr.push(''); return nr })
}

export function normalizarRegulamento(raw: unknown): RegulamentoConfig {
  const r = (raw ?? {}) as Partial<RegulamentoConfig>
  return {
    ativo: r.ativo === true,
    titulo: typeof r.titulo === 'string' ? r.titulo : '',
    descricao: typeof r.descricao === 'string' ? r.descricao : '',
    video_url: typeof r.video_url === 'string' ? r.video_url : '',
    documento_url: typeof r.documento_url === 'string' ? r.documento_url : '',
    documento_nome: typeof r.documento_nome === 'string' ? r.documento_nome : '',
    tabela: normalizarTabela(r.tabela),
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
