import { parseVtt } from './vtt';

describe('parseVtt', () => {
  it('lê falas simples, com id, multilinha e configurações de posição', () => {
    const cues = parseVtt(
      [
        'WEBVTT',
        '',
        '1',
        '00:00:01.000 --> 00:00:03.500 align:start position:10%',
        'Olá, pessoal.',
        'Bem-vindos!',
        '',
        '00:00:04.000 --> 00:00:06.000',
        'Segunda fala',
        '',
      ].join('\n'),
    );
    expect(cues).toEqual([
      { startS: 1, endS: 3.5, text: 'Olá, pessoal.\nBem-vindos!' },
      { startS: 4, endS: 6, text: 'Segunda fala' },
    ]);
  });

  it('aceita horas, formato curto MM:SS.mmm, vírgula decimal e CRLF', () => {
    const cues = parseVtt(
      'WEBVTT\r\n\r\n01:02:03,500 --> 01:02:05.000\r\nHora\r\n\r\n00:09.250 --> 00:10.000\r\nCurto\r\n',
    );
    expect(cues.map((c) => c.startS)).toEqual([9.25, 3723.5]); // ordenado
  });

  it('remove marcação, decodifica entidades e ignora NOTE/STYLE/blocos inválidos', () => {
    const cues = parseVtt(
      [
        '﻿WEBVTT - título',
        '',
        'NOTE isto é comentário',
        '',
        'STYLE',
        '::cue { color: red }',
        '',
        '00:00:01.000 --> 00:00:02.000',
        '<v Ana><i>Oi</i> &amp; tchau &lt;3</v>',
        '',
        '00:00:05.000 --> 00:00:04.000',
        'fim antes do início (descartada)',
        '',
        'sem tempo nenhum',
        '',
      ].join('\n'),
    );
    expect(cues).toEqual([{ startS: 1, endS: 2, text: 'Oi & tchau <3' }]);
  });

  it('descarta horário mal formado em vez de interpretá-lo errado', () => {
    const bad = [
      'WEBVTT',
      '',
      '00:133:20.000 --> 00:134:00.000',
      'minutos com 3 dígitos',
      '',
      '00:00:01.000 --> 00:00:02.000',
      'ok',
      '',
    ].join('\n');
    expect(parseVtt(bad)).toEqual([{ startS: 1, endS: 2, text: 'ok' }]);
  });

  it('rejeita arquivos que não são WebVTT ou sem falas', () => {
    expect(() => parseVtt('1\n00:00:01,000 --> 00:00:02,000\nSRT, não VTT')).toThrow(/WEBVTT/);
    expect(() => parseVtt('WEBVTT\n\nNOTE só comentário\n')).toThrow(/nenhuma fala/);
    expect(() => parseVtt('')).toThrow();
  });
});
