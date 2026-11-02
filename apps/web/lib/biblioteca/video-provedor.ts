// Detecção de provedor de vídeo por URL + construção da URL de embed. PURO (sem server-only) → usável
// no client e no server. Provedores REAIS do projeto: YouTube, Vimeo, Panda Video, Google Drive.
// NÃO existe "Waid Player"/hospedagem própria no sistema — isso é fase posterior (ver file-picker.tsx).

export type VideoPlataforma = 'youtube' | 'vimeo' | 'panda' | 'google_drive' | 'desconhecido'

export interface VideoInfo {
  /** Provedor detectado pelo domínio. */ plataforma: VideoPlataforma
  /** Id do vídeo quando extraível (YouTube/Vimeo/Drive). */ id: string | null
  /** URL pronta para <iframe src> (quando possível construir). */ embedUrl: string | null
  /** Rótulo humano do provedor (pt-BR). */ rotulo: string
}

export const PLATAFORMA_LABEL: Record<VideoPlataforma, string> = {
  youtube: 'YouTube',
  vimeo: 'Vimeo',
  panda: 'Panda Video',
  google_drive: 'Google Drive',
  desconhecido: 'Link de vídeo',
}

/** Normaliza: adiciona https:// quando o usuário cola "youtu.be/..." sem protocolo. */
function normalizar(raw: string): string {
  const s = (raw || '').trim()
  if (!s) return ''
  return /^https?:\/\//i.test(s) ? s : `https://${s}`
}

/**
 * Detecta o provedor e monta a URL de embed. Reconhece as formas comuns (watch, curta, já-embed).
 * Retorna `plataforma: 'desconhecido'` quando não é um dos provedores suportados — o chamador decide
 * se aceita mesmo assim (ex.: tratar como link externo).
 */
export function detectarVideo(urlRaw: string): VideoInfo {
  const url = normalizar(urlRaw)
  let host = ''
  try { host = new URL(url).hostname.toLowerCase() } catch { return { plataforma: 'desconhecido', id: null, embedUrl: null, rotulo: PLATAFORMA_LABEL.desconhecido } }

  // YouTube — youtu.be/ID · watch?v=ID · /embed/ID · /shorts/ID · /live/ID
  if (/(^|\.)youtube\.com$/.test(host) || host === 'youtu.be' || host.endsWith('youtube-nocookie.com')) {
    const m =
      url.match(/[?&]v=([\w-]{6,})/) ||
      url.match(/youtu\.be\/([\w-]{6,})/) ||
      url.match(/\/(?:embed|shorts|live)\/([\w-]{6,})/)
    const id = m?.[1] ?? null
    return { plataforma: 'youtube', id, embedUrl: id ? `https://www.youtube.com/embed/${id}` : null, rotulo: PLATAFORMA_LABEL.youtube }
  }

  // Vimeo — vimeo.com/ID · player.vimeo.com/video/ID
  if (host.endsWith('vimeo.com')) {
    const m = url.match(/vimeo\.com\/(?:video\/)?(\d{6,})/)
    const id = m?.[1] ?? null
    return { plataforma: 'vimeo', id, embedUrl: id ? `https://player.vimeo.com/video/${id}` : null, rotulo: PLATAFORMA_LABEL.vimeo }
  }

  // Panda Video — *.pandavideo.com.br (player-vz-*.tv.pandavideo.com.br/embed/?v=UUID).
  // O embed depende do subdomínio do tenant no Panda → se já vier um link de /embed, usa-se como está;
  // caso contrário não há como construir genericamente (mantém a URL original como embed best-effort).
  if (host.includes('pandavideo.com')) {
    const jaEmbed = /\/embed\b/.test(url)
    return { plataforma: 'panda', id: null, embedUrl: jaEmbed ? url : url, rotulo: PLATAFORMA_LABEL.panda }
  }

  // Google Drive — drive.google.com/file/d/FILEID/view → /preview
  if (host.endsWith('drive.google.com')) {
    const m = url.match(/\/file\/d\/([\w-]+)/) || url.match(/[?&]id=([\w-]+)/)
    const id = m?.[1] ?? null
    return { plataforma: 'google_drive', id, embedUrl: id ? `https://drive.google.com/file/d/${id}/preview` : null, rotulo: PLATAFORMA_LABEL.google_drive }
  }

  return { plataforma: 'desconhecido', id: null, embedUrl: null, rotulo: PLATAFORMA_LABEL.desconhecido }
}
