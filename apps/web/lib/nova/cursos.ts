import 'server-only'
// Resolver COMPARTILHADO das telas de Cursos da nova plataforma (/nova/cursos).
//
// Decisão de arquitetura (fixa): "curso" NÃO é entidade nova — REUSA o que o aluno já tem acesso.
// Aqui um "curso" = uma PASTA-RAIZ da Biblioteca de conteúdo (folder_area='conteudo') à qual o aluno
// tem acesso, resolvida pelo MESMO motor de acesso do Leitor (`arvoreBibliotecaAluno`, já filtrado por
// grupos/atribuições + herança, cacheado). ZERO tabela/migração nova.
//
// REAL (vindo do banco):
//   • lista de cursos           = pastas-raiz acessíveis (arvoreBibliotecaAluno(null))
//   • nº de PDFs/materiais       = totalDocs da subárvore (já contado e filtrado por acesso)
//   • progresso                  = docs lidos na subárvore (simulado_conteudo_leitura_progresso)
//   • "continue de onde parou"   = último documento lido do aluno
//   • documentos/subpastas       = conteúdo real de cada pasta (materiais → R.painelLeitor(docId))
//   • questões resolvidas/acerto = simulado_respostas_objetivas das sessões do aluno
//
// NÃO existe como dado (fica // TODO(dados) nas telas, nunca inventado aqui):
//   • videoaula/estrutura de módulos-aulas, "dias para a prova"/órgão, edital→conteúdo (conciliação),
//     disciplinas por professor, selo "conciliado". Não há tabela — não criamos.
import { getSessaoAluno } from '@/lib/aluno-session'
import { createAdminClient } from '@/lib/supabase/server'
import { arvoreBibliotecaAluno } from '@/lib/conteudo/leitor'
import { fetchAll, fetchAllByIn } from '@/lib/supabase/fetch-all'

const T_LP = 'simulado_conteudo_leitura_progresso'
const T_DOC = 'simulado_conteudo_documentos'
const T_PASTA = 'simulado_pastas'

export type CursoResumo = {
  /** id da PASTA-RAIZ da Biblioteca (= cursoId nas rotas). */
  id: string
  titulo: string
  cor: string | null
  /** materiais (PDFs) acessíveis na subárvore. */
  pdfs: number
  /** materiais já lidos na subárvore. */
  lidos: number
  /** progresso de leitura 0–100. */
  pct: number
  concluido: boolean
}

export type ContinueLeitura = {
  docId: string
  titulo: string
  cursoId: string | null
  cursoNome: string | null
  em: string | null
  /** capa do material (best-effort; pode faltar). */
  thumb?: string | null
} | null

export type CatalogoCursos = {
  nome: string
  cursos: CursoResumo[]
  continue: ContinueLeitura
  totalPdfs: number
  totalLidos: number
}

export type DocCurso = { id: string; titulo: string; tipo: string; lido: boolean }
export type SubCurso = { id: string; nome: string; cor: string | null; totalDocs: number }
export type CursoDetalhe = {
  id: string
  titulo: string
  cor: string | null
  /** total de materiais na subárvore do curso (PDFs). */
  pdfs: number
  lidos: number
  pct: number
  /** materiais diretos do nível atual. */
  documentos: DocCurso[]
  /** subpastas (módulos) do nível atual, com contagem. */
  subpastas: SubCurso[]
  /** caminho de navegação dentro do curso (raiz → nível atual). */
  breadcrumb: { id: string; nome: string }[]
  /** doc do "continue" quando pertence a este curso (senão null). */
  continueDocId: string | null
}

/** Contexto de leitura do aluno (lidos por documento + contagem por subárvore de pasta). Tolerante.
 *  SESSION-INDEPENDENT (svc/tenantId/estId explícitos) → reusado pelo snapshot de Cursos (render/escrita/worker). */
