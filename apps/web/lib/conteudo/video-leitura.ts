import 'server-only'
import { normalizarMetadados } from './metadados'
import { carregarDocParaLeitura } from './leitor'

// VÍDEO na área de leitura: o que o admin configurou no gerenciamento do documento (metadados.video).
//  • link  → YouTube/Vimeo viram embed; URL de arquivo (.mp4/.webm/.ogg/.mov/.m3u8) toca no <video>.
//  • plataforma → um documento-vídeo da Biblioteca; usa o mesmo carregador/gate de acesso da leitura (URL assinada).
// Devolve null quando não há vídeo (ou o aluno não tem acesso ao vídeo da plataforma).

export type VideoLeitura = { kind: 'embed' | 'file'; url: string; titulo: string }

/** URL do link → embed (YouTube/Vimeo) | arquivo | null (não suportada). Só https. */
export function embedDeLink(link: string): { kind: 'embed' | 'file'; url: string } | null {
  let u: URL
  try { u = new URL(link.trim()) } catch { return null }
  if (u.protocol !== 'https:') return null
  const h = u.hostname.replace(/^www\./, '').replace(/^m\./, '').toLowerCase()
  if (h === 'youtu.be') { const id = u.pathname.slice(1).split('/')[0]; return /^[\w-]{6,15}$/.test(id) ? { kind: 'embed', url: `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1` } : null }
  if (h === 'youtube.com' || h === 'youtube-nocookie.com') {
    const id = u.searchParams.get('v') || (/^\/(embed|shorts|live)\/([\w-]{6,15})/.exec(u.pathname)?.[2] ?? '')
    return /^[\w-]{6,15}$/.test(id) ? { kind: 'embed', url: `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1` } : null
  }
  if (h === 'vimeo.com' || h === 'player.vimeo.com') {
    const id = /(\d{6,12})/.exec(u.pathname)?.[1]
    return id ? { kind: 'embed', url: `https://player.vimeo.com/video/${id}${u.searchParams.get('h') ? `?h=${encodeURIComponent(u.searchParams.get('h')!)}` : ''}` } : null
  }
  if (/\.(mp4|webm|ogg|mov|m3u8)(\?|$)/i.test(u.pathname + u.search)) return { kind: 'file', url: u.toString() }
  return null
}

export async function resolverVideoLeitura(svc: any, tenantId: string, documentoId: string, alunoId: string): Promise<VideoLeitura | null> {
  try {
    const { data, error } = await svc.from('simulado_conteudo_documentos').select('titulo, metadados').eq('tenant_id', tenantId).eq('id', documentoId).maybeSingle()
    if (error || !data) return null
    const v = normalizarMetadados((data as any).metadados).video
    if (!v) return null
    if (v.tipo === 'link' && v.url) {
      const e = embedDeLink(v.url)
      return e ? { ...e, titulo: v.titulo || 'Videoaula' } : null
    }
    if (v.tipo === 'plataforma' && v.doc_id) {
      const d = await carregarDocParaLeitura(v.doc_id, alunoId)
      if (d && d.kind === 'midia' && d.midia.kind === 'video' && d.midia.url) return { kind: 'file', url: d.midia.url, titulo: v.titulo || d.midia.titulo || 'Videoaula' }
    }
  } catch { /* sem vídeo */ }
  return null
}
