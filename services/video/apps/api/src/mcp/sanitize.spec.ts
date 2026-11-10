import { sanitize, toSafeJson, UnsafeOutputError } from './sanitize';

describe('sanitize', () => {
  it('remove segredos, chaves de armazenamento e e-mails em qualquer profundidade', () => {
    const out = sanitize({
      id: 'a',
      email: 'x@y.z',
      passwordHash: 'h',
      nested: [{ s3Key: 'tenants/t/x', sourceKey: 's', title: 'ok', tokenHash: 't' }],
    });
    expect(out).toEqual({ id: 'a', nested: [{ title: 'ok' }] });
  });

  it('converte datas e limita listas enormes', () => {
    const out = sanitize({
      at: new Date('2026-01-01T00:00:00Z'),
      list: Array.from({ length: 500 }, (_, i) => i),
    });
    expect(out).toMatchObject({ at: '2026-01-01T00:00:00.000Z' });
    const list = (out as { list: { items: number[]; truncated: boolean; total: number } }).list;
    expect(list.items).toHaveLength(200);
    expect(list).toMatchObject({ truncated: true, total: 500 });
  });
});

describe('toSafeJson', () => {
  it('bloqueia URL assinada, token pessoal e chave privada', () => {
    for (const leak of [
      'https://s3/x?X-Amz-Signature=abc',
      'gvmcp_' + 'A'.repeat(30),
      '-----BEGIN PRIVATE KEY-----',
      '#EXT-X-KEY:URI="__KEY_URI__"',
    ]) {
      expect(() => toSafeJson({ text: leak })).toThrow(UnsafeOutputError);
    }
  });

  it('deixa passar conteúdo comum', () => {
    expect(toSafeJson({ text: 'aula sobre chaves e tokens' })).toBe(
      '{"text":"aula sobre chaves e tokens"}',
    );
  });
});
