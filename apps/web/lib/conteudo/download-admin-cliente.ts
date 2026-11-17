// Cliente (browser) do download admin: POST na rota, lê o arquivo como blob e dispara o salvamento.
import type { FormatoDownload } from './download-admin-pura'

export interface PedidoDownloadCliente {
  documentoIds: string[]; pastaIds?: string[]; incluirSubpastas?: boolean
  formatos: FormatoDownload[]; incluirCapa: boolean; incluirAtualizacao?: boolean; manterEstrutura?: boolean; versaoId?: string | null
}
export type RespostaDownloadCliente =
  | { ok: true; nome: string; zip: boolean; geradas: number; total: number; falhas: number; avisos: number; aviso?: string }
  | { ok: false; message: string }

function nomeDoHeader(cd: string | null): string {
  const m = cd && /filename\*=UTF-8''([^;]+)/i.exec(cd)
  if (m) { try { return decodeURIComponent(m[1]) } catch { /* cai no ASCII */ } }
  const a = cd && /filename="([^"]+)"/i.exec(cd)
  return a ? a[1] : 'download'
}

export async function baixarDoServidor(p: PedidoDownloadCliente): Promise<RespostaDownloadCliente> {
  try {
    const r = await fetch('/api/admin/biblioteca/download-lote', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(p), credentials: 'same-origin' })
    if (!r.ok) {
      const j = await r.json().catch(() => null) as { message?: string } | null
      return { ok: false, message: j?.message || (r.status === 504 ? 'O servidor demorou demais. Baixe menos documentos por vez.' : `Falha no download (HTTP ${r.status}).`) }
    }
    // Sessão expirada/redirect pro login volta 200 com HTML: NÃO salvar isso como se fosse o arquivo.
    if ((r.headers.get('content-type') ?? '').toLowerCase().includes('text/html')) return { ok: false, message: 'Sua sessão expirou ou o servidor devolveu uma página em vez do arquivo. Recarregue e entre novamente.' }
    const nome = nomeDoHeader(r.headers.get('content-disposition'))
    const blob = await r.blob()
    const esperado = r.headers.get('content-encoding') ? 0 : Number(r.headers.get('content-length') || 0) // com gzip o length é do corpo comprimido
    if (blob.size === 0 || (esperado && blob.size !== esperado)) return { ok: false, message: 'O download veio incompleto. Tente novamente.' }
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = nome; a.rel = 'noopener'
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
    const res = Object.fromEntries((r.headers.get('x-download-resumo') ?? '').split(';').map((kv) => kv.split('='))) as Record<string, string>
    const aviso = r.headers.get('x-download-aviso')
    return { ok: true, nome, zip: res.zip === '1', geradas: Number(res.geradas) || 0, total: Number(res.total) || 0, falhas: Number(res.falhas) || 0, avisos: Number(res.avisos) || 0, aviso: aviso ? decodeURIComponent(aviso) : undefined }
  } catch { return { ok: false, message: 'Falha de rede ao baixar. Tente novamente.' } }
}