export async function contextoLeitura(svc: any, tenantId: string, estId: string) {
  const prog = await fetchAll<{ documento_id: string; ultima_leitura_em: string | null }>(() =>
    svc.from(T_LP).select('documento_id, ultima_leitura_em')
      .eq('tenant_id', tenantId).eq('aluno_id', estId)
      .order('documento_id', { ascending: true })).catch(() => [] as { documento_id: string; ultima_leitura_em: string | null }[])

  const lidoIds = [...new Set(prog.map((r) => r.documento_id).filter(Boolean))]
  const lidoSet = new Set(lidoIds)

  // pasta de cada doc lido + árvore de pastas de conteúdo (poucas dezenas) → contagem por subárvore.
  const [docsPasta, folders] = await Promise.all([
    lidoIds.length
      ? fetchAllByIn<{ id: string; pasta_id: string | null }>(lidoIds, (c) =>
          svc.from(T_DOC).select('id, pasta_id').eq('tenant_id', tenantId).in('id', c).order('id', { ascending: true })).catch(() => [])
      : Promise.resolve([] as { id: string; pasta_id: string | null }[]),
    fetchAll<{ id: string; pai_id: string | null }>(() =>
      svc.from(T_PASTA).select('id, pai_id').eq('tenant_id', tenantId).eq('folder_area', 'conteudo').order('id', { ascending: true })).catch(() => [] as { id: string; pai_id: string | null }[]),
  ])

  const paiDe = new Map<string, string | null>((folders ?? []).map((f) => [f.id, f.pai_id ?? null]))
  const pastaDeDoc = new Map<string, string | null>((docsPasta ?? []).map((d) => [d.id, d.pasta_id ?? null]))

  // lidos por subárvore: cada doc lido incrementa a pasta que o contém e TODAS as ancestrais.
  const lidosNaSub = new Map<string, number>()
  for (const id of lidoIds) {
    let cur: string | null = pastaDeDoc.get(id) ?? null
    const seen = new Set<string>()
    while (cur && !seen.has(cur)) { seen.add(cur); lidosNaSub.set(cur, (lidosNaSub.get(cur) ?? 0) + 1); cur = paiDe.get(cur) ?? null }
  }
  return { prog, lidoSet, lidosNaSub }
}

/** Catálogo "Meus cursos": pastas-raiz acessíveis + progresso real + "continue de onde parou". */
export async function carregarCatalogoCursos(): Promise<CatalogoCursos> {
  const vazio: CatalogoCursos = { nome: 'Aluno', cursos: [], continue: null, totalPdfs: 0, totalLidos: 0 }
  const sessao = await getSessaoAluno()
  if (!sessao) return vazio
  try {
    const arvore = await arvoreBibliotecaAluno(sessao.estudanteId, null).catch(() => null)
    const base = (arvore?.pastas ?? [])
    if (!base.length) return { ...vazio, nome: sessao.nome }

    const svc = createAdminClient()
    const { prog, lidosNaSub } = await contextoLeitura(svc, sessao.tenantId, sessao.estudanteId)

    const cursos: CursoResumo[] = base.map((p) => {
      const pdfs = p.totalDocs
      const lidos = Math.min(lidosNaSub.get(p.id) ?? 0, pdfs)
      const pct = pdfs ? Math.min(100, Math.round((lidos / pdfs) * 100)) : 0
      return { id: p.id, titulo: p.nome, cor: p.cor ?? null, pdfs, lidos, pct, concluido: pdfs > 0 && lidos >= pdfs }
    }).sort((a, b) => b.pct - a.pct || a.titulo.localeCompare(b.titulo, 'pt-BR'))

    // "Continue de onde parou": último documento lido (por ultima_leitura_em).
    let cont: ContinueLeitura = null
    const ultimo = (prog ?? []).filter((r) => r.ultima_leitura_em)
      .sort((a, b) => (b.ultima_leitura_em ?? '').localeCompare(a.ultima_leitura_em ?? ''))[0]
    if (ultimo) {
      try {
        const { data: d } = await svc.from(T_DOC).select('id, titulo, pasta_id')
          .eq('tenant_id', sessao.tenantId).eq('id', ultimo.documento_id).maybeSingle()
        if (d) {
          // sobe até a pasta-raiz (curso) do documento.
          const folders = new Map<string, string | null>()
          // reaproveita a árvore de pastas via nova leitura mínima (ids/pais) — barata e tolerante.
          const { data: fs } = await svc.from(T_PASTA).select('id, pai_id').eq('tenant_id', sessao.tenantId).eq('folder_area', 'conteudo')
          for (const f of (fs ?? []) as any[]) folders.set(f.id, f.pai_id ?? null)
          let cur: string | null = (d as any).pasta_id ?? null
          const seen = new Set<string>()
          while (cur && folders.get(cur) && !seen.has(cur)) { seen.add(cur); cur = folders.get(cur) ?? null }
          const cursoId = cur ?? ((d as any).pasta_id ?? null)
          cont = { docId: (d as any).id, titulo: (d as any).titulo, cursoId, cursoNome: cursos.find((c) => c.id === cursoId)?.titulo ?? null, em: ultimo.ultima_leitura_em }
        }
      } catch { /* continue é best-effort */ }
    }

    const totalPdfs = cursos.reduce((s, c) => s + c.pdfs, 0)
    const totalLidos = cursos.reduce((s, c) => s + c.lidos, 0)
    return { nome: sessao.nome, cursos, continue: cont, totalPdfs, totalLidos }
  } catch {
    const s = await getSessaoAluno().catch(() => null)
    return { ...vazio, nome: s?.nome ?? 'Aluno' }
  }
}

