import { mkdir, mkdtemp, rm, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cleanStaleWorkDirs, evaluateDisk } from './disk';

const GB = 1024 ** 3;

describe('evaluateDisk', () => {
  const base = { totalBytes: 100 * GB, factor: 2.5, minFreeBytes: 2 * GB };

  it('ok quando há espaço livre suficiente', () => {
    expect(evaluateDisk({ ...base, freeBytes: 50 * GB, sourceBytes: 4 * GB }).verdict).toBe('ok');
  });
  it('wait quando cabe no disco mas não agora', () => {
    const r = evaluateDisk({ ...base, freeBytes: 5 * GB, sourceBytes: 4 * GB });
    expect(r.verdict).toBe('wait');
    expect(r.neededBytes).toBe(12 * GB);
  });
  it('impossible quando nunca caberia', () => {
    expect(evaluateDisk({ ...base, freeBytes: 90 * GB, sourceBytes: 50 * GB }).verdict).toBe(
      'impossible',
    );
  });
});

describe('cleanStaleWorkDirs', () => {
  it('remove só pastas video-* antigas', async () => {
    const base = await mkdtemp(join(tmpdir(), 'gv-clean-'));
    try {
      await mkdir(join(base, 'video-velha'));
      await mkdir(join(base, 'video-nova'));
      await mkdir(join(base, 'outra-velha'));
      const old = new Date(Date.now() - 10 * 3600_000);
      await utimes(join(base, 'video-velha'), old, old);
      await utimes(join(base, 'outra-velha'), old, old);
      expect(await cleanStaleWorkDirs(base, 3600_000)).toEqual(['video-velha']);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });
});
