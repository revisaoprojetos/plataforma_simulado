/*
 * Envia um vídeo de verdade pela API (multipart direto ao S3) e acompanha o processamento.
 * Uso: npm run upload:sample -w apps/api -- <arquivo.mp4> [--lesson <id>]
 * Variáveis: API_URL (http://localhost:3010), TENANT (empresa-a), EMAIL (professor@empresa-a.local), PASSWORD (dev12345)
 */
import { open, stat } from 'node:fs/promises';
import { basename } from 'node:path';

const API = process.env.API_URL ?? 'http://localhost:3010';
const TENANT = process.env.TENANT ?? 'empresa-a';
const EMAIL = process.env.EMAIL ?? 'professor@empresa-a.local';
const PASSWORD = process.env.PASSWORD ?? 'dev12345';

async function api<T>(path: string, token: string | null, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}/v1${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path} → ${res.status} ${text}`);
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

async function firstLessonId(token: string): Promise<string> {
  const courses = await api<{ data: { id: string }[] }>('/courses', token);
  for (const c of courses.data) {
    const modules = await api<{ lessons: { id: string }[] }[]>(`/courses/${c.id}/modules`, token);
    const lesson = modules.flatMap((m) => m.lessons)[0];
    if (lesson) return lesson.id;
  }
  throw new Error('nenhuma aula encontrada (rode npm run db:seed)');
}

async function main(): Promise<void> {
  const file = process.argv[2];
  if (!file) throw new Error('informe o arquivo: npm run upload:sample -w apps/api -- video.mp4');
  const lessonArg = process.argv.indexOf('--lesson');

  const { accessToken } = await api<{ accessToken: string }>('/auth/login', null, {
    method: 'POST',
    body: JSON.stringify({ tenant: TENANT, email: EMAIL, password: PASSWORD }),
  });
  const lessonId = lessonArg > 0 ? process.argv[lessonArg + 1] : await firstLessonId(accessToken);
  const { size } = await stat(file);

  console.log(`aula ${lessonId} · ${basename(file)} · ${(size / 1048576).toFixed(1)} MiB`);
  const upload = await api<{
    videoId: string;
    partSize: number;
    parts: { partNumber: number; url: string }[];
  }>('/uploads', accessToken, {
    method: 'POST',
    body: JSON.stringify({ lessonId, filename: basename(file), size, contentType: 'video/mp4' }),
  });

  const fh = await open(file, 'r');
  const parts: { partNumber: number; etag: string }[] = [];
  try {
    for (const p of upload.parts) {
      const buf = Buffer.alloc(upload.partSize);
      const { bytesRead } = await fh.read(
        buf,
        0,
        upload.partSize,
        (p.partNumber - 1) * upload.partSize,
      );
      const res = await fetch(p.url, { method: 'PUT', body: buf.subarray(0, bytesRead) });
      const etag = res.headers.get('etag');
      if (!res.ok || !etag) throw new Error(`parte ${p.partNumber}: HTTP ${res.status}`);
      parts.push({ partNumber: p.partNumber, etag });
      console.log(`parte ${p.partNumber}/${upload.parts.length} enviada`);
    }
  } finally {
    await fh.close();
  }

  await api(`/uploads/${upload.videoId}/complete`, accessToken, {
    method: 'POST',
    body: JSON.stringify({ parts }),
  });
  console.log('upload finalizado; aguardando o worker...');

  const deadline = Date.now() + 15 * 60_000;
  let last = '';
  while (Date.now() < deadline) {
    const v = await api<{
      status: string;
      durationS: number | null;
      renditions: unknown;
      error: string | null;
    }>(`/videos/${upload.videoId}`, accessToken);
    if (v.status !== last) console.log(`status: ${v.status}`);
    last = v.status;
    if (v.status === 'ready') {
      console.log(
        JSON.stringify(
          { videoId: upload.videoId, durationS: v.durationS, renditions: v.renditions },
          null,
          2,
        ),
      );
      return;
    }
    if (v.status === 'failed') throw new Error(`processamento falhou: ${v.error}`);
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error('tempo esgotado aguardando o processamento');
}

main().catch((e: Error) => {
  console.error(e.message);
  process.exit(1);
});