/** Detalhe de um curso (pasta-raiz) ou de uma subpasta (?pasta). Conteúdo real + progresso. */
export async function carregarCurso(cursoId: string, nivelId?: string | null): Promise<CursoDetalhe | null> {
  const sessao = await getSessaoAluno()
  if (!sessao) return null
  try {
    const nivel = nivelId || cursoId
    const arvore = await arvoreBibliotecaAluno(sessao.estudanteId, nivel).catch(() => null)
    if (!arvore) return null

    const svc = createAdminClient()
    const [{ lidoSet, lidosNaSub }, meta] = await Promise.all([
      contextoLeitura(svc, sessao.tenantId, sessao.estudanteId),
      svc.from(T_PASTA).select('id, nome, cor').eq('tenant_id', sessao.tenantId).eq('id', cursoId).maybeSingle()
        .then((r: any) => r.data, () => null),
    ])

    const documentos: DocCurso[] = (arvore.documentos ?? []).map((d) => ({ id: d.id, titulo: d.titulo, tipo: d.tipo_origem, lido: lidoSet.has(d.id) }))
    const subpastas: SubCurso[] = (arvore.pastas ?? []).map((p) => ({ id: p.id, nome: p.nome, cor: p.cor ?? null, totalDocs: p.totalDocs }))

    // Totais da subárvore DO CURSO (sempre pela raiz cursoId, não pelo nível atual) → hero estável.
    const arvoreRaiz = nivel === cursoId ? arvore : await arvoreBibliotecaAluno(sessao.estudanteId, cursoId).catch(() => null)
    const pdfs = (arvoreRaiz?.documentos.length ?? 0) + (arvoreRaiz?.pastas.reduce((s, p) => s + p.totalDocs, 0) ?? 0)
    const lidos = Math.min(lidosNaSub.get(cursoId) ?? 0, pdfs)
    const pct = pdfs ? Math.min(100, Math.round((lidos / pdfs) * 100)) : 0

    const titulo = (meta as any)?.nome ?? arvore.breadcrumb[arvore.breadcrumb.length - 1]?.nome ?? 'Curso'
    const cor = (meta as any)?.cor ?? null

    // doc do "continue": 1º material não lido do nível (senão o 1º) — alvo do botão "continuar".
    const continueDocId = (documentos.find((d) => !d.lido) ?? documentos[0])?.id ?? null

    return { id: cursoId, titulo, cor, pdfs, lidos, pct, documentos, subpastas, breadcrumb: arvore.breadcrumb ?? [], continueDocId }
  } catch {
    return null
  }
}

/** Estatística de questões do aluno (resolvidas + % de acerto), reusando as sessões de prova. */
export async function estatisticasQuestoesAluno(): Promise<{ resolvidas: number; acerto: number }> {
  const sessao = await getSessaoAluno()
  if (!sessao) return { resolvidas: 0, acerto: 0 }
  try {
    const svc = createAdminClient()
    const { data: sess } = await svc.from('simulado_sessoes_prova').select('id')
      .eq('estudante_id', sessao.estudanteId).eq('is_teste', false).eq('deletado', false)
    const ids = ((sess ?? []) as any[]).map((s) => s.id).filter(Boolean)
    if (!ids.length) return { resolvidas: 0, acerto: 0 }
    const base = () => svc.from('simulado_respostas_objetivas').select('*', { count: 'exact', head: true }).in('sessao_id', ids)
    const [{ count: tot }, { count: corr }] = await Promise.all([base(), base().eq('correta', true)])
    const resolvidas = tot ?? 0
    const acerto = resolvidas ? Math.round(((corr ?? 0) / resolvidas) * 100) : 0
    return { resolvidas, acerto }
  } catch {
    return { resolvidas: 0, acerto: 0 }
  }
}
