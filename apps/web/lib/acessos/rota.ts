/** Normalização de rota p/ o rastreio do aluno (pura; usada no cliente e no servidor). Sem query/hash; ids viram :id. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function normalizarRota(path: string): string | null {
  if (typeof path !== 'string') return null
  const limpo = path.split('?')[0].split('#')[0].trim()
  if (!/^\/(aluno|simulado|embed)(\/|$)/.test(limpo)) return null
  const partes = limpo.split('/').filter(Boolean).slice(0, 8).map((seg) => {
    if (UUID.test(seg) || /^\d{2,}$/.test(seg) || (seg.length > 24 && /\d/.test(seg)) || /^[A-Za-z0-9_-]{20,}$/.test(seg)) return ':id'
    return seg.replace(/[^\w\-.:]/g, '').slice(0, 40)
  })
  // Whitelist de prefixos conhecidos: 1º segmento sob /aluno (ou /aluno/nova/<seg>) fora da lista → /aluno/outros
  // (evita cardinalidade infinita/lixo vindo do cliente). /simulado e /embed só mantêm o 1º nível.
  if (partes[0] === 'aluno') {
    const nova = partes[1] === 'nova'
    const seg = partes[nova ? 2 : 1]
    if (seg !== undefined && !ID_OK.has(seg) && !(nova ? SEGS_NOVA : SEGS_ALUNO).has(seg)) return nova ? '/aluno/nova/outros' : '/aluno/outros'
  } else if (partes.length > 2) partes.length = 2
  const r = '/' + partes.join('/')
  return r.length <= 160 ? r : null
}

const ID_OK = new Set<string>([':id'])
const SEGS_ALUNO = new Set(['ajuda', 'biblioteca', 'cadernos', 'cronograma', 'desempenho', 'extensivos', 'favoritos', 'jurisprudencia', 'leitura', 'leitura-rapida', 'ligas', 'maratona', 'notificacoes', 'nova', 'perfil', 'questoes', 'realizados', 'recomendado', 'simulado', 'simulados', 'trilha', 'video', 'ranking', 'painel', 'cursos', 'entrar', 'login'])
const SEGS_NOVA = new Set(['inicio', 'ranking', 'ligas', 'cursos', 'desempenho', 'simulados', 'cronograma', 'biblioteca', 'cadernos', 'perfil', 'questoes', 'painel', 'maratona', 'ajuda', 'notificacoes', 'favoritos', 'trilha', 'leitura'])

/** Tipos que o CLIENTE pode enviar (nada além disso é aceito). */
export const TIPOS_CLIENTE = ['pagina_vista', 'tempo_pagina'] as const
export type TipoCliente = (typeof TIPOS_CLIENTE)[number]

/** Tipo "semântico" derivado da rota (feito no servidor, nunca confiado ao cliente). */
export function tipoDerivadoDaRota(rota: string): 'ranking_visto' | 'cronograma_aberto' | 'biblioteca_navegou' | null {
  if (/\/ranking(\/|$)/.test(rota)) return 'ranking_visto'
  if (/\/(cronograma|painel)(\/|$)/.test(rota)) return 'cronograma_aberto'
  if (/\/biblioteca(\/|$)/.test(rota)) return 'biblioteca_navegou'
  return null
}
