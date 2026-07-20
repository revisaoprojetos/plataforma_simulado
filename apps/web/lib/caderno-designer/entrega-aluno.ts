import { mesclarModalidades } from './types'
import { enunciadoPdf } from './material'
import { filtrarModsPorTipo, type TipoSimulado } from '@/lib/simulado/tipo'

export interface ModalidadeAluno {
  id: string
  nome: string
  /** "Como você fez" (sem gabarito) — disponível assim que o aluno finaliza. */
  semGab: boolean
  /** "Com correção" — disponível quando a nota/gabarito é liberado. */
  comGab: boolean
  /** Quando é o Gabarito Comentado (PDF importado): baixa o arquivo direto. */
  pdfUrl?: string
}

const temConteudo = (d: any) =>
  !!d && Array.isArray(d.pages) && d.pages.some((p: any) => (p.blocks ?? []).some((b: any) => b.type !== 'plano-fundo'))

/**
 * Cadernos que o aluno recebe ao finalizar um simulado — FONTE ÚNICA da verdade
 * usada por todos os pipelines (portal do aluno, API de resultado, visões admin).
 *
 * Modelo atual (o "Caderno Completo" com respostas marcadas NÃO é mais entregue):
 *  - Folha de Respostas  → como fez (sem gabarito) E com gabarito ao liberar
 *  - Caderno de questões → só as questões, sem resposta (só "como fez")
 *  - Diagnóstico         → só quando liberado
 *  - Gabarito Comentado (PDF) → PDF importado, só quando liberado (some se não houver PDF)
 */
export function modalidadesDoAluno(config: unknown, tipo: TipoSimulado | null): ModalidadeAluno[] {
  const cfg = (config ?? {}) as any
  const docs = (cfg.docsV2 ?? {}) as Record<string, unknown>

  const sistema = filtrarModsPorTipo(mesclarModalidades(cfg.modalidadesV2), tipo)
    // "Caderno Completo" (id caderno_completo) foi descontinuado para o aluno.
    .filter((m) => m.id !== 'caderno_completo')
    // "Caderno de questões" (caderno_perguntas) é entrega-padrão mesmo sem doc próprio;
    // as demais só aparecem se tiverem conteúdo desenhado.
    .filter((m) => temConteudo(docs[m.id]) || m.id === 'caderno_perguntas')
    .map((m): ModalidadeAluno => ({
      id: m.id,
      nome: m.nome,
      semGab: m.id !== 'diagnostico',       // diagnóstico depende do resultado → só ao liberar
      comGab: m.id !== 'caderno_perguntas', // caderno de questões não tem versão com gabarito
    }))

  const pdf = enunciadoPdf(cfg)
  const enunciado: ModalidadeAluno[] = pdf
    ? [{ id: 'pdf-importado', nome: pdf.nome, semGab: false, comGab: true, pdfUrl: pdf.url }]
    : []

  return [...sistema, ...enunciado]
}
