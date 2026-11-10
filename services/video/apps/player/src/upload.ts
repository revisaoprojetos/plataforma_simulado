import { api } from './api';

interface Init {
  videoId: string;
  partSize: number;
  parts: { partNumber: number; url: string }[];
}

export interface UploadHandle {
  /** Resolve com o id do vídeo quando o S3 recebeu tudo e o transcode foi enfileirado. */
  promise: Promise<string>;
  cancel(): void;
}

const CONCURRENCY = 3;
const ATTEMPTS = 3;

/**
 * Envio em partes direto ao S3 (URLs pré-assinadas da API), com progresso, retentativa por parte
 * e cancelamento. O arquivo nunca passa pela API.
 */
export function uploadVideo(
  lessonId: string,
  file: File,
  onProgress: (sent: number, total: number) => void,
): UploadHandle {
  const inflight = new Set<XMLHttpRequest>();
  let cancelled = false;
  let videoId: string | null = null;

  function putPart(url: string, blob: Blob, onBytes: (n: number) => void): Promise<string> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      inflight.add(xhr);
      xhr.open('PUT', url);
      xhr.upload.onprogress = (e) => onBytes(e.loaded);
      xhr.onload = () => {
        inflight.delete(xhr);
        const etag = xhr.getResponseHeader('ETag');
        if (xhr.status >= 200 && xhr.status < 300 && etag) resolve(etag);
        else {
          reject(
            new Error(
              etag
                ? `HTTP ${xhr.status}`
                : `HTTP ${xhr.status} sem ETag (confira o CORS do bucket para esta origem)`,
            ),
          );
        }
      };
      xhr.onerror = () => {
        inflight.delete(xhr);
        reject(new Error('falha de rede (CORS do bucket ou conexão)'));
      };
      xhr.onabort = () => {
        inflight.delete(xhr);
        reject(new Error('cancelado'));
      };
      xhr.send(blob);
    });
  }

  const run = async (): Promise<string> => {
    const init = await api<Init>('/uploads', {
      method: 'POST',
      body: {
        lessonId,
        filename: file.name,
        size: file.size,
        contentType: file.type || 'video/mp4',
      },
    });
    videoId = init.videoId;

    const sent = new Map<number, number>();
    const report = () =>
      onProgress(
        [...sent.values()].reduce((a, b) => a + b, 0),
        file.size,
      );
    const etags = new Map<number, string>();
    const queue = [...init.parts];

    const worker = async (): Promise<void> => {
      for (let part = queue.shift(); part; part = queue.shift()) {
        const start = (part.partNumber - 1) * init.partSize;
        const blob = file.slice(start, Math.min(start + init.partSize, file.size));
        let lastError = new Error('falha');
        for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
          if (cancelled) throw new Error('cancelado');
          try {
            const etag = await putPart(part.url, blob, (n) => {
              sent.set(part.partNumber, n);
              report();
            });
            sent.set(part.partNumber, blob.size);
            report();
            etags.set(part.partNumber, etag);
            lastError = null as never;
            break;
          } catch (e) {
            lastError = new Error(`parte ${part.partNumber}: ${(e as Error).message}`);
            if (cancelled) throw lastError;
          }
        }
        if (lastError) throw lastError;
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    await api(`/uploads/${init.videoId}/complete`, {
      method: 'POST',
      body: {
        parts: [...etags.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([partNumber, etag]) => ({ partNumber, etag })),
      },
    });
    return init.videoId;
  };

  const promise = run().catch(async (e: Error) => {
    // Libera a aula: um envio abandonado fica em "enviando" e bloquearia o próximo.
    if (videoId) await api(`/uploads/${videoId}`, { method: 'DELETE' }).catch(() => undefined);
    throw e;
  });

  return {
    promise,
    cancel() {
      cancelled = true;
      inflight.forEach((x) => x.abort());
    },
  };
}
