/** Marcador gravado pelo worker no #EXT-X-KEY (apps/worker/src/pipeline.ts). */
export const KEY_URI_PLACEHOLDER = '__KEY_URI__';

/** Nomes de segmento que o worker gera. Qualquer outra coisa nunca é assinada. */
export const SEGMENT_NAME = /^seg_\d{5}\.ts$/;

const isUriLine = (line: string) => line.trim() !== '' && !line.startsWith('#');

/** Master: cada playlist de qualidade passa a levar o token do playback (`?t=`). */
export function rewriteMaster(text: string, token: string): string {
  return text
    .split('\n')
    .map((line) => (isUriLine(line) ? `${line.trim()}?t=${encodeURIComponent(token)}` : line))
    .join('\n');
}

/** Nomes de segmento citados na playlist de uma qualidade (para assinar em lote). */
export function segmentNames(text: string): string[] {
  return text
    .split('\n')
    .filter(isUriLine)
    .map((l) => l.trim());
}

/**
 * Playlist de qualidade: troca o marcador da chave pela URL da API e cada segmento pela URL assinada do S3.
 * Segmento fora do padrão derruba a playlist (nunca assina um nome arbitrário).
 */
export function rewriteVariant(
  text: string,
  keyUrl: string,
  signedSegments: Map<string, string>,
): string {
  return text
    .split('\n')
    .map((line) => {
      if (line.startsWith('#EXT-X-KEY')) return line.replace(KEY_URI_PLACEHOLDER, keyUrl);
      if (!isUriLine(line)) return line;
      const name = line.trim();
      const url = SEGMENT_NAME.test(name) ? signedSegments.get(name) : undefined;
      if (!url) throw new Error(`segmento inesperado na playlist: "${name.slice(0, 60)}"`);
      return url;
    })
    .join('\n');
}

/** sprite.vtt: aponta o recorte para a URL assinada da imagem. */
export function rewriteSpriteVtt(text: string, spriteUrl: string): string {
  return text.replace(/^sprite\.jpg(?=#xywh)/gm, spriteUrl);
}
