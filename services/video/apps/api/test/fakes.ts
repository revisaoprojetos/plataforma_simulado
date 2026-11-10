import { TranscodeJob } from '../src/queue/transcode.queue';

/** Storage em memória: registra operações para os testes conferirem. */
export class FakeStorage {
  uploads = new Map<string, { key: string; contentType?: string }>();
  sizes = new Map<string, number>();
  deleted: string[] = [];
  deletedPrefixes: string[] = [];
  aborted: string[] = [];
  private n = 0;

  ping = async () => undefined;
  objects = new Map<string, Buffer>();
  put = async (key: string, body: Buffer | string) => {
    this.objects.set(key, Buffer.from(body));
  };
  get = async (key: string) => {
    const o = this.objects.get(key);
    if (!o) throw new Error(`NoSuchKey: ${key}`);
    return o;
  };
  presignGet = async (key: string, ttl = 300) => `https://fake.test/get/${key}?ttl=${ttl}&sig=fake`;

  createMultipart = async (key: string, contentType?: string) => {
    const id = `upload-${++this.n}`;
    this.uploads.set(id, { key, contentType });
    return id;
  };
  presignPart = async (key: string, uploadId: string, n: number) =>
    `https://fake.test/put/${key}?uploadId=${uploadId}&part=${n}`;
  completeMultipart = async () => undefined;
  abortMultipart = async (_key: string, uploadId: string) => {
    this.aborted.push(uploadId);
  };
  listParts = async () => [{ partNumber: 1, size: 16 * 1024 * 1024, etag: '"e1"' }];
  size = async (key: string) => this.sizes.get(key) ?? null;
  /** Sem objeto gravado, devolve um cabeçalho MP4 válido (os testes de upload não gravam conteúdo). */
  getRange = async (key: string) =>
    this.objects.get(key) ??
    Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), Buffer.alloc(16)]);
  delete = async (key: string) => {
    this.deleted.push(key);
  };
  deletePrefix = async (prefix: string) => {
    this.deletedPrefixes.push(prefix);
    return 0;
  };
}

export class FakeQueue {
  jobs: TranscodeJob[] = [];
  fail = false;
  counts = async () => ({ waiting: this.jobs.length });
  enqueue = async (job: TranscodeJob) => {
    if (this.fail) throw new Error('redis fora do ar');
    this.jobs.push(job);
  };
}
