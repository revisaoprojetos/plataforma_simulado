import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { createWriteStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Env } from './env';

const CONTENT_TYPES: Record<string, string> = {
  '.m3u8': 'application/vnd.apple.mpegurl',
  '.ts': 'video/mp2t',
  '.jpg': 'image/jpeg',
  '.vtt': 'text/vtt',
  '.bin': 'application/octet-stream',
};

export class Storage {
  private readonly s3: S3Client;
  private readonly bucket: string;

  constructor(env: Env) {
    this.bucket = env.S3_BUCKET;
    this.s3 = new S3Client({
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
      credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY },
    });
  }

  /** Tamanho do objeto em bytes (HEAD), para checar espaço em disco ANTES de baixar. */
  async size(key: string): Promise<number> {
    const res = await this.s3.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
    return Number(res.ContentLength ?? 0);
  }

  async download(key: string, dest: string, signal?: AbortSignal): Promise<void> {
    const res = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      abortSignal: signal,
    });
    await pipeline(res.Body as Readable, createWriteStream(dest), { signal });
  }

  async uploadFile(key: string, file: string, signal?: AbortSignal): Promise<void> {
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: await readFile(file),
        ContentType: CONTENT_TYPES[extname(file)] ?? 'application/octet-stream',
        // Playlists/segmentos são imutáveis por vídeo, mas são entregues via URL assinada.
        CacheControl: 'private, max-age=3600',
      }),
      { abortSignal: signal },
    );
  }

  /** Apaga tudo sob o prefixo (resultado anterior de um processamento) para reprocessar do zero. */
  async deletePrefix(prefix: string): Promise<void> {
    if (!prefix.endsWith('/') || prefix.length < 10)
      throw new Error(`prefixo inseguro: "${prefix}"`);
    let token: string | undefined;
    do {
      const list = await this.s3.send(
        new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, ContinuationToken: token }),
      );
      const keys = (list.Contents ?? []).map((o) => ({ Key: o.Key! }));
      if (keys.length) {
        await this.s3.send(
          new DeleteObjectsCommand({ Bucket: this.bucket, Delete: { Objects: keys, Quiet: true } }),
        );
      }
      token = list.IsTruncated ? list.NextContinuationToken : undefined;
    } while (token);
  }
}
