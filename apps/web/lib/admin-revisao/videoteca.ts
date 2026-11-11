import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { sanear, temColunaOculto } from './biblioteca'

// VIDEOTECA (Plataforma Revisão) — só leitura. (video_aulas foi removida pela migration 20261110040000: o vídeo próprio vive só no serviço de vídeo.) Reúne TODAS as videoaulas que a plataforma conhece, em uma lista:
//   • 'link'      → vídeo por LINK (YouTube/Vimeo/arquivo) configurado na aula (metadados.video do documento PDFull)
//   • 'biblioteca'→ documento-vídeo da Biblioteca (tipo_origem='video'); a "aula" é o PDFull que o referencia
// Paginação real: contagem head + .range() por fonte (concatenadas). O tempo de vídeo NÃO entra nas horas do cronograma.

export interface LinhaVideoteca {
  chave: string
  origem: 'link' | 'biblioteca' | 'proprio'
  docId: string | null // documento da Biblioteca (aula do PDFull p/ 'link'; o próprio vídeo p/ 'biblioteca')
  aula: string | null // título do PDFull ligado
  titulo: string
  duracaoMin: number | null
  link: string | null
  visivel: boolean | null // null = não se aplica (segue a aula / sem controle)
  status: string | null // só 'proprio'
  versao: number | null
  atualizadoEm: string | null
}

type Fonte = (sel: string, head?: boolean) => any

function fontes(svc: SupabaseClient, tenantId: string, q: string, soEscondidos: boolean, oc: boolean): Fonte[] {
  const b = sanear(q)
  const f: Fonte[] = []
  if (soEscondidos && !oc) return f
  if (!soEscondidos) {
    f.push((sel, head) => {
      let x = svc.from('simulado_conteudo_documentos').select(sel, head ? { count: 'exact', head: true } : { count: 'exact' })
        .eq('tenant_id', tenantId).eq('deletado', false).neq('tipo_origem', 'video').eq('metadados->video->>tipo', 'link')
      if (b) x = x.ilike('titulo', `%${b}%`)
      return x.order('titulo', { ascending: true }).order('id', { ascending: true })
    })
  }
  f.push((sel, head) => {
    let x = svc.from('simulado_conteudo_documentos').select(sel, head ? { count: 'exact', head: true } : { count: 'exact' })
      .eq('tenant_id', tenantId).eq('deletado', false).eq('tipo_origem', 'video').in('categoria', ['conteudo', 'jurisclub'])
    if (soEscondidos) x = x.eq('oculto', true)
    if (b) x = x.ilike('titulo', `%${b}%`)
    return x.order('titulo', { ascending: true }).order('id', { ascending: true })
  })
  return f
}

