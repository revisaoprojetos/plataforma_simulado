export interface Cue {
  startS: number;
  endS: number;
  text: string;
}

export const MAX_CUES = 20_000;

// Ancorada: um horário mal formado (ex.: "00:133:20.000") é recusado, nunca lido pela metade.
const TIME = /^(?:(\d{1,3}):)?(\d{2}):(\d{2})[.,](\d{3})$/;
const ARROW = /^\s*(\S+)\s+-->\s+(\S+)/;

const toSeconds = (s: string): number | null => {
  const m = TIME.exec(s);
  if (!m) return null;
  return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]) / 1000;
};

const decode = (t: string) =>
  t
    .replace(/<[^>]+>/g, '') // <v Fulano>, <c.cor>, <i>, <00:00:01.000>
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim();

/**
 * Lê um arquivo WebVTT e devolve as falas em ordem. Aceita horas opcionais, vírgula como separador
 * decimal, identificadores de fala, configurações de posição e blocos NOTE/STYLE/REGION (ignorados).
 * Lança Error se não for WebVTT ou se não houver nenhuma fala válida.
 */
export function parseVtt(input: string): Cue[] {
  const noBom = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input; // BOM UTF-8
  const text = noBom.replace(/\r\n?/g, '\n');
  if (!text.startsWith('WEBVTT')) throw new Error('o arquivo não começa com WEBVTT');

  const cues: Cue[] = [];
  for (const block of text.split(/\n{2,}/).slice(1)) {
    const lines = block.split('\n');
    if (/^(NOTE|STYLE|REGION)\b/.test(lines[0])) continue;
    const at = lines.findIndex((l) => l.includes('-->'));
    if (at < 0) continue;
    const m = ARROW.exec(lines[at]);
    const startS = m && toSeconds(m[1]);
    const endS = m && toSeconds(m[2]);
    if (startS == null || endS == null || endS <= startS) continue;
    const body = decode(lines.slice(at + 1).join('\n'));
    if (!body) continue;
    cues.push({ startS, endS, text: body });
    if (cues.length > MAX_CUES) throw new Error(`mais de ${MAX_CUES} falas`);
  }
  if (cues.length === 0) throw new Error('nenhuma fala válida encontrada');
  return cues.sort((a, b) => a.startS - b.startS);
}
