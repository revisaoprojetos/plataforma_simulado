import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { carregarInfoDocs, type InfoDoc } from './relink-documento-server'
import { encontrarSubstituto, normalizarTituloDoc, type DocCandidato } from './relink-documento'
import { docIdDaChave } from './remap-as'

// VISÃO ADMIN das ligações meta ↔ documento (somente leitura). Cruza o cadastro de metas (meta_def: 1 linha por aula/lei, com o
// snapshot do nome) e as assinaturas dos planos dos alunos (cfg.chavesAS / cfg.orfas) com a situação ATUAL dos documentos.

const T_DEF = 'simulado_cronograma_adaptativo_meta_def'
const T_PLANO = 'simulado_cronograma_adaptativo_plano'
const T_DOC = 'simulado_conteudo_documentos'
const T_PASTA = 'simulado_pastas'

export type ProblemaLigacao = 'sem_documento' | 'documento_deletado' | 'documento_despublicado' | 'documento_inexistente' | 'documento_movido' | 'titulo_divergente'

export interface ItemLigacao {
  definicao_id: string; tipo: string; chave: string; disciplina: string | null; titulo: string | null
  documento_id: string | null; problemas: ProblemaLigacao[]
  doc_titulo_snapshot: string | null; doc_titulo_atual: string | null
  /** substituto por nome: único (relinkável), ambíguo (precisa decisão humana) ou nenhum */
  relink: { situacao: 'unico' | 'ambiguo' | 'nenhum' | 'nao_aplicavel'; candidatos: Array<{ id: string; titulo: string }> }
}
export interface ResumoLigacoes {
  definicoes: number; sem_documento: number; deletados: number; despublicados: number; inexistentes: number; movidos: number; titulo_divergente: number
  relink_unico: number; relink_ambiguo: number
  planos: number; planos_com_orfas: number; planos_com_documento_problema: number; documentos_problema_em_planos: number
}
export interface FiltroLigacoes { pagina?: number; porPagina?: number; problema?: ProblemaLigacao | ''; busca?: string }

