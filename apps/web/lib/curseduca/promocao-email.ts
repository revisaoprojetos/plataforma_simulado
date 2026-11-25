// Promoção de e-mail da Curseduca a principal — decisão PURA (sem I/O), testável.
// Causa do ping-pong: dois membros/canais resolvem ao MESMO estudante com e-mails diferentes (A e B);
// a regra antiga promovia cada um em sequência (A→B→A…) a cada sync = 1+ UPDATE por membro por rodada.
// Aqui: agrega por estudante e decide UMA vez, de forma estável.

const norm = (s: unknown) => String(s ?? '').trim().toLowerCase()

export type PlanoPromocao =
  | { acao: 'promover'; email: string; secundarios: string[] }
  | { acao: 'pular'; motivo: 'ja_principal' | 'ja_secundario' | 'sem_candidato' }

/**
 * @param rec           estado atual do estudante (email principal + secundários)
 * @param emailsMembros e-mails (Curseduca) de TODOS os membros da rodada que resolveram a este estudante
 *
 * - Se o principal atual é igual a algum e-mail de membro → nada a fazer (mantém o atual: estável).
 * - Candidatos já presentes em emails_secundarios NÃO são promovidos (evita A→B→A).
 * - Entre candidatos elegíveis, escolhe o primeiro em ordem alfabética (determinístico, independe da ordem de chegada).
 */
export function planejarPromocaoEmail(
  rec: { email?: string | null; emails_secundarios?: string[] | null },
  emailsMembros: string[],
): PlanoPromocao {
  const atual = norm(rec.email)
  const cands = [...new Set(emailsMembros.map(norm).filter(Boolean))]
  if (!cands.length) return { acao: 'pular', motivo: 'sem_candidato' }
  if (cands.includes(atual)) return { acao: 'pular', motivo: 'ja_principal' }
  const sec = new Set<string>((rec.emails_secundarios ?? []).map(norm).filter(Boolean))
  const elegiveis = cands.filter((c) => !sec.has(c)).sort()
  if (!elegiveis.length) return { acao: 'pular', motivo: 'ja_secundario' }
  const novo = elegiveis[0]
  const novoSec = new Set(sec)
  if (atual) novoSec.add(atual)
  novoSec.delete(novo)
  return { acao: 'promover', email: novo, secundarios: [...novoSec] }
}
