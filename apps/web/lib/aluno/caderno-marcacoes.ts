// GRIFOS e ANOTAÇÕES do aluno para Meus Cadernos (nova), de TODOS os materiais da Biblioteca.
// Duas origens:
//   • simulado_conteudo_grifos_pdf — o leitor ATUAL (PDF fiel, /aluno/biblioteca/[id]). Grifo = página +
//     retângulos; `nota` é a anotação ligada ao grifo; `texto` é o trecho marcado (pode vir vazio).
//   • simulado_conteudo_anotacoes  — o leitor de TEXTO antigo (âncora por offset). Mantido para não sumir
//     com o que o aluno marcou antes da troca do leitor.
// Antes a aba Grifos lia só a tabela antiga (e de um material só), por isso aparecia vazia.
import { fetchAll } from '@/lib/supabase/fetch-all'

export type TagCor = 'gold' | 'green' | 'blue' | 'pink' | 'red' | 'gray'

// Cor salva pelo leitor (chave y/g/b/v/r/k ou o HEX equivalente) → etiqueta da tela.
const COR: Record<string, { tag: TagCor; label: string }> = {
  y: { tag: 'gold', label: 'Importante' },
  g: { tag: 'green', label: 'Revisar' },
  b: { tag: 'blue', label: 'Conceito' },
  v: { tag: 'pink', label: 'Dúvida' },
  r: { tag: 'red', label: 'Exceção' },
  k: { tag: 'gray', label: 'Riscado' },
  '#fde047': { tag: 'gold', label: 'Importante' },
  '#86efac': { tag: 'green', label: 'Revisar' },
  '#93c5fd': { tag: 'blue', label: 'Conceito' },
  '#c4b5fd': { tag: 'pink', label: 'Dúvida' },
  '#fca5a5': { tag: 'red', label: 'Exceção' },
  '#374151': { tag: 'gray', label: 'Riscado' },
}
const corDe = (c: unknown, fallback: string = 'y') => COR[String(c ?? '').toLowerCase()] ?? COR[fallback]

export type Marcacao = {
  id: string
  documentoId: string
  pagina: number | null // null = leitor de texto antigo (sem página)
  texto: string
  nota: string
  tag: TagCor
  label: string
  criadoEm: string
}

export type MaterialMarcado = { documentoId: string; titulo: string; marcacoes: Marcacao[]; ultimaEm: string }

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

/** Todas as marcações do aluno (grifos do PDF + anotações do leitor antigo), agrupadas por material. */
export async function carregarMarcacoesAluno(svc: any, tenantId: string, alunoId: string): Promise<MaterialMarcado[]> {
  const [pdf, texto] = await Promise.all([
    fetchAll<any>(() => svc.from('simulado_conteudo_grifos_pdf')
      .select('id, documento_id, pagina, cor, tool, nota, texto, criado_em')
      .eq('tenant_id', tenantId).eq('aluno_id', alunoId)
      .order('id', { ascending: true }), 1000, 'cadernos:grifos_pdf').catch(() => [] as any[]),
    fetchAll<any>(() => svc.from('simulado_conteudo_anotacoes')
      .select('id, documento_id, tipo, texto_ancora, conteudo, criada_em')
      .eq('tenant_id', tenantId).eq('aluno_id', alunoId)
      .order('id', { ascending: true }), 1000, 'cadernos:anotacoes').catch(() => [] as any[]),
  ])

  const todas: Marcacao[] = [
    ...pdf.map((g): Marcacao => ({
      id: g.id, documentoId: g.documento_id, pagina: Number(g.pagina) || 1,
      texto: str(g.texto), nota: str(g.nota), criadoEm: g.criado_em ?? '',
      ...corDe(g.cor, g.tool === 'st' ? 'k' : 'y'),
    })),
    ...texto.filter((a) => a.tipo !== 'insercao').map((a): Marcacao => ({
      id: a.id, documentoId: a.documento_id, pagina: null,
      texto: str(a.texto_ancora), nota: str(a?.conteudo?.nota) || (a.tipo === 'nota' ? str(a?.conteudo?.texto) : ''),
      criadoEm: a.criada_em ?? '',
      ...corDe(a?.conteudo?.cor, a.tipo === 'riscado' ? 'k' : 'y'),
    })),
  ]
  if (!todas.length) return []

  // Títulos dos materiais (e some com o que foi excluído da Biblioteca — o leitor daria 404).
  const docIds = [...new Set(todas.map((m) => m.documentoId))]
  const docs = new Map<string, string>()
  for (let i = 0; i < docIds.length; i += 100) {
    const { data } = await svc.from('simulado_conteudo_documentos').select('id, titulo, deletado')
      .eq('tenant_id', tenantId).in('id', docIds.slice(i, i + 100))
    for (const d of (data ?? []) as any[]) if (!d.deletado) docs.set(d.id, d.titulo || 'Material sem título')
  }

  const porDoc = new Map<string, MaterialMarcado>()
  for (const m of todas) {
    const titulo = docs.get(m.documentoId)
    if (!titulo) continue
    let g = porDoc.get(m.documentoId)
    if (!g) porDoc.set(m.documentoId, (g = { documentoId: m.documentoId, titulo, marcacoes: [], ultimaEm: '' }))
    g.marcacoes.push(m)
    if (m.criadoEm > g.ultimaEm) g.ultimaEm = m.criadoEm
  }
  // Dentro do material: na ordem de leitura (página); materiais: o mais recentemente marcado primeiro.
  const grupos = [...porDoc.values()]
  for (const g of grupos) g.marcacoes.sort((a, b) => (a.pagina ?? 0) - (b.pagina ?? 0) || a.criadoEm.localeCompare(b.criadoEm))
  return grupos.sort((a, b) => b.ultimaEm.localeCompare(a.ultimaEm))
}

/** Link que abre o material no leitor (na página do grifo) e volta para a aba de Meus Cadernos. */
export function linkLeitor(documentoId: string, pagina: number | null, voltar: string): string {
  const q = new URLSearchParams()
  if (pagina) q.set('pagina', String(pagina))
  q.set('voltar', voltar)
  return `/aluno/biblioteca/${documentoId}?${q.toString()}`
}
