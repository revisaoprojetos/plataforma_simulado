/**
 * Rótulo de EXIBIÇÃO da classificação do estudante. O valor gravado no banco é
 * minúsculo/sem acento ('normal' | 'passaporte' | 'vitalicio'); esta função devolve
 * o texto bonito usado em telas e exportações (evita "vitalicio" com v minúsculo).
 */
export function rotuloClassificacao(c?: string | null): string {
  switch ((c ?? '').toLowerCase()) {
    case 'vitalicio':
      return 'Vitalício'
    case 'passaporte':
      return 'Passaporte'
    case 'normal':
      return 'Normal'
    default:
      return c ? c.charAt(0).toUpperCase() + c.slice(1) : '—'
  }
}
