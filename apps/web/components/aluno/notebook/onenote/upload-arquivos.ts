// Cliente do upload de imagens/anexos do Caderno (POST /api/aluno/notebook/arquivos). Pré-valida tamanho/tipo no navegador
// só para poupar rede; a validação de verdade (mime + magic bytes) é do servidor.
import { EXT_ANEXO, EXT_IMAGEM, LIMITES } from '@/lib/aluno/notebook-tipos'

export type ArquivoEnviado = { arquivo: string; url: string; nome: string; tamanho: number; tipo: 'imagem' | 'arquivo'; ext: string }
export type ResultadoUpload = { ok: true; dados: ArquivoEnviado } | { ok: false; erro: string }

const extDe = (n: string) => (/\.([a-z0-9]{1,5})$/i.exec(n)?.[1] ?? '').toLowerCase()

/** Imagem de verdade? (por tipo do navegador; extensão só como reforço). */
export const ehImagem = (f: File) => /^image\/(png|jpe?g|webp|gif)$/i.test(f.type) || ((EXT_IMAGEM as readonly string[]).includes(extDe(f.name)) && !f.type)
export const ehAnexoPermitido = (f: File) => (EXT_ANEXO as readonly string[]).includes(extDe(f.name))

export async function enviarArquivoCaderno(file: File, tipo: 'imagem' | 'arquivo'): Promise<ResultadoUpload> {
  if (tipo === 'imagem' && file.size > LIMITES.imagemBytesMax) return { ok: false, erro: 'Imagem acima de 5 MB.' }
  if (tipo === 'arquivo' && file.size > LIMITES.anexoBytesMax) return { ok: false, erro: 'Arquivo acima de 10 MB.' }
  const fd = new FormData()
  fd.append('file', file, file.name || (tipo === 'imagem' ? 'imagem.png' : 'arquivo'))
  fd.append('tipo', tipo)
  try {
    const r = await fetch('/api/aluno/notebook/arquivos', { method: 'POST', body: fd, credentials: 'same-origin' })
    const j = await r.json().catch(() => null)
    if (!r.ok || !j?.ok) return { ok: false, erro: j?.message || (r.status === 503 ? 'Armazenamento indisponível no momento.' : 'Não foi possível enviar o arquivo.') }
    return { ok: true, dados: { arquivo: j.arquivo.arquivo, url: j.arquivo.url, nome: j.arquivo.nome, tamanho: j.arquivo.tamanho, tipo, ext: j.arquivo.ext } }
  } catch { return { ok: false, erro: 'Sem conexão. Tente novamente.' } }
}

/** Aviso leve para a casca (o ComandosTexto escuta e mostra na faixa de aviso). */
export const avisarCaderno = (mensagem: string) => { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('nb:aviso', { detail: mensagem })) }
