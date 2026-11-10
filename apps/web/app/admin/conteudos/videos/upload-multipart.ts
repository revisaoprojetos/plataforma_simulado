/**
 * Upload multipart direto ao S3 (URLs pré-assinadas pelo servidor), com progresso, retomada e cancelamento.
 *  1. POST /api/admin/video {titulo,pastaId?}            -> {id, uploadId, partSize}
 *  2. POST /api/admin/video/:id/parts {partNumbers[]}    -> {urls}   (array alinhado a partNumbers OU mapa nº->url)
 *  3. PUT <url> (XHR, progresso por parte)                -> header ETag (o CORS do bucket precisa expor ETag)
 *  4. POST /api/admin/video/:id/complete {parts:[{partNumber,etag}]}
 * O estado das partes concluídas fica em localStorage (chave por vídeo) para retomar após queda/recarga.
 */

import { retryDelayMs } from '@/lib/video/player-protocolo'

export type DonePart = { partNumber: number; etag: string }
export type UploadEstado = 'enviando' | 'finalizando' | 'concluido' | 'erro' | 'cancelado'
export type UploadProgresso = { estado: UploadEstado; enviado: number; total: number; erro?: string }

type Salvo = { id: string; uploadId: string; partSize: number; nome: string; tamanho: number; modificado: number; parts: DonePart[] }

const CONCORRENCIA = 3
const TENTATIVAS = 4
const KEY = (id: string) => `rev.video.upload.${id}`

const ler = (id: string): Salvo | null => { try { const r = localStorage.getItem(KEY(id)); return r ? JSON.parse(r) as Salvo : null } catch { return null } }
const gravar = (s: Salvo) => { try { localStorage.setItem(KEY(s.id), JSON.stringify(s)) } catch { /* sem storage: sem retomada */ } }
export const limparSalvo = (id: string) => { try { localStorage.removeItem(KEY(id)) } catch { /* noop */ } }

/** Há envio interrompido guardado para este vídeo? */
export function temEnvioPendente(id: string): { nome: string; tamanho: number; modificado: number } | null {
  const s = ler(id)
  return s ? { nome: s.nome, tamanho: s.tamanho, modificado: s.modificado } : null
}

async function json<T>(res: Response): Promise<T> {
  const j = await res.json().catch(() => ({})) as T & { error?: string; message?: string }
  if (!res.ok) throw new Error(j.error ?? j.message ?? `Erro ${res.status}`)
  return j
}

function putParte(url: string, blob: Blob, onProgress: (loaded: number) => void, signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    xhr.upload.onprogress = (e) => onProgress(e.loaded)
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const etag = xhr.getResponseHeader('ETag')
        if (!etag) reject(new Error('O bucket não expõe o ETag (ajustar CORS: ExposeHeaders ETag).'))
        else resolve(etag.replace(/"/g, ''))
      } else reject(Object.assign(new Error(`Falha ao enviar parte (${xhr.status})`), { retry: xhr.status >= 500 || xhr.status === 403 || xhr.status === 0 }))
    }
    xhr.onerror = () => reject(Object.assign(new Error('Falha de rede no envio.'), { retry: true }))
    xhr.onabort = () => reject(Object.assign(new Error('cancelado'), { abort: true }))
    signal.addEventListener('abort', () => xhr.abort(), { once: true })
    xhr.send(blob)
  })
}

export type UploadHandle = { cancelar: () => void; promessa: Promise<void> }

/**
 * Envia (ou retoma) o arquivo. `videoId` + `salvo` só em retomada; senão cria o vídeo.
 * Retorna o handle com `cancelar()`; `onChange` recebe o progresso consolidado.
 */
