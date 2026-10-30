// FAQ da AJUDA do aluno, personalizável por tenant. Guardado dentro do `tema` jsonb do tenant na
// chave `tema.ajuda_faq` (sem migração) — mesmo padrão de lib/sidebar-rotulos.tsx e
// lib/brand/aparencia-auth.ts (salvarTema* faz merge raso em simulado_tenants.tema).
//
// Puro / client-safe (sem hooks nem server-only) → importável em server e client.
// Ausente/vazio/inválido = cai no FAQ padrão do código (FAQ_PADRAO).

export type Pergunta = { q: string; a?: string }
export type Tema = { titulo: string; perguntas: Pergunta[] }

/** FAQ padrão (semente). Usado quando o tenant ainda não personalizou a Ajuda. */
export const FAQ_PADRAO: Tema[] = [
  { titulo: 'Primeiros passos', perguntas: [
    { q: 'Como monto o meu cronograma?', a: 'Em Meu painel de estudos, toque em Montar meu cronograma. São três perguntas rápidas e depois você escolhe dias, horas, disciplinas e metas.' },
    { q: 'O que aparece no Início?' },
    { q: 'Onde estão os meus cursos?' },
  ] },
  { titulo: 'Cronograma e metas', perguntas: [
    { q: 'Atrasei metas. E agora?' },
    { q: 'Posso mudar as horas de estudo depois?' },
    { q: 'Parei no meio de uma aula. Perco o que li?' },
  ] },
  { titulo: 'Materiais, grifos e cadernos', perguntas: [
    { q: 'Os meus grifos ficam salvos?' },
    { q: 'Como mando um trecho para o caderno?' },
    { q: 'Posso baixar o PDF?' },
  ] },
  { titulo: 'Conta e acesso', perguntas: [
    { q: 'Como troco a minha senha?' },
    { q: 'Meu acesso vai vencer. O que faço?' },
  ] },
]

/** Sanea uma pergunta crua (tolerante): exige `q` não-vazia; `a` opcional. */
function limparPergunta(raw: unknown): Pergunta | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const q = typeof r.q === 'string' ? r.q.trim() : ''
  if (!q) return null
  const a = typeof r.a === 'string' && r.a.trim() ? r.a.trim() : undefined
  return a ? { q, a } : { q }
}

/** Sanea um tema cru (tolerante): exige `titulo` e ao menos uma pergunta válida. */
function limparTema(raw: unknown): Tema | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const titulo = typeof r.titulo === 'string' ? r.titulo.trim() : ''
  if (!titulo) return null
  const perguntas = Array.isArray(r.perguntas)
    ? r.perguntas.map(limparPergunta).filter((p): p is Pergunta => !!p)
    : []
  if (!perguntas.length) return null
  return { titulo, perguntas }
}

/**
 * Lê e saneia o FAQ a partir do objeto `tema` do tenant (simulado_tenants.tema jsonb).
 * Ausente / vazio / inválido → FALLBACK no FAQ padrão do código.
 *
 * @param tema objeto `tema` do tenant (Tenant.tema de lib/tenant.ts)
 */
export function lerAjudaFaq(tema: unknown): Tema[] {
  const raw = (tema as Record<string, unknown> | null | undefined)?.ajuda_faq
  if (!Array.isArray(raw)) return FAQ_PADRAO
  const temas = raw.map(limparTema).filter((t): t is Tema => !!t)
  return temas.length ? temas : FAQ_PADRAO
}

/** Sanea um FAQ vindo do editor antes de gravar em `tema.ajuda_faq`. Remove temas/perguntas vazios. */
export function sanearAjudaFaq(input: unknown): Tema[] {
  if (!Array.isArray(input)) return []
  return input.map(limparTema).filter((t): t is Tema => !!t)
}
