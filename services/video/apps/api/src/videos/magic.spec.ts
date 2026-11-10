import { magicProblem } from './magic';

const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), Buffer.alloc(16)]);
const mkv = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(16)]);
const avi = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('AVI LIST')]);
const mpg = Buffer.concat([Buffer.from([0, 0, 1, 0xba]), Buffer.alloc(16)]);

describe('magicProblem', () => {
  it('aceita assinaturas que combinam com a extensão', () => {
    expect(magicProblem(mp4, 'aula.mp4')).toBeNull();
    expect(magicProblem(mp4, 'AULA.MOV')).toBeNull();
    expect(magicProblem(mkv, 'a.webm')).toBeNull();
    expect(magicProblem(mkv, 'a.mkv')).toBeNull();
    expect(magicProblem(avi, 'a.avi')).toBeNull();
    expect(magicProblem(mpg, 'a.mpg')).toBeNull();
  });

  it('recusa conteúdo que não bate com a extensão (ex.: executável ou texto renomeado)', () => {
    const exe = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(30)]);
    expect(magicProblem(exe, 'a.mp4')).toMatch(/MP4/);
    expect(magicProblem(mp4, 'a.mkv')).toMatch(/Matroska/);
    expect(magicProblem(Buffer.from('<html>aaaaaaaaaaaaaaaaaaa'), 'a.avi')).toMatch(/AVI/);
    expect(magicProblem(Buffer.alloc(4), 'a.mp4')).toMatch(/pequeno/);
  });
});