export function iniciarUpload(opts: {
  file: File
  titulo: string
  pastaId?: string
  retomarId?: string
  onChange: (p: UploadProgresso, videoId: string | null) => void
}): UploadHandle {
  const ac = new AbortController()
  const { file, onChange } = opts
  let videoId: string | null = opts.retomarId ?? null

  const promessa = (async () => {
    const total = file.size
    const emit = (estado: UploadEstado, enviado: number, erro?: string) => onChange({ estado, enviado, total, erro }, videoId)
    try {
      let salvo = opts.retomarId ? ler(opts.retomarId) : null
      if (salvo && (salvo.tamanho !== file.size || salvo.nome !== file.name || salvo.modificado !== file.lastModified)) {
        throw new Error('Este não é o mesmo arquivo do envio interrompido.')
      }
      if (!salvo) {
        const c = await json<{ id: string; uploadId: string; partSize: number }>(await fetch('/api/admin/video', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ titulo: opts.titulo, pastaId: opts.pastaId }), signal: ac.signal,
        }))
        videoId = c.id
        salvo = { id: c.id, uploadId: c.uploadId, partSize: c.partSize, nome: file.name, tamanho: file.size, modificado: file.lastModified, parts: [] }
        gravar(salvo)
      }
      const id = salvo.id
      const nParts = Math.max(1, Math.ceil(file.size / salvo.partSize))
      const feitas = new Map<number, string>(salvo.parts.map((p) => [p.partNumber, p.etag]))
      const emVoo = new Map<number, number>()
      const bytesDe = (n: number) => Math.min(salvo!.partSize, file.size - (n - 1) * salvo!.partSize)
      const somar = () => {
        let b = 0
        feitas.forEach((_e, n) => { b += bytesDe(n) })
        emVoo.forEach((v) => { b += v })
        return Math.min(b, total)
      }
      emit('enviando', somar())

      const fila = Array.from({ length: nParts }, (_, i) => i + 1).filter((n) => !feitas.has(n))
      const urlsDe = async (nums: number[]): Promise<Record<number, string>> => {
        const r = await json<{ urls: string[] | Record<string, string> }>(await fetch(`/api/admin/video/${id}/parts`, {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ partNumbers: nums }), signal: ac.signal,
        }))
        const out: Record<number, string> = {}
        nums.forEach((n, i) => { out[n] = Array.isArray(r.urls) ? r.urls[i] : r.urls[String(n)] })
        return out
      }

      const worker = async () => {
        while (fila.length && !ac.signal.aborted) {
          const n = fila.shift()!
          let ultimo: unknown
          for (let t = 0; t < TENTATIVAS; t++) {
            try {
              const url = (await urlsDe([n]))[n] // URL nova a cada tentativa (pode ter expirado)
              const ini = (n - 1) * salvo!.partSize
              const etag = await putParte(url, file.slice(ini, ini + bytesDe(n)), (l) => { emVoo.set(n, l); emit('enviando', somar()) }, ac.signal)
              emVoo.delete(n)
              feitas.set(n, etag)
              salvo!.parts = [...feitas].map(([partNumber, e]) => ({ partNumber, etag: e }))
              gravar(salvo!)
              emit('enviando', somar())
              ultimo = undefined
              break
            } catch (e) {
              emVoo.delete(n)
              ultimo = e
              if (ac.signal.aborted || (e as { abort?: boolean }).abort) throw e
              if (!(e as { retry?: boolean }).retry && t >= 1) break
              await new Promise((r) => setTimeout(r, retryDelayMs(t)))
            }
          }
          if (ultimo) throw ultimo
        }
      }
      await Promise.all(Array.from({ length: Math.min(CONCORRENCIA, fila.length || 1) }, worker))
      if (ac.signal.aborted) throw new Error('cancelado')

      emit('finalizando', total)
      await json(await fetch(`/api/admin/video/${id}/complete`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, signal: ac.signal,
        body: JSON.stringify({ parts: [...feitas].map(([partNumber, etag]) => ({ partNumber, etag })).sort((a, b) => a.partNumber - b.partNumber) }),
      }))
      limparSalvo(id)
      emit('concluido', total)
    } catch (e) {
      if (ac.signal.aborted || (e as { abort?: boolean }).abort || (e as Error).name === 'AbortError') {
        onChange({ estado: 'cancelado', enviado: 0, total: file.size }, videoId)
      } else {
        // Mantém o estado salvo: o envio pode ser retomado depois.
        onChange({ estado: 'erro', enviado: 0, total: file.size, erro: e instanceof Error ? e.message : 'Falha no envio.' }, videoId)
      }
    }
  })()

  return { cancelar: () => ac.abort(), promessa }
}
