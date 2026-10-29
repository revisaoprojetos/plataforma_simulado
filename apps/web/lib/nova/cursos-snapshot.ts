import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { catalogoRaizAluno } from '@/lib/conteudo/leitor'
import { contextoLeitura, type CatalogoCursos, type CursoResumo, type ContinueLeitura } from '@/lib/nova/cursos'

// CURSOS — serviço backend (backend-first). TODA a computação do catálogo "Meus cursos" vive aqui e é
// SESSION-INDEPENDENT (roda do render-miss, da escrita e do worker). A página /nova/cursos só LÊ o
// snapshot (1 linha pronta) — NÃO chama mais `carregarCatalogoCursos` → `arvoreBibliotecaAluno` no render.
// Diferença-chave de custo: `computarCatalogo` usa `catalogoRaizAluno` (só pastas-raiz + contagem, SEM
// thumbs/prévias) em vez da árvore inteira. Migração: 20261028040000_cursos_snapshot.sql.
// Ver docs/ARQUITETURA-BACKEND-FIRST.md.

const T = 'simulado_cursos_snapshot'
const T_DOC = 'simulado_conteudo_documentos'
const T_PASTA = 'simulado_pastas'

// Frescura do catálogo: sem `dia` (não vira por data). Se o snapshot for mais velho que isto, a leitura
// recomputa (self-heal do progresso), além do write-behind e do roll no worker. 10 min = bom equilíbrio
// entre "progresso recente aparece" e "não recomputar a árvore a cada render".
const FRESCOR_MS = 10 * 60 * 1000

const vazio = (nome = 'Aluno'): CatalogoCursos => ({ nome, cursos: [], continue: null, totalPdfs: 0, totalLidos: 0 })

/** Nome do aluno (p/ saudação na tela vazia) — session-independent. */
async function nomeDoAluno(svc: SupabaseClient, tenantId: string, estId: string): Promise<string> {
  try {
    const { data } = await svc.from('simulado_estudantes').select('nome').eq('tenant_id', tenantId).eq('id', estId).maybeSingle()
    return (data as { nome?: string } | null)?.nome || 'Aluno'
  } catch { return 'Aluno' }
}

/** COMPUTA o catálogo (pesado, mas SEM a árvore inteira). Session-independent — nunca no caminho rápido. */
export async function computarCatalogo(svc: SupabaseClient, tenantId: string, estId: string): Promise<CatalogoCursos> {
  if (!tenantId || !estId) return vazio()
  const nome = await nomeDoAluno(svc, tenantId, estId)

  // Cursos = pastas-raiz acessíveis (SEM thumbs/prévias — a parte cara/egress fica fora).
  const base = await catalogoRaizAluno(svc as any, tenantId, estId).catch(() => [])
  if (!base.length) return vazio(nome)

  // Progresso real (lidos por subárvore) + último lido — reusa o contexto de leitura do aluno.
  const { prog, lidosNaSub } = await contextoLeitura(svc, tenantId, estId)

  const cursos: CursoResumo[] = base.map((p) => {
    const pdfs = p.totalDocs
    const lidos = Math.min(lidosNaSub.get(p.id) ?? 0, pdfs)
    const pct = pdfs ? Math.min(100, Math.round((lidos / pdfs) * 100)) : 0
    return { id: p.id, titulo: p.nome, cor: p.cor ?? null, pdfs, lidos, pct, concluido: pdfs > 0 && lidos >= pdfs }
  }).sort((a, b) => b.pct - a.pct || a.titulo.localeCompare(b.titulo, 'pt-BR'))

  // "Continue de onde parou": último documento lido (query leve, igual ao Painel) + capa best-effort.
  let cont: ContinueLeitura = null
  const ultimo = (prog ?? []).filter((r) => r.ultima_leitura_em)
    .sort((a, b) => (b.ultima_leitura_em ?? '').localeCompare(a.ultima_leitura_em ?? ''))[0]
  if (ultimo?.documento_id) {
    try {
      const { data: d } = await svc.from(T_DOC).select('id, titulo, pasta_id')
        .eq('tenant_id', tenantId).eq('id', ultimo.documento_id).maybeSingle()
      if (d) {
        const doc = d as { id: string; titulo: string; pasta_id?: string | null }
        // sobe até a pasta-raiz (curso) do documento pela árvore de pastas de conteúdo (poucas dezenas).
        const { data: fs } = await svc.from(T_PASTA).select('id, pai_id')
          .eq('tenant_id', tenantId).eq('folder_area', 'conteudo')
        const paiDe = new Map<string, string | null>(((fs ?? []) as any[]).map((f) => [f.id, f.pai_id ?? null]))
        let cur: string | null = doc.pasta_id ?? null
        const seen = new Set<string>()
        while (cur && paiDe.get(cur) && !seen.has(cur)) { seen.add(cur); cur = paiDe.get(cur) ?? null }
        const cursoId = cur ?? (doc.pasta_id ?? null)
        let thumb: string | null = null
        try { const { gerarThumbDocumento } = await import('@/lib/conteudo/thumb'); thumb = await gerarThumbDocumento(tenantId, doc.id) } catch { /* capa best-effort */ }
        cont = { docId: doc.id, titulo: doc.titulo, cursoId, cursoNome: cursos.find((c) => c.id === cursoId)?.titulo ?? null, em: ultimo.ultima_leitura_em, thumb }
      }
    } catch { /* continue é best-effort */ }
  }

  const totalPdfs = cursos.reduce((s, c) => s + c.pdfs, 0)
  const totalLidos = cursos.reduce((s, c) => s + c.lidos, 0)
  return { nome, cursos, continue: cont, totalPdfs, totalLidos }
}

/** LÊ o catálogo (caminho rápido): 1 linha pronta. Recomputa só no miss ou se o snapshot ficou velho. */
export async function carregarCatalogo(svc: SupabaseClient, tenantId: string, estId: string): Promise<CatalogoCursos> {
  if (!tenantId || !estId) return vazio()
  try {
    const { data } = await svc.from(T).select('dados, atualizado_em').eq('tenant_id', tenantId).eq('estudante_id', estId).maybeSingle()
    const row = data as { dados?: CatalogoCursos; atualizado_em?: string } | null
    if (row?.dados && row.atualizado_em && Date.now() - new Date(row.atualizado_em).getTime() < FRESCOR_MS) {
      return row.dados
    }
  } catch { /* tabela ausente (sem migração) → computa direto */ }
  const dados = await computarCatalogo(svc, tenantId, estId)
  try {
    await svc.from(T).upsert({ tenant_id: tenantId, estudante_id: estId, dados, atualizado_em: new Date().toISOString() }, { onConflict: 'estudante_id' })
  } catch { /* snapshot best-effort */ }
  return dados
}

/** WRITE-BEHIND: recomputa e grava o snapshot (chamar nas ações que mudam o catálogo/progresso). */
export async function atualizarCatalogoSnapshot(svc: SupabaseClient, tenantId: string, estId: string): Promise<void> {
  if (!tenantId || !estId) return
  try {
    const dados = await computarCatalogo(svc, tenantId, estId)
    await svc.from(T).upsert({ tenant_id: tenantId, estudante_id: estId, dados, atualizado_em: new Date().toISOString() }, { onConflict: 'estudante_id' })
  } catch { /* best-effort */ }
}
