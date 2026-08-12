import type { ModalidadeAluno } from '@/lib/caderno-designer/entrega-aluno'

// Entrega V2: espelha os tipos de app/admin/cadernos-teste/actions.ts (definidos aqui p/ NÃO importar de
// um arquivo 'use server' — evita acoplar a lib ao bundle de server actions). `simulado_pastas.caderno_entrega`.
export type EntregaRef = { cadernoId?: string; itemId?: string; pdfUrl?: string; pdfNome?: string } | null
export type EntregaSlots = { diagnostico?: EntregaRef; folha?: EntregaRef; enunciado?: EntregaRef; gabarito?: EntregaRef }

/** Adiciona ?download=<nome>.pdf p/ o arquivo baixar com nome amigável (mesmo padrão do v1). */
function comDownload(url: string, nome: string): string {
  const arq = (nome || 'caderno').replace(/\.pdf$/i, '').trim() || 'caderno'
  const sep = url.includes('?') ? '&' : '?'
  return `${url}${sep}download=${encodeURIComponent(arq)}.pdf`
}

const usavel = (r: EntregaRef | undefined): r is NonNullable<EntregaRef> => !!r && !!(r.pdfUrl || (r.cadernoId && r.itemId))

function slot(id: string, nome: string, flags: { semGab: boolean; comGab: boolean }, r: NonNullable<EntregaRef>): ModalidadeAluno {
  const base: ModalidadeAluno = { id, nome, semGab: flags.semGab, comGab: flags.comGab }
  // PDF importado → baixa direto; item gerado → download pela rota do caderno de teste.
  if (r.pdfUrl) return { ...base, pdfUrl: comDownload(r.pdfUrl, r.pdfNome || nome) }
  return { ...base, cadernoTeste: { cadernoId: r.cadernoId!, itemId: r.itemId! } }
}

/**
 * Cadernos que o aluno recebe pela ENTREGA V2 (`caderno_entrega` do banco) — MESMA forma que
 * `modalidadesDoAluno` (v1), então os consumidores trocam com mínimo esforço (Fase 2). Cada slot vira
 * uma ModalidadeAluno: PDF importado (`pdfUrl` direto) OU item gerado (`cadernoTeste` → rota
 * /api/aluno/caderno-teste-pdf). Ordem de exibição: questões → folha → diagnóstico → gabarito.
 *  - Caderno de Questões (enunciado) → só "como fez" (sem gabarito), disponível antes/depois.
 *  - Folha de Respostas → "como fez" E "com correção" (esta só ao liberar).
 *  - Diagnóstico → só quando liberado.
 *  - Gabarito Comentado → só quando liberado (normalmente PDF importado).
 */
export function modalidadesDoAlunoV2(entrega: EntregaSlots | null | undefined): ModalidadeAluno[] {
  const e = entrega ?? {}
  const out: ModalidadeAluno[] = []
  if (usavel(e.enunciado)) out.push(slot('enunciado', 'Caderno de Questões', { semGab: true, comGab: false }, e.enunciado))
  if (usavel(e.folha)) out.push(slot('folha', 'Folha de Respostas', { semGab: true, comGab: true }, e.folha))
  if (usavel(e.diagnostico)) out.push(slot('diagnostico', 'Diagnóstico', { semGab: false, comGab: true }, e.diagnostico))
  if (usavel(e.gabarito)) out.push(slot('gabarito', e.gabarito.pdfNome || 'Gabarito Comentado', { semGab: false, comGab: true }, e.gabarito))
  return out
}

/** true se o banco tem QUALQUER slot de entrega V2 utilizável — gate p/ usar V2 no lugar do v1. */
export function temEntregaV2(entrega: EntregaSlots | null | undefined): boolean {
  const e = entrega ?? {}
  return usavel(e.enunciado) || usavel(e.folha) || usavel(e.diagnostico) || usavel(e.gabarito)
}

/** Carrega o `caderno_entrega` do banco (tolerante à coluna ausente). `tenantId` opcional: com
 *  createAdminClient passe o tenant (filtra); com createServiceClient (RLS do aluno) passe null. */
export async function carregarEntregaBanco(svc: any, tenantId: string | null | undefined, bancoId: string | null | undefined): Promise<EntregaSlots | null> {
  if (!bancoId) return null
  try {
    let q = svc.from('simulado_pastas').select('caderno_entrega').eq('id', bancoId)
    if (tenantId) q = q.eq('tenant_id', tenantId)
    const { data } = await q.maybeSingle()
    return ((data as any)?.caderno_entrega ?? null) as EntregaSlots | null
  } catch { return null }
}