export async function diagnosticarLigacoes(svc: SupabaseClient, tenantId: string, f: FiltroLigacoes = {}): Promise<{ ok: boolean; motivo?: string; resumo: ResumoLigacoes; itens: ItemLigacao[]; total: number; pagina: number; porPagina: number }> {
  const porPagina = Math.min(Math.max(f.porPagina ?? 50, 1), 200), pagina = Math.max(f.pagina ?? 1, 1)
  const resumo: ResumoLigacoes = { definicoes: 0, sem_documento: 0, deletados: 0, despublicados: 0, inexistentes: 0, movidos: 0, titulo_divergente: 0, relink_unico: 0, relink_ambiguo: 0, planos: 0, planos_com_orfas: 0, planos_com_documento_problema: 0, documentos_problema_em_planos: 0 }
  try {
    type Def = { id: string; tipo: string; chave: string; disciplina: string | null; titulo: string | null; documento_id: string | null; ativa: boolean; doc_titulo?: string | null; doc_pasta_id?: string | null }
    const ler = (cols: string) => fetchAll<any>(() => svc.from(T_DEF).select(cols).eq('tenant_id', tenantId).eq('ativa', true).order('id', { ascending: true }), 1000, 'ligacoes:def')
    let defs: Def[]
    try { defs = await ler('id, tipo, chave, disciplina, titulo, documento_id, ativa, doc_titulo, doc_pasta_id') } catch { defs = await ler('id, tipo, chave, disciplina, titulo, documento_id, ativa') }
    resumo.definicoes = defs.length
    const docs = await carregarInfoDocs(svc, tenantId, defs.map((d) => d.documento_id).filter(Boolean) as string[])

    // candidatos de relink: documentos PUBLICADOS na mesma pasta / pastas irmãs de cada documento problemático
    const prob = defs.filter((d) => d.documento_id && (!docs.get(d.documento_id)?.publicado))
    const pastasBase = new Set<string>()
    for (const d of prob) { const p = docs.get(d.documento_id!)?.pasta_id ?? d.doc_pasta_id; if (p) pastasBase.add(p) }
    const pai = new Map<string, string | null>()
    const lerPastas = async (col: 'id' | 'pai_id', ids: string[]) => { const out: Array<{ id: string; pai_id: string | null }> = []; for (let i = 0; i < ids.length; i += 80) { const { data } = await svc.from(T_PASTA).select('id, pai_id').eq('tenant_id', tenantId).in(col, ids.slice(i, i + 80)); if (data) out.push(...(data as typeof out)) } return out }
    for (const p of await lerPastas('id', [...pastasBase])) pai.set(p.id, p.pai_id)
    const pais = [...new Set([...pai.values()].filter(Boolean) as string[])]
    const irmas = pais.length ? await lerPastas('pai_id', pais) : []
    for (const p of irmas) pai.set(p.id, p.pai_id)
    const pastasBusca = [...new Set([...pastasBase, ...irmas.map((p) => p.id)])]
    const cands: Array<DocCandidato & { pasta_pai_id: string | null }> = []
    for (let i = 0; i < pastasBusca.length; i += 80) {
      const { data } = await svc.from(T_DOC).select('id, titulo, pasta_id, criado_em').eq('tenant_id', tenantId).eq('deletado', false).eq('status', 'publicado').in('pasta_id', pastasBusca.slice(i, i + 80)).limit(1000)
      for (const r of (data ?? []) as Array<{ id: string; titulo: string; pasta_id: string; criado_em: string }>) cands.push({ id: r.id, titulo: r.titulo, titulo_norm: normalizarTituloDoc(r.titulo), pasta_id: r.pasta_id, pasta_pai_id: pai.get(r.pasta_id) ?? null, publicado: true, criado_em: r.criado_em })
    }

    const itens: ItemLigacao[] = []
    for (const d of defs) {
      const problemas: ProblemaLigacao[] = []
      const info: InfoDoc | undefined = d.documento_id ? docs.get(d.documento_id) : undefined
      if (!d.documento_id) { if (d.tipo === 'aula') problemas.push('sem_documento') }
      else if (!info) problemas.push('documento_inexistente')
      else {
        if (info.deletado) problemas.push('documento_deletado')
        else if (info.status !== 'publicado') problemas.push('documento_despublicado')
        if (d.doc_pasta_id && info.pasta_id && d.doc_pasta_id !== info.pasta_id) problemas.push('documento_movido')
        if (d.doc_titulo && info.titulo && normalizarTituloDoc(d.doc_titulo) !== normalizarTituloDoc(info.titulo)) problemas.push('titulo_divergente')
      }
      if (!problemas.length) continue
      let relink: ItemLigacao['relink'] = { situacao: 'nao_aplicavel', candidatos: [] }
      if (problemas.includes('documento_deletado') || problemas.includes('documento_inexistente')) {
        const pasta = info?.pasta_id ?? d.doc_pasta_id ?? null
        const r = encontrarSubstituto(
          { id: d.documento_id!, titulo: info?.titulo ?? d.doc_titulo ?? d.titulo, pasta_id: pasta, pasta_pai_id: pasta ? pai.get(pasta) ?? null : null, disciplina: 'x', deletado: true, deletado_em: info?.deletado_em ?? null },
          cands.map((c) => ({ ...c, disciplina: 'x' })), // candidatos já vêm só da pasta/irmãs da própria aula → mesma disciplina
        )
        relink = r.tipo === 'unico' ? { situacao: 'unico', candidatos: [{ id: r.candidato.id, titulo: r.candidato.titulo }] }
          : r.tipo === 'ambiguo' ? { situacao: 'ambiguo', candidatos: r.candidatos.map((c) => ({ id: c.id, titulo: c.titulo })) } : { situacao: 'nenhum', candidatos: [] }
        if (relink.situacao === 'unico') resumo.relink_unico++; else if (relink.situacao === 'ambiguo') resumo.relink_ambiguo++
      }
      for (const p of problemas) {
        if (p === 'sem_documento') resumo.sem_documento++; else if (p === 'documento_deletado') resumo.deletados++; else if (p === 'documento_despublicado') resumo.despublicados++
        else if (p === 'documento_inexistente') resumo.inexistentes++; else if (p === 'documento_movido') resumo.movidos++; else resumo.titulo_divergente++
      }
      itens.push({ definicao_id: d.id, tipo: d.tipo, chave: d.chave, disciplina: d.disciplina, titulo: d.titulo, documento_id: d.documento_id, problemas, doc_titulo_snapshot: d.doc_titulo ?? null, doc_titulo_atual: info?.titulo ?? null, relink })
    }

    // planos dos alunos: quantos apontam para documentos com problema / têm aulas órfãs
    try {
      const planos = await fetchAll<{ id: string; chaves: unknown; orfas: unknown }>(
        () => svc.from(T_PLANO).select('id, chaves:cfg->chavesAS, orfas:cfg->orfas').eq('tenant_id', tenantId).eq('arquivada', false).eq('exemplo', false).order('id', { ascending: true }), 500, 'ligacoes:planos')
      resumo.planos = planos.length
      const porPlano: string[][] = []
      const todos = new Set<string>()
      for (const p of planos) {
        const ids = Array.isArray(p.chaves) ? (p.chaves as unknown[]).map((k) => docIdDaChave(typeof k === 'string' ? k : null)).filter(Boolean) as string[] : []
        porPlano.push(ids); ids.forEach((i) => todos.add(i))
        if (p.orfas && typeof p.orfas === 'object' && Object.keys(p.orfas as object).length) resumo.planos_com_orfas++
      }
      const infoPl = await carregarInfoDocs(svc, tenantId, [...todos])
      const ruins = new Set([...todos].filter((i) => { const x = infoPl.get(i); return !x || !x.publicado }))
      resumo.documentos_problema_em_planos = ruins.size
      resumo.planos_com_documento_problema = porPlano.filter((ids) => ids.some((i) => ruins.has(i))).length
    } catch { /* planos indisponíveis: resumo parcial */ }

    const q = nz(f.busca)
    const filtrados = itens.filter((i) => (!f.problema || i.problemas.includes(f.problema)) && (!q || nz(`${i.titulo} ${i.disciplina} ${i.doc_titulo_atual} ${i.doc_titulo_snapshot}`).includes(q)))
    return { ok: true, resumo, itens: filtrados.slice((pagina - 1) * porPagina, pagina * porPagina), total: filtrados.length, pagina, porPagina }
  } catch (e) {
    const m = (e as { message?: string })?.message ?? 'erro'
    return { ok: false, motivo: /does not exist|schema cache/i.test(m) ? 'migracao_pendente' : m, resumo, itens: [], total: 0, pagina, porPagina }
  }
}
const nz = (s: string | null | undefined): string => normalizarTituloDoc(s)
