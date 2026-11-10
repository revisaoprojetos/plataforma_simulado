import { corsAllows, hostOf, isOriginAllowed, watermarkText } from './origin';

describe('isOriginAllowed com denyEmpty (produção, 1.9)', () => {
  it('lista vazia nega quando o ambiente exige configuração explícita', () => {
    expect(isOriginAllowed('https://app.x.com', [], { denyEmpty: true })).toBe(false);
    expect(isOriginAllowed(undefined, [], { denyEmpty: true })).toBe(false);
    expect(isOriginAllowed('https://app.x.com', [], { denyEmpty: false })).toBe(true);
  });

  it('com lista preenchida denyEmpty não muda nada', () => {
    expect(isOriginAllowed('https://app.x.com', ['app.x.com'], { denyEmpty: true })).toBe(true);
    expect(isOriginAllowed('https://b.com', ['app.x.com'], { denyEmpty: true })).toBe(false);
  });
});

describe('corsAllows (CORS dinâmico por empresa, 1.9)', () => {
  const fixed = ['https://painel.nosso.com'];
  it('sem Origin (servidor a servidor) passa; origem fixa passa', () => {
    expect(corsAllows(undefined, fixed, [])).toBe(true);
    expect(corsAllows('https://painel.nosso.com', fixed, [])).toBe(true);
  });
  it('domínios das empresas passam (inclusive curinga); o resto não', () => {
    const hosts = ['app.a.com', '*.b.com'];
    expect(corsAllows('https://app.a.com', fixed, hosts)).toBe(true);
    expect(corsAllows('https://x.b.com', fixed, hosts)).toBe(true);
    expect(corsAllows('https://evil.com', fixed, hosts)).toBe(false);
    expect(corsAllows('https://app.a.com.evil.com', fixed, hosts)).toBe(false);
  });
  it('nenhuma empresa com domínio: só as origens fixas (vazio nega, nunca libera tudo)', () => {
    expect(corsAllows('https://qualquer.com', fixed, [])).toBe(false);
  });
});

describe('hostOf', () => {
  it('extrai host com porta e normaliza', () => {
    expect(hostOf('https://App.X.com:8443')).toBe('app.x.com:8443');
    expect(hostOf('https://x.com:443')).toBe('x.com'); // porta padrão some
    expect(hostOf('lixo')).toBeNull();
    expect(hostOf(undefined)).toBeNull();
  });
});

describe('isOriginAllowed', () => {
  it('sem restrição, tudo passa (inclusive sem origem)', () => {
    expect(isOriginAllowed(undefined, [])).toBe(true);
    expect(isOriginAllowed('https://qualquer.com', [])).toBe(true);
  });

  it('com restrição exige origem e casamento exato', () => {
    const list = ['app.x.com', 'localhost:5173'];
    expect(isOriginAllowed('https://app.x.com', list)).toBe(true);
    expect(isOriginAllowed('http://localhost:5173', list)).toBe(true);
    expect(isOriginAllowed('http://localhost:3000', list)).toBe(false);
    expect(isOriginAllowed('https://evil.com', list)).toBe(false);
    expect(isOriginAllowed('https://app.x.com.evil.com', list)).toBe(false);
    expect(isOriginAllowed(undefined, list)).toBe(false);
  });

  it('curinga *.dominio cobre subdomínios, não o domínio puro nem sufixos enganosos', () => {
    const list = ['*.x.com'];
    expect(isOriginAllowed('https://a.x.com', list)).toBe(true);
    expect(isOriginAllowed('https://a.b.x.com', list)).toBe(true);
    expect(isOriginAllowed('https://x.com', list)).toBe(false);
    expect(isOriginAllowed('https://evilx.com', list)).toBe(false);
  });
});

describe('watermarkText', () => {
  it('mascara o e-mail', () => {
    expect(watermarkText('Ana Souza', 'ana.souza@empresa.com')).toBe(
      'Ana Souza · a***@empresa.com',
    );
  });
});
