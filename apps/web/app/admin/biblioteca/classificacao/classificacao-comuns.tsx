// Peças visuais/HTTP COMPARTILHADAS da gestão de Classificações (listagem + página da classificação). Sem 'use client':
// só constantes e componentes puros (servem a server e client components). Cores só por token.
import { PAPEIS_TIPO } from '@/lib/cronograma/tipos-conteudo-tipos'
import { cn } from '@/lib/utils'

export const API_TIPOS = '/api/admin/biblioteca/classificacao/tipos'
export const apiDetalhe = (id: string) => `/api/admin/biblioteca/classificacao/${id}`
// `voltar` = caminho (com filtros/página) de onde o usuário veio; a página de detalhe o devolve no botão Voltar.
export const hrefDetalhe = (id: string, aba?: string, voltar?: string) => {
  const q = new URLSearchParams()
  if (aba && aba !== 'visao') q.set('aba', aba)
  if (voltar) q.set('voltar', voltar)
  return `/admin/biblioteca/classificacao/${id}${q.toString() ? `?${q}` : ''}`
}
/** Só aceita caminho interno do admin (evita open-redirect). */
export const voltarSeguro = (v: string | undefined): string | null => (v && v.startsWith('/admin/') && !v.startsWith('//') && !v.includes(String.fromCharCode(92)) ? v : null)
export const SELECT_CLS = 'h-11 rounded-xl border bg-card px-3 text-[13.5px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring'
export const INPUT_CLS = 'h-10 w-full rounded-xl border bg-card px-3 text-[13.5px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60'
export const ROTULO_PAPEL = Object.fromEntries(PAPEIS_TIPO.map((p) => [p.v, p.r])) as Record<string, string>
export const ROTULO_INDICE: Record<string, string> = { livro: 'Livro', parte: 'Parte', titulo: 'Título', capitulo: 'Capítulo', secao: 'Seção', subsecao: 'Subseção', artigo: 'Artigo' }

export async function api<T = any>(method: string, url: string, body?: unknown): Promise<{ ok: boolean; data: T }> {
  try {
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
    return { ok: r.ok, data: (await r.json().catch(() => ({}))) as T }
  } catch { return { ok: false, data: { error: 'Falha de rede.' } as T } }
}

export const Selo = ({ cls, children, title }: { cls: string; children: React.ReactNode; title?: string }) => (
  <span title={title} className={cn('inline-flex max-w-full items-center truncate rounded-md px-1.5 py-0.5 text-[11.5px] font-semibold', cls)}>{children}</span>
)
export const Bolinha = ({ cor, className }: { cor: string | null; className?: string }) => (
  <span className={cn('inline-block h-3 w-3 shrink-0 rounded-full border', className)} style={{ background: cor || 'var(--muted-foreground)' }} />
)
