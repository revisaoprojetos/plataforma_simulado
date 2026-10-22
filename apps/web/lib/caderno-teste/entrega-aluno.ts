/** Cada caderno que o aluno pode baixar (folha, diagnóstico, caderno de questões, gabarito). */
export interface ModalidadeAluno {
  id: string
  nome: string
  /** "Como você fez" (sem gabarito) — disponível assim que o aluno finaliza. */
  semGab: boolean
  /** "Com correção" — disponível quando a nota/gabarito é liberado. */
  comGab: boolean
  /** Gabarito Comentado (PDF importado): baixa o arquivo direto. */
  pdfUrl?: string
  /** Item gerado da entrega V2 → download pela rota /api/aluno/caderno-teste-pdf. */
  cadernoTeste?: { cadernoId: string; itemId: string }
}

// Entrega V2: espelha os tipos de app/admin/cadernos-teste/actions.ts (definidos aqui p/ NÃO importar de
// um arquivo 'use server' — evita acoplar a lib ao bundle de server actions). `simulado_pastas.caderno_entrega`.
// `docId`/`versaoId` = diagnóstico do EDITOR BETA (OnlyOffice). Hoje INERTE para o aluno (usavel() abaixo
// o ignora de propósito — é teste de usabilidade no admin). Em sincronia com app/admin/cadernos-teste/actions.ts.
export type EntregaRef = { cadernoId?: string; itemId?: string; pdfUrl?: string; pdfNome?: string; docId?: string; versaoId?: string } | null
export type EntregaSlots = { diagnostico?: EntregaRef; folha?: EntregaRef; enunciado?: EntregaRef; gabarito?: EntregaRef }

/** Adiciona ?download=<nome>.pdf p/ o arquivo baixar com nome amigável (mesmo padrão do v1). */
function comDownload(url: string, nome: string): string {
  const arq = (nome || 'caderno').replace(/\.pdf$/i, '').trim() || 'caderno'
  const sep = url.includes('?') ? '&' : '?'
  return `${url}${sep}download=${encodeURIComponent(arq)}.pdf`
}

// Variant OnlyOffice (diagnóstico do EDITOR BETA): só tem docId/versaoId, sem pdfUrl nem cadernoId.
const ehOffice = (r: NonNullable<EntregaRef>): boolean => !!(r.docId && r.versaoId) && !r.pdfUrl && !(r.cadernoId && r.itemId)
const usavel = (r: EntregaRef | undefined): r is NonNullable<EntregaRef> => !!r && !!(r.pdfUrl || (r.cadernoId && r.itemId) || (r.docId && r.versaoId))

function slot(id: string, nome: string, flags: { semGab: boolean; comGab: boolean }, r: NonNullable<EntregaRef>, sessaoId?: string): ModalidadeAluno {
  const base: ModalidadeAluno = { id, nome, semGab: flags.semGab, comGab: flags.comGab }
  // PDF importado → baixa direto.
  if (r.pdfUrl) return { ...base, pdfUrl: comDownload(r.pdfUrl, r.pdfNome || nome) }
  // Diagnóstico do EDITOR BETA (OnlyOffice): PDF gerado on-the-fly do .docx preenchido c/ os valores do aluno.
  if (ehOffice(r) && sessaoId) return { ...base, pdfUrl: comDownload(`/api/aluno/diagnostico-docx-pdf?versaoId=${encodeURIComponent(r.versaoId!)}&sessao=${encodeURIComponent(sessaoId)}`, nome) }
  // Item gerado (caderno de teste) → download pela rota do caderno.
  if (r.cadernoId && r.itemId) return { ...base, cadernoTeste: { cadernoId: r.cadernoId, itemId: r.itemId } }
  return base // office sem sessaoId: sem link (não ocorre no fluxo do aluno, que sempre tem sessão)
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
export function modalidadesDoAlunoV2(entrega: EntregaSlots | null | undefined, sessaoId?: string): ModalidadeAluno[] {
  const e = entrega ?? {}
  const out: ModalidadeAluno[] = []
  if (usavel(e.enunciado)) out.push(slot('enunciado', 'Caderno de Questões', { semGab: true, comGab: false }, e.enunciado))
  if (usavel(e.folha)) out.push(slot('folha', 'Folha de Respostas', { semGab: true, comGab: true }, e.folha))
  // Diagnóstico OnlyOffice só entra se há sessão (precisa dela p/ preencher os valores do aluno no PDF).
  if (usavel(e.diagnostico) && (!ehOffice(e.diagnostico) || sessaoId)) out.push(slot('diagnostico', 'Diagnóstico', { semGab: false, comGab: true }, e.diagnostico, sessaoId))
  if (usavel(e.gabarito)) out.push(slot('gabarito', 'Gabarito Comentado', { semGab: false, comGab: true }, e.gabarito))
  return out
}

/** true se o banco tem QUALQUER slot de entrega V2 utilizável — gate p/ usar V2 no lugar do v1. */
export function temEntregaV2(entrega: EntregaSlots | null | undefined): boolean {
  const e = entrega ?? {}
  return usavel(e.enunciado) || usavel(e.folha) || usavel(e.diagnostico) || usavel(e.gabarito)
}

/** Carrega o `caderno_entrega` do banco (tolerante à coluna ausente). `tenantId` opcional: com
 *  createAdminClient passe o tenant (filtra); com createAdminClient (RLS do aluno) passe null. */
export async function carregarEntregaBanco(svc: any, tenantId: string | null | undefined, bancoId: string | null | undefined): Promise<EntregaSlots | null> {
  if (!bancoId) return null
  try {
    let q = svc.from('simulado_pastas').select('caderno_entrega').eq('id', bancoId)
    if (tenantId) q = q.eq('tenant_id', tenantId)
    const { data } = await q.maybeSingle()
    return ((data as any)?.caderno_entrega ?? null) as EntregaSlots | null
  } catch { return null }
}
