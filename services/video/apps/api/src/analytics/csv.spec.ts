import { toCsv } from './csv';

const cols = [
  { header: 'nome', get: (r: { n: string; v: number | null }) => r.n },
  { header: 'valor', get: (r: { n: string; v: number | null }) => r.v },
];

describe('toCsv', () => {
  it('gera BOM, cabeçalho e linhas com CRLF', () => {
    const csv = toCsv([{ n: 'Ana', v: 1.5 }], cols);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1)).toBe('nome,valor\r\nAna,1.5\r\n');
  });

  it('escapa aspas, delimitador e quebras de linha', () => {
    const csv = toCsv([{ n: 'Silva, "Zé"\nJr', v: 2 }], cols).slice(1);
    expect(csv).toBe('nome,valor\r\n"Silva, ""Zé""\nJr",2\r\n');
  });

  it('delimitador ponto e vírgula (Excel pt-BR) só aspeia quando preciso', () => {
    const csv = toCsv(
      [
        { n: 'a,b', v: 1 },
        { n: 'a;b', v: 2 },
      ],
      cols,
      ';',
    ).slice(1);
    expect(csv).toBe('nome;valor\r\na,b;1\r\n"a;b";2\r\n');
  });

  it('neutraliza injeção de fórmula em texto, sem mexer em números negativos reais', () => {
    const csv = toCsv(
      [
        { n: '=HYPERLINK("http://x")', v: -3 },
        { n: '+cmd', v: null },
        { n: '@SUM(A1)', v: 0 },
        { n: '-1+1', v: 1 },
      ],
      cols,
    ).slice(1);
    const lines = csv.split('\r\n');
    expect(lines[1]).toBe(`"'=HYPERLINK(""http://x"")",-3`);
    expect(lines[2]).toBe("'+cmd,");
    expect(lines[3]).toBe("'@SUM(A1),0");
    expect(lines[4]).toBe("'-1+1,1");
  });

  it('datas em ISO e valores inválidos viram vazio', () => {
    const csv = toCsv(
      [{ d: new Date('2026-10-26T10:00:00Z'), x: NaN }],
      [
        { header: 'd', get: (r: { d: Date; x: number }) => r.d },
        { header: 'x', get: (r: { d: Date; x: number }) => r.x },
      ],
    ).slice(1);
    expect(csv).toBe('d,x\r\n2026-10-26T10:00:00.000Z,\r\n');
  });
});
