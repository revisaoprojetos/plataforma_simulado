// Helpers de formatação de tamanho de arquivo (pt-BR). Compartilhado pela área de
// Armazenamento (barras de uso, listagem de arquivos, limites).

/** Formata bytes em unidade legível pt-BR: "1,5 GB", "820 MB", "0 B". */
export function formatarBytes(n: number | null | undefined): string {
  const b = Number(n ?? 0)
  if (!isFinite(b) || b <= 0) return '0 B'
  const un = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  const i = Math.min(un.length - 1, Math.floor(Math.log(b) / Math.log(1024)))
  const v = b / Math.pow(1024, i)
  const casas = i === 0 ? 0 : v >= 100 ? 0 : v >= 10 ? 1 : 2
  return `${v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })} ${un[i]}`
}

/** GB (pode ter decimais) → bytes inteiros. */
export function gbParaBytes(gb: number): number {
  return Math.round((Number(gb) || 0) * 1024 ** 3)
}

/** bytes → GB (número com casas, para inputs). */
export function bytesParaGb(bytes: number | null | undefined): number {
  return Number(bytes ?? 0) / 1024 ** 3
}