/** As três fontes na MESMA ordem de `fontes()` quando !soEscondidos (link, biblioteca, proprio). */
export async function listarVideoteca(
  svc: SupabaseClient, tenantId: string, opts: { q: string; pagina: number; porPagina: number; soEscondidos: boolean },
): Promise<{ rows: LinhaVideoteca[]; total: number }> {
  const off = (Math.max(1, opts.pagina) - 1) * opts.porPagina
  const oc = await temColunaOculto(svc)
  const fs = fontes(svc, tenantId, opts.q, opts.soEscondidos, oc)
  // Cada fonte tem colunas diferentes: marca a linha com a origem para o mapeamento (a fonte 'proprio' tolera tabela ausente).
  const SEL_DOC = oc ? 'id, titulo, oculto, atualizado_em, metadados' : 'id, titulo, atualizado_em, metadados'
  const rotulos: ('link' | 'biblioteca' | 'proprio')[] = opts.soEscondidos ? ['biblioteca'] : ['link', 'biblioteca']
  const sels = rotulos.map(() => SEL_DOC)

  // Janela por fonte (cada uma com seu SELECT).
  const contagens = await Promise.all(fs.map(async (f) => { try { const { count, error } = await f('id', true); return error ? 0 : (count ?? 0) } catch { return 0 } }))
  const total = contagens.reduce((s, n) => s + n, 0)
  const brutas: { origem: 'link' | 'biblioteca' | 'proprio'; r: any }[] = []
  let ini = 0, pos = off
  for (let i = 0; i < fs.length && brutas.length < opts.porPagina; i++) {
    const n = contagens[i]; const fim = ini + n
    if (n > 0 && pos < fim) {
      const de = Math.max(0, pos - ini)
      const ate = Math.min(n - 1, de + (opts.porPagina - brutas.length) - 1)
      const { data } = await fs[i](sels[i]).range(de, ate)
      for (const r of (data ?? []) as any[]) brutas.push({ origem: rotulos[i], r })
      pos += ate - de + 1
    }
    ini = fim
  }

  // Aula (PDFull) que referencia cada vídeo da Biblioteca — só dos vídeos desta página; + versão atual.
  const idsVideoDoc = brutas.filter((b) => b.origem === 'biblioteca').map((b) => b.r.id as string)
  const aulaPorVideo = new Map<string, string>()
  const verPorDoc = new Map<string, number>()
  if (idsVideoDoc.length) {
    const [ref, vers] = await Promise.all([
      svc.from('simulado_conteudo_documentos').select('titulo, metadados').eq('tenant_id', tenantId).eq('deletado', false).in('metadados->video->>doc_id', idsVideoDoc).limit(500),
      svc.from('simulado_conteudo_versoes').select('documento_id, numero').eq('tenant_id', tenantId).in('documento_id', idsVideoDoc).limit(1000),
    ])
    for (const d of (ref.data ?? []) as any[]) { const id = d.metadados?.video?.doc_id; if (id && !aulaPorVideo.has(id)) aulaPorVideo.set(id, d.titulo) }
    for (const v of (vers.data ?? []) as any[]) verPorDoc.set(v.documento_id, Math.max(verPorDoc.get(v.documento_id) ?? 0, v.numero ?? 0))
  }

  const rows: LinhaVideoteca[] = brutas.map(({ origem, r }) => {
    if (origem === 'proprio') {
      return { chave: `p-${r.id}`, origem, docId: null, aula: null, titulo: r.titulo, duracaoMin: r.duracao_s ? Math.round(r.duracao_s / 60) : null, link: null, visivel: null, status: r.status, versao: null, atualizadoEm: r.atualizado_em ?? null }
    }
    if (origem === 'link') {
      const v = r.metadados?.video ?? {}
      return { chave: `l-${r.id}`, origem, docId: r.id, aula: r.titulo, titulo: v.titulo || 'Videoaula', duracaoMin: Number(r.metadados?.duracao_min) || null, link: v.url ?? null, visivel: null, status: null, versao: null, atualizadoEm: r.atualizado_em ?? null }
    }
    return { chave: `b-${r.id}`, origem, docId: r.id, aula: aulaPorVideo.get(r.id) ?? null, titulo: r.titulo, duracaoMin: Number(r.metadados?.duracao_min) || null, link: null, visivel: !r.oculto, status: null, versao: verPorDoc.get(r.id) ?? 1, atualizadoEm: r.atualizado_em ?? null }
  })
  return { rows, total }
}

/** KPIs: nº de videoaulas, minutos (só do vídeo próprio, único com duração medida), escondidas, processando. Só counts/uma coluna leve. */
export async function resumoVideoteca(svc: SupabaseClient, tenantId: string): Promise<{
  total: number; minutos: number; escondidas: number; temOculto: boolean
}> {
  const oc = await temColunaOculto(svc)
  const cont = async (fs: Fonte[]) => (await Promise.all(fs.map(async (f) => { try { const { count, error } = await f('id', true); return error ? 0 : (count ?? 0) } catch { return 0 } }))).reduce((s, n) => s + n, 0)
  const [total, escondidas, durDoc] = await Promise.all([
    cont(fontes(svc, tenantId, '', false, oc)), cont(fontes(svc, tenantId, '', true, oc)),
    svc.from('simulado_conteudo_documentos').select('d:metadados->>duracao_min').eq('tenant_id', tenantId).eq('deletado', false).not('metadados->>duracao_min', 'is', null).limit(20000),
  ])
  const minutos = ((durDoc.data ?? []) as any[]).reduce((s, r) => s + (Number(r.d) || 0), 0)
  return { total, minutos, escondidas, temOculto: oc }
}
