// Autosave do Caderno (beta): lógica PURA (sem DOM/rede) — testável em node.
// Um salvamento em voo por página; edições durante o voo são COALESCIDAS (vale a última).
// O hook (components/aluno/notebook/useAutosave.ts) só liga isto à rede, ao timer e ao IndexedDB.

export type Doc = Record<string, unknown>
/** `doc` = página de texto (TipTap); `tinta` = folha livre (JSON da folha). Campos independentes; última edição vence por campo. */
export type Alteracao = { doc?: Doc; tinta?: Doc; titulo?: string }
export type EmVoo = { opId: string; versao: number; alt: Alteracao }

export type Estado = {
  versao: number
  pendente: Alteracao | null
  emVoo: EmVoo | null
  tentativas: number
  fase: 'ocioso' | 'sujo' | 'salvando' | 'offline' | 'erro' | 'conflito'
  conflito: { versaoAtual: number } | null
}

export type Evento =
  | { t: 'editar'; alt: Alteracao }
  | { t: 'iniciar'; opId: string }
  | { t: 'ok'; versao: number }
  | { t: 'rede' }
  | { t: 'erro' }
  | { t: 'conflito'; versaoAtual: number }
  | { t: 'usar_servidor'; versao: number }
  | { t: 'manter_minha'; versaoAtual: number }
  | { t: 'tentar_de_novo' }

export const estadoInicial = (versao: number): Estado => ({ versao, pendente: null, emVoo: null, tentativas: 0, fase: 'ocioso', conflito: null })

/** Última edição vence, campo a campo (titulo e doc são independentes). */
export function coalescer(a: Alteracao | null, b: Alteracao | null): Alteracao | null {
  if (!a) return b
  if (!b) return a
  const r: Alteracao = { ...a, ...b }
  if (b.doc === undefined && a.doc !== undefined) r.doc = a.doc
  if (b.tinta === undefined && a.tinta !== undefined) r.tinta = a.tinta
  if (b.titulo === undefined && a.titulo !== undefined) r.titulo = a.titulo
  return r
}

export const vazia = (a: Alteracao | null) => !a || (a.doc === undefined && a.tinta === undefined && a.titulo === undefined)

/** Backoff exponencial com teto; `aleatorio` (0..1) injetável p/ teste. */
export function backoffMs(tentativa: number, aleatorio = 0.5, base = 1000, teto = 30000): number {
  const n = Math.max(0, Math.min(tentativa, 10))
  const bruto = Math.min(teto, base * 2 ** n)
  return Math.round(bruto * (0.75 + aleatorio * 0.5))
}

/** O que enviar agora? null = nada ou já há envio em voo / conflito aberto. */
export function proximoEnvio(s: Estado): Alteracao | null {
  if (s.emVoo || s.fase === 'conflito' || vazia(s.pendente)) return null
  return s.pendente
}

export function reduzir(s: Estado, e: Evento): Estado {
  switch (e.t) {
    case 'editar': {
      const pendente = coalescer(s.pendente, e.alt)
      return { ...s, pendente, fase: s.fase === 'conflito' ? 'conflito' : s.emVoo ? 'salvando' : 'sujo' }
    }
    case 'iniciar': {
      if (s.emVoo) {
        // retentativa de rede: MESMO opId (idempotência no servidor)
        return { ...s, fase: 'salvando' }
      }
      if (vazia(s.pendente) || s.fase === 'conflito') return s
      return { ...s, emVoo: { opId: e.opId, versao: s.versao, alt: s.pendente as Alteracao }, pendente: null, fase: 'salvando' }
    }
    case 'ok': {
      const vazioDepois = vazia(s.pendente)
      return { ...s, versao: e.versao, emVoo: null, tentativas: 0, fase: vazioDepois ? 'ocioso' : 'sujo' }
    }
    case 'rede':
      return { ...s, tentativas: s.tentativas + 1, fase: 'offline' }
    case 'erro':
      return { ...s, tentativas: s.tentativas + 1, fase: 'erro' }
    case 'conflito':
      return { ...s, fase: 'conflito', conflito: { versaoAtual: e.versaoAtual } }
    case 'usar_servidor':
      // descarta o que era local; o shell recarrega a página do servidor
      return { versao: e.versao, pendente: null, emVoo: null, tentativas: 0, fase: 'ocioso', conflito: null }
    case 'manter_minha': {
      // reenvia o que era meu sobre a versão atual do servidor (novo opId na próxima iniciar)
      const meu = coalescer(s.emVoo?.alt ?? null, s.pendente)
      return { versao: e.versaoAtual, pendente: meu, emVoo: null, tentativas: 0, fase: vazia(meu) ? 'ocioso' : 'sujo', conflito: null }
    }
    case 'tentar_de_novo':
      return { ...s, fase: s.emVoo || !vazia(s.pendente) ? 'sujo' : 'ocioso' }
  }
}

/** Classifica a resposta HTTP do PATCH. */
export type Resultado =
  | { k: 'ok'; versao: number }
  | { k: 'conflito'; versaoAtual: number }
  | { k: 'rede' }
  | { k: 'erro'; migracaoPendente?: boolean }

export function classificarResposta(status: number | null, corpo: unknown): Resultado {
  const c = (corpo && typeof corpo === 'object' ? corpo : {}) as Record<string, unknown>
  if (status === null) return { k: 'rede' }
  if (status >= 200 && status < 300) return typeof c.versao === 'number' ? { k: 'ok', versao: c.versao } : { k: 'erro' }
  if (status === 409) return { k: 'conflito', versaoAtual: typeof c.versao_atual === 'number' ? c.versao_atual : 0 }
  if (status === 503 && c.code === 'migracao_pendente') return { k: 'erro', migracaoPendente: true }
  if (status === 429 || status >= 500 || status === 408) return { k: 'rede' } // tenta de novo com backoff
  return { k: 'erro', migracaoPendente: c.code === 'migracao_pendente' }
}

// ---- fila offline persistida (1 item por página: o mais novo coalescido) ----
export type ItemFila = { paginaId: string; versao: number; opId: string; alt: Alteracao; em: number }

export function mesclarFila(fila: ItemFila[], novo: ItemFila): ItemFila[] {
  const i = fila.findIndex((x) => x.paginaId === novo.paginaId)
  if (i < 0) return [...fila, novo]
  const ant = fila[i]
  const alt = coalescer(ant.alt, novo.alt) as Alteracao
  // mantém a versão base mais antiga (a que o servidor conhece) e o opId mais novo
  const merged: ItemFila = { paginaId: novo.paginaId, versao: Math.min(ant.versao, novo.versao), opId: novo.opId, alt, em: novo.em }
  return fila.map((x, k) => (k === i ? merged : x))
}

export const removerDaFila = (fila: ItemFila[], paginaId: string, opId?: string): ItemFila[] =>
  fila.filter((x) => !(x.paginaId === paginaId && (opId === undefined || x.opId === opId)))

/** Rótulo do indicador. */
export function rotuloIndicador(fase: Estado['fase'], online: boolean, memoria: boolean): string {
  if (fase === 'conflito') return 'Conflito de versão'
  if (fase === 'erro') return 'Erro ao salvar — tentar de novo'
  if (fase === 'offline' || !online) return 'Offline — será enviado'
  if (fase === 'salvando' || fase === 'sujo') return 'Salvando…'
  return memoria ? 'Salvo (sem cópia local)' : 'Salvo'
}
