// "Comece por aqui" (pré-aula) por módulo LegProc. Tipo compartilhado admin ↔ aluno (puro, sem server).

export type IntroTipo = 'leitura' | 'video' | 'link'
export interface IntroConfig {
  ativo: boolean
  tipo: IntroTipo
  documento_id: string | null // quando tipo='leitura' (uma aula do módulo)
  url: string | null          // quando tipo='video' | 'link'
  titulo: string
  descricao: string
}
export const INTRO_PADRAO: IntroConfig = { ativo: false, tipo: 'video', documento_id: null, url: null, titulo: 'Comece por aqui', descricao: '' }

export function normalizarIntro(raw: unknown): IntroConfig {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const tipo: IntroTipo = r.tipo === 'leitura' || r.tipo === 'video' || r.tipo === 'link' ? r.tipo : 'video'
  return {
    ativo: !!r.ativo,
    tipo,
    documento_id: typeof r.documento_id === 'string' ? r.documento_id : null,
    url: typeof r.url === 'string' ? r.url : null,
    titulo: typeof r.titulo === 'string' && r.titulo.trim() ? r.titulo : 'Comece por aqui',
    descricao: typeof r.descricao === 'string' ? r.descricao : '',
  }
}

/** true se o link abre FORA da leitura (vídeo/site externo). */
export const introExterno = (c: IntroConfig) => c.tipo !== 'leitura'

/** Destino do nó "Comece por aqui" — null se estiver mal configurado (não injeta o nó). */
export function introHref(c: IntroConfig): string | null {
  if (!c.ativo) return null
  if (c.tipo === 'leitura') return c.documento_id ? `/aluno/leitura/${c.documento_id}` : null
  return c.url && /^https?:\/\//i.test(c.url) ? c.url : null
}
