import 'server-only'
import { modalidadesDoAlunoV2, type EntregaSlots } from '@/lib/caderno-teste/entrega-aluno'
import { resolverLiberacoes } from '@/lib/simulado/liberacao'

/** Um caderno que o aluno pode baixar a partir do CARD do simulado (home/pasta) — sem sessão específica.
 *  `tipo` dirige o ícone do pop-up. `comGab` separa "sem gabarito" (caderno) de "com correção" (gabarito). */
export interface DownloadSimulado {
  modalidade: string   // enunciado | folha | diagnostico | gabarito
  nome: string
  href: string
  comGab: boolean
  tipo: 'caderno' | 'folha' | 'diagnostico' | 'gabarito'
}

type SimDl = { id: string; regras: any; embed_token: string | null; status?: string | null; data_fim?: string | null }

/**
 * Resolve, por simulado, a LISTA de cadernos baixáveis a partir do card (pop-up "Baixar"): Caderno de
 * Questões (enunciado, pré-prova, sem sessão) + Gabarito Comentado / Diagnóstico (quando liberados E
 * importados como PDF — download direto). Modalidades GERADAS com gabarito dependem de uma sessão
 * específica → ficam no resultado do simulado, não aqui. Reusa a mesma fonte do resultado
 * (`caderno_entrega` do banco + `resolverLiberacoes`) para não divergir.
 */
export async function resolverDownloadsSimulados(svc: any, sims: SimDl[]): Promise<Map<string, DownloadSimulado[]>> {
  const out = new Map<string, DownloadSimulado[]>()
  const comBanco = sims.filter((s) => !!(s.regras as any)?.banco_base_id)
  if (!comBanco.length) return out
  const bancoIds = [...new Set(comBanco.map((s) => (s.regras as any).banco_base_id as string))]
  const entregaPorBanco = new Map<string, EntregaSlots | null>()
  try {
    const { data } = await svc.from('simulado_pastas').select('id, caderno_entrega').in('id', bancoIds)
    for (const p of (data ?? []) as any[]) entregaPorBanco.set(p.id, (p.caderno_entrega ?? null) as EntregaSlots | null)
  } catch { /* coluna pode não existir */ }

  for (const s of comBanco) {
    const entrega = entregaPorBanco.get((s.regras as any).banco_base_id) ?? null
    const mods = modalidadesDoAlunoV2(entrega)
    const { enunciadoLiberado, gabaritoLiberado } = resolverLiberacoes(s.regras, { status: s.status, data_fim: s.data_fim })
    const list: DownloadSimulado[] = []
    for (const m of mods) {
      if (m.id === 'enunciado') {
        // Caderno de Questões (sem respostas): pré-prova, sem sessão. PDF importado → direto; gerado → rota por token.
        if (!enunciadoLiberado) continue
        const href = m.pdfUrl ? m.pdfUrl
          : (m.cadernoTeste && s.embed_token) ? `/api/aluno/caderno-teste-questoes?token=${encodeURIComponent(s.embed_token)}` : null
        if (href) list.push({ modalidade: m.id, nome: m.nome, href, comGab: false, tipo: 'caderno' })
      } else if (m.id === 'gabarito') {
        // Gabarito Comentado — só quando liberado. PDF importado baixa direto (sessionless).
        if (gabaritoLiberado && m.pdfUrl) list.push({ modalidade: m.id, nome: m.nome, href: m.pdfUrl, comGab: true, tipo: 'gabarito' })
      } else if (m.id === 'diagnostico') {
        if (gabaritoLiberado && m.pdfUrl) list.push({ modalidade: m.id, nome: m.nome, href: m.pdfUrl, comGab: true, tipo: 'diagnostico' })
      }
      // `folha` (folha de respostas preenchida) depende de sessão → não entra no download genérico do card.
    }
    if (list.length) out.set(s.id, list)
  }
  return out
}
