// Helper ÚNICO de download no cliente do aluno (compatível com o iframe da Curseduca e webviews).
// Camadas: (1) <a download> disparado de forma SÍNCRONA; (2) onde o navegador não suporta `download`
// (webviews/iOS antigos) → Web Share com arquivo (blob) ou nova aba; (3) falha → resultado `falhou`
// (o chamador mostra o toast; este módulo não depende de UI). NUNCA fazer `await` antes de abrir/clicar
// em um link de URL direta: o popup blocker e o iframe sandbox só liberam gesto do usuário síncrono.

export type ResultadoDownload = 'download' | 'compartilhado' | 'aba' | 'falhou'

type DocLike = Pick<Document, 'createElement' | 'body'>

/** Nome de arquivo seguro (sem separadores/reservados), com extensão garantida. */
export function nomeArquivoSeguro(nome: string | null | undefined, ext: string, padrao = 'arquivo'): string {
  const base = (nome ?? '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '').replace(/\s+/g, '_').replace(/^\.+/, '').slice(0, 120) || padrao
  const e = ext.replace(/^\./, '')
  return e && !base.toLowerCase().endsWith(`.${e.toLowerCase()}`) ? `${base}.${e}` : base
}

function clicar(doc: DocLike, href: string, nome: string | null, novaAba: boolean): void {
  const a = doc.createElement('a')
  a.href = href
  a.rel = 'noopener noreferrer'
  if (nome) a.download = nome
  if (novaAba) a.target = '_blank'
  a.style.display = 'none'
  doc.body.appendChild(a)
  try { a.click() } finally { a.remove() }
}

/** Link direto (URL same-origin com Content-Disposition: attachment, ou arquivo externo). SÍNCRONO:
 *  chame direto do handler de clique, sem `await` antes. Cross-origin ignora `download` → abre em nova aba. */
export function baixarDeUrl(url: string, nome?: string, env: { doc?: DocLike; origem?: string } = {}): ResultadoDownload {
  try {
    const doc = env.doc ?? document
    const origem = env.origem ?? (typeof location !== 'undefined' ? location.origin : '')
    const mesmaOrigem = url.startsWith('/') || (origem !== '' && url.startsWith(origem))
    clicar(doc, url, mesmaOrigem ? (nome ?? '') : null, !mesmaOrigem)
    return mesmaOrigem ? 'download' : 'aba'
  } catch { return 'falhou' }
}

/** Entrega um Blob já baixado (pode ser chamada após `await`). */
export async function baixarBlob(
  blob: Blob, nome: string,
  env: { doc?: DocLike; nav?: Pick<Navigator, 'canShare' | 'share'> & Partial<Navigator>; urlApi?: Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'>; suportaDownload?: boolean } = {},
): Promise<ResultadoDownload> {
  const doc = env.doc ?? document
  const urlApi = env.urlApi ?? URL
  const nav = env.nav ?? (typeof navigator !== 'undefined' ? navigator : undefined)
  const suporta = env.suportaDownload ?? ('download' in doc.createElement('a'))
  if (!suporta && nav?.canShare && nav.share && typeof File !== 'undefined') {
    try {
      const f = new File([blob], nome, { type: blob.type })
      if (nav.canShare({ files: [f] })) { await nav.share({ files: [f], title: nome }); return 'compartilhado' }
    } catch (e) { if ((e as { name?: string })?.name === 'AbortError') return 'compartilhado' /* usuário cancelou: não é erro */ }
  }
  let url: string
  try { url = urlApi.createObjectURL(blob) } catch { return 'falhou' }
  try {
    clicar(doc, url, suporta ? nome : null, !suporta)
    return suporta ? 'download' : 'aba'
  } catch { return 'falhou' } finally { setTimeout(() => { try { urlApi.revokeObjectURL(url) } catch { /* noop */ } }, 60_000) }
}

export interface OpcoesFetch {
  nome: string
  /** Valida o blob (ex.: PDF). Retorne a mensagem de erro ou null se ok. */
  validar?: (blob: Blob) => string | null
  /** Tentativas extras quando o servidor responde 503 "ocupado" (pausa crescente). Padrão 2. */
  retries503?: number
  aoTentarDeNovo?: () => void
  fetchFn?: typeof fetch
  esperar?: (ms: number) => Promise<void>
  entregar?: typeof baixarBlob
}

/** Baixa via fetch (rota autenticada) + entrega. Lança `Error` com mensagem pronta p/ toast. */
export async function baixarViaFetch(url: string, o: OpcoesFetch): Promise<ResultadoDownload> {
  const f = o.fetchFn ?? fetch
  const esperar = o.esperar ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)))
  let res: Response | null = null
  const max = (o.retries503 ?? 2) + 1
  try {
    for (let i = 0; i < max; i++) {
      res = await f(url, { credentials: 'same-origin' })
      if (res.status !== 503) break
      o.aoTentarDeNovo?.()
      if (i < max - 1) await esperar(2000 * (i + 1))
    }
  } catch { throw new Error('Sem conexão com o servidor. Verifique a internet e tente novamente.') }
  if (!res || !res.ok) {
    if (res && (res.status === 401 || res.status === 403)) throw new Error('Sua sessão expirou ou o acesso foi negado. Recarregue a página e tente novamente.')
    let msg = 'Não foi possível baixar o arquivo agora. Tente novamente em instantes.'
    try { const j = await res?.json(); if (j?.message) msg = String(j.message) } catch { /* corpo não-JSON */ }
    throw new Error(msg)
  }
  const blob = await res.blob()
  if (!blob.size) throw new Error('O arquivo veio vazio. Tente novamente em instantes.')
  const inv = o.validar?.(blob)
  if (inv) throw new Error(inv)
  const r = await (o.entregar ?? baixarBlob)(blob, o.nome)
  if (r === 'falhou') throw new Error('Seu navegador bloqueou o download. Toque em "Abrir em nova aba" ou use o navegador do aparelho.')
  return r
}
